// Anexo que chega pela Evolution: o link da mensagem aponta para a CDN do WhatsApp, com o arquivo
// criptografado. Quem abre é a própria instância (`getBase64FromMediaMessage`), e o CRM recebe o
// arquivo em base64 — conferido pelo tamanho ANTES de decodificar.
import 'server-only'
import { getSecret } from '@/server/secrets'
import { chaveToken } from '@/server/canais/segredos'
import { TETO_BYTES, type ResultadoDownload } from '@/server/canais/midia'
import { baixarMidiaBase64, ErroHttp, ErroRespostaGrande } from '@/server/canais/evolution-api'

const PREFIXO_DATA = /^data:[^,]*;base64,/i
const ALFABETO = /^[A-Za-z0-9+/]+={0,2}$/

export function decodificarComTeto(
  base64: string,
  teto: number,
): { ok: true; bytes: Uint8Array } | { ok: false; motivo: 'grande' | 'invalido' } {
  const limpo = base64.replace(PREFIXO_DATA, '').replace(/\s+/g, '')
  if (!limpo) return { ok: false, motivo: 'invalido' }
  if (Math.floor((limpo.length * 3) / 4) > teto) return { ok: false, motivo: 'grande' }
  if (!ALFABETO.test(limpo)) return { ok: false, motivo: 'invalido' }
  return { ok: true, bytes: new Uint8Array(Buffer.from(limpo, 'base64')) }
}

// Folga do JSON em volta do base64 (chaves, mimetype, nome do arquivo).
const FOLGA_JSON = 64 * 1024

export async function baixarMidiaEvolution(
  canal: { id: string; serverUrl: string; externalId: string | null },
  messageId: string,
  folga: number,
  deps: { fetchFn?: typeof fetch } = {},
): Promise<ResultadoDownload> {
  if (!canal.externalId || !canal.serverUrl) return { ok: false, motivo: 'destino_recusado' }
  const apiKey = await getSecret(chaveToken(canal.id))
  if (!apiKey) return { ok: false, motivo: 'destino_recusado' }

  let r: { base64: string; mimetype: string | null }
  try {
    r = await baixarMidiaBase64(canal.serverUrl, apiKey, canal.externalId, messageId, {
      fetchFn: deps.fetchFn,
      tetoResposta: Math.ceil((TETO_BYTES * 4) / 3) + FOLGA_JSON,
    })
  } catch (err) {
    if (err instanceof ErroRespostaGrande) return { ok: false, motivo: 'grande' }
    if (err instanceof ErroHttp) return { ok: false, motivo: 'http' }
    return { ok: false, motivo: 'rede' }
  }

  const d = decodificarComTeto(r.base64, TETO_BYTES)
  if (!d.ok) return { ok: false, motivo: d.motivo === 'grande' ? 'grande' : 'http' }
  if (d.bytes.byteLength > folga) return { ok: false, motivo: 'sem_cota' }
  return { ok: true, bytes: d.bytes, mime: r.mimetype }
}
