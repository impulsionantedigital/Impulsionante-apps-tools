// src/app/(app)/ferramentas/detracao/[calculadora]/acoes.ts
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
import { caminhoDoProduto } from '@/lib/produtos/catalogo'
import { versaoAtual } from '@/lib/detracao/recolhimento-noturno/versoes/registro'
import type { EntradaCalculo } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-0/tipos'

// 🔴 A versão gravada vem do REGISTRO, e não de uma constante do módulo da versão: é ele que diz
// qual é a vigente, e um cálculo novo tem de sair com ela. A constante interna seria uma segunda
// verdade — trocar a atual no registro e esquecer a constante gravaria o rótulo errado.
const ALGORITMO_VERSAO = versaoAtual().versao

const TABELA = 'detracao_calculos'
const CALCULO_TIPO = 'recolhimento-noturno'
const PRODUTO_ID = 'detracao-recolhimento-noturno'
const SLUG = 'recolhimento-noturno'

const Id = z.string().uuid()

const NAO_ACHOU =
  'Este cálculo não existe mais, ou não está na sua conta. Recarregue a lista e tente de novo.'

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

async function contexto(): Promise<{ userId: string; ws: string } | { erro: string }> {
  const user = await exigirSessao()
  const ws = await resolverWorkspaceAtivo()
  if (!ws) return { erro: 'Escolha um espaço de trabalho antes de salvar.' }
  return { userId: user.id, ws }
}

function revalidar(calculoId?: string) {
  const base = caminhoDoProduto(SLUG)
  revalidatePath(base)
  if (calculoId) revalidatePath(`${base}/${calculoId}`)
}

export async function salvarCalculo(input: {
  titulo: string
  entrada: EntradaCalculo
}): Promise<{ ok: true; id: string } | { erro: string }> {
  await exigirEngineLiberado()
  const ctx = await contexto()
  if ('erro' in ctx) return ctx
  if (!ehObjeto(input)) return { erro: 'Confira os dados do cálculo.' }
  const p = preparar(input)
  if ('erro' in p) return { erro: p.erro }
  const acesso = await exigirEscrita(PRODUTO_ID)
  if ('erro' in acesso) return { erro: acesso.erro }

  try {
    const { data, error } = await admin()
      .from(TABELA)
      .insert({
        workspace_id: ctx.ws,
        user_id: ctx.userId,
        calculo_tipo: CALCULO_TIPO,
        algoritmo_versao: ALGORITMO_VERSAO,
        titulo: p.titulo,
        entrada: p.entrada,
        resultado: p.resultado,
      })
      .select('id')
      .single()
    if (error) throw error
    revalidar()
    return { ok: true, id: (data as { id: string }).id }
  } catch (err) {
    console.error('[detracao] salvarCalculo', detalheSeguro(err))
    return { erro: fraseDeBanco(err) }
  }
}

export async function atualizarCalculo(input: {
  id: string
  titulo: string
  entrada: EntradaCalculo
}): Promise<{ ok: true } | { erro: string }> {
  await exigirEngineLiberado()
  const ctx = await contexto()
  if ('erro' in ctx) return ctx
  if (!ehObjeto(input)) return { erro: NAO_ACHOU }
  const id = Id.safeParse(input.id)
  if (!id.success) return { erro: NAO_ACHOU }
  const p = preparar(input)
  if ('erro' in p) return { erro: p.erro }
  const acesso = await exigirEscrita(PRODUTO_ID)
  if ('erro' in acesso) return { erro: acesso.erro }

  try {
    const { data, error } = await admin()
      .from(TABELA)
      .update({
        calculo_tipo: CALCULO_TIPO,
        algoritmo_versao: ALGORITMO_VERSAO,
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
    revalidar(id.data)
    return { ok: true }
  } catch (err) {
    console.error('[detracao] atualizarCalculo', detalheSeguro(err))
    return { erro: fraseDeBanco(err) }
  }
}

export async function excluirCalculo(idBruto: string): Promise<{ ok: true } | { erro: string }> {
  await exigirEngineLiberado()
  const ctx = await contexto()
  if ('erro' in ctx) return ctx
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
    revalidar()
    return { ok: true }
  } catch (err) {
    console.error('[detracao] excluirCalculo', detalheSeguro(err))
    return { erro: fraseDeBanco(err) }
  }
}
