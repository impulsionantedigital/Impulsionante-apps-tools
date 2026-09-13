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
  //
  // 🔴 `isNaN` SOLTO, não `Number.isNaN` — não é descuido, não "modernize".
  // O tipo do parâmetro não vale em runtime: o resultado do cálculo é gravado em
  // coluna `jsonb` e volta do banco sem garantia nenhuma. `Number.isNaN('abc')` é
  // `false`, então um valor não-numérico atravessaria esta guarda e a função
  // devolveria "NaN anos NaN meses NaN dias" — na tela do advogado, e daí na
  // petição. O `isNaN` com coerção devolve '-', que é o que o engine.js original
  // faz (linha 55).
  // eslint-disable-next-line no-restricted-globals -- ver o parágrafo acima
  if (nDias === null || nDias === undefined || isNaN(nDias)) return '-'

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
 * Existe para as regras que exigem cumprimento contado em TEMPO CORRIDO, e só
 * para elas. Fração de pena nunca usa esta função: ali a convenção é a 30/360 de
 * `dias()`, e trocar uma pela outra muda o resultado sem erro nenhum.
 *
 * Cada decreto diz quais das suas regras caem aqui. No Decreto 12.970/2025, é uma
 * só — o inciso IV do Art. 9º (célula `F49` da planilha). Um decreto futuro pode
 * numerar diferente, ter mais de uma ou não ter nenhuma.
 */
export function diasCorridos(de: Date | null, ate: Date | null): number {
  if (!de || !ate) return 0
  return Math.round((ate.getTime() - de.getTime()) / 86_400_000)
}
