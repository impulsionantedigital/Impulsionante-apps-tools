'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { exigirEngineLiberado } from '@/server/license/exigir'
import { exigirSessao } from '@/server/auth/sessao'
import { resolverWorkspaceAtivo } from '@/server/auth/workspace-ativo'
import { admin } from '@/server/supabase'
import { fraseDeBanco } from '@/lib/erro-de-banco'
import { detalheSeguro } from '@/lib/sanitizar-erro'
import { preparar } from './preparar'
import { exigirEscrita } from '@/server/vendas/acesso'
import { produtoDoMotor } from '@/lib/produtos/catalogo'
import type { Entrada } from '@/lib/indulto-comutacao/tipos'

const BASE = '/ferramentas/cic-2025'
const TABELA = 'indulto_comutacao_calculos'

const Id = z.string().uuid()

const NAO_ACHOU =
  'Este cálculo não existe mais, ou não está na sua conta. Recarregue a lista e tente de novo.'

/**
 * `input` chega tipado, mas nada impede uma chamada forjada com `null`,
 * `undefined` ou um valor primitivo — e `input.id`/`input.titulo` sobre um
 * desses lança `TypeError` antes de qualquer validação. Guarda de forma, não
 * de conteúdo: quem confere o CONTEÚDO é o `Dados.safeParse` de `preparar.ts`.
 */
function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Quem está salvando. Chamada FORA do `try`: `exigirSessao` redireciona lançando. */
async function contexto(): Promise<{ userId: string; ws: string } | { erro: string }> {
  const user = await exigirSessao()
  const ws = await resolverWorkspaceAtivo()
  if (!ws) return { erro: 'Escolha um espaço de trabalho antes de salvar.' }
  return { userId: user.id, ws }
}

export async function salvarCalculo(input: {
  titulo: string
  decretoId: string
  entrada: Entrada
}): Promise<{ ok: true; id: string } | { erro: string }> {
  await exigirEngineLiberado()
  const ctx = await contexto()
  if ('erro' in ctx) return ctx
  if (!ehObjeto(input)) return { erro: 'Confira os dados do cálculo.' }
  const p = preparar(input)
  if ('erro' in p) return { erro: p.erro }
  // 🔴 O gate de verdade (§9.4): criar e editar exigem acesso ativo ao produto deste decreto.
  const produto = produtoDoMotor(p.motor.id)
  const acesso = produto ? await exigirEscrita(produto) : { erro: 'Este decreto não está disponível.' }
  if ('erro' in acesso) return { erro: acesso.erro }

  try {
    // 🔴 workspace_id e user_id vêm da SESSÃO, nunca do input: admin() é
    // service-role e não passa por RLS, então o isolamento acontece aqui.
    const { data, error } = await admin()
      .from(TABELA)
      .insert({
        workspace_id: ctx.ws,
        user_id: ctx.userId,
        decreto_id: p.motor.id,
        motor_versao: p.motor.versao,
        titulo: p.titulo,
        entrada: p.entrada,
        resultado: p.resultado,
      })
      .select('id')
      .single()
    if (error) throw error

    revalidatePath(BASE)
    return { ok: true, id: (data as { id: string }).id }
  } catch (err) {
    console.error('[indulto-comutacao] salvarCalculo', detalheSeguro(err))
    return { erro: fraseDeBanco(err) }
  }
}

export async function atualizarCalculo(input: {
  id: string
  titulo: string
  decretoId: string
  entrada: Entrada
}): Promise<{ ok: true } | { erro: string }> {
  await exigirEngineLiberado()
  const ctx = await contexto()
  if ('erro' in ctx) return ctx
  if (!ehObjeto(input)) return { erro: NAO_ACHOU }
  const id = Id.safeParse(input.id)
  if (!id.success) return { erro: NAO_ACHOU }
  const p = preparar(input)
  if ('erro' in p) return { erro: p.erro }
  // 🔴 O gate de verdade (§9.4): criar e editar exigem acesso ativo ao produto deste decreto.
  const produto = produtoDoMotor(p.motor.id)
  const acesso = produto ? await exigirEscrita(produto) : { erro: 'Este decreto não está disponível.' }
  if ('erro' in acesso) return { erro: acesso.erro }

  try {
    // 🔴 O filtro por user_id NÃO é redundante: service-role não passa por RLS.
    // E o `.select('id')` também não: sem ele, atualizar o id de OUTRO membro
    // não afeta linha nenhuma, não dá erro, e a action devolveria ok.
    const { data, error } = await admin()
      .from(TABELA)
      .update({
        decreto_id: p.motor.id,
        motor_versao: p.motor.versao,
        titulo: p.titulo,
        entrada: p.entrada,
        resultado: p.resultado,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', id.data)
      .eq('workspace_id', ctx.ws)
      .eq('user_id', ctx.userId)
      .select('id')
    if (error) throw error
    if (!data?.length) return { erro: NAO_ACHOU }

    revalidatePath(BASE)
    revalidatePath(`${BASE}/${id.data}`)
    return { ok: true }
  } catch (err) {
    console.error('[indulto-comutacao] atualizarCalculo', detalheSeguro(err))
    return { erro: fraseDeBanco(err) }
  }
}

export async function excluirCalculo(idBruto: string): Promise<{ ok: true } | { erro: string }> {
  await exigirEngineLiberado()
  const ctx = await contexto()
  if ('erro' in ctx) return ctx
  // `idBruto` é o parâmetro inteiro (não um objeto): `typeof` basta, sem acesso
  // a propriedade nenhuma. `Id.safeParse` já tolera qualquer valor sem lançar,
  // mas a guarda fica explícita para o arquivo tratar as três actions do mesmo
  // jeito, em vez de duas com guarda e uma "confiando" na tolerância do zod.
  if (typeof idBruto !== 'string') return { erro: NAO_ACHOU }
  const id = Id.safeParse(idBruto)
  if (!id.success) return { erro: NAO_ACHOU }

  try {
    const { data, error } = await admin()
      .from(TABELA)
      .delete()
      .eq('id', id.data)
      .eq('workspace_id', ctx.ws)
      .eq('user_id', ctx.userId)
      .select('id')
    if (error) throw error
    if (!data?.length) return { erro: NAO_ACHOU }

    revalidatePath(BASE)
    return { ok: true }
  } catch (err) {
    console.error('[indulto-comutacao] excluirCalculo', detalheSeguro(err))
    return { erro: fraseDeBanco(err) }
  }
}
