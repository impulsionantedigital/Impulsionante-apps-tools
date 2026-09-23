'use server'

import { z } from 'zod'
import { admin } from '@/server/supabase'
import { criarClienteServidor } from '@/server/supabase-session'
import { resolverWorkspaceAtivo } from '@/server/auth/workspace-ativo'
import { ehOwnerDoWorkspace } from '@/server/auth/owner-workspace'
import { ehDonoDoDeploy } from '@/server/auth/dono-deploy'
import { exigirEngineLiberado } from '@/server/license/exigir'
import { detalheSeguro } from '@/lib/sanitizar-erro'

/**
 * Ações do CADASTRO de produtos externos.
 *
 * 🔴 Vivem num arquivo próprio, e não dentro de `acoes-comercial.ts`, que já passa de 516 linhas —
 * o `ComercialCard` tem 505, e o cadastro de produto é um assunto à parte das ofertas.
 *
 * 🔴 A autorização é a MESMA do resto do comercial: só o DONO DO SERVIDOR, no workspace de que é
 * owner. Owner de workspace não basta: qualquer usuário logado cria o seu, e poderia cadastrar
 * primeiro o código de oferta de outra pessoa e capturar os compradores dela.
 */

export interface ProdutoExternoItem {
  id: string
  nome: string
  ativo: boolean
  /**
   * Quantas ofertas o referenciam. Decisivo: é o que explica por que o botão de excluir está
   * desabilitado. Diferente da oferta, aqui não há FK a que recorrer — a coluna `produto_id` é de
   * texto e guarda id de código E id de banco, então nenhuma FK aponta para esta tabela (0072).
   */
  ofertas: number
}

type Resposta = { ok: true; detalhe?: string } | { erro: string }

const NAO_AUTORIZADO = 'Só o dono do servidor mexe no comercial.'
const Uuid = z.string().uuid()

async function workspaceDoOwner(): Promise<string | null> {
  if (!(await ehDonoDoDeploy())) return null
  const cliente = await criarClienteServidor()
  const ws = await resolverWorkspaceAtivo({ cliente })
  if (!ws || !(await ehOwnerDoWorkspace(ws))) return null
  return ws
}

/** A lista, com a contagem de ofertas — uma consulta própria, sem `limit`. */
export async function lerProdutosExternos(ws: string): Promise<ProdutoExternoItem[]> {
  const db = admin()
  const { data, error } = await db
    .from('produtos_externos')
    .select('id, nome, ativo')
    .eq('workspace_id', ws)
    .order('nome', { ascending: true })
  if (error) throw error
  const produtos = (data ?? []) as Array<{ id: string; nome: string; ativo: boolean }>
  if (produtos.length === 0) return []

  const { data: usos, error: erroUsos } = await db
    .from('ofertas_produtos')
    .select('produto_id')
    .in('produto_id', produtos.map((p) => p.id))
  if (erroUsos) throw erroUsos
  const porProduto = new Map<string, number>()
  for (const u of (usos ?? []) as Array<{ produto_id: string }>) {
    porProduto.set(u.produto_id, (porProduto.get(u.produto_id) ?? 0) + 1)
  }
  return produtos.map((p) => ({ ...p, ofertas: porProduto.get(p.id) ?? 0 }))
}

const ProdutoExternoSchema = z.object({
  id: Uuid.optional(),
  nome: z.string().trim().min(1).max(200),
  ativo: z.boolean().optional(),
})

export async function salvarProdutoExterno(entrada: unknown): Promise<Resposta> {
  await exigirEngineLiberado()
  const ws = await workspaceDoOwner()
  if (!ws) return { erro: NAO_AUTORIZADO }
  const r = ProdutoExternoSchema.safeParse(entrada)
  if (!r.success) return { erro: 'Dê um nome ao produto (até 200 caracteres).' }

  const { id, nome } = r.data
  const db = admin()
  const { data, error } = id
    ? await db.from('produtos_externos').update({ nome }).eq('workspace_id', ws).eq('id', id).select('id')
    : await db.from('produtos_externos').insert({ nome, workspace_id: ws }).select('id')
  if (error) {
    // O índice único é (workspace_id, lower(nome)): dois "Curso de Execução Penal" não se
    // distinguem na hora de montar a oferta.
    if (error.code === '23505') return { erro: 'Já existe um produto externo com este nome.' }
    console.error('[produtos-externos] salvar falhou:', detalheSeguro(error))
    return { erro: 'Não foi possível salvar o produto externo.' }
  }
  if (!data?.length) return { erro: 'Produto externo não encontrado.' }
  return { ok: true }
}

/**
 * Liga ou desliga o produto no catálogo.
 *
 * 🔴 Desativar NÃO recusa venda (decisão da spec): quando o webhook chega, a Hotmart já cobrou a
 * pessoa. Recusar aqui não estorna nada e ainda perde o registro de um dinheiro que entrou — e, se
 * a oferta tiver brinde, a pessoa pagaria sem receber. Desativar é arquivamento do catálogo ("não
 * ofereça mais este produto ao montar uma oferta nova"). O freio de verdade é desativar a OFERTA,
 * que já existe e já é respeitado no `aprovar`.
 */
export async function alternarProdutoExterno(id: string, ativo: boolean): Promise<Resposta> {
  await exigirEngineLiberado()
  const ws = await workspaceDoOwner()
  if (!ws) return { erro: NAO_AUTORIZADO }
  if (!Uuid.safeParse(id).success) return { erro: 'Produto externo inválido.' }
  const { data, error } = await admin()
    .from('produtos_externos')
    .update({ ativo })
    .eq('workspace_id', ws)
    .eq('id', id)
    .select('id')
  if (error) {
    console.error('[produtos-externos] alternar falhou:', detalheSeguro(error))
    return { erro: 'Não foi possível atualizar o produto externo.' }
  }
  if (!data?.length) return { erro: 'Produto externo não encontrado.' }
  return { ok: true }
}

/**
 * Exclui um produto externo **que nenhuma oferta usa**.
 *
 * 🔴 Não há FK a que recorrer: a coluna `ofertas_produtos.produto_id` é de texto e guarda id de
 * código E id de banco (por isso a 0072 não cria a FK — ela quebraria toda venda de produto
 * interno). Então a conferência é NOSSA, e ela confere as duas tabelas antes de apagar.
 *
 * Exclusão segue a regra da oferta: só sai quem nenhuma oferta e nenhuma venda referenciam; o resto
 * se desativa.
 */
export async function excluirProdutoExterno(id: string): Promise<Resposta> {
  await exigirEngineLiberado()
  const ws = await workspaceDoOwner()
  if (!ws) return { erro: NAO_AUTORIZADO }
  if (!Uuid.safeParse(id).success) return { erro: 'Produto externo inválido.' }

  const db = admin()
  const [ofertasR, vendasR] = await Promise.all([
    db.from('ofertas_produtos').select('oferta_id').eq('produto_id', id).limit(1),
    db.from('vendas').select('id').eq('workspace_id', ws).contains('produtos', [id]).limit(1),
  ])
  if (ofertasR.error) {
    console.error('[produtos-externos] conferir ofertas falhou:', detalheSeguro(ofertasR.error))
    return { erro: 'Não foi possível conferir as ofertas deste produto.' }
  }
  if (vendasR.error) {
    console.error('[produtos-externos] conferir vendas falhou:', detalheSeguro(vendasR.error))
    return { erro: 'Não foi possível conferir as vendas deste produto.' }
  }
  if (ofertasR.data?.length || vendasR.data?.length) {
    return {
      erro: 'Este produto externo já é usado por uma oferta ou por uma venda e não pode ser excluído. Desative-o para parar de oferecê-lo em ofertas novas.',
    }
  }

  const { data, error } = await db
    .from('produtos_externos')
    .delete()
    .eq('workspace_id', ws)
    .eq('id', id)
    .select('id')
  if (error) {
    console.error('[produtos-externos] excluir falhou:', detalheSeguro(error))
    return { erro: 'Não foi possível excluir o produto externo.' }
  }
  if (!data?.length) return { erro: 'Produto externo não encontrado.' }
  return { ok: true }
}
