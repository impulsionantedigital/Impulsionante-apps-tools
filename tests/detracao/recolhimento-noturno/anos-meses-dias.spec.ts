// tests/detracao/recolhimento-noturno/anos-meses-dias.spec.ts
//
// A conversão do total em anos/meses/dias, ao lado dos dias de 24h no resumo. É a MESMA grandeza
// dita na unidade do juízo, e é o número que vai para a peça — por isso ele não pode divergir do
// `diasDetracao`, e a convenção (365/30) não pode ser trocada pelo calendário real sem alguém
// perceber.
//
// 🔴 1 ano = 365 dias e 1 mês = 30 dias são DIVISORES FIXOS da conta de execução penal, não o
// calendário: o ano real tem 365 ou 366, o mês tem 28 a 31. É a mesma convenção da planilha de
// referência; trocá-la por diferença de datas reais mudaria o número de cálculos já em uso.

import { describe, it, expect } from 'vitest'
import { paraAnosMesesDias, calcular } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-0/motor'

describe('paraAnosMesesDias — a convenção da execução penal', () => {
  it('zero dias', () => {
    expect(paraAnosMesesDias(0)).toEqual({ anos: 0, meses: 0, dias: 0 })
  })

  it('abaixo de um mês fica só em dias', () => {
    expect(paraAnosMesesDias(29)).toEqual({ anos: 0, meses: 0, dias: 29 })
  })

  it('exatamente 30 dias é 1 mês', () => {
    expect(paraAnosMesesDias(30)).toEqual({ anos: 0, meses: 1, dias: 0 })
  })

  it('exatamente 365 dias é 1 ano', () => {
    expect(paraAnosMesesDias(365)).toEqual({ anos: 1, meses: 0, dias: 0 })
  })

  it('um ano é 365 dias — e NÃO 360 (doze meses de 30)', () => {
    // 🔴 O divisor do ano tem precedência sobre o do mês. Se a conta fosse "meses primeiro",
    // 365 dias dariam 12 meses e 5 dias, e não 1 ano. Os dois caminhos divergem em 5 dias aqui.
    expect(paraAnosMesesDias(365)).toEqual({ anos: 1, meses: 0, dias: 0 })
    expect(paraAnosMesesDias(360)).toEqual({ anos: 0, meses: 12, dias: 0 })
  })

  it('1 ano e 1 mês = 395 dias', () => {
    expect(paraAnosMesesDias(395)).toEqual({ anos: 1, meses: 1, dias: 0 })
  })

  it('1 ano, 2 meses e 3 dias = 365 + 60 + 3', () => {
    expect(paraAnosMesesDias(428)).toEqual({ anos: 1, meses: 2, dias: 3 })
  })

  it('o resto depois dos meses fica em dias', () => {
    expect(paraAnosMesesDias(400)).toEqual({ anos: 1, meses: 1, dias: 5 })
  })

  it('dois anos exatos', () => {
    expect(paraAnosMesesDias(730)).toEqual({ anos: 2, meses: 0, dias: 0 })
  })

  it('a decomposição reconstrói o total', () => {
    // Propriedade geral: anos × 365 + meses × 30 + dias === entrada, para qualquer dia.
    for (const dias of [0, 1, 29, 30, 59, 60, 364, 365, 400, 731, 1461, 3650]) {
      const { anos, meses, dias: d } = paraAnosMesesDias(dias)
      expect(anos * 365 + meses * 30 + d).toBe(dias)
    }
  })

  it('nunca devolve fração nem valor negativo', () => {
    expect(paraAnosMesesDias(100.7)).toEqual(paraAnosMesesDias(100))
    expect(Number.isInteger(paraAnosMesesDias(1234.9).dias)).toBe(true)
    expect(paraAnosMesesDias(-5)).toEqual({ anos: 0, meses: 0, dias: 0 })
  })
})

describe('o resultado do cálculo traz a conversão coerente com os dias', () => {
  it('a conversão parte do MESMO diasDetracao do destaque — não de um segundo cálculo', () => {
    const r = calcular({
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
          incluirFeriadosUteis: true,
        },
      ],
    })
    // 195 dias → 6 meses e 15 dias (195 = 6 × 30 + 15), sem completar um ano.
    // (Eram 194 antes de a Sexta-feira Santa entrar na lista: 18/04/2025 é um dia útil.)
    expect(r.diasDetracao).toBe(195)
    expect(r.detracaoEmAnosMesesDias).toEqual({ anos: 0, meses: 6, dias: 15 })
  })

  it('o saldo abaixo de 24h NÃO entra na conversão', () => {
    // 8h = 0 dias → 0 anos 0 meses 0 dias, ainda que haja 8 horas computadas.
    const r = calcular({
      timezone: 'America/Sao_Paulo',
      segmentos: [
        {
          dataInicio: '2026-01-05',
          dataFim: '2026-01-05',
          horaInicioNoturno: '22:00',
          horaFimNoturno: '06:00',
          diasSemanaNoturno: ['MON'],
          diasFolgaIntegral: [],
          feriadosIntegral: [],
          incluirFeriadosUteis: false,
        },
      ],
    })
    expect(r.diasDetracao).toBe(0)
    expect(r.detracaoEmAnosMesesDias).toEqual({ anos: 0, meses: 0, dias: 0 })
    expect(r.saldoHoras).toBe('08:00')
  })
})
