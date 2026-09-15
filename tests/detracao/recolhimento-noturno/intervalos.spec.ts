// tests/detracao/recolhimento-noturno/intervalos.spec.ts
import { describe, it, expect } from 'vitest'
import {
  paraInstante,
  paraInstanteDeData,
  somarDias,
  proximoDia,
  formatarInstante,
  intersectar,
  mergeIntervalos,
  subtrairIntervalos,
  duracaoMinutos,
} from '@/lib/detracao/recolhimento-noturno/intervalos'

describe('intervalos — funções puras', () => {
  it('converte data+hora em instante e formata de volta', () => {
    const ms = paraInstanteDeData('2026-01-02', '22:00')
    expect(formatarInstante(ms)).toBe('2026-01-02T22:00:00')
  })

  it('paraInstante aceita datetime com e sem segundos', () => {
    expect(paraInstante('2026-01-02T22:00')).toBe(paraInstante('2026-01-02T22:00:00'))
  })

  it('somarDias avança 24h por dia', () => {
    const a = paraInstanteDeData('2026-01-02', '22:00')
    expect(formatarInstante(somarDias(a, 1))).toBe('2026-01-03T22:00:00')
  })

  it('proximoDia atravessa virada de mês e de ano', () => {
    expect(proximoDia('2026-01-31')).toBe('2026-02-01')
    expect(proximoDia('2026-12-31')).toBe('2027-01-01')
  })

  it('intersectar corta pelas duas pontas, e devolve null sem sobreposição real', () => {
    expect(intersectar({ inicio: 0, fim: 100 }, { inicio: 50, fim: 150 })).toEqual({ inicio: 50, fim: 100 })
    expect(intersectar({ inicio: 0, fim: 10 }, { inicio: 10, fim: 20 })).toBeNull()
  })

  it('mergeIntervalos une sobrepostos e contíguos, mas preserva lacunas reais', () => {
    const unidos = mergeIntervalos([
      { inicio: 0, fim: 10 },
      { inicio: 10, fim: 20 },
      { inicio: 30, fim: 40 },
    ])
    expect(unidos).toEqual([
      { inicio: 0, fim: 20 },
      { inicio: 30, fim: 40 },
    ])
  })

  it('subtrairIntervalos recorta dos dois lados e do meio', () => {
    const base = [{ inicio: 0, fim: 100 }]
    expect(subtrairIntervalos(base, [{ inicio: -10, fim: 10 }])).toEqual([{ inicio: 10, fim: 100 }])
    expect(subtrairIntervalos(base, [{ inicio: 90, fim: 200 }])).toEqual([{ inicio: 0, fim: 90 }])
    expect(subtrairIntervalos(base, [{ inicio: 40, fim: 60 }])).toEqual([
      { inicio: 0, fim: 40 },
      { inicio: 60, fim: 100 },
    ])
  })

  it('duracaoMinutos soma em minutos inteiros', () => {
    expect(
      duracaoMinutos([
        { inicio: 0, fim: 60_000 },
        { inicio: 100_000, fim: 160_000 },
      ]),
    ).toBe(2)
  })
})
