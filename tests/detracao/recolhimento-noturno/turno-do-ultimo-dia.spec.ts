// tests/detracao/recolhimento-noturno/turno-do-ultimo-dia.spec.ts
//
// Regressivo do defeito encontrado em 16/09/2026: o turno noturno do ÚLTIMO dia do período era
// cortado a zero, e o período inteiro saía com 1 dia a menos do que a conta da referência
// (`dias × horas ÷ 24`).
//
// Causa: "Fim da cautelar = 01/01/2026" virava a janela `[..., 02/01/2026T00:00)` — e o turno que
// começa às 22:00 de 01/01/2026 caía FORA dela. O último dia marcado não gerava turno.
//
// Regra correta (Tema Repetitivo 1.155/STJ, item 3): as horas de recolhimento noturno e nos dias
// de folga são computadas. Se o usuário diz que a cautelar vigeu até 01/01/2026, o turno das 22:00
// daquele dia conta por inteiro.

import { describe, it, expect } from 'vitest'
import { calcular } from '@/lib/detracao/recolhimento-noturno/motor'
import { segmentoParaRegra, segmentoFormularioEmBranco } from '@/lib/detracao/recolhimento-noturno/formulario'
import type { Weekday } from '@/lib/detracao/recolhimento-noturno/tipos'

const TODOS: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

function regra(de: string, ate: string, dias: Weekday[] = TODOS) {
  return segmentoParaRegra({
    ...segmentoFormularioEmBranco(),
    dataInicio: de,
    dataFim: ate,
    horaInicioNoturno: '22:00',
    horaFimNoturno: '06:00',
    diasSemanaNoturno: dias,
  })
}

describe('o turno noturno do último dia conta', () => {
  it('a janela alcança o FIM do turno do último dia (e não só o início dele)', () => {
    const r = regra('2026-01-31', '2026-01-31')
    expect(r.inicio).toBe('2026-01-31T00:00:00')
    // 31/01/2026 é sábado, e sábado está entre os dias noturnos: a janela vai até as 06:00 de
    // 01/02 — o fim do turno que começa às 22:00 de 31/01. Um passo a mais que isso criaria dia
    // espúrio; um a menos descartaria o turno inteiro (a janela é semiaberta).
    expect(r.fim).toBe('2026-02-01T06:00:00')
  })

  it('um único dia marcado computa o turno inteiro de 8h', () => {
    const r = calcular({ timezone: 'America/Sao_Paulo', segmentos: [regra('2026-01-05', '2026-01-05', ['MON'])] })
    expect(r.totalMinutos).toBe(8 * 60)
  })

  it('dois dias consecutivos computam 16h — e não 10h nem 8h', () => {
    const r = calcular({
      timezone: 'America/Sao_Paulo',
      segmentos: [regra('2026-01-05', '2026-01-06', ['MON', 'TUE'])],
    })
    expect(r.totalMinutos).toBe(16 * 60)
  })

  it('sem dia noturno no último dia, a janela termina à meia-noite (folga integral não é esticada)', () => {
    // Só a segunda está marcada; a cautelar vai até terça. A janela NÃO deve ser esticada até as
    // 22:00 de terça, porque não há turno noturno começando em terça.
    const r = regra('2026-01-05', '2026-01-06', ['MON'])
    expect(r.fim).toBe('2026-01-07T00:00:00')
  })

  it('folga integral no último dia ainda computa as 24h dela', () => {
    const sf = {
      ...segmentoFormularioEmBranco(),
      dataInicio: '2026-01-03',
      dataFim: '2026-01-03',
      diasSemanaNoturno: [] as Weekday[],
      diasFolgaIntegral: ['SAT'] as Weekday[],
    }
    const r = calcular({ timezone: 'America/Sao_Paulo', segmentos: [segmentoParaRegra(sf)] })
    expect(r.totalMinutos).toBe(24 * 60)
    expect(r.diasDetracao).toBe(1)
  })

  it('o cenário da tela (01/01/2020 a 01/01/2026, todos os dias, 22h–06h) dá 731 dias', () => {
    const r = calcular({ timezone: 'America/Sao_Paulo', segmentos: [regra('2020-01-01', '2026-01-01')] })
    // 2193 dias tocados × 8h = 17544h = 731 dias exatos — o mesmo número da calculadora de
    // referência. Antes da correção dava 17538h / 730 dias (6h do último turno eram perdidas).
    expect(r.totalMinutos).toBe(2193 * 8 * 60)
    expect(r.totalHoras).toBe('17544:00')
    expect(r.diasDetracao).toBe(731)
    expect(r.saldoMinutos).toBe(0)
  })

  it('a fração menor que 24h continua sendo desprezada (item 3 da tese)', () => {
    // 22:00 → 06:00 de um só dia = 8h = 0 dias. Não vira 1 dia por arredondamento.
    const r = calcular({ timezone: 'America/Sao_Paulo', segmentos: [regra('2026-01-05', '2026-01-05', ['MON'])] })
    expect(r.diasDetracao).toBe(0)
    expect(r.saldoHoras).toBe('08:00')
  })
})
