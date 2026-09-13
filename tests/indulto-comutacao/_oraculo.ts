// O oráculo do porte: `validacao/2025/engine.js`, carregado de verdade, mais o
// comparador que põe o original e o porte no MESMO vocabulário — o original chama
// de `situacao` o que o contrato chama de `geral`, não tem `especial` nos incisos
// de comutação, e formata o resumo com `fmtDias`.
//
// Não é um `.spec.ts` de propósito — é infraestrutura dos testes de paridade
// (`paridade-engine.spec.ts` e `paridade-fronteiras.spec.ts`), e o `include` do
// Vitest só coleta `*.spec.ts`.

import { readFileSync } from 'node:fs'
import { runInThisContext } from 'node:vm'
import { fileURLToPath } from 'node:url'
import { VEREDITOS } from '@/lib/indulto-comutacao/tipos'
import { fmtDias } from '@/lib/indulto-comutacao/tempo'
import type { Entrada, Resultado } from '@/lib/indulto-comutacao/tipos'

export const RAIZ = fileURLToPath(new URL('../../', import.meta.url))

export type IncisoOriginal = {
  geral?: string
  situacao?: string
  especial?: string
  comutacao?: number | null
  penaApos?: number | null
}

export type SaidaOriginal = {
  incisos: Record<string, IncisoOriginal>
  resumo: {
    totalPenasImpostas: string
    totalPenaCumprida: string
    penaCumpridaImpeditivos: string
    penaRemanescente: string
    fracoes: Record<string, string>
  }
  avisos: string[]
}

/**
 * O `engine.js` carregado à mão, pelo MESMO invólucro que o Node usa para
 * CommonJS.
 *
 * 🔴 Não troque por `import` nem por `createRequire`. Dois motivos, os dois já
 * sentidos aqui: o transform do Vitest entrega o arquivo sem `module`, e o
 * `package.json` da raiz é `"type": "module"`, então um `require` normal trataria
 * o `.js` como ESM e devolveria um namespace vazio. Nos dois casos o UMD cai no
 * ramo `root.MotorIndulto` e o oráculo some SEM ERRO VISÍVEL na comparação — o
 * teste passaria a comparar o porte com nada. Assim ele roda exatamente como está
 * em disco, byte por byte, sem transform nenhum no meio.
 */
export const engineOriginal = (() => {
  const caminho = RAIZ + 'validacao/2025/engine.js'
  const fonte = readFileSync(caminho, 'utf8')
  const mod = { exports: {} as { calcular(input: unknown): SaidaOriginal } }
  const invólucro = runInThisContext(`(function (exports, module) {\n${fonte}\n})`, {
    filename: caminho,
  }) as (exports: unknown, module: unknown) => void
  invólucro(mod.exports, mod)
  if (typeof mod.exports.calcular !== 'function') {
    throw new Error('o oráculo não expôs `calcular` — o invólucro CommonJS quebrou')
  }
  return mod.exports
})()

const SEM_PREVISAO = VEREDITOS.sem_previsao

/**
 * Roda os dois lados e devolve a primeira diferença, ou `null`.
 *
 * 🔴 O caminho feliz NÃO CONSTRÓI STRING NENHUMA, e não chama `expect`. Os dois
 * detalhes são de desempenho, e é o que faz caber uma varredura dia a dia no
 * orçamento do commit: um `expect` por campo custa ~30x o cálculo em si, e montar
 * uma assinatura em string dos dois lados a cada caso custa ~1,5x (MEDIDO: 12,7 µs
 * por caso montando string, 8,2 µs comparando campo a campo — a varredura inteira
 * caiu de 1,05 s para 0,63 s). A mensagem só é montada para o caso que divergiu.
 *
 * Compara TUDO o que o porte produz: os dois vereditos de cada dispositivo, o
 * quantum e a pena após de cada comutação, os nove tempos do resumo e os avisos.
 */
export function divergencia(entrada: Entrada, porte: (e: Entrada) => Resultado): string | null {
  const a = engineOriginal.calcular(entrada)
  const b = porte(entrada)
  const orig = a.incisos
  const ids = Object.keys(orig)

  if (b.incisos.length !== ids.length) {
    return `quantidade de dispositivos: original=${ids.length} porte=${b.incisos.length}`
  }
  for (let n = 0; n < b.incisos.length; n++) {
    const i = b.incisos[n]
    if (i.id !== ids[n]) return `ordem dos dispositivos: original[${n}]=${ids[n]} porte[${n}]=${i.id}`
    const o = orig[i.id]
    if (VEREDITOS[i.geral] !== (o.geral ?? o.situacao)) {
      return `${i.id}.geral: original="${o.geral ?? o.situacao}" porte="${VEREDITOS[i.geral]}"`
    }
    if (VEREDITOS[i.especial] !== (o.especial ?? SEM_PREVISAO)) {
      return `${i.id}.especial: original="${o.especial ?? SEM_PREVISAO}" porte="${VEREDITOS[i.especial]}"`
    }
    // `?? null` iguala o `undefined` dos incisos de indulto ao `null` da comutação
    // sem comutação — e preserva o 0, que é quantum legítimo.
    if ((i.quantum ?? null) !== (o.comutacao ?? null)) {
      return `${i.id}.quantum: original=${o.comutacao} porte=${i.quantum}`
    }
    if ((i.penaApos ?? null) !== (o.penaApos ?? null)) {
      return `${i.id}.penaApos: original=${o.penaApos} porte=${i.penaApos}`
    }
  }

  const r = b.resumo
  const f = r.fracoes
  const pares: Array<[string, string, string]> = [
    ['totalImposto', fmtDias(r.totalImposto), a.resumo.totalPenasImpostas],
    ['totalCumprido', fmtDias(r.totalCumprido), a.resumo.totalPenaCumprida],
    ['penaCumpridaImpeditivos', fmtDias(r.penaCumpridaImpeditivos), a.resumo.penaCumpridaImpeditivos],
    ['remanescente', fmtDias(r.remanescente), a.resumo.penaRemanescente],
    ['doisTercosImpeditivos', fmtDias(f.doisTercosImpeditivos), a.resumo.fracoes['2/3 impeditivos']],
    ['umQuinto', fmtDias(f.umQuinto), a.resumo.fracoes['1/5 não impeditivos']],
    ['umQuarto', fmtDias(f.umQuarto), a.resumo.fracoes['1/4 não impeditivos']],
    ['umTerco', fmtDias(f.umTerco), a.resumo.fracoes['1/3 não impeditivos']],
    ['metade', fmtDias(f.metade), a.resumo.fracoes['1/2 não impeditivos']],
  ]
  for (const [nome, porteV, origV] of pares) {
    if (porteV !== origV) return `resumo.${nome}: original="${origV}" porte="${porteV}"`
  }

  if (b.avisos.length !== a.avisos.length) {
    return `avisos: original=${a.avisos.length} porte=${b.avisos.length}`
  }
  for (let n = 0; n < b.avisos.length; n++) {
    if (b.avisos[n] !== a.avisos[n]) return `avisos[${n}]: original="${a.avisos[n]}" porte="${b.avisos[n]}"`
  }
  return null
}
