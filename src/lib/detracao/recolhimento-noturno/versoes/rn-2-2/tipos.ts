// src/lib/detracao/recolhimento-noturno/tipos.ts
//
// Os contratos do domínio de detração por recolhimento noturno. Forma, sem regra de negócio —
// quem soma e converte é `motor.ts`.

import type { AnosMesesDias } from './motor'
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

/** Um feriado que o membro declara: a data (que o motor lê) e o nome (que o resumo e a petição
 *  mostram). O nome é OPCIONAL — quem não o informa continua com o cálculo correto, só sem a
 *  identificação no resumo. */
export type FeriadoDeclarado = { data: string; nome?: string }

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
  /** 🔴 RN-2.2 — os feriados declarados à mão (municipais e estaduais) passam a ter NOME, e não só
   *  data: o resumo os lista, e "09/07/2025" sozinho não diz de que feriado se trata nem permite
   *  conferir contra o calendário da comarca. O motor usa `data`; o `nome` é para o documento. */
  feriadosIntegral: FeriadoDeclarado[]
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
  /** Os mesmos `diasDetracao` abertos em anos/meses/dias (1 ano = 365 dias, 1 mês = 30 dias) — a
   *  leitura que o juízo usa, ao lado dos dias corridos de 24h. */
  detracaoEmAnosMesesDias: AnosMesesDias
  saldoMinutos: number
  saldoHoras: string
  /** Composição da contagem (PASSO 3 da spec): dias de regra noturna e dias integrais (24h).
   *  `totalMinutos = diasIntegrais × 1440 + diasUteis × H_NOTURNO`. */
  diasUteis: number
  diasIntegrais: number
  /** Os feriados que este cálculo efetivamente computou — os NACIONAIS (com o checkbox ligado) e os
   *  DECLARADOS à mão (municipais/estaduais) —, com nome, dia da semana e origem.
   *
   *  🔴 A tela LISTA isto, e não só conta: "6 dias — 144 horas" sozinho não permite conferir quais
   *  seis entraram, e foi assim que o resumo passou a dizer "6 feriados" enquanto o membro havia
   *  informado 8, parecendo que os extras tinham sido ignorados. */
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
  /** 🔴 `string`, e não o literal da versão: o contrato comum (`versoes/contrato.ts`) compara
   *  resultados de versões DIFERENTES na mesma assinatura — o literal estreitaria o tipo e cada
   *  versão deixaria de ser atribuível ao contrato. O valor gravado continua sendo `VERSAO`. */
  algoritmoVersao: string
}
