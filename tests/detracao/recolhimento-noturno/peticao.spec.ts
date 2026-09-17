// tests/detracao/recolhimento-noturno/peticao.spec.ts
import { describe, expect, it } from 'vitest'
import { gerarTextoPeticao } from '@/lib/detracao/recolhimento-noturno/peticao'
import type { EntradaCalculo, ResultadoCalculo } from '@/lib/detracao/recolhimento-noturno/tipos'

function resultado(parcial: Partial<ResultadoCalculo>): ResultadoCalculo {
  return {
    totalMinutos: 0,
    totalHoras: '0:00',
    diasDetracao: 0,
    saldoMinutos: 0,
    saldoHoras: '00:00',
    diasUteis: 0,
    diasIntegrais: 0,
    composicao: {
      diasUteis: 0,
      minutosUteis: 0,
      diasIntegrais: 0,
      diasFeriados: 0,
      diasFolgaIntegral: 0,
      minutosIntegrais: 0,
    },
    feriadosConsiderados: [],
    algoritmoVersao: 'RN-2.0',
    ...parcial,
  }
}

/** A entrada cujas datas o texto relata — o anexo fala do PERÍODO da cautelar, não do cômputo. */
function entrada(dataInicio: string, dataFim: string): EntradaCalculo {
  return {
    timezone: 'America/Sao_Paulo',
    segmentos: [
      {
        dataInicio,
        dataFim,
        horaInicioNoturno: '22:00',
        horaFimNoturno: '06:00',
        diasSemanaNoturno: ['MON'],
        diasFolgaIntegral: [],
        feriadosIntegral: [],
        incluirFeriadosUteis: false,
      },
    ],
  }
}

describe('gerarTextoPeticao', () => {
  it('relata o período informado e o total apurado', () => {
    const texto = gerarTextoPeticao(
      entrada('2022-01-05', '2026-09-14'),
      resultado({ totalMinutos: 13712 * 60, diasDetracao: 571 }),
    )
    expect(texto).toBe(
      'Em cumprimento à decisão exarada nos autos, procedo às seguintes anotações:\n' +
        'O recuperando permaneceu em recolhimento noturno do dia 05/01/2022 a 14/09/2026.\n' +
        'No período indicado, cumpriu 13712.00 horas de recolhimento, correspondentes a 571 dias de detração.',
    )
  })

  it('o fim sai como o membro digitou, sem adiantar nem atrasar um dia', () => {
    // 🔴 Regressivo: com a janela semiaberta, o fim gravado era o dia SEGUINTE à meia-noite, e o
    // texto precisava recuar um dia para relatar certo. Com datas de calendário, é literal.
    const texto = gerarTextoPeticao(entrada('2026-03-01', '2026-03-02'), resultado({ totalMinutos: 1440 }))
    expect(texto).toContain('do dia 01/03/2026 a 02/03/2026')
  })

  it('um único dia aparece como início e fim iguais', () => {
    const texto = gerarTextoPeticao(entrada('2026-01-05', '2026-01-05'), resultado({ totalMinutos: 480 }))
    expect(texto).toContain('do dia 05/01/2026 a 05/01/2026')
  })

  it('devolve string vazia quando não há período informado', () => {
    const semDatas: EntradaCalculo = {
      timezone: 'America/Sao_Paulo',
      segmentos: [
        {
          dataInicio: '',
          dataFim: '',
          horaInicioNoturno: '22:00',
          horaFimNoturno: '06:00',
          diasSemanaNoturno: [],
          diasFolgaIntegral: [],
          feriadosIntegral: [],
          incluirFeriadosUteis: false,
        },
      ],
    }
    expect(gerarTextoPeticao(semDatas, resultado({}))).toBe('')
  })

  it('usa a data final do ÚLTIMO segmento quando há mais de um', () => {
    const primeiro = entrada('2026-01-01', '2026-03-31').segmentos[0]
    const segundo = entrada('2026-06-01', '2026-08-15').segmentos[0]
    const dois: EntradaCalculo = { timezone: 'America/Sao_Paulo', segmentos: [primeiro, segundo] }
    const texto = gerarTextoPeticao(dois, resultado({ totalMinutos: 1440 }))
    expect(texto).toContain('do dia 01/01/2026 a 15/08/2026')
  })
})
