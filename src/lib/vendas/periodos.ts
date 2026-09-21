import { somarDias, somarDuracao, type Duracao } from './duracao'

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
  return faltantes.map((produtoId) => ({ produtoId, iniciaEm: args.aprovadaEm, expiraEm }))
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
    return { produtoId, iniciaEm: new Date(base.getTime()), expiraEm: expiracao(base, args.duracao) }
  })
}
