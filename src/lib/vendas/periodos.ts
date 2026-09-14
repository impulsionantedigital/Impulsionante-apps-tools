import { somarDuracao, type Duracao } from './duracao'

export interface PeriodoExistente {
  produtoId: string
  expiraEm: Date | null
  /** A venda de onde o período nasceu ainda está ativa (não foi cancelada, reembolsada nem estornada). */
  vendaAtiva: boolean
}

export interface PeriodoNovo {
  produtoId: string
  iniciaEm: Date
  expiraEm: Date | null
}

/**
 * Um período por produto da venda (§16.1, item 8). A renovação empilha POR PRODUTO:
 *
 * - começa no maior vencimento entre os períodos daquele produto cujas vendas estão ativas;
 * - se esse vencimento já passou, começa na aprovação;
 * - venda encerrada não doa o tempo dela;
 * - vitalício ativo não empilha — não há vencimento a bater.
 *
 * 🔴 A base é o `expiraEm` anterior, não `expiraEm + 1 dia`: o vencimento é fronteira exclusiva.
 */
export function calcularPeriodos(args: {
  produtos: readonly string[]
  duracao: Duracao
  aprovadaEm: Date
  existentes: readonly PeriodoExistente[]
}): PeriodoNovo[] {
  return [...new Set(args.produtos)].map((produtoId) => {
    const vigentes = args.existentes.filter((p) => p.produtoId === produtoId && p.vendaAtiva)
    let base = args.aprovadaEm
    if (!vigentes.some((p) => p.expiraEm === null)) {
      for (const p of vigentes) {
        if (p.expiraEm && p.expiraEm.getTime() > base.getTime()) base = p.expiraEm
      }
    }
    return { produtoId, iniciaEm: new Date(base.getTime()), expiraEm: somarDuracao(base, args.duracao) }
  })
}
