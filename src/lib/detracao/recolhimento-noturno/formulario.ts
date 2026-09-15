// src/lib/detracao/recolhimento-noturno/formulario.ts
//
// A ponte entre os campos que a TELA edita (datas soltas, data/hora exata opcional) e o que o
// MOTOR espera (janela `[inicio, fim)` sempre fechada). O motor não tem noção de "modo simples"
// ou "avançado" — isso é só como esta camada preenche `SegmentoRegra` (ver §4 da spec).

import { proximoDia } from './intervalos'
import type { EntradaCalculo, Intervalo, IntervaloComMotivo, SegmentoRegra, Weekday } from './tipos'

export type SegmentoFormulario = {
  dataInicio: string
  dataFim: string
  dataHoraInicioExata?: string
  dataHoraFimExata?: string
  horaInicioNoturno: string
  horaFimNoturno: string
  diasSemanaNoturno: Weekday[]
  diasFolgaIntegral: Weekday[]
  feriadosIntegral: string[]
  intervalosAdicionais: Intervalo[]
  intervalosExcluidos: IntervaloComMotivo[]
}

export type EntradaFormulario = {
  timezone: string
  segmentos: SegmentoFormulario[]
  observacoes?: string
  monitoramentoEletronico?: 'sim' | 'nao' | 'nao_informado'
}

/** `<input type="datetime-local">` devolve "YYYY-MM-DDTHH:MM", sem segundos. */
function normalizarDataHora(valor: string): string {
  return valor.length === 16 ? `${valor}:00` : valor
}

export function segmentoParaRegra(sf: SegmentoFormulario): SegmentoRegra {
  return {
    inicio: sf.dataHoraInicioExata?.trim()
      ? normalizarDataHora(sf.dataHoraInicioExata)
      : `${sf.dataInicio}T00:00:00`,
    // 🔴 §12 da spec: fim exclusivo preferido internamente — "último dia" vira o INÍCIO do dia
    // seguinte, não "23:59:59" (que cortaria 1 minuto de um dia de folga integral no fim).
    fim: sf.dataHoraFimExata?.trim() ? normalizarDataHora(sf.dataHoraFimExata) : `${proximoDia(sf.dataFim)}T00:00:00`,
    horaInicioNoturno: sf.horaInicioNoturno,
    horaFimNoturno: sf.horaFimNoturno,
    diasSemanaNoturno: sf.diasSemanaNoturno,
    diasFolgaIntegral: sf.diasFolgaIntegral,
    feriadosIntegral: sf.feriadosIntegral,
    intervalosAdicionais: sf.intervalosAdicionais,
    intervalosExcluidos: sf.intervalosExcluidos,
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
    intervalosAdicionais: [],
    intervalosExcluidos: [],
  }
}
