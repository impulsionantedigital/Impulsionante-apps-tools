// Adapter da Evolution API v2. Lê o webhook dela (`messages.upsert`, `messages.update`,
// `connection.update`) e responde com texto. Anexo de SAÍDA não existe em canal nenhum ainda.
import { causaDaFalhaSemResposta } from '@/lib/canais/erroMeta'
import { normalizarTelefone } from '@/lib/canais/telefone'
import { redigirValores } from '@/lib/canais/redigir'
import { isoDeCarimbo } from '@/lib/canais/carimbo'
import {
  comoId,
  comoTexto,
  contarCorte,
  limparTexto,
  LIMITE_NOME,
  LIMITE_TEXTO,
} from '@/server/canais/providers/fronteira'
import type {
  CanalAdapter,
  CanalCreds,
  CanalEvent,
  CorteDoEnvelope,
  EnvioResultado,
  HttpDeps,
  InboundMidia,
  TipoChat,
} from '@/server/canais/types'
import { refNaoValidada, segredosDe, SLUG_EVOLUTION } from '@/server/canais/types'
import type { StatusEntregaProvider } from '@/lib/canais/janela'

const TIMEOUT_ENVIO_MS = 20_000
const LIMITE_ACKS = 500
const LIMITE_MIME = 100
const FORMA_MIME = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i

interface EvoMidia {
  caption?: unknown
  mimetype?: unknown
  message?: { documentMessage?: EvoMidia }
}

interface EvoKey {
  remoteJid?: unknown
  remoteJidAlt?: unknown
  senderPn?: unknown
  participant?: unknown
  participantAlt?: unknown
  fromMe?: unknown
  id?: unknown
}

interface EvoEnvelope {
  event?: unknown
  instance?: unknown
  data?: {
    key?: EvoKey
    keyId?: unknown
    status?: unknown
    state?: unknown
    pushName?: unknown
    messageTimestamp?: unknown
    message?: Record<string, unknown> & {
      conversation?: unknown
      extendedTextMessage?: { text?: unknown }
    }
  }
}

const KIND: Record<string, InboundMidia['kind']> = Object.assign(Object.create(null), {
  imageMessage: 'imagem',
  audioMessage: 'audio',
  videoMessage: 'video',
  documentMessage: 'documento',
  documentWithCaptionMessage: 'documento',
})

const ACK: Record<string, StatusEntregaProvider> = Object.assign(Object.create(null), {
  SERVER_ACK: 'sent',
  DELIVERY_ACK: 'delivered',
  READ: 'read',
  PLAYED: 'read',
  ERROR: 'failed',
})

function tipoDoChat(jid: string): TipoChat {
  if (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@c.us') || jid.endsWith('@lid')) return 'individual'
  if (jid.endsWith('@g.us')) return 'grupo'
  if (jid.endsWith('@broadcast')) return 'broadcast'
  return 'outro'
}

function mimeDoEnvelope(bruto: unknown): string | undefined {
  const limpo = limparTexto(bruto, LIMITE_MIME + 1).trim()
  if (!limpo || limpo.length > LIMITE_MIME || /[\r\n]/.test(limpo)) return undefined
  return FORMA_MIME.test(limpo.split(';')[0].trim()) ? limpo : undefined
}

// A Evolution manda `messageTimestamp` em SEGUNDOS (às vezes como string).
function msDoCarimbo(bruto: unknown): number | undefined {
  const n = typeof bruto === 'string' ? Number(bruto) : bruto
  return typeof n === 'number' && Number.isFinite(n) ? n * 1000 : undefined
}

function midiaDe(
  message: Record<string, unknown>,
  messageId: string,
): { midia: InboundMidia | null; legenda: string } {
  for (const campo of Object.keys(KIND)) {
    const bruto = message[campo]
    if (!bruto || typeof bruto !== 'object') continue
    // `documentWithCaptionMessage` embrulha um `documentMessage` dentro de `message`.
    const conteudo = ((bruto as EvoMidia).message?.documentMessage ?? bruto) as EvoMidia
    const legenda = limparTexto(conteudo.caption, LIMITE_TEXTO)
    return {
      midia: {
        kind: KIND[campo],
        mime: mimeDoEnvelope(conteudo.mimetype),
        refExterna: refNaoValidada(messageId),
        legenda,
      },
      legenda,
    }
  }
  return { midia: null, legenda: '' }
}

function parseMensagem(env: EvoEnvelope, agoraMs: number): CanalEvent[] {
  const d = env.data
  const key = d?.key
  const externalId = comoId(key?.id)
  const conversaExterna = comoTexto(key?.remoteJid)
  if (!externalId || !conversaExterna) return []
  const tipoChat = tipoDoChat(conversaExterna)

  const message = d?.message && typeof d.message === 'object' ? d.message : {}
  const { midia, legenda } = midiaDe(message, externalId)
  const textoPuro = comoTexto(message.conversation) ?? comoTexto(message.extendedTextMessage?.text)

  // Grupo: quem falou vem do `participant`. Chat @lid: o telefone vem no campo alternativo.
  const candidatos =
    tipoChat === 'grupo'
      ? [key?.participantAlt, key?.participant]
      : [key?.senderPn, key?.remoteJidAlt, conversaExterna]
  let remetente: string | null = null
  for (const c of candidatos) {
    remetente = normalizarTelefone(comoTexto(c))
    if (remetente) break
  }

  const nome = comoTexto(d?.pushName)
  return [
    {
      tipo: 'mensagem',
      externalId,
      conversaExterna,
      tipoChat,
      remetente,
      identidadeExterna: null,
      nomeRemetente: nome ? limparTexto(nome, LIMITE_NOME) : null,
      timestamp: isoDeCarimbo(msDoCarimbo(d?.messageTimestamp), agoraMs),
      texto: limparTexto(textoPuro ?? legenda, LIMITE_TEXTO),
      midia,
      origem: key?.fromMe === true ? 'aparelho' : 'contato',
    },
  ]
}

function parseAck(env: EvoEnvelope, corte?: CorteDoEnvelope): CanalEvent[] {
  // A v2 manda um ack por evento; `data` como lista também é aceito, com o mesmo teto da uazapi.
  const lista = Array.isArray(env.data) ? (env.data as EvoEnvelope['data'][]) : [env.data]
  contarCorte(corte, lista.length, LIMITE_ACKS)
  const eventos: CanalEvent[] = []
  for (const d of lista.slice(0, LIMITE_ACKS)) {
    const status = ACK[comoTexto(d?.status) ?? '']
    const id = comoId(d?.keyId) ?? comoId(d?.key?.id)
    if (status && id) eventos.push({ tipo: 'status', externalId: id, status })
  }
  return eventos
}

function parseConexao(env: EvoEnvelope): CanalEvent[] {
  const externalId = comoTexto(env.instance)
  if (!externalId) return []
  return [{ tipo: 'conexao', externalId, conectado: env.data?.state === 'open' }]
}

export const evolutionAdapter: CanalAdapter = {
  slug: SLUG_EVOLUTION,
  capabilities: {
    enviaMidia: false,
    markRead: false,
    conexaoPareada: true,
    precisaCredencial: true,
    janela24h: false,
    identidadePorTelefone: true,
    sintaxeWhatsapp: true,
    // A Evolution reenvia como `messages.upsert` com `fromMe` o que foi mandado pela API.
    ecoaEnvioProprio: true,
    recebePorWebhook: true,
  },

  parse(envelope: unknown, agoraMs: number = Date.now(), corte?: CorteDoEnvelope): CanalEvent[] {
    if (!envelope || typeof envelope !== 'object') return []
    const env = envelope as EvoEnvelope
    switch (env.event) {
      case 'messages.upsert':
        return parseMensagem(env, agoraMs)
      case 'messages.update':
        return parseAck(env, corte)
      case 'connection.update':
        return parseConexao(env)
      default:
        return []
    }
  },

  async enviarTexto(
    creds: CanalCreds | null,
    destino: string,
    texto: string,
    deps: HttpDeps = {},
  ): Promise<EnvioResultado> {
    if (!creds || creds.tipo !== SLUG_EVOLUTION) {
      return { ok: false, erro: 'canal sem credencial configurada', codigoHttp: null }
    }
    const http = deps.fetchFn ?? fetch
    const segredos = segredosDe(creds)
    let r: Response
    try {
      r = await http(`${creds.serverUrl}/message/sendText/${encodeURIComponent(creds.instancia)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: creds.apiKey },
        body: JSON.stringify({ number: destino, text: texto }),
        signal: AbortSignal.timeout(TIMEOUT_ENVIO_MS),
      })
    } catch (err) {
      return {
        ok: false,
        erro: redigirValores(err, segredos),
        codigoHttp: null,
        causa: causaDaFalhaSemResposta(err),
      }
    }
    if (!r.ok) {
      return { ok: false, erro: redigirValores(`HTTP ${r.status}`, segredos), codigoHttp: r.status }
    }
    let externalId: string | undefined
    try {
      const corpo = (await r.json()) as { key?: { id?: unknown } }
      externalId = comoId(corpo?.key?.id)
    } catch {
      externalId = undefined
    }
    if (!externalId) {
      return {
        ok: false,
        erro:
          'O servidor de mensagens aceitou o envio (HTTP 200) mas não confirmou a entrega; confira o WhatsApp antes de reenviar.',
        codigoHttp: r.status,
      }
    }
    return { ok: true, externalId }
  },
}
