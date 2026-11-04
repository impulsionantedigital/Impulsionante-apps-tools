import { describe, it, expect, vi } from 'vitest'
import {
  apagarInstancia,
  baixarMidiaBase64,
  conectarInstancia,
  criarInstancia,
  estadoDaInstancia,
  extrairChaveDaInstancia,
  registrarWebhookEvolution,
} from '@/server/canais/evolution-api'

const SRV = 'https://evo.exemplo.com'
const GLOBAL = 'chave-global-secreta'
const KEY = 'chave-da-instancia'

type Chamada = { url: string; metodo: string; headers: Record<string, string>; corpo: unknown }

function falso(respostas: Array<[number, unknown]>) {
  const chamadas: Chamada[] = []
  let i = 0
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({
      url: String(url),
      metodo: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      corpo: init?.body ? JSON.parse(init.body as string) : undefined,
    })
    const [status, corpo] = respostas[Math.min(i++, respostas.length - 1)]
    return new Response(JSON.stringify(corpo), { status })
  }) as unknown as typeof fetch
  return { fetchFn, chamadas }
}

describe('evolution-api', () => {
  it('criarInstancia: POST /instance/create com a chave global e devolve o hash', async () => {
    const { fetchFn, chamadas } = falso([[201, { instance: { instanceName: 'loja' }, hash: KEY }]])
    expect(await criarInstancia(SRV, GLOBAL, 'loja', { fetchFn })).toEqual({ instancia: 'loja', apiKey: KEY })
    expect(chamadas[0]).toMatchObject({
      url: `${SRV}/instance/create`,
      metodo: 'POST',
      headers: { apikey: GLOBAL },
      corpo: { instanceName: 'loja', integration: 'WHATSAPP-BAILEYS', qrcode: true },
    })
  })

  it('extrairChaveDaInstancia aceita string ou { apikey }', () => {
    expect(extrairChaveDaInstancia({ hash: KEY })).toBe(KEY)
    expect(extrairChaveDaInstancia({ hash: { apikey: 'k2' } })).toBe('k2')
    expect(extrairChaveDaInstancia({})).toBeNull()
    expect(extrairChaveDaInstancia({ hash: 3 })).toBeNull()
    expect(extrairChaveDaInstancia(null)).toBeNull()
  })

  it('criarInstancia com 401 dá a mensagem fixa e não vaza a chave global', async () => {
    const { fetchFn } = falso([[401, { message: `bad ${GLOBAL}` }]])
    const err = await criarInstancia(SRV, GLOBAL, 'loja', { fetchFn }).catch((e: Error) => e)
    expect((err as Error).message).toBe('A Evolution recusou a chave global — confira a AUTHENTICATION_API_KEY.')
  })

  it('outro erro HTTP redige a chave', async () => {
    const { fetchFn } = falso([[500, { message: `boom ${GLOBAL}` }]])
    const err = (await criarInstancia(SRV, GLOBAL, 'loja', { fetchFn }).catch((e: Error) => e)) as Error
    expect(err.message).toContain('HTTP 500')
    expect(err.message).not.toContain(GLOBAL)
  })

  it('registrarWebhookEvolution: POST /webhook/set/<inst> com os três eventos', async () => {
    const { fetchFn, chamadas } = falso([[201, {}]])
    await registrarWebhookEvolution(SRV, KEY, 'loja', 'https://crm/x', { fetchFn })
    expect(chamadas[0]).toMatchObject({
      url: `${SRV}/webhook/set/loja`,
      metodo: 'POST',
      headers: { apikey: KEY },
      corpo: {
        webhook: {
          enabled: true,
          url: 'https://crm/x',
          byEvents: false,
          base64: false,
          events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
        },
      },
    })
  })

  it('estadoDaInstancia: GET /instance/connectionState/<inst>', async () => {
    const { fetchFn, chamadas } = falso([[200, { instance: { instanceName: 'loja', state: 'open' } }]])
    expect(await estadoDaInstancia(SRV, KEY, 'loja', { fetchFn })).toBe('open')
    expect(chamadas[0]).toMatchObject({ url: `${SRV}/instance/connectionState/loja`, metodo: 'GET' })
    const outro = falso([[200, { instance: { state: 'esquisito' } }]])
    expect(await estadoDaInstancia(SRV, KEY, 'loja', { fetchFn: outro.fetchFn })).toBeNull()
  })

  it('nome com caractere especial vai codificado no caminho', async () => {
    const { fetchFn, chamadas } = falso([[200, { instance: { state: 'close' } }]])
    await estadoDaInstancia(SRV, KEY, 'Trilhas de Aruanda (GuIA)', { fetchFn })
    expect(chamadas[0].url).toBe(`${SRV}/instance/connectionState/Trilhas%20de%20Aruanda%20(GuIA)`)
  })

  it('conectarInstancia: GET /instance/connect/<inst> devolve o code', async () => {
    const { fetchFn, chamadas } = falso([[200, { code: '2@abc', base64: 'data:image/png;base64,xx' }]])
    expect(await conectarInstancia(SRV, KEY, 'loja', { fetchFn })).toEqual({ qr: '2@abc' })
    expect(chamadas[0]).toMatchObject({ url: `${SRV}/instance/connect/loja`, metodo: 'GET' })
  })

  it('conectarInstancia: o 2.3.x responde {count:0} antes do QR — tenta de novo até o code chegar', async () => {
    const { fetchFn, chamadas } = falso([
      [200, { count: 0 }],
      [200, { count: 0 }],
      [200, { pairingCode: null, code: '2@xyz', count: 1 }],
    ])
    expect(await conectarInstancia(SRV, KEY, 'loja', { fetchFn, esperaMs: 0 })).toEqual({ qr: '2@xyz' })
    expect(chamadas).toHaveLength(3)
  })

  it('conectarInstancia: aceita o formato { qrcode: { code } }', async () => {
    const { fetchFn } = falso([[200, { qrcode: { code: '2@aninhado' } }]])
    expect(await conectarInstancia(SRV, KEY, 'loja', { fetchFn, esperaMs: 0 })).toEqual({ qr: '2@aninhado' })
  })

  it('conectarInstancia: desiste depois de algumas tentativas sem code', async () => {
    const { fetchFn, chamadas } = falso([[200, { count: 0 }]])
    expect(await conectarInstancia(SRV, KEY, 'loja', { fetchFn, esperaMs: 0 })).toEqual({ qr: null })
    expect(chamadas.length).toBeGreaterThan(1)
    expect(chamadas.length).toBeLessThanOrEqual(8)
  })

  it('apagarInstancia: logout que falha não impede o delete', async () => {
    const { fetchFn, chamadas } = falso([
      [500, {}],
      [200, {}],
    ])
    await apagarInstancia(SRV, KEY, 'loja', { fetchFn })
    expect(chamadas.map((c) => `${c.metodo} ${c.url}`)).toEqual([
      `DELETE ${SRV}/instance/logout/loja`,
      `DELETE ${SRV}/instance/delete/loja`,
    ])
  })

  it('apagarInstancia: 404 no delete não é erro', async () => {
    const { fetchFn } = falso([
      [200, {}],
      [404, {}],
    ])
    await expect(apagarInstancia(SRV, KEY, 'loja', { fetchFn })).resolves.toBeUndefined()
  })

  it('baixarMidiaBase64: POST /chat/getBase64FromMediaMessage/<inst>', async () => {
    const { fetchFn, chamadas } = falso([[201, { base64: 'YWJj', mimetype: 'image/jpeg' }]])
    expect(await baixarMidiaBase64(SRV, KEY, 'loja', 'MSG1', { fetchFn })).toEqual({
      base64: 'YWJj',
      mimetype: 'image/jpeg',
    })
    expect(chamadas[0]).toMatchObject({
      url: `${SRV}/chat/getBase64FromMediaMessage/loja`,
      metodo: 'POST',
      corpo: { message: { key: { id: 'MSG1' } }, convertToMp4: false },
    })
  })

  it('erro de rede vira "Não consegui falar" sem vazar a chave', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error(`ECONNREFUSED ${KEY}`)
    }) as unknown as typeof fetch
    const err = (await estadoDaInstancia(SRV, KEY, 'loja', { fetchFn }).catch((e: Error) => e)) as Error
    expect(err.message).toMatch(/^Não consegui falar com o servidor de mensagens/)
    expect(err.message).not.toContain(KEY)
  })
})
