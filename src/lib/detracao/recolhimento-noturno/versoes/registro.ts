// src/lib/detracao/recolhimento-noturno/versoes/registro.ts
//
// O ponto onde uma versão nova da calculadora é plugada.
//
// 🔴 IMPORTS ESTÁTICOS, sempre — mesma regra do registro do CIC (`indulto-comutacao/registro.ts`):
// varredura de diretório não sobrevive ao bundler do Next, e o motor some do build SEM ERRO. Para
// acrescentar uma versão, crie a pasta em `./` e acrescente UMA linha no array abaixo.
//
// A ORDEM importa: da versão mais recente para a mais antiga, e `versaoAtual()` devolve a primeira.
// É ela que todo cálculo NOVO usa.

import type { VersaoRecolhimento } from './rn-2-0'
import { rn20 } from './rn-2-0'

export const VERSOES: readonly VersaoRecolhimento[] = [rn20]

/** A versão com que todo cálculo NOVO é feito. Sempre a mais recente do registro. */
export function versaoAtual(): VersaoRecolhimento {
  return VERSOES[0]
}

/** A versão gravada num cálculo salvo. `null` quando o rótulo não corresponde a nenhuma versão
 *  conhecida — cálculo de uma versão que não existe mais neste build. */
export function versaoPorRotulo(rotulo: string): VersaoRecolhimento | null {
  return VERSOES.find((v) => v.versao === rotulo) ?? null
}

/** Todas as versões anteriores à atual, da mais recente para a mais antiga. */
export function versoesAnteriores(): readonly VersaoRecolhimento[] {
  return VERSOES.slice(1)
}

/** `true` quando o cálculo está numa versão que não é mais a vigente — a tela avisa e oferece
 *  criar um cálculo novo para refletir a regra atual. */
export function estaDesatualizada(rotulo: string): boolean {
  return rotulo !== versaoAtual().versao
}
