import { somarDias, somarDuracao, type Duracao } from './duracao'

export interface PeriodoExistente {
  produtoId: string
  expiraEm: Date | null
  /** A venda de onde o período nasceu ainda está ativa (não foi cancelada, reembolsada nem estornada). */
  vendaAtiva: boolean
  /** Opcional: o histórico lido antes da 0070 não tinha origem, e ausência equivale a 'venda'. */
  origem?: OrigemPeriodo
}

export type OrigemPeriodo = 'venda' | 'degustacao'

export interface PeriodoNovo {
  produtoId: string
  iniciaEm: Date
  expiraEm: Date | null
  /** De onde o acesso nasceu. `degustacao` é o brinde concedido por uma oferta filha. */
  origem: OrigemPeriodo
}

/**
 * O brinde de uma oferta filha: o período nasce AGORA, não na data da compra.
 *
 * 🔴 É a única concessão do sistema que não é retroativa, e a diferença é deliberada. Os produtos
 * de bônus de `calcularBonus` fingem que sempre fizeram parte da compra: nascem na data da venda,
 * para não encurtar um prazo que o membro já tinha. O brinde é um presente CONDICIONAL ("quem
 * comprar X ganha Y"), e retroativo ele venceria antes de o membro perceber que o tinha.
 *
 * 🔴 E o brinde NÃO EMPILHA: duas concessões da mesma oferta para o mesmo membro são sempre um
 * período só, sempre a partir de `concedidoEm`. Quem quiser um segundo período de degustação cria
 * outra oferta filha — é o que torna o brinde uma ação controlada, e não uma renovação silenciosa.
 */
export function periodosDeBrinde(args: {
  produtos: readonly string[]
  dias: number
  /** Quando a concessão acontece — agora, no reprocessamento. */
  concedidoEm: Date
}): PeriodoNovo[] {
  const expiraEm = somarDias(args.concedidoEm, args.dias)
  return [...new Set(args.produtos)].map((produtoId) => ({
    produtoId,
    iniciaEm: args.concedidoEm,
    expiraEm,
    origem: 'degustacao' as const,
  }))
}

/**
 * O prazo que uma compra concede. É a duração NORMAL (nome) ou um número de DIAS CORRIDOS — a
 * degustação, cujo prazo é escolhido na oferta. `null` em `expiraEm` continua significando
 * vitalício, e só a duração `vitalicio` produz isso: dias sempre vencem.
 */
export type Prazo = Duracao | number

function expiracao(inicio: Date, prazo: Prazo): Date | null {
  return typeof prazo === 'number' ? somarDias(inicio, prazo) : somarDuracao(inicio, prazo)
}

/**
 * Determina se uma venda está VIGENTE agora: dá acesso a alguma coisa neste instante.
 *
 * 🔴 `status === 'ativa'` sozinho não basta: a Hotmart avisa cancelamento e reembolso, mas nunca
 * avisa que uma parcela de assinatura recorrente não foi paga — ela só processa o pagamento de
 * cada ciclo. Uma assinatura que parou de pagar fica com `status: 'ativa'` para sempre no banco,
 * mas o período já venceu. Por isso as duas condições são necessárias, cada uma cobrindo o caso
 * que a outra não cobre: `status` cobre o cancelamento explícito (que a Hotmart avisa), e o prazo
 * cobre a falta de pagamento silenciosa (que ela não avisa).
 */
export function vendaVigente(args: {
  status: string
  periodos: readonly { expiraEm: Date | null }[]
  agora: Date
}): boolean {
  if (args.status !== 'ativa') return false
  return args.periodos.some((p) => p.expiraEm === null || p.expiraEm.getTime() > args.agora.getTime())
}

/**
 * Bônus retroativo de produto: quando uma oferta ganha um produto novo (ou uma atualização), cada
 * venda VIGENTE daquela oferta pode ganhar o produto também, com um período PRÓPRIO — sem olhar
 * nem mexer no que outras vendas do mesmo membro já garantem para esse produto.
 *
 * 🔴 O período nasce na mesma data de aprovação da venda e vence na mesma duração dela: é como se
 * o produto tivesse feito parte da compra desde o início, não uma extensão a partir de hoje. Por
 * isso NÃO reaproveita `calcularPeriodos` (que empilha sobre o histórico do membro) — este bônus é
 * isolado por venda, de propósito: é presente para quem já assina, não uma renovação.
 */
export function calcularBonus(args: {
  produtosDaOferta: readonly string[]
  produtosDaVenda: readonly string[]
  duracao: Prazo
  aprovadaEm: Date
}): PeriodoNovo[] {
  const existentes = new Set(args.produtosDaVenda)
  const faltantes = [...new Set(args.produtosDaOferta)].filter((p) => !existentes.has(p))
  const expiraEm = expiracao(args.aprovadaEm, args.duracao)
  return faltantes.map((produtoId) => ({ produtoId, iniciaEm: args.aprovadaEm, expiraEm, origem: 'venda' as const }))
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
  duracao: Prazo
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
    return { produtoId, iniciaEm: new Date(base.getTime()), expiraEm: expiracao(base, args.duracao), origem: 'venda' as const }
  })
}
