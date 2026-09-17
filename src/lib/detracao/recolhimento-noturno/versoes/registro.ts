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

import type { VersaoRecolhimento } from './contrato'
import { rn21 } from './rn-2-1'
import { rn20 } from './rn-2-0'

// 🔴 Da MAIS RECENTE para a mais antiga. `versaoAtual()` é a primeira da lista, e é ela que todo
// cálculo NOVO usa. As anteriores ficam para poder ABRIR o que já foi gravado com elas.
export const VERSOES: readonly VersaoRecolhimento[] = [rn21, rn20]

/** A versão com que todo cálculo NOVO é feito. Sempre a mais recente do registro. */
export function versaoAtual(): VersaoRecolhimento {
  return VERSOES[0]
}

/** 🔴 O ÚNICO CAST DE TIPO DO REGISTRO, e ele é do DESENHO, não uma gambiarra.
 *
 *  Cada versão tem o seu par `TFormulario`/`TEntrada`, e a tela usa o par do MESMO pacote: monta a
 *  entrada com `formulario.paraCalculo` e a passa para `calcular` daquela mesma versão. A garantia
 *  de que os dois combinam é a identidade do pacote — não algo que o compilador possa verificar
 *  numa lista heterogênea.
 *
 *  Concentrar a asserção aqui, nomeada e com este comentário, é melhor do que espalhá-la pelos
 *  consumidores: quem alterar o registro encontra a explicação no único lugar onde ela é feita. */
export function pacoteTipado<TSegmento, TFormulario, TEntrada>(
  v: VersaoRecolhimento,
): {
  versao: string
  desde: string
  resumo: string
  calcular: (entrada: TEntrada) => ReturnType<VersaoRecolhimento['calcular']>
  mesmoResultado: VersaoRecolhimento['mesmoResultado']
  gerarTextoPeticao: (entrada: TEntrada, resultado: ReturnType<VersaoRecolhimento['calcular']>) => string
  formulario: {
    emBranco: () => TSegmento
    paraCalculo: (entrada: TFormulario) => TEntrada
    segmentoParaRegra: (s: TSegmento) => TEntrada extends { segmentos: Array<infer S> } ? S : never
  }
} {
  return v as never
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
