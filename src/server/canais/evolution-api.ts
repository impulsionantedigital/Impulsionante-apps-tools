// Chamadas à Evolution API v2. Toda chamada leva o cabeçalho `apikey` e toda mensagem de erro sai
// com a chave e o endereço do servidor redigidos. A chave GLOBAL só entra em `criarInstancia`;
// o resto usa a chave da instância.
import { redigirValores } from '@/lib/canais/redigir'

const TIMEOUT_MS = 20_000

export const EVENTOS_DO_WEBHOOK = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'] as const

export type EstadoEvolution = 'open' | 'connecting' | 'close'

// `tetoResposta`: recusa a resposta pelo `content-length` antes de ler o corpo (anexo em base64).
type Deps = { fetchFn?: typeof fetch; tetoResposta?: number }

export class ErroRespostaGrande extends Error {}

export class ErroHttp extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
  ) {
    super(mensagem)
  }
}

async function chamar(
  url: string,
  apiKey: string,
  corpo: unknown,
  segredos: string[],
  metodo: string,
  deps: Deps,
): Promise<Record<string, unknown>> {
  const http = deps.fetchFn ?? fetch
  let r: Response
  try {
    r = await http(url, {
      method: metodo,
      headers: { 'content-type': 'application/json', apikey: apiKey },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    throw new Error(`Não consegui falar com o servidor de mensagens: ${redigirValores(err, segredos)}`)
  }
  const anunciado = Number(r.headers.get('content-length'))
  if (deps.tetoResposta !== undefined && Number.isFinite(anunciado) && anunciado > deps.tetoResposta) {
    await r.body?.cancel().catch(() => {})
    throw new ErroRespostaGrande('resposta maior que o teto')
  }
  let dados: Record<string, unknown> = {}
  try {
    const lido = (await r.json()) as unknown
    dados = lido && typeof lido === 'object' ? (lido as Record<string, unknown>) : {}
  } catch {
    dados = {}
  }
  if (!r.ok) {
    throw new ErroHttp(
      `O servidor de mensagens recusou (HTTP ${r.status}): ${redigirValores(JSON.stringify(dados), segredos)}`,
      r.status,
    )
  }
  return dados
}

const caminho = (serverUrl: string, rota: string, instancia: string): string =>
  `${serverUrl}/${rota}/${encodeURIComponent(instancia)}`

function texto(x: unknown): string | null {
  return typeof x === 'string' && x.trim() ? x.trim() : null
}

// Na v2 o `hash` é a própria chave; em algumas versões veio como `{ apikey }`.
export function extrairChaveDaInstancia(resposta: unknown): string | null {
  if (!resposta || typeof resposta !== 'object') return null
  const hash = (resposta as { hash?: unknown }).hash
  if (typeof hash === 'string') return texto(hash)
  if (hash && typeof hash === 'object') return texto((hash as { apikey?: unknown }).apikey)
  return null
}

export async function criarInstancia(
  serverUrl: string,
  chaveGlobal: string,
  instanceName: string,
  deps: Deps = {},
): Promise<{ instancia: string; apiKey: string | null }> {
  let r: Record<string, unknown>
  try {
    r = await chamar(
      `${serverUrl}/instance/create`,
      chaveGlobal,
      { instanceName, integration: 'WHATSAPP-BAILEYS', qrcode: true },
      [chaveGlobal, serverUrl],
      'POST',
      deps,
    )
  } catch (err) {
    if (err instanceof ErroHttp && err.status === 401) {
      throw new Error('A Evolution recusou a chave global — confira a AUTHENTICATION_API_KEY.')
    }
    throw err
  }
  const instancia =
    texto((r.instance as { instanceName?: unknown } | undefined)?.instanceName) ?? instanceName
  return { instancia, apiKey: extrairChaveDaInstancia(r) }
}

export async function registrarWebhookEvolution(
  serverUrl: string,
  apiKey: string,
  instancia: string,
  url: string,
  deps: Deps = {},
): Promise<void> {
  await chamar(
    caminho(serverUrl, 'webhook/set', instancia),
    apiKey,
    {
      webhook: {
        enabled: true,
        url,
        byEvents: false,
        base64: false,
        events: [...EVENTOS_DO_WEBHOOK],
      },
    },
    // A URL do webhook carrega o segredo do canal: redigida também.
    [apiKey, serverUrl, url],
    'POST',
    deps,
  )
}

export async function conectarInstancia(
  serverUrl: string,
  apiKey: string,
  instancia: string,
  deps: Deps = {},
): Promise<{ qr: string | null }> {
  const r = await chamar(caminho(serverUrl, 'instance/connect', instancia), apiKey, undefined, [apiKey, serverUrl], 'GET', deps)
  return { qr: texto(r.code) }
}

export async function estadoDaInstancia(
  serverUrl: string,
  apiKey: string,
  instancia: string,
  deps: Deps = {},
): Promise<EstadoEvolution | null> {
  const r = await chamar(
    caminho(serverUrl, 'instance/connectionState', instancia),
    apiKey,
    undefined,
    [apiKey, serverUrl],
    'GET',
    deps,
  )
  const estado = (r.instance as { state?: unknown } | undefined)?.state
  return estado === 'open' || estado === 'connecting' || estado === 'close' ? estado : null
}

export async function baixarMidiaBase64(
  serverUrl: string,
  apiKey: string,
  instancia: string,
  messageId: string,
  deps: Deps = {},
): Promise<{ base64: string; mimetype: string | null }> {
  const r = await chamar(
    caminho(serverUrl, 'chat/getBase64FromMediaMessage', instancia),
    apiKey,
    { message: { key: { id: messageId } }, convertToMp4: false },
    [apiKey, serverUrl],
    'POST',
    deps,
  )
  return { base64: typeof r.base64 === 'string' ? r.base64 : '', mimetype: texto(r.mimetype) }
}

// Logout primeiro (pode falhar: a instância pode nem estar conectada), depois delete. 404 no
// delete quer dizer que ela já não existe — o que se queria.
export async function apagarInstancia(
  serverUrl: string,
  apiKey: string,
  instancia: string,
  deps: Deps = {},
): Promise<void> {
  const segredos = [apiKey, serverUrl]
  try {
    await chamar(caminho(serverUrl, 'instance/logout', instancia), apiKey, undefined, segredos, 'DELETE', deps)
  } catch {
    // segue para o delete
  }
  try {
    await chamar(caminho(serverUrl, 'instance/delete', instancia), apiKey, undefined, segredos, 'DELETE', deps)
  } catch (err) {
    if (err instanceof ErroHttp && err.status === 404) return
    throw err
  }
}
