import { describe, it, expect } from 'vitest'
import { DURACOES, ehDuracao, somarDias, somarDuracao } from '@/lib/vendas/duracao'

const d = (iso: string) => new Date(iso)

describe('somarDuracao', () => {
  it('soma dias corridos em semanal e quinzenal', () => {
    expect(somarDuracao(d('2027-01-01T10:00:00Z'), 'semanal')).toEqual(d('2027-01-08T10:00:00Z'))
    expect(somarDuracao(d('2027-01-01T10:00:00Z'), 'quinzenal')).toEqual(d('2027-01-16T10:00:00Z'))
  })

  it('usa mês de calendário, não 30 dias', () => {
    expect(somarDuracao(d('2027-03-15T10:00:00Z'), 'mensal')).toEqual(d('2027-04-15T10:00:00Z'))
    expect(somarDuracao(d('2027-11-15T10:00:00Z'), 'trimestral')).toEqual(d('2028-02-15T10:00:00Z'))
  })

  it('fecha no último dia do mês de destino', () => {
    expect(somarDuracao(d('2027-01-31T10:00:00Z'), 'mensal')).toEqual(d('2027-02-28T10:00:00Z'))
    expect(somarDuracao(d('2027-03-31T10:00:00Z'), 'mensal')).toEqual(d('2027-04-30T10:00:00Z'))
  })

  it('respeita ano bissexto', () => {
    expect(somarDuracao(d('2028-01-31T10:00:00Z'), 'mensal')).toEqual(d('2028-02-29T10:00:00Z'))
    expect(somarDuracao(d('2027-08-31T10:00:00Z'), 'semestral')).toEqual(d('2028-02-29T10:00:00Z'))
    expect(somarDuracao(d('2028-02-29T10:00:00Z'), 'anual')).toEqual(d('2029-02-28T10:00:00Z'))
  })

  it('preserva a hora exata', () => {
    expect(somarDuracao(d('2027-05-10T23:59:58.123Z'), 'anual')).toEqual(d('2028-05-10T23:59:58.123Z'))
  })

  it('vitalício não vence', () => {
    expect(somarDuracao(d('2027-01-01T00:00:00Z'), 'vitalicio')).toBeNull()
  })
})

describe('somarDias', () => {
  it('soma dias corridos, preservando a hora', () => {
    expect(somarDias(d('2027-01-01T12:00:00Z'), 7)).toEqual(d('2027-01-08T12:00:00Z'))
    expect(somarDias(d('2027-01-01T12:00:00Z'), 1)).toEqual(d('2027-01-02T12:00:00Z'))
  })

  it('atravessa mês e ano sem regra de calendário — é o que uma degustação de N dias é', () => {
    expect(somarDias(d('2027-12-20T09:00:00Z'), 45)).toEqual(d('2028-02-03T09:00:00Z'))
  })
})

describe('ehDuracao', () => {
  it('conhece exatamente as sete durações', () => {
    expect([...DURACOES]).toEqual(['semanal', 'quinzenal', 'mensal', 'trimestral', 'semestral', 'anual', 'vitalicio'])
    expect(ehDuracao('mensal')).toBe(true)
    expect(ehDuracao('bimestral')).toBe(false)
    expect(ehDuracao(null)).toBe(false)
  })
})
