// src/lib/detracao/recolhimento-noturno/comparar.ts
//
// Compara dois `ResultadoCalculo` POR ESTRUTURA — nunca `JSON.stringify` bruto: um dos dois pode
// ter vindo de uma coluna `jsonb`, e o Postgres não preserva ordem de chaves.

import type { ResultadoCalculo } from './tipos'

export function mesmoResultado(a: ResultadoCalculo, b: ResultadoCalculo): boolean {
  return (
    a.totalMinutos === b.totalMinutos &&
    a.diasDetracao === b.diasDetracao &&
    a.saldoMinutos === b.saldoMinutos &&
    a.algoritmoVersao === b.algoritmoVersao &&
    a.diasUteis === b.diasUteis &&
    a.diasIntegrais === b.diasIntegrais
  )
}
