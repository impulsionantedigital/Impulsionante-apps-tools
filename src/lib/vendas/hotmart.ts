import { normalizar } from '@/lib/documento'

/**
 * Nome, no cofre, do token que a Hotmart manda em X-HOTMART-HOTTOK. É o único guarda do endereço
 * do webhook (§12.3): a Hotmart não assina o corpo.
 */
export const CHAVE_HOTTOK_HOTMART = 'webhook_hottok:hotmart'

export type StatusEncerramento = 'cancelada' | 'reembolsada' | 'chargeback'

const ENCERRAMENTOS: Readonly<Record<string, StatusEncerramento>> = {
  PURCHASE_CANCELED: 'cancelada',
  PURCHASE_REFUNDED: 'reembolsada',
  PURCHASE_PROTEST: 'reembolsada',
  PURCHASE_CHARGEBACK: 'chargeback',
}

export function statusDoEncerramento(evento: string | null | undefined): StatusEncerramento | null {
  return evento ? ENCERRAMENTOS[evento] ?? null : null
}

export interface Comprador {
  nome: string | null
  email: string
  /** Normalizado, mas não validado: quem decide o que fazer com documento inválido é o servidor. */
  documento: string | null
}

export type EventoHotmart =
  | {
      tipo: 'aprovada'
      eventId: string | null
      evento: 'PURCHASE_APPROVED'
      transacao: string
      codigoOferta: string
      aprovadaEm: Date
      valor: number | null
      moeda: string | null
      comprador: Comprador
    }
  | { tipo: 'encerrada'; eventId: string | null; evento: string; transacao: string; status: StatusEncerramento }
  | {
      tipo: 'ignorado'
      eventId: string | null
      evento: string | null
      transacao: string | null
      motivo: 'evento_desconhecido' | 'payload_invalido'
    }

function objeto(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function texto(v: unknown, maximo: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t && t.length <= maximo ? t : null
}

function numero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Lê o envelope da Hotmart (versão 2.0.0). Nunca lança: o que não entende vira `ignorado`. */
export function lerEventoHotmart(payload: unknown): EventoHotmart {
  const envelope = objeto(payload)
  const eventId = texto(envelope?.id, 200)
  const evento = texto(envelope?.event, 100)
  const dados = objeto(envelope?.data)
  const compra = objeto(dados?.purchase)
  const transacao = texto(compra?.transaction, 200)

  if (!envelope || !evento) return { tipo: 'ignorado', eventId, evento, transacao, motivo: 'payload_invalido' }

  const status = statusDoEncerramento(evento)
  if (status) {
    if (!transacao) return { tipo: 'ignorado', eventId, evento, transacao, motivo: 'payload_invalido' }
    return { tipo: 'encerrada', eventId, evento, transacao, status }
  }

  if (evento !== 'PURCHASE_APPROVED') {
    return { tipo: 'ignorado', eventId, evento, transacao, motivo: 'evento_desconhecido' }
  }

  const comprador = objeto(dados?.buyer)
  const email = texto(comprador?.email, 254)?.toLowerCase() ?? null
  const codigoOferta = texto(objeto(compra?.offer)?.code, 200)
  const aprovadaMs = numero(compra?.approved_date) ?? numero(envelope.creation_date)
  const aprovadaEm = aprovadaMs === null ? null : new Date(aprovadaMs)
  const preco = objeto(compra?.price)

  if (!transacao || !codigoOferta || !email || !email.includes('@') || !aprovadaEm || Number.isNaN(aprovadaEm.getTime())) {
    return { tipo: 'ignorado', eventId, evento, transacao, motivo: 'payload_invalido' }
  }

  const documento = texto(comprador?.document, 30)
  return {
    tipo: 'aprovada',
    eventId,
    evento: 'PURCHASE_APPROVED',
    transacao,
    codigoOferta,
    aprovadaEm,
    valor: numero(preco?.value),
    moeda: texto(preco?.currency_value, 10),
    comprador: { nome: texto(comprador?.name, 200), email, documento: documento ? normalizar(documento) : null },
  }
}

/**
 * Status com que a venda NASCE, dado o que já chegou para a mesma transação (§16.1, item 9).
 * Um encerramento que chegou antes da aprovação não pode ser desfeito por ela. Vale o primeiro.
 */
export function statusInicialDaVenda(eventosAnteriores: readonly string[]): 'ativa' | StatusEncerramento {
  for (const evento of eventosAnteriores) {
    const status = statusDoEncerramento(evento)
    if (status) return status
  }
  return 'ativa'
}
