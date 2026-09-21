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
 * As opções do seletor. `DURACOES` continua sendo o domínio do que VENCE — sete durações —, e a
 * degustação entra aqui porque é a única cuja duração vem de um número em dias, e não de um nome.
 */
export const OPCOES_TEMPO_DE_ACESSO = [...DURACOES, DEGUSTACAO] as const

/**
 * O teto de dias. É o teto que o campo do formulário promete, o que a coluna do banco aceita e o
 * que o `somarDuracao` sabe somar sem perder precisão — os três têm de ser o mesmo número.
 */
export const MAX_DIAS_DEGUSTACAO = 3650

/** Só os dígitos: o campo aceita o que a pessoa digita, e o que vale é o que sobrar de número. */
export function diasDeDegustacao(texto: string): number {
  const digitos = texto.replace(/\D/g, '')
  if (!digitos) return 0
  return Math.min(Number(digitos), MAX_DIAS_DEGUSTACAO)
}

/**
 * A duração efetiva que a compra concede. `null` é recusa, não "sem prazo": um valor inválido aqui
 * vira `oferta_invalida` na aprovação, e a compra não libera nada por engano.
 */
export function duracaoDaOferta(oferta: OfertaDeAcesso): Duracao | number | null {
  if (oferta.duracao !== DEGUSTACAO) return ehDuracao(oferta.duracao) ? oferta.duracao : null
  return ehDiasDegustacao(oferta.diasDegustacao) ? oferta.diasDegustacao : null
}

/** O limite é o mesmo em toda parte, e é por isso que ele mora aqui e não em cada chamador. */
export function ehDiasDegustacao(valor: unknown): valor is number {
  return Number.isInteger(valor) && (valor as number) >= 1 && (valor as number) <= MAX_DIAS_DEGUSTACAO
}

/** Rótulo do selo da lista — a mesma frase que descreve a oferta na tela de vendas. */
export function rotuloDaDuracao(duracao: string, diasDegustacao: number | null): string {
  return duracao === DEGUSTACAO ? `${diasDegustacao ?? '—'} dias de degustação` : rotuloDeDuracao(duracao)
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
