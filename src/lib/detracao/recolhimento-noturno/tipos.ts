// src/lib/detracao/recolhimento-noturno/tipos.ts
//
// Os contratos do domínio de detração por recolhimento noturno. Forma, sem regra de negócio —
// quem soma e converte é `motor.ts`.

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

/** Sempre `[início, fim)` — semiaberto, para que o instante final não conte duas vezes quando
 *  dois períodos são contíguos. Strings ISO `YYYY-MM-DDTHH:MM[:SS]`, sem fuso. */
export type Intervalo = { inicio: string; fim: string }

export type SegmentoRegra = {
  /** Janela de vigência deste segmento — `[inicio, fim)`. */
  inicio: string
  fim: string
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
  /** As faixas geradas, para a memória de cálculo e o texto da petição — NÃO são a conta do
   *  total, que sai de `diasUteis`/`diasIntegrais` (ver `motor.ts`). */
  intervalosConsolidados: Intervalo[]
  /** Composição da contagem (PASSO 3 da spec): dias de regra noturna e dias integrais (24h).
   *  `totalMinutos = diasIntegrais × 1440 + diasUteis × H_NOTURNO`. */
  diasUteis: number
  diasIntegrais: number
  algoritmoVersao: typeof ALGORITMO_VERSAO
}
