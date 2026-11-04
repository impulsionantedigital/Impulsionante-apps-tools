// Aviso de que quem responde é uma IA, e de como chamar uma pessoa. Vai na primeira resposta da
// conversa e de novo a cada REPETIR_APOS_DIAS. Ele fica no FIM da resposta: a abertura é do
// assistente, que se apresenta do jeito que o dono configurou, sem um cumprimento fixo antes.

export const REPETIR_APOS_DIAS = 30

// Cabe numa bolha só e funciona igual para qualquer negócio.
const AVISO = 'Sou um assistente virtual com inteligência artificial. Se preferir falar com uma pessoa, escreva "falar com atendente" e alguém do time segue por aqui.'

// Texto das versões anteriores, que abria a resposta. Continua reconhecido para a conversa
// antiga não receber o aviso de novo antes do prazo.
const AVISO_ANTIGO =
  'Oi! Sou o assistente virtual (IA) da empresa. Se preferir, escreva "falar com atendente": eu paro de responder e alguém do time segue por aqui.'

// Acima disso a resposta vira mais de uma bolha; o aviso vai então para cima, logo abaixo do
// nome, para não ficar na última bolha (que é a que se perde se a resposta for cortada).
const TETO_PARA_O_FIM = 3500

export function linhaDoDisclosure(): string {
  return AVISO
}

/**
 * Trecho comum aos dois textos do aviso, para a busca no banco (`like '%…%'`). Sem nenhum dos
 * caracteres que o `like` ou o filtro do PostgREST tratam como especiais.
 */
export const PREFIXO_BUSCAVEL_DO_DISCLOSURE = 'assistente virtual'

export function carregaDisclosure(texto: string | null | undefined): boolean {
  const t = texto ?? ''
  return t.includes(AVISO) || t.includes(AVISO_ANTIGO)
}

/** Tira o aviso (novo ou antigo) de uma mensagem do assistente, para o histórico do modelo. */
export function semDisclosure(texto: string): string {
  let t = texto ?? ''
  for (const aviso of [AVISO, AVISO_ANTIGO]) {
    for (const forma of [`_${aviso}_`, aviso]) t = t.split(forma).join('')
  }
  return t.replace(/\n{3,}/g, '\n\n').trim()
}

export function precisaDisclosure(input: {
  avisosEntregues: number
  ultimoAvisoEm: string | null
  agora: string
  repetirAposDias?: number
}): boolean {
  if (input.avisosEntregues <= 0) return true
  if (!input.ultimoAvisoEm) return true
  const t = Date.parse(input.ultimoAvisoEm)
  const agora = Date.parse(input.agora)
  if (!Number.isFinite(t) || !Number.isFinite(agora)) return false
  const dias = (agora - t) / 86_400_000
  return dias >= (input.repetirAposDias ?? REPETIR_APOS_DIAS)
}

/**
 * Junta o aviso à resposta: no fim, separado por uma linha em branco (em itálico no WhatsApp).
 * Resposta longa, que vai virar mais de uma bolha, leva o aviso no começo.
 */
export function aplicarDisclosure(texto: string, sintaxeWhatsapp: boolean): string {
  const corpo = (texto ?? '').trim()
  const aviso = sintaxeWhatsapp ? `_${AVISO}_` : AVISO
  if (!corpo) return aviso
  if (corpo.length + aviso.length + 2 > TETO_PARA_O_FIM) return `${aviso}\n\n${corpo}`
  return `${corpo}\n\n${aviso}`
}
