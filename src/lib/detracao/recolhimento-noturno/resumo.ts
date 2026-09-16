// src/lib/detracao/recolhimento-noturno/resumo.ts
//
// Quebra do total computado por categoria de dia — dias úteis, finais de semana e feriados —
// para dar transparência de composição além do número final. Não é o motor: não decide o que
// entra no cômputo (isso já veio pronto em `intervalosConsolidados`), só reclassifica o que já
// foi consolidado, minuto a minuto, pela DATA CIVIL em que cada fatia ocorre.

import { formatarInstante, paraInstante, paraInstanteDeData, somarDias } from './intervalos'
import type { Intervalo } from './tipos'

export type CategoriaDia = 'util' | 'fimDeSemana' | 'feriado'

export type ResumoCategoria = { dias: number; minutos: number }

export type ResumoDetalhado = {
  util: ResumoCategoria
  fimDeSemana: ResumoCategoria
  feriado: ResumoCategoria
}

function ehFimDeSemana(dataISO: string): boolean {
  const dow = new Date(`${dataISO}T00:00:00Z`).getUTCDay()
  return dow === 0 || dow === 6
}

function proximaMeiaNoite(instanteMs: number): number {
  const dataCivil = formatarInstante(instanteMs).slice(0, 10)
  return somarDias(paraInstanteDeData(dataCivil, '00:00'), 1)
}

/** Fatia cada intervalo consolidado pela meia-noite: um turno como "sexta 22h–sábado 6h" vira
 *  duas fatias (2h de sexta, 6h de sábado), cada uma contada na categoria da SUA PRÓPRIA data
 *  civil — diferente da convenção do motor, que atribui o turno inteiro ao dia em que começa
 *  para fins de regra (§5 do plano); aqui o objetivo é a composição real por tipo de dia. */
export function calcularResumoDetalhado(
  intervalosConsolidados: Intervalo[],
  feriados: string[],
): ResumoDetalhado {
  const feriadosSet = new Set(feriados)
  const porDia = new Map<string, { categoria: CategoriaDia; minutos: number }>()

  for (const iv of intervalosConsolidados) {
    let inicioMs = paraInstante(iv.inicio)
    const fimMs = paraInstante(iv.fim)
    while (inicioMs < fimMs) {
      const dataCivil = formatarInstante(inicioMs).slice(0, 10)
      const fimFatiaMs = Math.min(fimMs, proximaMeiaNoite(inicioMs))
      const minutosFatia = Math.floor((fimFatiaMs - inicioMs) / 60_000)

      const categoria: CategoriaDia = feriadosSet.has(dataCivil)
        ? 'feriado'
        : ehFimDeSemana(dataCivil)
          ? 'fimDeSemana'
          : 'util'

      const existente = porDia.get(dataCivil)
      porDia.set(dataCivil, { categoria, minutos: (existente?.minutos ?? 0) + minutosFatia })

      inicioMs = fimFatiaMs
    }
  }

  const resumo: ResumoDetalhado = {
    util: { dias: 0, minutos: 0 },
    fimDeSemana: { dias: 0, minutos: 0 },
    feriado: { dias: 0, minutos: 0 },
  }
  for (const { categoria, minutos } of porDia.values()) {
    resumo[categoria].dias += 1
    resumo[categoria].minutos += minutos
  }
  return resumo
}
