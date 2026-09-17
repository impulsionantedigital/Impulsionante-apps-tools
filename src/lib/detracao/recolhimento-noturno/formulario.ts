// src/lib/detracao/recolhimento-noturno/formulario.ts
//
// A ponte entre os campos que a TELA edita (datas soltas, data/hora exata opcional) e o que o
// MOTOR espera (janela `[inicio, fim)` sempre fechada). O motor não tem noção de "modo simples"
// ou "avançado" — isso é só como esta camada preenche `SegmentoRegra` (ver §4 da spec).

import { proximoDia } from './intervalos'
import { diaSemanaDe } from './motor'
import type { EntradaCalculo, SegmentoRegra, Weekday } from './tipos'

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
  incluirFeriadosUteis: boolean
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

/**
 * Quando o último dia do período tem turno noturno que VIRA a meia-noite, a janela precisa
 * alcançar o FIM desse turno — senão o turno do último dia é cortado a zero.
 *
 * 🔴 Tema Repetitivo 1.155/STJ, item 3: "as horas de recolhimento domiciliar noturno e nos dias
 * de folga devem ser convertidas em dias". Se o usuário informa "Fim da cautelar = 01/01/2026",
 * ele está dizendo que a cautelar vigeu NAQUELE DIA — logo o turno que começa às 22:00 de
 * 01/01/2026 conta por inteiro, e não um fragmento de 0 a 6 horas.
 *
 * ⚠️ A janela tem de ir até o FIM do turno, não até o seu início: ela é semiaberta `[inicio, fim)`,
 * então esticar até as 22:00 exatas descartaria o turno inteiro (o instante de início encosta na
 * fronteira e `intersectar` devolve `null`). Estende-se até o horário de término noturno, somado
 * de um dia quando ele cai na madrugada seguinte — que é o caso normal (22:00 → 06:00).
 */
function fimDaJanela(dataFim: string, turnoDoUltimoDia: { inicio: string; fim: string } | null): string {
  const meiaNoiteSeguinte = `${proximoDia(dataFim)}T00:00:00`
  // Sem turno noturno começando no último dia (só folga integral/feriado), a meia-noite seguinte
  // basta: a folga integral JÁ termina nela, e esticar mais só criaria dia espúrio.
  if (!turnoDoUltimoDia) return meiaNoiteSeguinte
  const { inicio, fim } = turnoDoUltimoDia
  // O fim do turno cai no dia seguinte quando é menor ou igual ao início (22:00 → 06:00).
  const vira = fim <= inicio
  return `${vira ? proximoDia(dataFim) : dataFim}T${fim}:00`
}

export function segmentoParaRegra(sf: SegmentoFormulario): SegmentoRegra {
  return {
    inicio: sf.dataHoraInicioExata?.trim()
      ? normalizarDataHora(sf.dataHoraInicioExata)
      : `${sf.dataInicio}T00:00:00`,
    // 🔴 §12 da spec: fim exclusivo preferido internamente — "último dia" vira o INÍCIO do dia
    // seguinte, não "23:59:59" (que cortaria 1 minuto de um dia de folga integral no fim).
    // A extensão pelo turno noturno do ÚLTIMO dia é o que faz o turno daquele dia contar (ver
    // `fimDaJanela`): sem ela, o turno das 22:00 do último dia era cortado a zero.
    fim: sf.dataHoraFimExata?.trim()
      ? normalizarDataHora(sf.dataHoraFimExata)
      : fimDaJanela(
          sf.dataFim,
          sf.diasSemanaNoturno.includes(diaSemanaDe(sf.dataFim))
            ? { inicio: sf.horaInicioNoturno, fim: sf.horaFimNoturno }
            : null,
        ),
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
