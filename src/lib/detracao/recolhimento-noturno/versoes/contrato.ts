// src/lib/detracao/recolhimento-noturno/versoes/contrato.ts
//
// 🔴 O CONTRATO COMUM a todas as versões da calculadora de recolhimento noturno.
//
// Cada versão é um pacote fechado (`versoes/rn-X-Y/`) com o SEU motor e o SEU formulário. Os
// formulários são LEGITIMAMENTE diferentes: a RN-2.0 tinha `timezone`, `observacoes` e
// `monitoramentoEletronico`; a RN-2.1 não tem nenhum dos três. E o registro precisa guardar as duas
// na MESMA lista, porque um cálculo salvo em qualquer delas tem de continuar abrindo.
//
// 🔴 POR QUE ESTE ARQUIVO USA `any`, E POR QUE ISSO É A ESCOLHA CERTA AQUI:
//
// Tentei o caminho "correto" antes — um contrato genérico (`TEntrada`, `TFormulario`, `TRotulo`)
// amarrando cada pacote aos seus próprios tipos. Não vale o preço: os parâmetros de função são
// contravariantes, então uma versão com `(e: EntradaCalculo) => R` não é atribuível a uma forma que
// pede `(e: unknown) => R`, e cada versão acabaria castando a própria assinatura para caber. O
// resultado eram quatro parâmetros de tipo e um erro de atribuição por arquivo, para expressar uma
// assimetria que os genéricos não resolvem — eles só a empurram para outro lugar.
//
// O que `any` significa aqui, e o que NÃO significa: ele não quer dizer "não sei o que é". Quer
// dizer "cada versão tem o seu tipo, e a única coisa que o registro pode afirmar sobre todas é que a
// forma bate". A GARANTIA de que os tipos combinam não vem do compilador, e sim do DESENHO:
//
//   • A TELA NUNCA CONSTRÓI A ENTRADA À MÃO. Ela pega `formulario.emBranco()` e
//     `formulario.paraCalculo()` do PRÓPRIO pacote e passa o resultado ao `calcular()` do MESMO
//     pacote. O par entra e sai junto, e é a identidade do pacote que garante a combinação.
//   • `pacoteTipado()` (em `registro.ts`) é o ÚNICO ponto onde os tipos da versão escolhida são
//     afirmados, e ele existe para que essa afirmação seja uma só, nomeada e documentada — em vez
//     de espalhada por cada consumidor.
//
// ⚠️ Se um dia o RESULTADO mudar de forma entre versões, este contrato passa a mentir e precisa de
// revisão. Hoje ele é estável: todas as versões leem os mesmos campos e devolvem os mesmos números.
// Mudar isso é o sinal de que a alteração é grande o bastante para merecer atenção explícita.

/* eslint-disable @typescript-eslint/no-explicit-any -- ver o bloco acima: a assimetria entre os
   formulários de cada versão não é expressável sem genéricos, e genéricos foram avaliados e
   descartados por custarem mais do que entregam. A garantia vem do desenho, não daqui. */

/** O que qualquer versão precisa devolver ao calcular — estrutural e igual entre todas. */
export type ResultadoCalculo = {
  totalMinutos: number
  totalHoras: string
  diasDetracao: number
  detracaoEmAnosMesesDias: { anos: number; meses: number; dias: number }
  saldoMinutos: number
  saldoHoras: string
  diasUteis: number
  diasIntegrais: number
  // 🔴 `origem` entra como OPCIONAL: resultados gravados antes da RN-2.2 não a têm, e a tela
  // precisa aceitar os dois — o resumo marca só o que é `declarado`.
  feriadosConsiderados: Array<{
    data: string
    nome: string
    diaSemana: string
    origem?: 'nacional' | 'declarado'
  }>
  composicao: {
    diasUteis: number
    minutosUteis: number
    diasIntegrais: number
    diasFeriados: number
    diasFolgaIntegral: number
    minutosIntegrais: number
  }
  algoritmoVersao: string
}

/** O que uma versão precisa oferecer ao registro e à tela. */
export type VersaoRecolhimento = {
  /** O rótulo gravado no banco e comparado ao abrir o cálculo (`algoritmo_versao`). */
  versao: string
  /** Quando a versão entrou em uso. */
  desde: string
  /** O que ela tem de diferente, em uma linha, para exibição ao membro. */
  resumo: string
  /** Calcula. A entrada é EXATAMENTE a que o `formulario.paraCalculo` DESTA versão produziu. */
  calcular: (entrada: any) => ResultadoCalculo
  /** Compara dois resultados gravados por estrutura (a coluna é `jsonb`, o Postgres não preserva a
   *  ordem das chaves). */
  mesmoResultado: (a: ResultadoCalculo, b: ResultadoCalculo) => boolean
  /** O texto do anexo de petição. */
  gerarTextoPeticao: (entrada: any, resultado: ResultadoCalculo) => string
  formulario: {
    /** O segmento em branco DESTA versão — os campos que ela edita. */
    emBranco: () => any
    /** Monta a entrada do motor a partir do que a tela editou. */
    paraCalculo: (entrada: any) => any
    /** Converte um segmento do formulário na regra do motor. */
    segmentoParaRegra: (s: any) => any
  }
}
