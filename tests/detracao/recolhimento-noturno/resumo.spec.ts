import { describe, expect, it } from 'vitest'
import { calcularResumoDetalhado } from '@/lib/detracao/recolhimento-noturno/resumo'

describe('calcularResumoDetalhado', () => {
  it('fatia um intervalo noturno pela meia-noite: parte em cada data civil', () => {
    // sexta 2026-01-02 22:00 -> sábado 2026-01-03 06:00: 2h de sexta (útil) + 6h de sábado (fds).
    const resumo = calcularResumoDetalhado(
      [{ inicio: '2026-01-02T22:00:00', fim: '2026-01-03T06:00:00' }],
      [],
    )
    expect(resumo.util).toEqual({ dias: 1, minutos: 120 })
    expect(resumo.fimDeSemana).toEqual({ dias: 1, minutos: 360 })
    expect(resumo.feriado).toEqual({ dias: 0, minutos: 0 })
  })

  it('separa um dia integral de fim de semana da fatia de dia útil quando cruza a virada', () => {
    // sexta 22h -> sábado 00:00 (2h, dia útil) + sábado 00:00 -> domingo 00:00 (24h, fim de
    // semana, dia de folga integral).
    const resumo = calcularResumoDetalhado(
      [{ inicio: '2026-01-02T22:00:00', fim: '2026-01-04T00:00:00' }],
      [],
    )
    expect(resumo.util).toEqual({ dias: 1, minutos: 120 })
    expect(resumo.fimDeSemana).toEqual({ dias: 1, minutos: 1440 })
  })

  it('feriado tem prioridade sobre dia útil e fim de semana', () => {
    const resumo = calcularResumoDetalhado(
      [{ inicio: '2026-01-01T00:00:00', fim: '2026-01-02T00:00:00' }], // quinta-feira
      ['2026-01-01'],
    )
    expect(resumo.feriado).toEqual({ dias: 1, minutos: 1440 })
    expect(resumo.util).toEqual({ dias: 0, minutos: 0 })
  })

  it('conta uma data civil por dia tocado, mesmo em intervalos que cruzam a meia-noite', () => {
    // Duas segundas-feiras (05 e 12/01/2026), cada uma gerando 2h de segunda + 6h de terça.
    const resumo = calcularResumoDetalhado(
      [
        { inicio: '2026-01-05T22:00:00', fim: '2026-01-06T06:00:00' },
        { inicio: '2026-01-12T22:00:00', fim: '2026-01-13T06:00:00' },
      ],
      [],
    )
    expect(resumo.util).toEqual({ dias: 4, minutos: 960 })
  })

  it('devolve tudo zerado sem intervalos', () => {
    const resumo = calcularResumoDetalhado([], [])
    expect(resumo).toEqual({
      util: { dias: 0, minutos: 0 },
      fimDeSemana: { dias: 0, minutos: 0 },
      feriado: { dias: 0, minutos: 0 },
    })
  })
})
