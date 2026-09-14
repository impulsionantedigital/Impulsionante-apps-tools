import { describe, it, expect } from 'vitest'
import { estadoDeAcesso, type PeriodoDoMembro } from '@/lib/vendas/acesso'

const d = (iso: string) => new Date(iso)
const A = 'indulto-comutacao-2025'
const AGORA = d('2027-03-15T12:00:00Z')

function estado(periodos: PeriodoDoMembro[], ehDonoDoServidor = false) {
  return estadoDeAcesso({ produto: A, ehDonoDoServidor, periodos, agora: AGORA })
}

describe('estadoDeAcesso', () => {
  it('sem período nenhum do produto: nunca', () => {
    expect(estado([])).toBe('nunca')
    expect(estado([{ produtoId: 'outro', iniciaEm: d('2027-01-01T00:00:00Z'), expiraEm: null, vendaAtiva: true }])).toBe('nunca')
  })

  it('período ativo cobrindo agora: ativo', () => {
    expect(estado([{ produtoId: A, iniciaEm: d('2027-03-01T00:00:00Z'), expiraEm: d('2027-04-01T00:00:00Z'), vendaAtiva: true }])).toBe('ativo')
  })

  it('vitalício de venda ativa: ativo', () => {
    expect(estado([{ produtoId: A, iniciaEm: d('2026-01-01T00:00:00Z'), expiraEm: null, vendaAtiva: true }])).toBe('ativo')
  })

  it('vencimento é fronteira exclusiva', () => {
    expect(estado([{ produtoId: A, iniciaEm: d('2027-02-15T12:00:00Z'), expiraEm: AGORA, vendaAtiva: true }])).toBe('encerrado')
    expect(estado([{ produtoId: A, iniciaEm: AGORA, expiraEm: d('2027-04-15T12:00:00Z'), vendaAtiva: true }])).toBe('ativo')
  })

  it('já venceu: encerrado', () => {
    expect(estado([{ produtoId: A, iniciaEm: d('2027-01-01T00:00:00Z'), expiraEm: d('2027-02-01T00:00:00Z'), vendaAtiva: true }])).toBe('encerrado')
  })

  it('venda cancelada não dá acesso, mesmo dentro do período', () => {
    expect(estado([{ produtoId: A, iniciaEm: d('2027-03-01T00:00:00Z'), expiraEm: d('2027-04-01T00:00:00Z'), vendaAtiva: false }])).toBe('encerrado')
  })

  it('período que só começa no futuro não cobre agora', () => {
    expect(estado([{ produtoId: A, iniciaEm: d('2027-04-01T00:00:00Z'), expiraEm: d('2027-05-01T00:00:00Z'), vendaAtiva: true }])).toBe('encerrado')
  })

  it('o dono do servidor passa por cima', () => {
    expect(estado([], true)).toBe('ativo')
  })
})
