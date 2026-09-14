import 'server-only'
import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { admin } from '@/server/supabase'
import { ehValido } from '@/lib/documento'
import type { Comprador } from '@/lib/vendas/hotmart'

export interface MembroResolvido {
  membroId: string
  userId: string
  /** Nunca entrou no sistema: é quem recebe as boas-vindas com a senha temporária. */
  nuncaEntrou: boolean
  observacao: string | null
}

type LinhaMembro = { id: string; user_id: string; cpf_cnpj: string | null; nome: string | null }

const COLUNAS = 'id, user_id, cpf_cnpj, nome'

async function concluir(cli: SupabaseClient, linha: LinhaMembro, observacao: string | null): Promise<MembroResolvido> {
  const { data, error } = await cli.auth.admin.getUserById(linha.user_id)
  if (error) throw error
  return {
    membroId: linha.id,
    userId: linha.user_id,
    nuncaEntrou: !data.user?.last_sign_in_at,
    observacao,
  }
}

/**
 * Encontra ou cria o membro de uma compra (§4.6). Ordem fixa: documento → e-mail → cria.
 *
 * 🔴 Nunca sobrescreve o documento de alguém a partir de um payload externo: divergência vira
 * observação para o owner olhar.
 */
export async function resolverMembro(workspaceId: string, comprador: Comprador): Promise<MembroResolvido> {
  const cli = admin()
  const documento = comprador.documento && ehValido(comprador.documento) ? comprador.documento : null

  // 1. Pelo documento.
  if (documento) {
    const { data, error } = await cli
      .from('membros')
      .select(COLUNAS)
      .eq('workspace_id', workspaceId)
      .eq('cpf_cnpj', documento)
      .maybeSingle()
    if (error) throw error
    if (data) return concluir(cli, data as LinhaMembro, null)
  }

  // 2. Pelo e-mail — a conta pode existir, com ou sem membro neste workspace.
  const { data: encontrado, error: erroBusca } = await cli.rpc('buscar_usuario_por_email', { p_email: comprador.email })
  if (erroBusca) throw erroBusca
  let userId = (encontrado as string | null) ?? null
  let observacao: string | null = null

  if (userId) {
    const { data, error } = await cli
      .from('membros')
      .select(COLUNAS)
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    const linha = data as LinhaMembro | null
    if (linha) {
      if (documento && !linha.cpf_cnpj) {
        const { error: erroDoc } = await cli
          .from('membros')
          .update({ cpf_cnpj: documento, ...(linha.nome ? {} : { nome: comprador.nome }) })
          .eq('id', linha.id)
          .is('cpf_cnpj', null)
        if (erroDoc && erroDoc.code !== '23505') throw erroDoc
        if (erroDoc) observacao = 'o documento da compra já pertence a outro membro e não foi gravado'
      } else if (documento && linha.cpf_cnpj && linha.cpf_cnpj !== documento) {
        observacao = `o documento da compra (${documento}) difere do cadastrado neste membro e não foi sobrescrito`
      }
      return concluir(cli, linha, observacao)
    }
  } else {
    // 3. Cria a conta, com senha aleatória que ninguém conhece — a porta é a senha temporária.
    const { data, error } = await cli.auth.admin.createUser({
      email: comprador.email,
      password: randomBytes(32).toString('base64url'),
      email_confirm: true,
      user_metadata: comprador.nome ? { nome: comprador.nome } : {},
    })
    if (error || !data.user) {
      // Corrida com outro processamento da mesma compra: a conta já nasceu.
      const { data: denovo } = await cli.rpc('buscar_usuario_por_email', { p_email: comprador.email })
      if (!denovo) throw error ?? new Error('não foi possível criar a conta do comprador')
      userId = denovo as string
    } else {
      userId = data.user.id
    }
  }

  // A conta existe e o membro não: cria o membro neste workspace.
  const inserir = (cpf: string | null) =>
    cli
      .from('membros')
      .insert({ workspace_id: workspaceId, user_id: userId, papel: 'membro', nome: comprador.nome, cpf_cnpj: cpf })
      .select(COLUNAS)
      .single()

  const { data: novo, error: erroNovo } = await inserir(documento)
  if (!erroNovo) return concluir(cli, novo as LinhaMembro, observacao)
  if (erroNovo.code !== '23505') throw erroNovo

  const { data: jaExiste } = await cli
    .from('membros')
    .select(COLUNAS)
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle()
  if (jaExiste) return concluir(cli, jaExiste as LinhaMembro, observacao)

  // O documento pertence a outro membro: cria sem documento e anota.
  const { data: semDoc, error: erroSemDoc } = await inserir(null)
  if (erroSemDoc || !semDoc) throw erroSemDoc ?? new Error('não foi possível criar o membro')
  return concluir(cli, semDoc as LinhaMembro, 'o documento da compra já pertence a outro membro; membro criado sem documento')
}
