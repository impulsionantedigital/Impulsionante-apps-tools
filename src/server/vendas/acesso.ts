import 'server-only'
import { cache } from 'react'
import { admin } from '@/server/supabase'
import { criarClienteServidor } from '@/server/supabase-session'
import { resolverWorkspaceAtivo } from '@/server/auth/workspace-ativo'
import { estadoDeAcesso, type EstadoAcesso, type PeriodoDoMembro } from '@/lib/vendas/acesso'
import type { ProdutoId } from '@/lib/produtos/catalogo'

/** Uma leitura por requisição, partilhada por todos os pontos que perguntam (§9.3). */
const contextoDeAcesso = cache(async (): Promise<{ ehOwner: boolean; periodos: PeriodoDoMembro[] } | null> => {
  const cliente = await criarClienteServidor()
  const { data: { user } } = await cliente.auth.getUser()
  if (!user) return null
  const ws = await resolverWorkspaceAtivo({ cliente })
  if (!ws) return null

  const db = admin()
  const { data: membro, error } = await db
    .from('membros')
    .select('id, papel')
    .eq('workspace_id', ws)
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw error
  if (!membro) return null
  if (membro.papel === 'owner') return { ehOwner: true, periodos: [] }

  const { data: vendas, error: erroVendas } = await db
    .from('vendas')
    .select('id, status')
    .eq('workspace_id', ws)
    .eq('membro_id', membro.id)
  if (erroVendas) throw erroVendas
  const lista = (vendas ?? []) as Array<{ id: string; status: string }>
  if (lista.length === 0) return { ehOwner: false, periodos: [] }

  const ativa = new Map(lista.map((v) => [v.id, v.status === 'ativa']))
  const { data: periodos, error: erroPeriodos } = await db
    .from('vendas_periodos')
    .select('venda_id, produto_id, inicia_em, expira_em')
    .in('venda_id', [...ativa.keys()])
  if (erroPeriodos) throw erroPeriodos

  return {
    ehOwner: false,
    periodos: ((periodos ?? []) as Array<{ venda_id: string; produto_id: string; inicia_em: string; expira_em: string | null }>).map((p) => ({
      produtoId: p.produto_id,
      iniciaEm: new Date(p.inicia_em),
      expiraEm: p.expira_em ? new Date(p.expira_em) : null,
      vendaAtiva: ativa.get(p.venda_id) ?? false,
    })),
  }
})

export async function estadoDoProduto(produto: ProdutoId): Promise<EstadoAcesso> {
  const ctx = await contextoDeAcesso()
  if (!ctx) return 'nunca'
  return estadoDeAcesso({ produto, ehOwner: ctx.ehOwner, periodos: ctx.periodos, agora: new Date() })
}

/**
 * 🔴 O gate de verdade (§9.4, ponto 3): as escritas passam por server action com service-role, e
 * esconder botão não protege nada. Esta linha na ação protege.
 */
export async function exigirEscrita(produto: ProdutoId): Promise<{ ok: true } | { erro: string }> {
  return (await estadoDoProduto(produto)) === 'ativo'
    ? { ok: true }
    : { erro: 'O seu acesso a esta ferramenta não está ativo. Renove para criar ou editar cálculos.' }
}
