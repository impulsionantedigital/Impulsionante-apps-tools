// tests/detracao/recolhimento-noturno/comparar.spec.ts
import { describe, it, expect } from 'vitest'
import { calcular } from '@/lib/detracao/recolhimento-noturno/motor'
import { mesmoResultado } from '@/lib/detracao/recolhimento-noturno/comparar'
import type { EntradaCalculo } from '@/lib/detracao/recolhimento-noturno/tipos'

const ENTRADA: EntradaCalculo = {
  timezone: 'America/Sao_Paulo',
  segmentos: [
    {
      inicio: '2026-01-01T00:00:00',
      fim: '2026-01-02T00:00:00',
      horaInicioNoturno: '22:00',
      horaFimNoturno: '06:00',
      diasSemanaNoturno: [],
      // Quinta 01/01/2026 — um dia de folga integral, para que a entrada tenha total > 0.
      diasFolgaIntegral: ['THU'],
      feriadosIntegral: [],
      incluirFeriadosUteis: false,
    },
  ],
}

describe('mesmoResultado', () => {
  it('é true para o mesmo cálculo recalculado', () => {
    expect(mesmoResultado(calcular(ENTRADA), calcular(ENTRADA))).toBe(true)
  })

  it('é true mesmo com as chaves do objeto em outra ordem (simula ida e volta por jsonb)', () => {
    const r = calcular(ENTRADA)
    // A rodada abaixo quebra como JSON de propósito (reverter uma string JSON não produz JSON
    // válido) — é só para documentar a tentativa; o teste real de "ordem de chave não importa" é
    // reconstruir o objeto manualmente com as chaves em outra ordem, logo abaixo:
    let reordenado: unknown
    try {
      reordenado = JSON.parse(JSON.stringify(r).split('').reverse().join(''))
    } catch {
      reordenado = undefined
    }
    const outraOrdem = {
      algoritmoVersao: r.algoritmoVersao,
      totalMinutos: r.totalMinutos,
      diasDetracao: r.diasDetracao,
      saldoMinutos: r.saldoMinutos,
      totalHoras: r.totalHoras,
      saldoHoras: r.saldoHoras,
      intervalosConsolidados: r.intervalosConsolidados,
      diasUteis: r.diasUteis,
      diasIntegrais: r.diasIntegrais,
    }
    expect(mesmoResultado(r, outraOrdem)).toBe(true)
    void reordenado // só para não sobrar variável não usada
  })

  it('é false quando o total muda', () => {
    const r = calcular(ENTRADA)
    expect(mesmoResultado(r, { ...r, totalMinutos: r.totalMinutos + 1 })).toBe(false)
  })
})
