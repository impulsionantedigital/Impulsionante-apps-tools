// As duas convenções de contagem da planilha do GPS da Pena, portadas de
// validacao/2025/engine.js (linhas 17-66).
//
// Este arquivo é compartilhado por TODOS os decretos: não coloque aqui nada que
// dependa de um decreto específico.

export type Tempo = { anos?: number; meses?: number; dias?: number }

const DIA_ANO = 360
const DIA_MES = 30

/**
 * Sistema A — 30 dias por mês, 360 por ano.
 *
 * Não é contagem de calendário: é a convenção usada em todo cálculo de fração de
 * pena. Aceita número em string porque é o que vem de um `<input>`.
 */
export function dias(t: Tempo | null | undefined): number {
  if (!t) return 0
  const a = Number(t.anos) || 0
  const m = Number(t.meses) || 0
  const d = Number(t.dias) || 0
  return d + m * DIA_MES + a * DIA_ANO
}

/**
 * Formata dias (base 360) em "X anos Y meses Z dias".
 *
 * Traz sempre as três casas, inclusive zeradas — é o formato da POC, e mudá-lo
 * mudaria o que o advogado está acostumado a ler na planilha.
 */
export function fmtDias(nDias: number | null | undefined): string {
  // `null` é ausência de valor: a planilha devolvia #VALUE! (bug L145:L149).
  if (nDias === null || nDias === undefined || Number.isNaN(nDias)) return '-'

  const neg = nDias < 0
  const n = Math.abs(nDias)
  let anos = Math.floor(n / DIA_ANO)
  const resto = n - anos * DIA_ANO
  let meses = Math.floor(resto / DIA_MES)
  let d = Math.round(resto - meses * DIA_MES)

  // As duas normalizações existem por causa do arredondamento acima: sem elas,
  // 359,6 dias sairia como "0 anos 11 meses 30 dias".
  if (d === 30) { d = 0; meses += 1 }
  if (meses === 12) { meses = 0; anos += 1 }

  return `${neg ? '- ' : ''}${anos} anos ${meses} meses ${d} dias`
}

/**
 * Sistema B — dias de calendário reais.
 *
 * Usado APENAS no inciso IV do Art. 9º (`F49`), que exige cumprimento
 * ininterrupto contado em tempo corrido. Em qualquer outro lugar, use dias().
 */
export function diasCorridos(de: Date | null, ate: Date | null): number {
  if (!de || !ate) return 0
  return Math.round((ate.getTime() - de.getTime()) / 86_400_000)
}
