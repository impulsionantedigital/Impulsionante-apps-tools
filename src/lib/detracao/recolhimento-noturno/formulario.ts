// src/lib/detracao/recolhimento-noturno/formulario.ts
//
// A ponte entre os campos que a TELA edita e o que o MOTOR espera. É uma conversão de nomes: o
// formulário chama o período de "início/fim da cautelar" e o motor de `dataInicio`/`dataFim` — os
// dois em dias de calendário, sem instante e sem janela semiaberta.

import type { EntradaCalculo, SegmentoRegra, Weekday } from './tipos'

export type SegmentoFormulario = {
  dataInicio: string
  dataFim: string
  horaInicioNoturno: string
  horaFimNoturno: string
  diasSemanaNoturno: Weekday[]
  diasFolgaIntegral: Weekday[]
  feriadosIntegral: string[]
  incluirFeriadosUteis: boolean
}

export type EntradaFormulario = {
  timezone: string
  segmentos: SegmentoFormulario[]
  observacoes?: string
  monitoramentoEletronico?: 'sim' | 'nao' | 'nao_informado'
}

export function segmentoParaRegra(sf: SegmentoFormulario): SegmentoRegra {
  return {
    dataInicio: sf.dataInicio,
    dataFim: sf.dataFim,
    horaInicioNoturno: sf.horaInicioNoturno,
    horaFimNoturno: sf.horaFimNoturno,
    diasSemanaNoturno: sf.diasSemanaNoturno,
    diasFolgaIntegral: sf.diasFolgaIntegral,
    feriadosIntegral: sf.feriadosIntegral,
    incluirFeriadosUteis: sf.incluirFeriadosUteis,
  }
}

export function entradaFormularioParaCalculo(ef: EntradaFormulario): EntradaCalculo {
  return {
    timezone: ef.timezone,
    segmentos: ef.segmentos.map(segmentoParaRegra),
    observacoes: ef.observacoes,
    monitoramentoEletronico: ef.monitoramentoEletronico,
  }
}

export function segmentoFormularioEmBranco(): SegmentoFormulario {
  return {
    dataInicio: '',
    dataFim: '',
    horaInicioNoturno: '22:00',
    horaFimNoturno: '06:00',
    diasSemanaNoturno: [],
    diasFolgaIntegral: [],
    feriadosIntegral: [],
    // Desmarcado por padrão: computar feriado como dia integral é uma escolha jurídica do caso,
    // não um default que o produto presume pelo membro.
    incluirFeriadosUteis: false,
  }
}
