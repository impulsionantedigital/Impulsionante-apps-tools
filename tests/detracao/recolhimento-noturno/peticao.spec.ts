import { describe, expect, it } from 'vitest'
import { gerarTextoPeticao } from '@/lib/detracao/recolhimento-noturno/peticao'
import type { ResultadoCalculo } from '@/lib/detracao/recolhimento-noturno/tipos'

function resultado(parcial: Partial<ResultadoCalculo>): ResultadoCalculo {
  return {
    totalMinutos: 0,
    totalHoras: '0:00',
    diasDetracao: 0,
    saldoMinutos: 0,
    saldoHoras: '00:00',
    intervalosConsolidados: [],
    intervalosExcluidos: [],
    algoritmoVersao: 'RN-1.0',
    ...parcial,
  }
}

describe('gerarTextoPeticao', () => {
  it('gera o texto exatamente no formato pedido', () => {
    const texto = gerarTextoPeticao(
      resultado({
        totalMinutos: 13712 * 60,
        diasDetracao: 571,
        intervalosConsolidados: [
          { inicio: '2022-01-05T22:00:00', fim: '2022-01-06T06:00:00' },
          { inicio: '2026-09-13T22:00:00', fim: '2026-09-14T06:00:00' },
        ],
      }),
    )
    expect(texto).toBe(
      'Em cumprimento à decisão exarada nos autos, procedo às seguintes anotações:\n' +
        'O recuperando permaneceu em recolhimento noturno do dia 05/01/2022 a 14/09/2026.\n' +
        'No período indicado, cumpriu 13712.00 horas de recolhimento, correspondentes a 571 dias de detração.',
    )
  })

  it('devolve string vazia sem intervalos consolidados', () => {
    expect(gerarTextoPeticao(resultado({}))).toBe('')
  })

  it('usa o dia anterior quando o fim do último intervalo é um instante exclusivo à meia-noite', () => {
    const texto = gerarTextoPeticao(
      resultado({
        totalMinutos: 1440,
        intervalosConsolidados: [{ inicio: '2026-03-01T00:00:00', fim: '2026-03-02T00:00:00' }],
      }),
    )
    expect(texto).toContain('do dia 01/03/2026 a 01/03/2026')
  })
})
