// tests/detracao/recolhimento-noturno/migrar.spec.ts
//
// Regressivo do erro 500 que o membro viu ao reabrir o último cálculo gravado ("This page couldn't
// load"). A causa: a RN-2.0 trocou o formato do segmento, de uma JANELA DE INSTANTES
// (`inicio`/`fim`, ISO com hora, fim exclusivo) para um PAR DE DATAS DE CALENDÁRIO
// (`dataInicio`/`dataFim`, inclusivas). A página do cálculo salvo roda `calcular(entrada)` no
// SERVIDOR para conferir se o número mudou; com uma entrada antiga, o motor lia `s.dataInicio`,
// recebia `undefined` e lançava — derrubando a página inteira, com o histórico do membro dentro.
//
// 🔴 O que estes testes protegem não é a conversão em si, e sim a possibilidade de REABRIR cálculos
// que já existem. Um cálculo antigo pode ter virado petição; perder acesso a ele é pior do que um
// número a menos na tela.

import { describe, it, expect } from 'vitest'
import { migrarEntrada } from '@/lib/detracao/recolhimento-noturno/migrar'
import { calcular } from '@/lib/detracao/recolhimento-noturno/motor'

/** Um segmento EXATAMENTE como a RN-1.1 gravava: janela de instantes, com os campos já removidos. */
function segmentoAntigo(over: Record<string, unknown> = {}) {
  return {
    inicio: '2025-01-01T00:00:00',
    // Fim exclusivo E esticado até o fim do turno do último dia (31/12 às 22:00 → 01/01 às 06:00).
    fim: '2026-01-01T06:00:00',
    horaInicioNoturno: '22:00',
    horaFimNoturno: '06:00',
    diasSemanaNoturno: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    diasFolgaIntegral: ['SAT', 'SUN'],
    feriadosIntegral: [],
    intervalosAdicionais: [],
    intervalosExcluidos: [],
    ...over,
  }
}

function entradaAntiga(segmentos: unknown[]) {
  return { timezone: 'America/Sao_Paulo', segmentos }
}

describe('migrarEntrada — cálculo gravado antes da RN-2.0', () => {
  it('o caso do erro 500: migrar e calcular não lança', () => {
    // 🔴 Sem a migração, este `calcular` lança (`Cannot read properties of undefined`) e a página do
    // cálculo salvo responde erro 500. É o teste que reproduz o defeito relatado.
    const entrada = migrarEntrada(entradaAntiga([segmentoAntigo()]))
    expect(() => calcular(entrada)).not.toThrow()
  })

  it('a data de início vem do dia do instante `inicio`', () => {
    const e = migrarEntrada(entradaAntiga([segmentoAntigo()]))
    expect(e.segmentos[0].dataInicio).toBe('2025-01-01')
  })

  it('a data de fim RECUA um dia quando o fim foi esticado pelo turno do último dia', () => {
    // 🔴 O ponto delicado. `fim = 2026-01-01T06:00:00` significa "a cautelar vigeu ATÉ 31/12/2025":
    // a janela foi esticada de 31/12T00:00 até o fim do turno daquele dia. Pegar a data de `fim`
    // literalmente daria 01/01/2026 — um dia a MAIS, que o membro nunca informou.
    const e = migrarEntrada(entradaAntiga([segmentoAntigo()]))
    expect(e.segmentos[0].dataFim).toBe('2025-12-31')
  })

  it('a data de fim também recua quando a janela fecha à meia-noite', () => {
    // Fim exclusivo simples: "até 02/01" vira `2026-01-03T00:00:00`.
    const e = migrarEntrada(entradaAntiga([segmentoAntigo({ fim: '2026-01-03T00:00:00' })]))
    expect(e.segmentos[0].dataFim).toBe('2026-01-02')
  })

  it('um período de um único dia sobrevive à conversão', () => {
    // "05/01/2026, um dia só" com turno 22:00→06:00 virava `2026-01-05T00:00` → `2026-01-06T06:00`.
    const e = migrarEntrada(
      entradaAntiga([segmentoAntigo({ inicio: '2026-01-05T00:00:00', fim: '2026-01-06T06:00:00' })]),
    )
    expect(e.segmentos[0].dataInicio).toBe('2026-01-05')
    expect(e.segmentos[0].dataFim).toBe('2026-01-05')
  })

  it('descarta os intervalos adicionais e excluídos, que deixaram de existir', () => {
    const e = migrarEntrada(entradaAntiga([segmentoAntigo()]))
    expect('intervalosAdicionais' in e.segmentos[0]).toBe(false)
    expect('intervalosExcluidos' in e.segmentos[0]).toBe(false)
  })

  it('`incluirFeriadosUteis` entra desmarcado — o campo não existia', () => {
    const e = migrarEntrada(entradaAntiga([segmentoAntigo()]))
    expect(e.segmentos[0].incluirFeriadosUteis).toBe(false)
  })

  it('preserva os dias marcados e os horários do turno', () => {
    const e = migrarEntrada(entradaAntiga([segmentoAntigo()]))
    expect(e.segmentos[0].diasSemanaNoturno).toEqual(['MON', 'TUE', 'WED', 'THU', 'FRI'])
    expect(e.segmentos[0].diasFolgaIntegral).toEqual(['SAT', 'SUN'])
    expect(e.segmentos[0].horaInicioNoturno).toBe('22:00')
    expect(e.segmentos[0].horaFimNoturno).toBe('06:00')
  })

  it('preserva os metadados da entrada', () => {
    const e = migrarEntrada({
      timezone: 'America/Recife',
      observacoes: 'nota antiga',
      monitoramentoEletronico: 'sim',
      segmentos: [segmentoAntigo()],
    })
    expect(e.timezone).toBe('America/Recife')
    expect(e.observacoes).toBe('nota antiga')
    expect(e.monitoramentoEletronico).toBe('sim')
  })
})

describe('migrarEntrada — idempotência (entrada já no formato novo)', () => {
  const NOVA = {
    timezone: 'America/Sao_Paulo',
    segmentos: [
      {
        dataInicio: '2025-01-01',
        dataFim: '2025-12-31',
        horaInicioNoturno: '22:00',
        horaFimNoturno: '06:00',
        diasSemanaNoturno: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
        diasFolgaIntegral: ['SAT', 'SUN'],
        feriadosIntegral: ['2025-07-09'],
        incluirFeriadosUteis: true,
      },
    ],
  }

  it('uma entrada nova passa intacta', () => {
    const e = migrarEntrada(NOVA)
    expect(e.segmentos[0].dataInicio).toBe('2025-01-01')
    expect(e.segmentos[0].dataFim).toBe('2025-12-31')
    expect(e.segmentos[0].incluirFeriadosUteis).toBe(true)
    expect(e.segmentos[0].feriadosIntegral).toEqual(['2025-07-09'])
  })

  it('migrar duas vezes dá o mesmo resultado da primeira', () => {
    const uma = migrarEntrada(entradaAntiga([segmentoAntigo()]))
    const duas = migrarEntrada(uma)
    expect(duas).toEqual(uma)
  })

  it('não confunde `dataInicio` com `inicio` quando os dois estão presentes', () => {
    // Um cálculo gravado por uma versão intermediária poderia ter os dois campos.
    const mista = { ...segmentoAntigo(), dataInicio: '2025-03-01', dataFim: '2025-03-31' }
    const e = migrarEntrada(entradaAntiga([mista]))
    expect(e.segmentos[0].dataInicio).toBe('2025-03-01')
    expect(e.segmentos[0].dataFim).toBe('2025-03-31')
  })
})

describe('migrarEntrada — o cálculo antigo reaberto produz um número', () => {
  it('o cenário completo de 2025 dá o mesmo total que a entrada já migrada', () => {
    const antiga = calcular(migrarEntrada(entradaAntiga([segmentoAntigo()])))
    const nova = calcular(
      migrarEntrada({
        timezone: 'America/Sao_Paulo',
        segmentos: [
          {
            dataInicio: '2025-01-01',
            dataFim: '2025-12-31',
            horaInicioNoturno: '22:00',
            horaFimNoturno: '06:00',
            diasSemanaNoturno: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
            diasFolgaIntegral: ['SAT', 'SUN'],
            feriadosIntegral: [],
            incluirFeriadosUteis: false,
          },
        ],
      }),
    )
    // Sem o checkbox, o total não depende dos feriados nacionais — os dois caminhos concordam.
    expect(antiga.totalMinutos).toBe(nova.totalMinutos)
    expect(antiga.totalMinutos).toBeGreaterThan(0)
  })

  it('não lança mesmo com entrada degenerada (sem segmentos, campos nulos)', () => {
    expect(() => migrarEntrada({})).not.toThrow()
    expect(() => migrarEntrada({ segmentos: [] })).not.toThrow()
    expect(() => migrarEntrada({ segmentos: [{ inicio: null, fim: null }] })).not.toThrow()
    expect(migrarEntrada({}).segmentos).toEqual([])
  })
})
