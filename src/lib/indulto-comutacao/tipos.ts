// Os contratos que TODO motor de decreto cumpre. Forma, nunca regra: nada aqui
// pode depender de um decreto específico.

export type { Tempo } from './tempo'
import type { Tempo } from './tempo'

/**
 * As respostas do questionário, como objeto plano.
 *
 * As CHAVES são definidas por cada decreto, porque o questionário de um ano não
 * serve para outro sem revisão. O tipo é aberto de propósito; quem garante a
 * correspondência entre chave e motor é o teste de reconciliação da Task 6.
 */
export type Entrada = Record<string, string | number | Tempo | null | undefined>

/**
 * Os quatro estados, com o rótulo que a POC exibia.
 *
 * O motor devolve a CHAVE; a tela resolve o rótulo aqui. O engine.js original
 * devolvia a string pronta — a tradução para código é o que dá type-safety à UI
 * sem tocar nas condições de cada inciso.
 */
export const VEREDITOS = {
  preenche: 'Preenche os requisitos',
  nao_preenche: 'Não preenche os requisitos',
  a_analisar: 'A analisar',
  sem_previsao: 'Sem previsão no Decreto',
} as const

export type Veredito = keyof typeof VEREDITOS

export function ehVeredito(v: unknown): v is Veredito {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(VEREDITOS, v)
}

/**
 * O resultado de um dispositivo.
 *
 * `geral` e `especial` são vereditos INDEPENDENTES: a regra especial do §2º
 * concede fração menor a quem se enquadra no perfil de vulnerabilidade. Onde o
 * decreto não prevê regra especial, `especial` é 'sem_previsao'.
 *
 * `quantum` e `penaApos` só aparecem nos dispositivos de comutação. `null`
 * significa ausência de valor — a planilha devolvia #VALUE! (bug L145:L149).
 */
export type ResultadoInciso = {
  id: string
  geral: Veredito
  especial: Veredito
  quantum?: number | null
  penaApos?: number | null
}

/** O painel de contexto que abre a tela de resultado. Tudo em dias (30/360). */
export type Resumo = {
  totalImposto: number
  totalCumprido: number
  /** min(total cumprido, 2/3 do impeditivo) — o que conta para os impeditivos. */
  penaCumpridaImpeditivos: number
  remanescente: number
  fracoes: {
    doisTercosImpeditivos: number
    umQuinto: number
    umQuarto: number
    umTerco: number
    metade: number
  }
}

export type Resultado = {
  /** Na ordem em que o motor os produz — a mesma da planilha. */
  incisos: ResultadoInciso[]
  resumo: Resumo
  avisos: string[]
}

/** O que a tela precisa para desenhar o cartão de um dispositivo. */
export type MetaInciso = {
  id: string
  rotulo: string
  descricao: string
  temRegraEspecial: boolean
}

export type Campo =
  | { tipo: 'texto'; chave: string; rotulo: string; ajuda?: string }
  | { tipo: 'numero'; chave: string; rotulo: string; ajuda?: string }
  | { tipo: 'data'; chave: string; rotulo: string; ajuda?: string }
  | { tipo: 'tempo'; chave: string; rotulo: string; ajuda?: string }
  | {
      tipo: 'selecao'
      chave: string
      rotulo: string
      opcoes: readonly string[]
      /** Quando ausente, o padrão é 'NÃO' se estiver nas opções, senão a primeira. */
      padrao?: string
      ajuda?: string
    }

export type Secao = {
  id: string
  titulo: string
  /** Texto de alerta da seção. No questionário de 2025, só a da data do fato tem. */
  aviso?: string
  descricao?: string
  campos: Campo[]
}

export type MotorDecreto = {
  id: string
  ano: number
  rotulo: string
  versao: string
  /** Data-base do decreto, `YYYY-MM-DD`. Nunca uma constante global. */
  dataBase: string
  questionario: Secao[]
  incisos: { indulto: MetaInciso[]; comutacao: MetaInciso[] }
  avisos: { fixos: string[]; validarJuridicamente: string[] }
  calcular(entrada: Entrada): Resultado
}
