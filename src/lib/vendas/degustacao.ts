import { DURACOES, ehDuracao, type Duracao } from './duracao'

/**
 * A oferta de degustação, vista de fora: `duracao` é a duração NORMAL da oferta, e `dias` só
 * significa alguma coisa quando a duração escolhida é `degustacao`.
 */
export interface OfertaDeAcesso {
  duracao: string
  diasDegustacao: number | null
}

/** O rótulo que o dono do servidor vê no seletor "Tempo de acesso". */
export const DEGUSTACAO = 'degustacao'

/**
 * Os prazos de degustação oferecidos, FIXOS.
 *
 * 🔴 A lista é fechada de propósito: o valor do seletor é um par (`trial:7`), e não um número
 * digitado. Isso tira o campo de texto da tela, e com ele toda uma classe de erro: prazo em branco,
 * prazo zero, prazo absurdo, e oferta de degustação gravada sem prazo — que recusaria a compra
 * depois (`oferta_invalida`). O conjunto é pequeno e conhecido, então é aqui que ele vive.
 *
 * Acrescentar um prazo novo é acrescentar um item nesta lista: o seletor, a gravação e o teste
 * acompanham sozinhos.
 */
export const PRAZOS_DE_DEGUSTACAO = [7, 15] as const

/**
 * As opções do seletor. `DURACOES` continua sendo o domínio do que VENCE — sete durações —, e a
 * degustação entra aqui porque é a única cuja duração vem de um número em dias, e não de um nome.
 */
export const OPCOES_TEMPO_DE_ACESSO = [
  ...DURACOES,
  ...PRAZOS_DE_DEGUSTACAO.map((dias) => valorDaDegustacao(dias)),
] as const

/** O valor do seletor para um prazo de degustação: `trial:7`. */
export function valorDaDegustacao(dias: number): string {
  return `${DEGUSTACAO}:${dias}`
}

/**
 * Lê o valor do seletor e devolve o que gravar — ou `null` se não for uma opção válida.
 *
 * 🔴 O par só vale se os DIAS estiverem na lista fechada: um `duracao` forjado como
 * `degustacao:9999` (API direta, ou um select adulterado no navegador) tem de ser recusado, e não
 * virar um trial de 27 anos.
 */
export type TempoDeAcesso = { duracao: Duracao; diasDegustacao?: never } | { duracao: typeof DEGUSTACAO; diasDegustacao: number }

export function lerTempoDeAcesso(valor: string): TempoDeAcesso | null {
  if (valor.startsWith(`${DEGUSTACAO}:`)) {
    const dias = Number(valor.slice(DEGUSTACAO.length + 1))
    const conhecido = (PRAZOS_DE_DEGUSTACAO as readonly number[]).includes(dias)
    return conhecido ? { duracao: DEGUSTACAO, diasDegustacao: dias } : null
  }
  return ehDuracao(valor) ? { duracao: valor } : null
}

/**
 * A duração efetiva que a compra concede. `null` é recusa, não "sem prazo": um valor inválido aqui
 * vira `oferta_invalida` na aprovação, e a compra não libera nada por engano.
 */
export function duracaoDaOferta(oferta: OfertaDeAcesso): Duracao | number | null {
  if (oferta.duracao !== DEGUSTACAO) return ehDuracao(oferta.duracao) ? oferta.duracao : null
  return ehDiasDegustacao(oferta.diasDegustacao) ? oferta.diasDegustacao : null
}

/**
 * Se o número de dias é um prazo que o CRM oferece. É o mesmo critério da lista fechada do seletor,
 * e por isso não há teto arbitrário aqui: um prazo fora da lista é recusado, e não truncado.
 */
export function ehDiasDegustacao(valor: unknown): valor is number {
  return typeof valor === 'number' && (PRAZOS_DE_DEGUSTACAO as readonly number[]).includes(valor)
}

/**
 * Rótulo de um tempo de acesso, para o seletor e para os selos de lista.
 *
 * 🔴 Sem o `diasDegustacao`, a degustação NÃO ganha placeholder: ela não tem um prazo "vazio", tem
 * prazos conhecidos. O `—` que existia aqui aparecia no seletor como uma opção sem sentido.
 */
export function rotuloDaDuracao(duracao: string, diasDegustacao: number | null): string {
  if (duracao === DEGUSTACAO) {
    return diasDegustacao === null ? 'Degustação' : `Degustação — ${diasDegustacao} dias`
  }
  return rotuloDeDuracao(duracao)
}

/** O rótulo de uma opção do seletor: `trial:15` vira "Degustação — 15 dias". */
export function rotuloDoTempoDeAcesso(valor: string): string {
  if (valor.startsWith(`${DEGUSTACAO}:`)) return `Degustação — ${valor.slice(DEGUSTACAO.length + 1)} dias`
  return rotuloDeDuracao(valor)
}

const ROTULOS: Partial<Record<Duracao, string>> = {
  semanal: 'Semanal',
  quinzenal: 'Quinzenal',
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
  vitalicio: 'Vitalício',
}

/** O nome da duração normal; o que não é duração conhecida sai como veio, para não sumir da tela. */
function rotuloDeDuracao(duracao: string): string {
  return ehDuracao(duracao) ? (ROTULOS[duracao] as string) : duracao
}
