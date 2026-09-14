export type EstadoAcesso = 'ativo' | 'encerrado' | 'nunca'

export interface PeriodoDoMembro {
  produtoId: string
  iniciaEm: Date
  expiraEm: Date | null
  vendaAtiva: boolean
}

/**
 * Os três estados da §9.2:
 * - `nunca`: nenhum período daquele produto — a ferramenta nem aparece;
 * - `ativo`: um período de venda ativa cobre este instante;
 * - `encerrado`: já teve, mas nada cobre agora — vê o que produziu, não cria nem edita.
 *
 * O owner passa por cima de tudo. O vencimento é fronteira exclusiva.
 */
export function estadoDeAcesso(args: {
  produto: string
  ehOwner: boolean
  periodos: readonly PeriodoDoMembro[]
  agora: Date
}): EstadoAcesso {
  if (args.ehOwner) return 'ativo'
  const doProduto = args.periodos.filter((p) => p.produtoId === args.produto)
  if (doProduto.length === 0) return 'nunca'
  const t = args.agora.getTime()
  const cobre = doProduto.some(
    (p) => p.vendaAtiva && p.iniciaEm.getTime() <= t && (p.expiraEm === null || p.expiraEm.getTime() > t),
  )
  return cobre ? 'ativo' : 'encerrado'
}
