// tests/detracao/recolhimento-noturno/rn21-modo-simples.spec.ts
//
// A RN-2.1 tirou o modo avançado e subiu os feriados municipais/estaduais para o formulário único.
//
// 🔴 O que este arquivo protege, e é o pedido que originou a mudança: "excluir o modo avançado mas
// com a CERTEZA de que não vai alterar o motor de cálculo do modo simples". Tirar campos da TELA é
// uma coisa; o número não pode mudar. Estes testes comparam a RN-2.1 com a RN-2.0 — que fica
// congelada no registro justamente para servir de referência — e falham se o resultado divergir.

import { describe, it, expect } from 'vitest'
import { versaoAtual, versaoPorRotulo } from '@/lib/detracao/recolhimento-noturno/versoes/registro'
import type { SegmentoFormulario } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-1/formulario'

const rn21 = versaoPorRotulo('RN-2.1')!
const rn20 = versaoPorRotulo('RN-2.0')!

/** O mesmo período, montado nos DOIS formatos de formulário — cada versão consome o seu. */
const BASE = {
  dataInicio: '2025-01-01',
  dataFim: '2025-12-31',
  horaInicioNoturno: '22:00',
  horaFimNoturno: '06:00',
  diasSemanaNoturno: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
  diasFolgaIntegral: ['SAT', 'SUN'],
  feriadosIntegral: [] as string[],
  incluirFeriadosUteis: false,
}

describe('RN-2.1 é a versão vigente', () => {
  it('`versaoAtual()` é a RN-2.1', () => {
    expect(versaoAtual().versao).toBe('RN-2.1')
  })

  it('a RN-2.0 continua disponível para abrir cálculos existentes', () => {
    // 🔴 Congelar não é apagar: um cálculo gravado na RN-2.0 tem de continuar abrindo com o motor
    // DELE. Se esta versão sair do registro, esses cálculos deixam de abrir.
    expect(rn20).not.toBeNull()
    expect(rn20.versao).toBe('RN-2.0')
  })
})

describe('o CÁLCULO do modo simples não mudou entre a RN-2.0 e a RN-2.1', () => {
  it('sem feriados: o total é idêntico nas duas versões', () => {
    const entrada21 = rn21.formulario.paraCalculo({ segmentos: [BASE] })
    const entrada20 = rn20.formulario.paraCalculo({
      timezone: 'America/Sao_Paulo',
      segmentos: [BASE],
    })
    const r21 = rn21.calcular(entrada21)
    const r20 = rn20.calcular(entrada20)

    expect(r21.totalMinutos).toBe(r20.totalMinutos)
    expect(r21.diasDetracao).toBe(r20.diasDetracao)
    expect(r21.saldoMinutos).toBe(r20.saldoMinutos)
    expect(r21.diasUteis).toBe(r20.diasUteis)
    expect(r21.diasIntegrais).toBe(r20.diasIntegrais)
    expect(r21.composicao).toEqual(r20.composicao)
    expect(r21.detracaoEmAnosMesesDias).toEqual(r20.detracaoEmAnosMesesDias)
  })

  it('com o checkbox de feriados nacionais: o total também é idêntico', () => {
    const comFeriados = { ...BASE, incluirFeriadosUteis: true }
    const r21 = rn21.calcular(rn21.formulario.paraCalculo({ segmentos: [comFeriados] }))
    const r20 = rn20.calcular(
      rn20.formulario.paraCalculo({ timezone: 'America/Sao_Paulo', segmentos: [comFeriados] }),
    )
    expect(r21.totalMinutos).toBe(r20.totalMinutos)
    expect(r21.feriadosConsiderados).toEqual(r20.feriadosConsiderados)
    // 255 noites × 8h + 110 integrais × 24h = 4680h (o valor que a tela mostra desde a RN-2.0).
    expect(r21.totalHoras).toBe('4680:00')
  })

  it('com feriados municipais/estaduais: idêntico — o campo é o mesmo nos dois lados', () => {
    // 🔴 Este é o ponto da mudança: o campo que era do modo avançado agora está no formulário
    // simples, mas é O MESMO campo, e o motor o trata igual. O número não pode mudar por causa da
    // mudança de lugar.
    // 🔴 Os dois em DIA ÚTIL, de propósito: um feriado municipal que caia em sábado é capturado
    // antes pela FOLGA INTEGRAL (a precedência da spec), e contaria como folga, não como feriado.
    // 09/07 e 25/01 de 2025 são quarta e sábado — por isso o segundo é 20/08 (quarta).
    const comMunicipais = { ...BASE, feriadosIntegral: ['2025-07-09', '2025-08-20'] }
    const r21 = rn21.calcular(rn21.formulario.paraCalculo({ segmentos: [comMunicipais] }))
    const r20 = rn20.calcular(
      rn20.formulario.paraCalculo({ timezone: 'America/Sao_Paulo', segmentos: [comMunicipais] }),
    )
    expect(r21.totalMinutos).toBe(r20.totalMinutos)
    expect(r21.diasIntegrais).toBe(r20.diasIntegrais)
    // Dois feriados municipais entraram como dias integrais nas duas versões.
    expect(r21.composicao.diasFeriados).toBe(2)
  })
})

describe('RN-2.1 — o formulário é só o modo simples', () => {
  it('o segmento em branco traz os feriados municipais/estaduais', () => {
    const s = rn21.formulario.emBranco() as SegmentoFormulario
    expect(s.feriadosIntegral).toEqual([])
    expect(s.incluirFeriadosUteis).toBe(false)
  })

  it('o formulário não carrega mais os campos que eram do modo avançado', () => {
    const s = rn21.formulario.emBranco() as Record<string, unknown>
    expect('timezone' in s).toBe(false)
    expect('observacoes' in s).toBe(false)
    expect('monitoramentoEletronico' in s).toBe(false)
  })

  it('a entrada do motor mantém o fuso, que o pacote preenche sozinho', () => {
    // O fuso saiu do FORMULÁRIO, mas continua na entrada: os cálculos gravados antes o têm, e o
    // formato da entrada não precisa encolher por causa da tela.
    const e = rn21.formulario.paraCalculo({ segmentos: [BASE] }) as { timezone: string }
    expect(e.timezone).toBe('America/Sao_Paulo')
  })
})

describe('RN-2.1 — feriados municipais/estaduais computam pelo valor da regra', () => {
  it('um feriado municipal em dia útil vale 24h, e não o turno noturno', () => {
    const s: SegmentoFormulario = {
      dataInicio: '2025-07-09', // quarta — feriado estadual de SP
      dataFim: '2025-07-09',
      horaInicioNoturno: '22:00',
      horaFimNoturno: '06:00',
      diasSemanaNoturno: ['WED'],
      diasFolgaIntegral: [],
      feriadosIntegral: ['2025-07-09'],
      incluirFeriadosUteis: false,
    }
    const r = rn21.calcular(rn21.formulario.paraCalculo({ segmentos: [s] }))
    expect(r.diasUteis).toBe(0)
    expect(r.composicao.diasFeriados).toBe(1)
    expect(r.totalMinutos).toBe(1440)
  })

  it('feriado municipal que NÃO está na lista continua sendo dia de regra noturna', () => {
    const s: SegmentoFormulario = {
      dataInicio: '2025-07-09',
      dataFim: '2025-07-09',
      horaInicioNoturno: '22:00',
      horaFimNoturno: '06:00',
      diasSemanaNoturno: ['WED'],
      diasFolgaIntegral: [],
      feriadosIntegral: [], // não declarado
      incluirFeriadosUteis: false,
    }
    const r = rn21.calcular(rn21.formulario.paraCalculo({ segmentos: [s] }))
    expect(r.diasUteis).toBe(1)
    expect(r.totalMinutos).toBe(480)
  })
})