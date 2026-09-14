import { describe, it, expect } from 'vitest'
import { formatarValor, formatarVencimento, vencimentoMaisTardio } from '@/lib/vendas/formatos'

const semNbsp = (s: string) => s.replace(/ /g, ' ')

describe('formatarVencimento', () => {
  it('usa o fuso de Brasília', () => {
    expect(formatarVencimento(new Date('2027-02-01T02:59:00Z'))).toBe('31/01/2027')
    expect(formatarVencimento(new Date('2027-02-01T03:00:00Z'))).toBe('01/02/2027')
  })

  it('vitalício não tem data', () => {
    expect(formatarVencimento(null)).toBe('sem data de término')
  })
})

describe('formatarValor', () => {
  it('formata em reais', () => {
    expect(semNbsp(formatarValor(97, 'BRL'))).toBe('R$ 97,00')
    expect(semNbsp(formatarValor(1234.5, 'BRL'))).toBe('R$ 1.234,50')
  })

  it('sem valor', () => {
    expect(formatarValor(null, 'BRL')).toBe('—')
  })

  it('moeda inválida não lança', () => {
    expect(formatarValor(10, 'reais')).toBe('10.00 reais')
  })
})

describe('vencimentoMaisTardio', () => {
  it('escolhe o mais tardio', () => {
    const a = new Date('2027-02-01T00:00:00Z')
    const b = new Date('2027-05-01T00:00:00Z')
    expect(vencimentoMaisTardio([b, a])).toEqual(b)
  })

  it('vitalício vence todos', () => {
    expect(vencimentoMaisTardio([new Date('2027-02-01T00:00:00Z'), null])).toBeNull()
  })
})
