import { describe, it, expect } from 'vitest'
import { calcularPeriodos, type PeriodoExistente } from '@/lib/vendas/periodos'

const d = (iso: string) => new Date(iso)
const A = 'indulto-comutacao-2025'
const B = 'indulto-comutacao-2024'

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
