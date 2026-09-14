'use server'

import { admin } from '@/server/supabase'
import { criarClienteServidor } from '@/server/supabase-session'
import { resolverWorkspaceAtivo } from '@/server/auth/workspace-ativo'
import { criarConvite } from '@/server/auth/convites'
import { exigirEngineLiberado } from '@/server/license/exigir'
import { ehOwnerDoWorkspace } from '@/server/auth/owner-workspace'
import { ehValido, normalizar } from '@/lib/documento'



export type MembroItem = {
  id: string
  papel: 'owner' | 'membro'
  email: string | null
  nome: string | null
  cpfCnpj: string | null
  desde: string
}

export type ConviteItem = {
  papel: 'owner' | 'membro'
  email: string | null
  expiraEm: string
  link: string
}

export type VistaEquipe = {
  souOwner: boolean
  membros: MembroItem[]
  convitesAbertos: ConviteItem[]
}

async function usuarioDaSessao(): Promise<string | null> {
  const sessao = await criarClienteServidor()
  const {
    data: { user },
  } = await sessao.auth.getUser()
  return user?.id ?? null
}

export async function lerEquipe(): Promise<VistaEquipe | { erro: string }> {
  const userId = await usuarioDaSessao()
  if (!userId) return { erro: 'nao_autorizado' }

  const cliente = await criarClienteServidor()
  const ws = await resolverWorkspaceAtivo({ cliente })
  if (!ws) return { erro: 'sem_workspace' }

  const db = admin()
  const { data: membros } = await db
    .from('membros')
    .select('id, user_id, papel, criado_em, nome, cpf_cnpj')
    .eq('workspace_id', ws)
    .order('criado_em', { ascending: true })

  const linhas = (membros ?? []) as Array<{
    id: string
    user_id: string
    papel: 'owner' | 'membro'
    criado_em: string
    nome: string | null
    cpf_cnpj: string | null
  }>
  const souOwner = linhas.some((m) => m.user_id === userId && m.papel === 'owner')
  // 🔴 `admin()` não passa por RLS: é aqui que um comprador deixa de ver os outros compradores.
  const visiveis = souOwner ? linhas : linhas.filter((m) => m.user_id === userId)

  
  
  
  const comEmail: MembroItem[] = await Promise.all(
    visiveis.map(async (m) => {
      const { data } = await db.auth.admin.getUserById(m.user_id)
      return {
        id: m.id,
        papel: m.papel,
        email: data?.user?.email ?? null,
        nome: m.nome,
        cpfCnpj: m.cpf_cnpj,
        desde: m.criado_em,
      }
    }),
  )

  
  
  let convitesAbertos: ConviteItem[] = []
  if (souOwner) {
    const { data: convites } = await db
      .from('convites')
      .select('papel, email, expira_em, token, aceito_em')
      .eq('workspace_id', ws)
      .is('aceito_em', null)
      .gt('expira_em', new Date().toISOString())
      .order('expira_em', { ascending: true })

    convitesAbertos = (
      (convites ?? []) as Array<{
        papel: 'owner' | 'membro'
        email: string | null
        expira_em: string
        token: string
      }>
    ).map((c) => ({
      papel: c.papel,
      email: c.email,
      expiraEm: c.expira_em,
      link: `/convite/${c.token}`,
    }))
  }

  return { souOwner, membros: comEmail, convitesAbertos }
}

export async function gerarConvite(
  papel: 'owner' | 'membro',
  email?: string,
): Promise<{ ok: true; vista: VistaEquipe } | { erro: string }> {
  await exigirEngineLiberado()
  if (papel !== 'owner' && papel !== 'membro') return { erro: 'papel_invalido' }

  const cliente = await criarClienteServidor()
  const ws = await resolverWorkspaceAtivo({ cliente })
  if (!ws) return { erro: 'sem_workspace' }

  
  
  const r = await criarConvite({
    workspaceId: ws,
    papel,
    email: email?.trim() || undefined,
  })
  if ('erro' in r) return r

  const vista = await lerEquipe()
  if ('erro' in vista) return vista
  return { ok: true, vista }
}


export async function cancelarConvite(
  token: string,
): Promise<{ ok: true; vista: VistaEquipe } | { erro: string }> {
  await exigirEngineLiberado()
  const cliente = await criarClienteServidor()
  const ws = await resolverWorkspaceAtivo({ cliente })
  if (!ws) return { erro: 'sem_workspace' }

  const userId = await usuarioDaSessao()
  if (!userId) return { erro: 'nao_autorizado' }

  const db = admin()
  const { data: eOwner } = await db
    .from('membros')
    .select('id')
    .eq('workspace_id', ws)
    .eq('user_id', userId)
    .eq('papel', 'owner')
    .maybeSingle()
  if (!eOwner) return { erro: 'nao_autorizado' }

  
  
  const { error } = await db
    .from('convites')
    .delete()
    .eq('workspace_id', ws)
    .eq('token', token)
    .is('aceito_em', null)
  if (error) return { erro: 'falha_ao_cancelar' }

  const vista = await lerEquipe()
  if ('erro' in vista) return vista
  return { ok: true, vista }
}


/**
 * O documento é por onde as compras encontram a pessoa (§4.5): só o owner corrige. O membro comum
 * não edita o próprio — senão trocaria o documento para reivindicar a compra de outra pessoa.
 */
export async function corrigirDocumento(
  membroId: string,
  bruto: string,
): Promise<{ ok: true; vista: VistaEquipe } | { erro: string }> {
  await exigirEngineLiberado()
  const userId = await usuarioDaSessao()
  if (!userId) return { erro: 'nao_autorizado' }

  const cliente = await criarClienteServidor()
  const ws = await resolverWorkspaceAtivo({ cliente })
  if (!ws) return { erro: 'sem_workspace' }
  if (!(await ehOwnerDoWorkspace(ws))) return { erro: 'nao_autorizado' }

  if (typeof membroId !== 'string' || !/^[0-9a-f-]{36}$/i.test(membroId)) return { erro: 'documento_invalido' }
  if (typeof bruto !== 'string' || bruto.length > 30) return { erro: 'documento_invalido' }
  const texto = bruto.trim()
  const documento = texto === '' ? null : normalizar(texto)
  if (documento !== null && !ehValido(documento)) return { erro: 'documento_invalido' }

  const { data, error } = await admin()
    .from('membros')
    .update({ cpf_cnpj: documento })
    .eq('workspace_id', ws)
    .eq('id', membroId)
    .select('id')
  if (error) return { erro: error.code === '23505' ? 'documento_em_uso' : 'falha_documento' }
  if (!data?.length) return { erro: 'nao_autorizado' }

  const vista = await lerEquipe()
  if ('erro' in vista) return vista
  return { ok: true, vista }
}
