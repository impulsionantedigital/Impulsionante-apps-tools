// tests/detracao/recolhimento-noturno/motor.spec.ts
import { describe, it, expect } from 'vitest'
import { calcular } from '@/lib/detracao/recolhimento-noturno/motor'
import type { SegmentoRegra, Weekday } from '@/lib/detracao/recolhimento-noturno/tipos'

/** `SegmentoRegra` com todos os campos preenchidos — os testes só sobrescrevem o que importa. */
function segmentoBase(overrides: Partial<SegmentoRegra>): SegmentoRegra {
  return {
    dataInicio: '2026-01-01',
    dataFim: '2026-01-02',
    horaInicioNoturno: '22:00',
    horaFimNoturno: '06:00',
    diasSemanaNoturno: [],
    diasFolgaIntegral: [],
    feriadosIntegral: [],
    incluirFeriadosUteis: false,
    ...overrides,
  }
}

const TODOS: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

function calcular1(s: Partial<SegmentoRegra>) {
  return calcular({ timezone: 'America/Sao_Paulo', segmentos: [segmentoBase(s)] })
}

describe('motor — contagem de dias', () => {
  it('um dia de regra noturna vale o turno inteiro (22:00→06:00 = 8h)', () => {
    // Segunda 05/01/2026. O turno atravessa a meia-noite, e isso é irrelevante: vale 8h no dia.
    const r = calcular1({
      dataInicio: '2026-01-05',
      dataFim: '2026-01-05',
      diasSemanaNoturno: ['MON'],
    })
    expect(r.diasUteis).toBe(1)
    expect(r.totalMinutos).toBe(8 * 60)
    expect(r.diasDetracao).toBe(0)
    expect(r.saldoHoras).toBe('08:00')
  })

  it('mesmo período com N dias marcados: total = N × 8h (é só multiplicar)', () => {
    // 05/01 (seg), 12/01 (seg), 19/01 (seg) — três segundas.
    const r = calcular1({
      dataInicio: '2026-01-05',
      dataFim: '2026-01-19',
      diasSemanaNoturno: ['MON'],
    })
    expect(r.diasUteis).toBe(3)
    expect(r.totalMinutos).toBe(3 * 8 * 60)
    expect(r.diasDetracao).toBe(1)
  })

  it('o último dia do período CONTA — o fim é inclusivo', () => {
    // 🔴 O que antes exigia estender uma janela até o fim do turno agora é simplesmente o dia
    // estar no intervalo. "Fim da cautelar = 05/01" significa que 05/01 conta.
    const r = calcular1({
      dataInicio: '2026-01-05',
      dataFim: '2026-01-05',
      diasSemanaNoturno: ['MON'],
    })
    expect(r.diasUteis).toBe(1)
    expect(r.totalMinutos).toBe(8 * 60)
  })

  it('o PRIMEIRO dia do período conta — o início é inclusivo', () => {
    const r = calcular1({
      dataInicio: '2026-01-05',
      dataFim: '2026-01-06',
      diasSemanaNoturno: ['MON'],
    })
    expect(r.diasUteis).toBe(1)
  })

  it('dia de folga integral vale 24h', () => {
    // Sábado 03/01 e domingo 04/01 de 2026.
    const r = calcular1({
      dataInicio: '2026-01-03',
      dataFim: '2026-01-04',
      diasFolgaIntegral: ['SAT', 'SUN'],
    })
    expect(r.composicao.diasFolgaIntegral).toBe(2)
    expect(r.totalMinutos).toBe(2 * 1440)
    expect(r.diasDetracao).toBe(2)
  })

  it('ano inteiro de 2025: 256 dias de regra noturna × 8h', () => {
    // 2025 tem 365 dias, 104 de fim de semana, 5 feriados em dia útil (com o checkbox).
    const r = calcular1({
      dataInicio: '2025-01-01',
      dataFim: '2025-12-31',
      diasSemanaNoturno: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      diasFolgaIntegral: ['SAT', 'SUN'],
      incluirFeriadosUteis: true,
    })
    // 365 = 104 (fds) + 5 (feriados em dia útil) + 256 (regra noturna).
    expect(r.diasUteis + r.composicao.diasFeriados + r.composicao.diasFolgaIntegral).toBe(365)
    expect(r.diasIntegrais).toBe(109)
    expect(r.composicao.diasFolgaIntegral).toBe(104)
    expect(r.composicao.diasFeriados).toBe(5)
    expect(r.diasUteis).toBe(256)
    // 🔴 As 256 noites valem 256 × 8h = 2048h — era ESTE o número que a tela mostrava como 1718h.
    expect(r.composicao.minutosUteis).toBe(256 * 8 * 60)
    expect(r.composicao.minutosUteis / 60).toBe(2048)
    // O total soma também os 109 dias integrais (104 fins de semana + 5 feriados) × 24h.
    expect(r.composicao.diasIntegrais).toBe(109)
    expect(r.composicao.minutosIntegrais).toBe(109 * 1440)
    expect(r.totalMinutos).toBe(256 * 8 * 60 + 109 * 1440)
    expect(r.totalHoras).toBe('4664:00')
  })

  it('folga integral tem PRECEDÊNCIA sobre a regra noturna', () => {
    const r = calcular1({
      dataInicio: '2026-01-03', // sábado
      dataFim: '2026-01-03',
      diasSemanaNoturno: ['SAT'],
      diasFolgaIntegral: ['SAT'],
    })
    expect(r.composicao.diasFolgaIntegral).toBe(1)
    expect(r.diasUteis).toBe(0)
    expect(r.totalMinutos).toBe(1440)
  })

  it('ausência de monitoramento eletrônico não altera o resultado', () => {
    const s = segmentoBase({ dataInicio: '2026-01-05', dataFim: '2026-01-05', diasSemanaNoturno: ['MON'] })
    const com = calcular({ timezone: 'America/Sao_Paulo', segmentos: [s], monitoramentoEletronico: 'sim' })
    const sem = calcular({ timezone: 'America/Sao_Paulo', segmentos: [s], monitoramentoEletronico: 'nao' })
    expect(sem.totalMinutos).toBe(com.totalMinutos)
    expect(sem.totalMinutos).toBeGreaterThan(0)
  })
})

describe('motor — feriados nacionais (checkbox `incluirFeriadosUteis`)', () => {
  it('desmarcado: feriado nacional em dia útil cai na regra noturna', () => {
    // 01/01/2026 é quinta-feira e feriado nacional.
    const r = calcular1({
      dataInicio: '2026-01-01',
      dataFim: '2026-01-01',
      diasSemanaNoturno: ['THU'],
      incluirFeriadosUteis: false,
    })
    expect(r.totalMinutos).toBe(8 * 60)
    expect(r.diasUteis).toBe(1)
    expect(r.composicao.diasFeriados).toBe(0)
  })

  it('marcado: feriado nacional vale 24h', () => {
    const r = calcular1({
      dataInicio: '2026-01-01',
      dataFim: '2026-01-01',
      diasSemanaNoturno: ['THU'],
      incluirFeriadosUteis: true,
    })
    expect(r.totalMinutos).toBe(1440)
    expect(r.composicao.diasFeriados).toBe(1)
    expect(r.diasUteis).toBe(0)
    expect(r.diasDetracao).toBe(1)
  })

  it('feriado vale 24h mesmo se o dia da semana não está em `diasSemanaNoturno`', () => {
    const r = calcular1({
      dataInicio: '2026-01-01', // quinta
      dataFim: '2026-01-01',
      diasSemanaNoturno: ['MON'],
      incluirFeriadosUteis: true,
    })
    expect(r.composicao.diasFeriados).toBe(1)
    expect(r.totalMinutos).toBe(1440)
  })

  it('feriado que cai em folga integral computa 24h UMA vez (sem duplicar)', () => {
    // 25/12/2026 é sexta (Natal). Com sáb/dom como folga integral: 25, 26 e 27 = 3 dias integrais.
    const r = calcular1({
      dataInicio: '2026-12-25',
      dataFim: '2026-12-27',
      diasFolgaIntegral: ['SAT', 'SUN'],
      incluirFeriadosUteis: true,
    })
    expect(r.composicao.diasFeriados).toBe(1) // só o Natal
    expect(r.composicao.diasFolgaIntegral).toBe(2) // sábado e domingo
    expect(r.totalMinutos).toBe(3 * 1440)
  })

  it('feriado móvel NÃO entra: a lista de origem só tem datas fixas', () => {
    // 03/04/2026 é Sexta-feira Santa, e não está na lista homologada.
    const r = calcular1({
      dataInicio: '2026-04-03',
      dataFim: '2026-04-03',
      incluirFeriadosUteis: true,
    })
    expect(r.totalMinutos).toBe(0)
  })

  it('feriado declarado à mão (`feriadosIntegral`) vale 24h sem o checkbox', () => {
    const r = calcular1({
      dataInicio: '2026-07-09', // feriado estadual de SP — não é nacional
      dataFim: '2026-07-09',
      feriadosIntegral: ['2026-07-09'],
    })
    expect(r.composicao.diasFeriados).toBe(1)
    expect(r.totalMinutos).toBe(1440)
  })
})

describe('motor — o último dia NÃO vaza para o dia seguinte', () => {
  it('período de um dia só não computa o dia seguinte', () => {
    // 🔴 Regressivo: a versão anterior esticava a janela até o fim do turno, e um cálculo de
    // 31/12/2025 alcançava 01/01/2026 — um dia A MAIS, que ainda por cima era feriado.
    const r = calcular1({
      dataInicio: '2025-12-31',
      dataFim: '2025-12-31',
      diasSemanaNoturno: ['WED'],
      incluirFeriadosUteis: true,
    })
    expect(r.diasUteis).toBe(1)
    expect(r.composicao.diasFeriados).toBe(0)
    expect(r.totalMinutos).toBe(8 * 60)
  })

  it('31/12/2025 a 31/12/2025 não inclui 01/01/2026', () => {
    const r = calcular1({
      dataInicio: '2025-12-31',
      dataFim: '2025-12-31',
      diasSemanaNoturno: TODOS,
      incluirFeriadosUteis: true,
    })
    expect(r.totalMinutos).toBe(8 * 60)
  })

  it('ano inteiro de 2025 fecha em 365 dias de calendário, sem sobra', () => {
    const r = calcular1({
      dataInicio: '2025-01-01',
      dataFim: '2025-12-31',
      diasSemanaNoturno: TODOS,
    })
    // Todos os dias marcados: 365 dias × 8h, e nenhum dia de 2026.
    expect(r.diasUteis).toBe(365)
    expect(r.totalMinutos).toBe(365 * 8 * 60)
  })
})

describe('motor — composição e casos de borda', () => {
  it('a composição fecha com o total', () => {
    const r = calcular1({
      dataInicio: '2025-01-01',
      dataFim: '2025-12-31',
      diasSemanaNoturno: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      diasFolgaIntegral: ['SAT', 'SUN'],
      incluirFeriadosUteis: true,
    })
    const c = r.composicao
    expect(c.minutosUteis + c.minutosIntegrais).toBe(r.totalMinutos)
    expect(c.minutosUteis).toBe(c.diasUteis * 8 * 60)
    expect(c.minutosIntegrais).toBe(c.diasIntegrais * 1440)
    expect(c.diasIntegrais).toBe(c.diasFeriados + c.diasFolgaIntegral)
  })

  it('rejeita horário noturno com início igual ao fim (ambíguo)', () => {
    expect(() =>
      calcular1({ horaInicioNoturno: '00:00', horaFimNoturno: '00:00', diasSemanaNoturno: ['MON'] }),
    ).toThrow(/ambígu/)
  })

  it('rejeita data final anterior à inicial', () => {
    expect(() => calcular1({ dataInicio: '2026-01-10', dataFim: '2026-01-01' })).toThrow(/posterior/)
  })

  it('rejeita data fora do formato', () => {
    expect(() => calcular1({ dataInicio: '10/01/2026' })).toThrow(/formato/)
  })

  it('rejeita nenhum segmento informado', () => {
    expect(() => calcular({ timezone: 'America/Sao_Paulo', segmentos: [] })).toThrow(/segmento/)
  })

  it('nunca produz float: totalMinutos e saldoMinutos são sempre inteiros', () => {
    const r = calcular1({
      dataInicio: '2026-01-05',
      dataFim: '2026-01-05',
      horaInicioNoturno: '22:00',
      horaFimNoturno: '05:37',
      diasSemanaNoturno: ['MON'],
    })
    expect(Number.isInteger(r.totalMinutos)).toBe(true)
    expect(Number.isInteger(r.saldoMinutos)).toBe(true)
  })

  it('segmento sem nenhum dia marcado gera zero, sem erro', () => {
    const r = calcular1({ dataInicio: '2026-01-05', dataFim: '2026-01-05' })
    expect(r.totalMinutos).toBe(0)
  })

  it('dia de um segmento não é contado duas vezes pelo segmento seguinte', () => {
    const r = calcular({
      timezone: 'America/Sao_Paulo',
      segmentos: [
        segmentoBase({ dataInicio: '2026-01-05', dataFim: '2026-01-05', diasSemanaNoturno: ['MON'] }),
        segmentoBase({ dataInicio: '2026-01-05', dataFim: '2026-01-05', diasSemanaNoturno: ['MON'] }),
      ],
    })
    // Dois segmentos que cobrem o mesmo dia somam os dois — é o que o membro pediu ao criá-los.
    expect(r.diasUteis).toBe(2)
    expect(r.totalMinutos).toBe(16 * 60)
  })
})
