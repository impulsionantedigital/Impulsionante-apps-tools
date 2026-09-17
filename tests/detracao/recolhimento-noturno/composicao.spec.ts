// tests/detracao/recolhimento-noturno/composicao.spec.ts
//
// A composição que a tela mostra ("Dias de regra noturna — N dias — X horas", etc.) tem de FECHAR
// com o total do topo. É o número que o membro confere de cabeça: ele multiplica os dias de cada
// linha pelo valor do dia (8h ou 24h) e espera a soma bater com o "Total computável".
//
// 🔴 Regressivo de um defeito real (relatado em tela): a composição era recalculada a partir de
// intervalos de tempo, fatia do cada turno na meia-noite. Um dia de 22:00→06:00 valia 2h (a parte
// antes da meia-noite) em vez de 8h, e a madrugada de sábado vinda de um turno de sexta entrava na
// conta do sábado. A tela mostrava "257 dias — 1718.00 horas" onde a conta certa é 2048h.
//
// Hoje não há intervalo nenhum para reconstruir: a composição sai da MESMA contagem que produz o
// total, então não existe a possibilidade de as duas divergirem.

import { describe, it, expect } from 'vitest'
import { calcular } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-0/motor'
import { segmentoParaRegra, segmentoFormularioEmBranco } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-0/formulario'
import type { Weekday } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-0/tipos'

const SEG_A_SEX: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI']
const SABADO_E_DOMINGO: Weekday[] = ['SAT', 'SUN']

/** O cenário da tela: ano inteiro, regra noturna de segunda a sexta, folga no fim de semana. */
function anoInteiro(incluirFeriadosUteis: boolean) {
  return calcular({
    timezone: 'America/Sao_Paulo',
    segmentos: [
      segmentoParaRegra({
        ...segmentoFormularioEmBranco(),
        dataInicio: '2025-01-01',
        dataFim: '2025-12-31',
        horaInicioNoturno: '22:00',
        horaFimNoturno: '06:00',
        diasSemanaNoturno: SEG_A_SEX,
        diasFolgaIntegral: SABADO_E_DOMINGO,
        incluirFeriadosUteis,
      }),
    ],
  })
}

describe('composição do cômputo — as linhas do resumo fecham com o total', () => {
  it('a soma das três categorias reproduz o total computável (checkbox desmarcado)', () => {
    const r = anoInteiro(false)
    const c = r.composicao
    expect(c.minutosUteis + c.minutosIntegrais).toBe(r.totalMinutos)
    expect(c.diasFeriados).toBe(0)
  })

  it('a soma das três categorias reproduz o total computável (checkbox marcado)', () => {
    const r = anoInteiro(true)
    const c = r.composicao
    expect(c.minutosUteis + c.minutosIntegrais).toBe(r.totalMinutos)
  })

  it('dias úteis × 8h dá as horas de regra noturna — e NÃO as 2h do pedaço antes da meia-noite', () => {
    // 🔴 Este é o número que a tela mostrava errado: 257 dias × 8h = 2056h, e não 1718h.
    const r = anoInteiro(true)
    expect(r.composicao.minutosUteis).toBe(r.composicao.diasUteis * 8 * 60)
    expect(r.composicao.minutosUteis / 60).toBe((r.composicao.diasUteis * 8))
  })

  it('todo dia integral vale 24h na composição', () => {
    const r = anoInteiro(true)
    expect(r.composicao.minutosIntegrais).toBe(r.composicao.diasIntegrais * 1440)
    expect(r.composicao.diasIntegrais).toBe(r.composicao.diasFeriados + r.composicao.diasFolgaIntegral)
  })

  it('a contagem fecha EXATAMENTE com os dias do período — sem dia extra', () => {
    const r = anoInteiro(true)
    const c = r.composicao
    // 🔴 2025 tem 365 dias, e a conta dá 365 — nem um a mais. Era esta a diferença do `fimDaJanela`
    // da versão anterior, que esticava o período até o fim do turno do último dia e alcançava
    // 01/01/2026 (um feriado), somando um dia inteiro que ninguém pediu.
    expect(c.diasUteis + c.diasFeriados + c.diasFolgaIntegral).toBe(365)
  })

  it('mesmo período sem feriados computados tem zero na linha de feriados', () => {
    const r = anoInteiro(false)
    expect(r.composicao.diasFeriados).toBe(0)
    expect(r.composicao.diasFolgaIntegral).toBeGreaterThan(0)
  })
})

describe('composição — turno que atravessa a meia-noite', () => {
  it('um único dia de regra noturna vale o turno INTEIRO, não o pedaço do dia civil', () => {
    // Segunda 05/01/2026, turno 22:00→06:00: 8h, e não as 2h até a meia-noite.
    const r = calcular({
      timezone: 'America/Sao_Paulo',
      segmentos: [
        segmentoParaRegra({
          ...segmentoFormularioEmBranco(),
          dataInicio: '2026-01-05',
          dataFim: '2026-01-05',
          diasSemanaNoturno: ['MON'],
        }),
      ],
    })
    expect(r.composicao.diasUteis).toBe(1)
    expect(r.composicao.minutosUteis).toBe(8 * 60)
    expect(r.composicao.minutosUteis).toBe(r.totalMinutos)
  })

  it('dia integral de 24h vale 1440 minutos na composição', () => {
    const r = calcular({
      timezone: 'America/Sao_Paulo',
      segmentos: [
        segmentoParaRegra({
          ...segmentoFormularioEmBranco(),
          dataInicio: '2026-01-03', // sábado
          dataFim: '2026-01-03',
          diasSemanaNoturno: [],
          diasFolgaIntegral: ['SAT'],
        }),
      ],
    })
    expect(r.composicao.diasFolgaIntegral).toBe(1)
    expect(r.composicao.minutosIntegrais).toBe(1440)
    expect(r.composicao.minutosIntegrais).toBe(r.totalMinutos)
  })
})
