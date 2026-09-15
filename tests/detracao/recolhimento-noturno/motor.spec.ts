// tests/detracao/recolhimento-noturno/motor.spec.ts
import { describe, it, expect } from 'vitest'
import { calcular } from '@/lib/detracao/recolhimento-noturno/motor'
import type { EntradaCalculo, SegmentoRegra, Weekday } from '@/lib/detracao/recolhimento-noturno/tipos'

const WEEKDAY_POR_INDICE_JS: readonly Weekday[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function fmtData(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}
function fmtDataHora(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${fmtData(d)}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
}
function diaSemanaDe(d: Date): Weekday {
  return WEEKDAY_POR_INDICE_JS[d.getUTCDay()]
}

function segmentoBase(overrides: Partial<SegmentoRegra>): SegmentoRegra {
  return {
    inicio: '2026-01-01T00:00:00',
    fim: '2026-01-02T00:00:00',
    horaInicioNoturno: '22:00',
    horaFimNoturno: '06:00',
    diasSemanaNoturno: [],
    diasFolgaIntegral: [],
    feriadosIntegral: [],
    intervalosAdicionais: [],
    intervalosExcluidos: [],
    ...overrides,
  }
}

function entradaCom(segmentos: SegmentoRegra[]): EntradaCalculo {
  return { timezone: 'America/Sao_Paulo', segmentos }
}

describe('motor de recolhimento noturno — casos de aceitação (§11 do plano)', () => {
  it('T01 — 1439 min computáveis: 0 dias, saldo 23:59', () => {
    const r = calcular(
      entradaCom([
        segmentoBase({
          intervalosAdicionais: [{ inicio: '2026-01-01T00:00:00', fim: '2026-01-01T23:59:00' }],
        }),
      ]),
    )
    expect(r.totalMinutos).toBe(1439)
    expect(r.diasDetracao).toBe(0)
    expect(r.saldoHoras).toBe('23:59')
  })

  it('T02 — exatamente 24h: 1 dia, saldo 00:00', () => {
    const r = calcular(
      entradaCom([
        segmentoBase({
          intervalosAdicionais: [{ inicio: '2026-01-01T00:00:00', fim: '2026-01-02T00:00:00' }],
        }),
      ]),
    )
    expect(r.totalMinutos).toBe(1440)
    expect(r.diasDetracao).toBe(1)
    expect(r.saldoHoras).toBe('00:00')
  })

  it('T03 — 47h59: 1 dia, saldo 23:59', () => {
    const r = calcular(
      entradaCom([
        segmentoBase({
          fim: '2026-01-03T00:00:00',
          intervalosAdicionais: [{ inicio: '2026-01-01T00:00:00', fim: '2026-01-02T23:59:00' }],
        }),
      ]),
    )
    expect(r.totalMinutos).toBe(2879)
    expect(r.diasDetracao).toBe(1)
    expect(r.saldoHoras).toBe('23:59')
  })

  it('T04 — 48h: 2 dias, saldo 00:00', () => {
    const r = calcular(
      entradaCom([
        segmentoBase({
          fim: '2026-01-04T00:00:00',
          intervalosAdicionais: [{ inicio: '2026-01-01T00:00:00', fim: '2026-01-03T00:00:00' }],
        }),
      ]),
    )
    expect(r.totalMinutos).toBe(2880)
    expect(r.diasDetracao).toBe(2)
    expect(r.saldoHoras).toBe('00:00')
  })

  it('T05 — 30 noites de 22h–05h (7h cada): 8 dias, saldo 18:00', () => {
    const inicio = new Date(Date.UTC(2026, 1, 1))
    const fim = new Date(inicio.getTime() + 30 * 86_400_000 + 5 * 3_600_000)
    const todosOsDias: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
    const r = calcular(
      entradaCom([
        segmentoBase({
          inicio: fmtDataHora(inicio),
          fim: fmtDataHora(fim),
          horaInicioNoturno: '22:00',
          horaFimNoturno: '05:00',
          diasSemanaNoturno: todosOsDias,
        }),
      ]),
    )
    expect(r.totalMinutos).toBe(30 * 7 * 60)
    expect(r.diasDetracao).toBe(8)
    expect(r.saldoHoras).toBe('18:00')
  })

  it('T06 — sexta 22h–sábado 06h + sábado integral: une para 26h, não 32h', () => {
    const dia1 = new Date(Date.UTC(2026, 0, 2))
    const dia2 = new Date(dia1.getTime() + 86_400_000)
    const dia3 = new Date(dia2.getTime() + 86_400_000)
    const r = calcular(
      entradaCom([
        segmentoBase({
          inicio: fmtDataHora(dia1),
          fim: fmtDataHora(dia3),
          horaInicioNoturno: '22:00',
          horaFimNoturno: '06:00',
          diasSemanaNoturno: [diaSemanaDe(dia1)],
          diasFolgaIntegral: [diaSemanaDe(dia2)],
        }),
      ]),
    )
    expect(r.totalMinutos).toBe(26 * 60)
  })

  it('T07 — intervalo cruza o início da cautelar: soma só depois do início exato', () => {
    const r = calcular(
      entradaCom([
        segmentoBase({
          inicio: '2026-01-02T00:00:00',
          fim: '2026-01-03T00:00:00',
          intervalosAdicionais: [{ inicio: '2026-01-01T20:00:00', fim: '2026-01-02T04:00:00' }],
        }),
      ]),
    )
    expect(r.totalMinutos).toBe(4 * 60)
  })

  it('T08 — intervalo cruza o fim/revogação: soma só até o fim exato', () => {
    const r = calcular(
      entradaCom([
        segmentoBase({
          inicio: '2026-01-01T00:00:00',
          fim: '2026-01-01T04:00:00',
          intervalosAdicionais: [{ inicio: '2026-01-01T00:00:00', fim: '2026-01-01T08:00:00' }],
        }),
      ]),
    )
    expect(r.totalMinutos).toBe(4 * 60)
  })

  it('T09 — exclusão parcial de 2h dentro de uma noite: total reduz em 120 min', () => {
    const r = calcular(
      entradaCom([
        segmentoBase({
          inicio: '2026-01-01T00:00:00',
          fim: '2026-01-02T06:00:00',
          intervalosAdicionais: [{ inicio: '2026-01-01T22:00:00', fim: '2026-01-02T06:00:00' }],
          intervalosExcluidos: [
            { inicio: '2026-01-01T23:00:00', fim: '2026-01-02T01:00:00', motivo: 'viagem autorizada' },
          ],
        }),
      ]),
    )
    expect(r.totalMinutos).toBe(8 * 60 - 120)
    expect(r.intervalosExcluidos).toHaveLength(1)
  })

  it('T10 — ausência de monitoramento eletrônico não altera o resultado', () => {
    const base = segmentoBase({
      intervalosAdicionais: [{ inicio: '2026-01-01T00:00:00', fim: '2026-01-01T10:00:00' }],
    })
    const com = calcular({ timezone: 'America/Sao_Paulo', segmentos: [base], monitoramentoEletronico: 'sim' })
    const sem = calcular({ timezone: 'America/Sao_Paulo', segmentos: [base], monitoramentoEletronico: 'nao' })
    expect(sem.totalMinutos).toBe(com.totalMinutos)
    expect(sem.totalMinutos).toBeGreaterThan(0)
  })

  it('T11 — mudança de regra no meio do período: cada segmento usa a sua', () => {
    const dia1 = new Date(Date.UTC(2026, 0, 2))
    const dia2 = new Date(Date.UTC(2026, 2, 2))
    const r = calcular(
      entradaCom([
        segmentoBase({
          inicio: fmtDataHora(dia1),
          fim: fmtDataHora(new Date(dia1.getTime() + 86_400_000)),
          horaInicioNoturno: '22:00',
          horaFimNoturno: '23:00',
          diasSemanaNoturno: [diaSemanaDe(dia1)],
        }),
        segmentoBase({
          inicio: fmtDataHora(dia2),
          fim: fmtDataHora(new Date(dia2.getTime() + 86_400_000)),
          horaInicioNoturno: '20:00',
          horaFimNoturno: '22:00',
          diasSemanaNoturno: [diaSemanaDe(dia2)],
        }),
      ]),
    )
    expect(r.totalMinutos).toBe(1 * 60 + 2 * 60)
  })

  it('T12 — intervalos contíguos 06h–08h e 08h–10h: 4h totais, um único bloco', () => {
    const r = calcular(
      entradaCom([
        segmentoBase({
          intervalosAdicionais: [
            { inicio: '2026-01-01T06:00:00', fim: '2026-01-01T08:00:00' },
            { inicio: '2026-01-01T08:00:00', fim: '2026-01-01T10:00:00' },
          ],
        }),
      ]),
    )
    expect(r.totalMinutos).toBe(4 * 60)
    expect(r.intervalosConsolidados).toHaveLength(1)
  })
})

describe('motor — casos de borda (§12 do plano)', () => {
  it('rejeita horário noturno com início igual ao fim (ambíguo)', () => {
    expect(() =>
      calcular(
        entradaCom([
          segmentoBase({ horaInicioNoturno: '00:00', horaFimNoturno: '00:00', diasSemanaNoturno: ['MON'] }),
        ]),
      ),
    ).toThrow(/ambígu/)
  })

  it('nunca produz float: totalMinutos e saldoMinutos são sempre inteiros', () => {
    const r = calcular(
      entradaCom([
        segmentoBase({ intervalosAdicionais: [{ inicio: '2026-01-01T00:00:00', fim: '2026-01-01T00:37:00' }] }),
      ]),
    )
    expect(Number.isInteger(r.totalMinutos)).toBe(true)
    expect(Number.isInteger(r.saldoMinutos)).toBe(true)
  })

  it('rejeita segmento sem nenhum segmento informado', () => {
    expect(() => calcular({ timezone: 'America/Sao_Paulo', segmentos: [] })).toThrow(/segmento/)
  })
})
