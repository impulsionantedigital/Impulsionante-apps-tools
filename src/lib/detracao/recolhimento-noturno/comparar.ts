// src/lib/detracao/recolhimento-noturno/comparar.ts
//
// Compara dois `ResultadoCalculo` POR ESTRUTURA — nunca `JSON.stringify` bruto: um dos dois pode
// ter vindo de uma coluna `jsonb`, e o Postgres não preserva ordem de chaves.

import type { Intervalo, ResultadoCalculo } from './tipos'

function mesmosIntervalos(a: Intervalo[], b: Intervalo[]): boolean {
  if (a.length !== b.length) return false
  return a.every((iv, i) => iv.inicio === b[i].inicio && iv.fim === b[i].fim)
}

export function mesmoResultado(a: ResultadoCalculo, b: ResultadoCalculo): boolean {
  return (
    a.totalMinutos === b.totalMinutos &&
    a.diasDetracao === b.diasDetracao &&
    a.saldoMinutos === b.saldoMinutos &&
    a.algoritmoVersao === b.algoritmoVersao &&
    mesmosIntervalos(a.intervalosConsolidados, b.intervalosConsolidados) &&
    mesmosIntervalos(a.intervalosExcluidos, b.intervalosExcluidos)
  )
}
