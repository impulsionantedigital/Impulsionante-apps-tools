// src/lib/detracao/recolhimento-noturno/tipos.ts
//
// Os contratos do domínio de detração por recolhimento noturno. Forma, sem regra de negócio —
// quem soma e converte é `motor.ts`.

import type { FeriadoConsiderado } from './feriados'

export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const
export type Weekday = (typeof WEEKDAYS)[number]

export const ROTULOS_DIA_SEMANA: Record<Weekday, string> = {
  MON: 'Segunda',
  TUE: 'Terça',
  WED: 'Quarta',
  THU: 'Quinta',
  FRI: 'Sexta',
  SAT: 'Sábado',
  SUN: 'Domingo',
}

/** A versão do algoritmo, gravada em cada cálculo salvo — o que permite avisar o membro quando
 *  uma correção de fórmula muda um número que ele já usou (ver `[id]/page.tsx`). */
export const ALGORITMO_VERSAO = 'RN-2.0' as const

export type SegmentoRegra = {
  /** 🔴 Período da cautelar em DIAS DE CALENDÁRIO, `YYYY-MM-DD`, INCLUSIVE nas duas pontas.
   *  "Fim da cautelar = 31/12/2025" significa que o dia 31/12 conta — não que a janela fecha à
   *  meia-noite dele. Não há instante, não há fim exclusivo e não há turno atravessando a
   *  meia-noite para recortar: o turno noturno vale H_NOTURNO no dia em que a regra o coloca. */
  dataInicio: string
  dataFim: string
  horaInicioNoturno: string
  horaFimNoturno: string
  diasSemanaNoturno: Weekday[]
  diasFolgaIntegral: Weekday[]
  feriadosIntegral: string[]
  /** 🔴 O checkbox: quando `true`, os feriados NACIONAIS (`feriados.ts`) que caem em dia útil são
   *  tratados como dia integral (24h), e não como o turno noturno do dia. Feriado que já caia em
   *  dia de folga integral continua valendo 24h uma única vez — a precedência resolve, sem somar
   *  duas vezes (ver `motor.ts`). */
  incluirFeriadosUteis: boolean
}

export type EntradaCalculo = {
  timezone: string
  segmentos: SegmentoRegra[]
  observacoes?: string
  monitoramentoEletronico?: 'sim' | 'nao' | 'nao_informado'
}

export type ResultadoCalculo = {
  totalMinutos: number
  totalHoras: string
  diasDetracao: number
  saldoMinutos: number
  saldoHoras: string
  /** Composição da contagem (PASSO 3 da spec): dias de regra noturna e dias integrais (24h).
   *  `totalMinutos = diasIntegrais × 1440 + diasUteis × H_NOTURNO`. */
  diasUteis: number
  diasIntegrais: number
  /** Os feriados NACIONAIS que este cálculo efetivamente computou, com nome e dia da semana —
   *  para a tela poder LISTAR o que entrou no número, e não só dizer quantos são. Vazio quando o
   *  checkbox está desmarcado. */
  feriadosConsiderados: FeriadoConsiderado[]
  /** A mesma contagem aberta por categoria, para o resumo da tela. Só o MOTOR sabe isto — tentar
   *  reconstruir depois dá número errado, e era daí que saíam os valores errados na tela. */
  composicao: {
    /** Dias de regra noturna (H_NOTURNO cada). */
    diasUteis: number
    /** `diasUteis × H_NOTURNO` — a multiplicação que o membro confere na tela. */
    minutosUteis: number
    /** Total de dias integrais = `diasFeriados + diasFolgaIntegral`. */
    diasIntegrais: number
    /** Dias integrais por feriado (nacional com o checkbox, ou declarado à mão). */
    diasFeriados: number
    /** Dias integrais por folga de fim de semana. */
    diasFolgaIntegral: number
    /** `(diasFeriados + diasFolgaIntegral) × 1440`. */
    minutosIntegrais: number
  }
  algoritmoVersao: typeof ALGORITMO_VERSAO
}
