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
 * `geral` e `especial` são vereditos INDEPENDENTES: além da regra cheia, um
 * decreto pode prever uma regra especial, de fração menor, para quem se enquadra
 * num perfil de vulnerabilidade. Em que parágrafo ela vive, e a quais
 * dispositivos se aplica, é decisão de cada decreto — onde não houver previsão,
 * `especial` é 'sem_previsao', que é diferente de 'nao_preenche'.
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
  /**
   * Só a fatia IMPEDITIVA do total imposto — o que a tela chama de "Total de penas
   * impeditivas".
   *
   * 🔴 É o MESMO valor que o campo `penaImpeditiva` do questionário guarda (um dos três
   * que compõem `totalImposto`), e NÃO se confunde com `penaCumpridaImpeditivos`, que logo
   * abaixo é a fatia do **cumprido** atribuída aos impeditivos. Um é o que foi IMPOSTO
   * pela sentença; o outro, o que já foi CUMPRIDO e conta contra aquele. Trocar os dois
   * troca um número que vai para petição.
   */
  totalImpeditivo: number
  /**
   * Só a fatia NÃO IMPEDITIVA do total imposto — o que a tela chama de "Total de penas
   * permissivas".
   *
   * 🔴 É a SOMA de DOIS campos do questionário: `penaViolencia` + `penaSemViolencia`. Não
   * confundir com `fracoes.{umQuinto,umQuarto,...}`, que aplicam uma fração a essa mesma
   * soma — ali é a fração exigida por dispositivo, aqui é o total cheio.
   *
   * Com `totalImpeditivo`, fecha o `totalImposto`: os dois somados dão o card 1.
   */
  totalPermissivo: number
  totalCumprido: number
  /** min(total cumprido, 2/3 do impeditivo) — o que conta para os impeditivos. */
  penaCumpridaImpeditivos: number
  /**
   * O que sobra do cumprido depois de atribuir a parte dos impeditivos — o cumprido que
   * conta para os crimes PERMISSIVOS.
   *
   * 🔴 Diferença entre dois CAMPOS DO RESUMO, e não soma de campos do formulário:
   * `totalCumprido − penaCumpridaImpeditivos`. É a única grandeza do painel definida assim,
   * e por isso ela é sensível à ordem: se `penaCumpridaImpeditivos` mudar de fórmula, este
   * muda junto, sem que ninguém tenha mexido nele.
   *
   * Pode dar NEGATIVO no papel? Não: `penaCumpridaImpeditivos` é `min(cumprido, 2/3 do
   * impeditivo)`, limitado por `totalCumprido` — nunca ultrapassa o que foi cumprido. Ainda
   * assim o motor trava em zero, porque um número negativo aqui iria para petição.
   */
  penaCumpridaPermissivos: number
  /**
   * O que falta cumprir da pena impeditiva para atingir os 2/3 dela — diferença entre
   * dois campos do RESUMO: `totalImpeditivo − penaCumpridaImpeditivos`.
   *
   * 🔴 Como `penaCumpridaPermissivos`, é diferença ENTRE CARDS, não soma de campos do
   * formulário. E a base é o impeditivo CHEIO (card 2), e não os 2/3 dele: o que se
   * desconta é o que já foi cumprido (card 5), que é justamente o limitado pelos 2/3.
   *
   * ⚠️ Ao contrário de `penaCumpridaPermissivos`, este PODE dar negativo no papel? Não:
   * `penaCumpridaImpeditivos = min(cumprido, 2/3 do impeditivo)`, e `2/3 de X <= X` para
   * qualquer X >= 0 — então o subtraendo nunca ultrapassa o minuendo. O `Math.max(0, ...)`
   * no motor fica como guarda, pelo mesmo motivo do outro.
   */
  remanescenteImpeditivo: number
  /**
   * O que falta cumprir da parte NÃO impeditiva — diferença entre dois campos do RESUMO:
   * `remanescente − remanescenteImpeditivo` (card 7 − card 8).
   *
   * 🔴 Também entre CARDS, como os cards 6 e 8. E, como eles, é sensível aos dois lados:
   * mexer na fórmula do remanescente OU na do impeditivo muda este card sem ninguém o tocar.
   *
   * ⚠️ Ele PODE parecer igual ao `totalCumprido` (card 4) — no cenário do relato dá 8 nos
   * dois. É COINCIDÊNCIA aritmética, não identidade: com pena impeditiva pequena o card 4 dá
   * 5 e este dá 7; sem nada cumprido, 0 e 10. Não troque um pelo outro.
   *
   * Pode ficar negativo? `card 7 = totalImposto − totalCumprido` e `card 8 = totalImpeditivo
   * − penaCumpridaImpeditivos`; desenvolvendo, este card é `totalPermissivo −
   * penaCumpridaPermissivos` — a mesma estrutura de card 3 (imposto) menos card 6 (cumprido)
   * da parte permissiva, e ambos os lados são >= 0. Ainda assim o motor trava em zero.
   */
  remanescentePermissivo: number
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

/** O que um gerador de petição de decreto recebe: a entrada, o resultado calculado e o título
 *  do cálculo. O `motor` não entra aqui — cada gerador já é método DO motor a que pertence — e
 *  o anexo de premissas é montado por dentro do próprio gerador, via `formatarAnexoTexto`. */
export type DadosPeticao = {
  entrada: Entrada
  resultado: Resultado
  titulo: string
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

  /** Ausente num decreto que ainda não tem modelo de petição — o botão "Petição"
   *  (`BotaoPeticao.tsx`) só aparece quando isto existe E há pelo menos um dispositivo
   *  aplicável (ver `enquadramentos.ts`). Cada função devolve o texto pronto, anexo incluído. */
  peticoes?: {
    indulto: (dados: DadosPeticao) => string
    comutacao: (dados: DadosPeticao) => string
  }
}
