// src/lib/detracao/recolhimento-noturno/versoes/rn-2-1/formulario.ts
//
// A ponte entre os campos que a TELA edita e o que o MOTOR espera. É uma conversão de nomes: o
// formulário chama o período de "início/fim da cautelar" e o motor de `dataInicio`/`dataFim` — os
// dois em dias de calendário, sem instante e sem janela semiaberta.
//
// 🔴 RN-2.1 — O MODO SIMPLES É O ÚNICO MODO. Saíram o toggle "avançado", os múltiplos segmentos, o
// fuso configurável, o monitoramento eletrônico e as observações. O que a tela edita agora é um
// período só, e é isto aqui. A RN-2.0 fica intacta em `../rn-2-0/`: modificar uma versão já em uso
// está fora de questão, mesmo que a tabela esteja vazia hoje.

import type { EntradaCalculo, SegmentoRegra, Weekday } from './tipos'

export type SegmentoFormulario = {
  dataInicio: string
  dataFim: string
  horaInicioNoturno: string
  horaFimNoturno: string
  diasSemanaNoturno: Weekday[]
  diasFolgaIntegral: Weekday[]
  /** 🔴 SOBE para o modo simples na RN-2.1: são os feriados MUNICIPAIS e ESTADUAIS, que a lista
   *  nacional de `feriados.ts` não cobre e que a decisão do caso pode computar como dia integral.
   *  O motor já os lia — o que mudou é que agora há como preenchê-los sem esconder-se atrás de um
   *  modo avançado. */
  feriadosIntegral: string[]
  /** O checkbox dos feriados NACIONAIS (lista de `feriados.ts`). */
  incluirFeriadosUteis: boolean
}

export type EntradaFormulario = {
  segmentos: SegmentoFormulario[]
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

/** O fuso não é mais editável e não vai mais na entrada: era configurável no modo avançado, e o
 *  motor nunca o usou para calcular (a comparação de datas é textual). Fixo no nome que o resto do
 *  produto usa, para o campo continuar existindo no formato gravado. */
const FUSO_PADRAO = 'America/Sao_Paulo'

export function entradaFormularioParaCalculo(ef: EntradaFormulario): EntradaCalculo {
  return {
    timezone: FUSO_PADRAO,
    segmentos: ef.segmentos.map(segmentoParaRegra),
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
