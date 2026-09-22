import 'server-only'
import { cache } from 'react'
import { admin } from '@/server/supabase'
import { criarClienteServidor } from '@/server/supabase-session'
import { resolverWorkspaceAtivo } from '@/server/auth/workspace-ativo'
import { ehDonoDoDeploy } from '@/server/auth/dono-deploy'
import { SEM_DETALHE, detalheDeAcesso, estadoDeAcesso, type DetalheAcesso, type EstadoAcesso, type PeriodoDoMembro } from '@/lib/vendas/acesso'
import type { ProdutoId } from '@/lib/produtos/catalogo'

/** Uma leitura por requisição, partilhada por todos os pontos que perguntam (§9.3). */
const contextoDeAcesso = cache(async (): Promise<{ ehDonoDoServidor: boolean; periodos: PeriodoDoMembro[] } | null> => {
  const cliente = await criarClienteServidor()
  const { data: { user } } = await cliente.auth.getUser()
  if (!user) return null
  const ws = await resolverWorkspaceAtivo({ cliente })
  if (!ws) return null

  // 🔴 Só o DONO DO SERVIDOR passa por cima. "Owner do workspace ativo" não serve: criar workspace
  // é self-service para qualquer usuário logado, e o comprador viraria owner do seu e usaria tudo
  // de graça.
  if (await ehDonoDoDeploy()) return { ehDonoDoServidor: true, periodos: [] }

  const db = admin()
  const { data: membro, error } = await db
    .from('membros')
    .select('id')
    .eq('workspace_id', ws)
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw error
  if (!membro) return null

  const { data: vendas, error: erroVendas } = await db
    .from('vendas')
    .select('id, status')
    .eq('workspace_id', ws)
    .eq('membro_id', membro.id)
  if (erroVendas) throw erroVendas
  const lista = (vendas ?? []) as Array<{ id: string; status: string }>
  if (lista.length === 0) return { ehDonoDoServidor: false, periodos: [] }

  const ativa = new Map(lista.map((v) => [v.id, v.status === 'ativa']))
    const { data: periodos, error: erroPeriodos } = await db
      .from('vendas_periodos')
      .select('venda_id, produto_id, inicia_em, expira_em, origem')
      .in('venda_id', [...ativa.keys()])
    if (erroPeriodos) throw erroPeriodos
    return {
      ehDonoDoServidor: false,
      periodos: ((periodos ?? []) as Array<{
        venda_id: string
        produto_id: string
        inicia_em: string
        expira_em: string | null
        origem: string | null
      }>).map((p) => ({
        produtoId: p.produto_id,
        iniciaEm: new Date(p.inicia_em),
        expiraEm: p.expira_em ? new Date(p.expira_em) : null,
        vendaAtiva: ativa.get(p.venda_id) ?? false,
        // O domínio é garantido pelo CHECK da 0070; o fallback cobre a base anterior à migration.
        origem: p.origem === 'degustacao' ? ('degustacao' as const) : ('venda' as const),
      })),
    }
  })

export async function estadoDoProduto(produto: ProdutoId): Promise<EstadoAcesso> {
  const ctx = await contextoDeAcesso()
  if (!ctx) return 'nunca'
  return estadoDeAcesso({ produto, ehDonoDoServidor: ctx.ehDonoDoServidor, periodos: ctx.periodos, agora: new Date() })
}

/**
 * O estado E o detalhe (trial, vencimento, dias restantes) numa leitura só.
 *
 * Use este quando a tela precisar dizer mais sobre o acesso do que apenas "está ativo": a leitura
 * de períodos já é a mesma, então não há consulta extra — só um segundo recorte dos mesmos dados.
 */
export async function estadoEDetalheDoProduto(
  produto: ProdutoId,
): Promise<{ estado: EstadoAcesso; detalhe: DetalheAcesso }> {
  const ctx = await contextoDeAcesso()
  const agora = new Date()
  if (!ctx) return { estado: 'nunca', detalhe: SEM_DETALHE }
  const base = { produto, ehDonoDoServidor: ctx.ehDonoDoServidor, periodos: ctx.periodos, agora }
  return { estado: estadoDeAcesso(base), detalhe: detalheDeAcesso(base) }
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
