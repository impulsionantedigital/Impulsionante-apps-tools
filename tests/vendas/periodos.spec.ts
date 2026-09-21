import { describe, it, expect } from 'vitest'
import { calcularPeriodos, calcularBonus, vendaVigente, type PeriodoExistente } from '@/lib/vendas/periodos'

const d = (iso: string) => new Date(iso)
const A = 'indulto-comutacao-2025'
const B = 'indulto-comutacao-2024'

/** O mesmo de `calcular` para o prazo em DIAS — a degustação, que não tem nome de duração. */
function calcularDias(produtos: string[], dias: number, aprovadaEm: string, existentes: PeriodoExistente[] = []) {
  return calcularPeriodos({ produtos, duracao: dias, aprovadaEm: d(aprovadaEm), existentes })
}

function calcular(produtos: string[], aprovadaEm: string, existentes: PeriodoExistente[] = [], duracao: 'mensal' | 'vitalicio' = 'mensal') {
  return calcularPeriodos({ produtos, duracao, aprovadaEm: d(aprovadaEm), existentes })
}

describe('calcularPeriodos', () => {
  it('primeira compra começa na aprovação', () => {
    expect(calcular([A], '2027-01-01T12:00:00Z')).toEqual([
      { produtoId: A, iniciaEm: d('2027-01-01T12:00:00Z'), expiraEm: d('2027-02-01T12:00:00Z') },
    ])
  })

  it('renovação antecipada começa EXATAMENTE no vencimento anterior, sem +1 dia', () => {
    const existentes = [{ produtoId: A, expiraEm: d('2027-02-01T12:00:00Z'), vendaAtiva: true }]
    expect(calcular([A], '2027-01-25T09:00:00Z', existentes)).toEqual([
      { produtoId: A, iniciaEm: d('2027-02-01T12:00:00Z'), expiraEm: d('2027-03-01T12:00:00Z') },
    ])
  })

  it('renovação atrasada começa na aprovação', () => {
    const existentes = [{ produtoId: A, expiraEm: d('2027-02-01T12:00:00Z'), vendaAtiva: true }]
    expect(calcular([A], '2027-02-10T08:00:00Z', existentes)[0].iniciaEm).toEqual(d('2027-02-10T08:00:00Z'))
  })

  it('usa o MAIOR vencimento entre vários períodos ativos', () => {
    const existentes = [
      { produtoId: A, expiraEm: d('2027-02-01T00:00:00Z'), vendaAtiva: true },
      { produtoId: A, expiraEm: d('2027-03-01T00:00:00Z'), vendaAtiva: true },
    ]
    expect(calcular([A], '2027-01-20T00:00:00Z', existentes)[0].iniciaEm).toEqual(d('2027-03-01T00:00:00Z'))
  })

  it('venda encerrada não doa o tempo dela', () => {
    const existentes = [{ produtoId: A, expiraEm: d('2027-06-01T00:00:00Z'), vendaAtiva: false }]
    expect(calcular([A], '2027-01-20T00:00:00Z', existentes)[0].iniciaEm).toEqual(d('2027-01-20T00:00:00Z'))
  })

  it('vitalício ativo não empilha', () => {
    const existentes = [
      { produtoId: A, expiraEm: null, vendaAtiva: true },
      { produtoId: A, expiraEm: d('2027-06-01T00:00:00Z'), vendaAtiva: true },
    ]
    expect(calcular([A], '2027-01-20T00:00:00Z', existentes)[0].iniciaEm).toEqual(d('2027-01-20T00:00:00Z'))
  })

  it('combo: cada produto empilha sobre o SEU histórico, e o produto novo libera já', () => {
    const existentes = [{ produtoId: A, expiraEm: d('2027-05-01T00:00:00Z'), vendaAtiva: true }]
    const r = calcular([A, B], '2027-01-20T00:00:00Z', existentes)
    expect(r.find((p) => p.produtoId === A)?.iniciaEm).toEqual(d('2027-05-01T00:00:00Z'))
    expect(r.find((p) => p.produtoId === B)?.iniciaEm).toEqual(d('2027-01-20T00:00:00Z'))
  })

  it('produto repetido na oferta gera um período só', () => {
    expect(calcular([A, A], '2027-01-01T00:00:00Z')).toHaveLength(1)
  })

  it('oferta vitalícia gera período sem vencimento', () => {
    expect(calcular([A], '2027-01-01T00:00:00Z', [], 'vitalicio')[0].expiraEm).toBeNull()
  })
})

describe('calcularPeriodos — travas de regressão', () => {
  it('vitalício de venda ENCERRADA não impede o empilhamento', () => {
    const existentes = [
      { produtoId: A, expiraEm: null, vendaAtiva: false },
      { produtoId: A, expiraEm: d('2027-05-01T00:00:00Z'), vendaAtiva: true },
    ]
    expect(calcular([A], '2027-01-20T00:00:00Z', existentes)[0].iniciaEm).toEqual(d('2027-05-01T00:00:00Z'))
  })

  it('acha o maior vencimento qualquer que seja a ordem dos períodos', () => {
    const existentes = [
      { produtoId: A, expiraEm: d('2027-03-01T00:00:00Z'), vendaAtiva: true },
      { produtoId: A, expiraEm: d('2027-02-01T00:00:00Z'), vendaAtiva: true },
    ]
    expect(calcular([A], '2027-01-20T00:00:00Z', existentes)[0].iniciaEm).toEqual(d('2027-03-01T00:00:00Z'))
  })
})

describe('calcularPeriodos — degustação (prazo em dias)', () => {
  it('sete dias de degustação vencem sete dias corridos depois da aprovação', () => {
    expect(calcularDias([A], 7, '2027-01-01T12:00:00Z')).toEqual([
      { produtoId: A, iniciaEm: d('2027-01-01T12:00:00Z'), expiraEm: d('2027-01-08T12:00:00Z') },
    ])
  })

  it('dias são corridos: atravessam mês e ano sem regra de calendário', () => {
    expect(calcularDias([A], 45, '2027-12-20T09:00:00Z')[0].expiraEm).toEqual(d('2028-02-03T09:00:00Z'))
  })

  it('degustação VENCE — nunca devolve período vitalício', () => {
    expect(calcularDias([A], 1, '2027-01-01T00:00:00Z')[0].expiraEm).not.toBeNull()
  })

  it('renovação dentro da degustação empilha sobre o vencimento dela', () => {
    const existentes = [{ produtoId: A, expiraEm: d('2027-01-08T00:00:00Z'), vendaAtiva: true }]
    expect(calcularDias([A], 7, '2027-01-05T00:00:00Z', existentes)[0]).toEqual({
      produtoId: A,
      iniciaEm: d('2027-01-08T00:00:00Z'),
      expiraEm: d('2027-01-15T00:00:00Z'),
    })
  })
})

describe('calcularBonus — degustação (prazo em dias)', () => {
  it('o bônus usa os dias da VENDA de degustação, e não a duração da oferta de hoje', () => {
    const r = calcularBonus({ produtosDaOferta: [B], produtosDaVenda: [], duracao: 15, aprovadaEm: d('2027-01-10T00:00:00Z') })
    expect(r).toEqual([{ produtoId: B, iniciaEm: d('2027-01-10T00:00:00Z'), expiraEm: d('2027-01-25T00:00:00Z') }])
  })
})

describe('vendaVigente', () => {
  const AGORA = d('2027-06-01T00:00:00Z')

  it('status diferente de ativa nunca é vigente, mesmo com período no futuro', () => {
    const periodos = [{ expiraEm: d('2028-01-01T00:00:00Z') }]
    expect(vendaVigente({ status: 'cancelada', periodos, agora: AGORA })).toBe(false)
  })

  it('ativa, mas todos os períodos já venceram: não vigente (falta de pagamento silenciosa)', () => {
    const periodos = [{ expiraEm: d('2027-01-01T00:00:00Z') }]
    expect(vendaVigente({ status: 'ativa', periodos, agora: AGORA })).toBe(false)
  })

  it('ativa com pelo menos um período ainda não vencido: vigente', () => {
    const periodos = [{ expiraEm: d('2027-01-01T00:00:00Z') }, { expiraEm: d('2028-01-01T00:00:00Z') }]
    expect(vendaVigente({ status: 'ativa', periodos, agora: AGORA })).toBe(true)
  })

  it('ativa com período vitalício (sem vencimento): vigente', () => {
    expect(vendaVigente({ status: 'ativa', periodos: [{ expiraEm: null }], agora: AGORA })).toBe(true)
  })

  it('ativa, mas sem nenhum período: não vigente', () => {
    expect(vendaVigente({ status: 'ativa', periodos: [], agora: AGORA })).toBe(false)
  })

  it('vencimento é fronteira exclusiva, como em calcularPeriodos', () => {
    expect(vendaVigente({ status: 'ativa', periodos: [{ expiraEm: AGORA }], agora: AGORA })).toBe(false)
  })
})

describe('calcularBonus', () => {
  it('produto que a oferta ganhou e a venda ainda não tem: gera período', () => {
    const r = calcularBonus({
      produtosDaOferta: [A, B],
      produtosDaVenda: [A],
      duracao: 'mensal',
      aprovadaEm: d('2027-01-10T00:00:00Z'),
    })
    expect(r).toEqual([{ produtoId: B, iniciaEm: d('2027-01-10T00:00:00Z'), expiraEm: d('2027-02-10T00:00:00Z') }])
  })

  it('produto que a venda já tem: não gera período de novo', () => {
    expect(calcularBonus({ produtosDaOferta: [A], produtosDaVenda: [A], duracao: 'mensal', aprovadaEm: d('2027-01-10T00:00:00Z') })).toEqual([])
  })

  it('retroage à data de aprovação da venda, não a hoje', () => {
    const r = calcularBonus({ produtosDaOferta: [B], produtosDaVenda: [], duracao: 'anual', aprovadaEm: d('2020-03-15T00:00:00Z') })
    expect(r).toEqual([{ produtoId: B, iniciaEm: d('2020-03-15T00:00:00Z'), expiraEm: d('2021-03-15T00:00:00Z') }])
  })

  it('não olha nem empilha sobre períodos de outras vendas do mesmo membro', () => {
    // Ausência do parâmetro `existentes` de calcularPeriodos é proposital: esta função nem aceita
    // esse argumento — o bônus é isolado por venda, independente do histórico do membro.
    const r = calcularBonus({ produtosDaOferta: [A], produtosDaVenda: [], duracao: 'mensal', aprovadaEm: d('2027-01-10T00:00:00Z') })
    expect(r[0].iniciaEm).toEqual(d('2027-01-10T00:00:00Z'))
  })

  it('duração vitalícia gera período sem vencimento', () => {
    const r = calcularBonus({ produtosDaOferta: [A], produtosDaVenda: [], duracao: 'vitalicio', aprovadaEm: d('2027-01-10T00:00:00Z') })
    expect(r[0].expiraEm).toBeNull()
  })

  it('produto repetido na oferta gera um período só', () => {
    const r = calcularBonus({ produtosDaOferta: [A, A], produtosDaVenda: [], duracao: 'mensal', aprovadaEm: d('2027-01-10T00:00:00Z') })
    expect(r).toHaveLength(1)
  })

  it('nenhum produto faltante: lista vazia', () => {
    expect(calcularBonus({ produtosDaOferta: [], produtosDaVenda: [], duracao: 'mensal', aprovadaEm: d('2027-01-10T00:00:00Z') })).toEqual([])
  })
})
