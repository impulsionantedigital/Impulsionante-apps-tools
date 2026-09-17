// tests/detracao/recolhimento-noturno/motor.spec.ts
import { describe, it, expect } from 'vitest'
import { calcular } from '@/lib/detracao/recolhimento-noturno/motor'
import type { SegmentoRegra, Weekday } from '@/lib/detracao/recolhimento-noturno/tipos'

/** `SegmentoRegra` com todos os campos preenchidos — os testes só sobrescrevem o que importa. */
function segmentoBase(overrides: Partial<SegmentoRegra>): SegmentoRegra {
  return {
    inicio: '2026-01-01T00:00:00',
    fim: '2026-01-02T00:00:00',
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
describe('motor — contagem de dias (PASSO 3 da spec)', () => {
  it('dia de regra noturna vale H_NOTURNO, com turno que atravessa a meia-noite', () => {
    // 22:00 → 06:00 = 8h. Uma segunda-feira (05/01/2026) marcada = 8h = 0 dias, saldo 08:00.
    const r = calcular1({
      inicio: '2026-01-05T00:00:00',
      fim: '2026-01-06T00:00:00',
      diasSemanaNoturno: ['MON'],
    })
    expect(r.totalMinutos).toBe(8 * 60)
    expect(r.diasUteis).toBe(1)
    expect(r.diasIntegrais).toBe(0)
    expect(r.diasDetracao).toBe(0)
    expect(r.saldoHoras).toBe('08:00')
  })

  it('turno de 8h em duas segundas = 16h = 0 dias (fração não arredonda)', () => {
    const r = calcular1({
      inicio: '2026-01-05T00:00:00',
      fim: '2026-01-13T00:00:00',
      diasSemanaNoturno: ['MON'],
    })
    expect(r.totalMinutos).toBe(16 * 60)
    expect(r.diasUteis).toBe(2)
    expect(r.diasDetracao).toBe(0)
  })

  it('três segundas de 8h = 24h = exatamente 1 dia', () => {
    const r = calcular1({
      inicio: '2026-01-05T00:00:00',
      fim: '2026-01-20T00:00:00',
      diasSemanaNoturno: ['MON'],
    })
    expect(r.totalMinutos).toBe(24 * 60)
    expect(r.diasUteis).toBe(3)
    expect(r.diasDetracao).toBe(1)
    expect(r.saldoMinutos).toBe(0)
  })

  it('dia de folga integral vale 24h', () => {
    // Sábado 03/01/2026 e domingo 04/01: 2 dias integrais = 48h = 2 dias.
    const r = calcular1({
      inicio: '2026-01-03T00:00:00',
      fim: '2026-01-05T00:00:00',
      diasFolgaIntegral: ['SAT', 'SUN'],
    })
    expect(r.totalMinutos).toBe(48 * 60)
    expect(r.diasIntegrais).toBe(2)
    expect(r.diasDetracao).toBe(2)
  })

  it('30 dias de turno 22h–05h (7h cada): 210h = 8 dias e 18h de saldo', () => {
    const r = calcular1({
      inicio: '2026-02-01T00:00:00',
      fim: '2026-03-03T00:00:00',
      horaInicioNoturno: '22:00',
      horaFimNoturno: '05:00',
      diasSemanaNoturno: TODOS,
    })
    expect(r.diasUteis).toBe(30)
    expect(r.totalMinutos).toBe(30 * 7 * 60)
    expect(r.diasDetracao).toBe(8)
    expect(r.saldoHoras).toBe('18:00')
  })

  it('folga integral tem PRECEDÊNCIA sobre a regra noturna: sábado nos dois grupos vale 24h', () => {
    const r = calcular1({
      inicio: '2026-01-03T00:00:00',
      fim: '2026-01-04T00:00:00',
      horaInicioNoturno: '22:00',
      horaFimNoturno: '06:00',
      diasSemanaNoturno: ['SAT'],
      diasFolgaIntegral: ['SAT'],
    })
    expect(r.totalMinutos).toBe(24 * 60)
    expect(r.diasIntegrais).toBe(1)
    expect(r.diasUteis).toBe(0)
  })

  it('mudança de regra no meio do período: a contagem vale para os dias de cada segmento', () => {
    const r = calcular({
      timezone: 'America/Sao_Paulo',
      segmentos: [
        segmentoBase({
          inicio: '2026-01-05T00:00:00', // segunda
          fim: '2026-01-06T00:00:00',
          horaInicioNoturno: '22:00',
          horaFimNoturno: '23:00',
          diasSemanaNoturno: ['MON'],
        }),
        segmentoBase({
          inicio: '2026-03-02T00:00:00', // segunda
          fim: '2026-03-03T00:00:00',
          horaInicioNoturno: '20:00',
          horaFimNoturno: '22:00',
          diasSemanaNoturno: ['MON'],
        }),
      ],
    })
    // Os dois segmentos somam os seus dias úteis: 2 dias × H_NOTURNO do primeiro segmento (1h).
    expect(r.diasUteis).toBe(2)
    expect(r.totalMinutos).toBe(2 * 60)
  })

  it('ausência de monitoramento eletrônico não altera o resultado', () => {
    const s = segmentoBase({
      inicio: '2026-01-05T00:00:00',
      fim: '2026-01-06T00:00:00',
      diasSemanaNoturno: ['MON'],
    })
    const com = calcular({ timezone: 'America/Sao_Paulo', segmentos: [s], monitoramentoEletronico: 'sim' })
    const sem = calcular({ timezone: 'America/Sao_Paulo', segmentos: [s], monitoramentoEletronico: 'nao' })
    expect(sem.totalMinutos).toBe(com.totalMinutos)
    expect(sem.totalMinutos).toBeGreaterThan(0)
  })
})

describe('motor — feriados nacionais (checkbox `incluirFeriadosUteis`)', () => {
  it('desmarcado: feriado nacional em dia útil cai na regra noturna', () => {
    // 01/01/2026 é quinta-feira e feriado nacional (Confraternização Universal).
    const r = calcular1({
      inicio: '2026-01-01T00:00:00',
      fim: '2026-01-02T00:00:00',
      diasSemanaNoturno: ['THU'],
      incluirFeriadosUteis: false,
    })
    expect(r.totalMinutos).toBe(8 * 60)
    expect(r.diasUteis).toBe(1)
    expect(r.diasIntegrais).toBe(0)
  })

  it('marcado: feriado nacional em dia útil vale 24h', () => {
    const r = calcular1({
      inicio: '2026-01-01T00:00:00',
      fim: '2026-01-02T00:00:00',
      diasSemanaNoturno: ['THU'],
      incluirFeriadosUteis: true,
    })
    expect(r.totalMinutos).toBe(24 * 60)
    expect(r.diasIntegrais).toBe(1)
    expect(r.diasUteis).toBe(0)
    expect(r.diasDetracao).toBe(1)
  })

  it('marcado: feriado nacional vale 24h mesmo se o dia da semana não está em `diasSemanaNoturno`', () => {
    // 🔴 Leitura fiel do PASSO 3: a condição do feriado NÃO exige pertencimento a
    // `dias_regra_noturna` — ela é independente da regra noturna do dia da semana.
    const r = calcular1({
      inicio: '2026-01-01T00:00:00',
      fim: '2026-01-02T00:00:00',
      diasSemanaNoturno: ['MON'],
      incluirFeriadosUteis: true,
    })
    expect(r.totalMinutos).toBe(24 * 60)
    expect(r.diasIntegrais).toBe(1)
    expect(r.diasUteis).toBe(0)
  })

  it('feriado que cai em folga integral computa 24h UMA vez (sem duplicar)', () => {
    // 25/12/2026 é sexta-feira (Natal). Com sábado e domingo como folga integral e o Natal
    // feriado: 3 dias integrais, não 4.
    const r = calcular1({
      inicio: '2026-12-25T00:00:00',
      fim: '2026-12-28T00:00:00',
      diasFolgaIntegral: ['SAT', 'SUN'],
      incluirFeriadosUteis: true,
    })
    expect(r.diasIntegrais).toBe(3)
    expect(r.totalMinutos).toBe(3 * 1440)
  })

  it('feriado móvel NÃO entra: a lista de origem só tem datas fixas', () => {
    // 🔴 03/04/2026 é Sexta-feira Santa, e NÃO está em `temp/feriados.json` — o arquivo traz apenas
    // datas fixas (mais as Eleições gerais de 1990/1994). Quem deriva a Páscoa aqui reintroduz uma
    // regra que a fonte homologada não tem, e o dia passa a computar 24h que ninguém pediu.
    const r = calcular1({
      inicio: '2026-04-03T00:00:00',
      fim: '2026-04-04T00:00:00',
      incluirFeriadosUteis: true,
    })
    expect(r.diasIntegrais).toBe(0)
    expect(r.totalMinutos).toBe(0)
  })

  it('feriado de data fixa vale em qualquer ano coberto, pelo arquivo', () => {
    // 21/04/2026 é Tiradentes, uma terça-feira.
    const r = calcular1({
      inicio: '2026-04-21T00:00:00',
      fim: '2026-04-22T00:00:00',
      incluirFeriadosUteis: true,
    })
    expect(r.diasIntegrais).toBe(1)
    expect(r.totalMinutos).toBe(24 * 60)
  })

  it('feriado explícito (`feriadosIntegral`) continua valendo 24h sem o checkbox', () => {
    const r = calcular1({
      inicio: '2026-07-09T00:00:00', // quinta, feriado estadual de SP — não é nacional
      fim: '2026-07-10T00:00:00',
      feriadosIntegral: ['2026-07-09'],
    })
    expect(r.diasIntegrais).toBe(1)
    expect(r.totalMinutos).toBe(24 * 60)
  })
})

describe('motor — memória de cálculo e exclusões', () => {
  it('gera as faixas do dia integral para a memória de cálculo', () => {
    const r = calcular1({
      inicio: '2026-01-05T00:00:00',
      fim: '2026-01-06T00:00:00',
      diasFolgaIntegral: ['MON'],
    })
    expect(r.intervalosConsolidados).toEqual([
      { inicio: '2026-01-05T00:00:00', fim: '2026-01-06T00:00:00' },
    ])
  })

  it('gera o turno noturno atravessando a meia-noite quando a janela o alcança', () => {
    // A janela do formulário (`segmentoParaRegra`) é estendida até o FIM do turno do último dia
    // — é isso que o caso real produz (ver `turno-do-ultimo-dia.spec.ts`). Aqui a janela já vem
    // estendida, como viria da tela.
    const r = calcular1({
      inicio: '2026-01-05T00:00:00',
      fim: '2026-01-06T06:00:00',
      diasSemanaNoturno: ['MON'],
    })
    expect(r.intervalosConsolidados).toEqual([
      { inicio: '2026-01-05T22:00:00', fim: '2026-01-06T06:00:00' },
    ])
  })

  it('turno de um dia só, com a janela fechando à meia-noite, é recortado por ela', () => {
    // A janela é semiaberta e termina em 06/01T00:00 — o turno das 22:00 fica só com as 2h
    // antes da meia-noite. É o recorte de BORDA, e não contradiz o total: o dia conta 8h pela
    // regra (PASSO 3), enquanto a memória de cálculo mostra o que a janela alcança.
    const r = calcular1({
      inicio: '2026-01-05T00:00:00',
      fim: '2026-01-06T00:00:00',
      diasSemanaNoturno: ['MON'],
    })
    expect(r.diasUteis).toBe(1)
    expect(r.totalMinutos).toBe(8 * 60)
    expect(r.intervalosConsolidados).toEqual([
      { inicio: '2026-01-05T22:00:00', fim: '2026-01-06T00:00:00' },
    ])
  })

  it('não há intervalos excluídos no resultado — o campo foi removido com a funcionalidade', () => {
    const r = calcular1({
      inicio: '2026-01-05T00:00:00',
      fim: '2026-01-06T00:00:00',
      diasSemanaNoturno: ['MON'],
    })
    expect('intervalosExcluidos' in r).toBe(false)
  })
})

describe('motor — casos de borda (§12 do plano)', () => {
  it('rejeita horário noturno com início igual ao fim (ambíguo)', () => {
    expect(() =>
      calcular1({ horaInicioNoturno: '00:00', horaFimNoturno: '00:00', diasSemanaNoturno: ['MON'] }),
    ).toThrow(/ambígu/)
  })

  it('nunca produz float: totalMinutos e saldoMinutos são sempre inteiros', () => {
    const r = calcular1({
      inicio: '2026-01-05T00:00:00',
      fim: '2026-01-06T00:00:00',
      horaInicioNoturno: '22:00',
      horaFimNoturno: '05:37',
      diasSemanaNoturno: ['MON'],
    })
    expect(Number.isInteger(r.totalMinutos)).toBe(true)
    expect(Number.isInteger(r.saldoMinutos)).toBe(true)
  })

  it('rejeita nenhum segmento informado', () => {
    expect(() => calcular({ timezone: 'America/Sao_Paulo', segmentos: [] })).toThrow(/segmento/)
  })

  it('rejeita data final anterior à inicial', () => {
    expect(() =>
      calcular1({ inicio: '2026-01-02T00:00:00', fim: '2026-01-01T00:00:00' }),
    ).toThrow(/posterior/)
  })

  it('segmento sem nenhum dia marcado gera zero, sem erro', () => {
    const r = calcular1({ inicio: '2026-01-05T00:00:00', fim: '2026-01-06T00:00:00' })
    expect(r.totalMinutos).toBe(0)
  })
})
