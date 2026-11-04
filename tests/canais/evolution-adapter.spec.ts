import { describe, it, expect, vi } from 'vitest'
import { evolutionAdapter } from '@/server/canais/providers/evolution'
import { credenciaisDeCanal, credenciaisEvolution, type CanalCreds } from '@/server/canais/types'

const base = { instance: 'loja', apikey: 'chave-da-instancia' }
const AGORA = 1730000001000
const creds = credenciaisEvolution({
  serverUrl: 'https://evo.exemplo.com',
  instancia: 'loja',
  apiKey: 'chave-da-instancia',
}) as CanalCreds

function upsert(data: Record<string, unknown>) {
  return { ...base, event: 'messages.upsert', data }
}

describe('evolutionAdapter.parse', () => {
  it('texto simples', () => {
    const [ev] = evolutionAdapter.parse(
      upsert({
        key: { remoteJid: '5511999990000@s.whatsapp.net', fromMe: false, id: 'ABC' },
        pushName: 'Ana',
        messageTimestamp: 1730000000,
        message: { conversation: 'oi' },
      }),
      AGORA,
    )
    expect(ev).toMatchObject({
      tipo: 'mensagem',
      externalId: 'ABC',
      conversaExterna: '5511999990000@s.whatsapp.net',
      tipoChat: 'individual',
      texto: 'oi',
      remetente: '5511999990000',
      nomeRemetente: 'Ana',
      origem: 'contato',
      midia: null,
      timestamp: new Date(1730000000 * 1000).toISOString(),
    })
  })

  it('extendedTextMessage', () => {
    const [ev] = evolutionAdapter.parse(
      upsert({
        key: { remoteJid: '5511999990000@s.whatsapp.net', id: 'ABC' },
        message: { extendedTextMessage: { text: 'com link' } },
      }),
      AGORA,
    )
    expect(ev).toMatchObject({ texto: 'com link' })
  })

  it('imagem com legenda', () => {
    const [ev] = evolutionAdapter.parse(
      upsert({
        key: { remoteJid: '5511999990000@s.whatsapp.net', id: 'ABC' },
        messageType: 'imageMessage',
        message: { imageMessage: { caption: 'foto', mimetype: 'image/jpeg' } },
      }),
      AGORA,
    )
    expect(ev).toMatchObject({
      texto: 'foto',
      midia: { kind: 'imagem', mime: 'image/jpeg', refExterna: { valor: 'ABC' }, legenda: 'foto' },
    })
  })

  it('áudio, vídeo e documento', () => {
    const tipos: Array<[string, string]> = [
      ['audioMessage', 'audio'],
      ['videoMessage', 'video'],
      ['documentMessage', 'documento'],
      ['documentWithCaptionMessage', 'documento'],
    ]
    for (const [campo, kind] of tipos) {
      const [ev] = evolutionAdapter.parse(
        upsert({
          key: { remoteJid: '5511999990000@s.whatsapp.net', id: 'X' },
          message: { [campo]: { mimetype: 'application/octet-stream' } },
        }),
        AGORA,
      )
      expect(ev && ev.tipo === 'mensagem' && ev.midia?.kind).toBe(kind)
    }
  })

  it('figurinha não vira mídia', () => {
    const [ev] = evolutionAdapter.parse(
      upsert({
        key: { remoteJid: '5511999990000@s.whatsapp.net', id: 'X' },
        message: { stickerMessage: { mimetype: 'image/webp' } },
      }),
      AGORA,
    )
    expect(ev && ev.tipo === 'mensagem' && ev.midia).toBeNull()
  })

  it('fromMe vira origem aparelho', () => {
    const [ev] = evolutionAdapter.parse(
      upsert({
        key: { remoteJid: '5511999990000@s.whatsapp.net', fromMe: true, id: 'OUT1' },
        message: { conversation: 'enviada pela API' },
      }),
      AGORA,
    )
    expect(ev).toMatchObject({ origem: 'aparelho', externalId: 'OUT1' })
  })

  it('grupo pelo sufixo @g.us, remetente do participant', () => {
    const [ev] = evolutionAdapter.parse(
      upsert({
        key: { remoteJid: '1203630@g.us', participant: '5511888880000@s.whatsapp.net', id: 'G1' },
        message: { conversation: 'no grupo' },
      }),
      AGORA,
    )
    expect(ev).toMatchObject({ tipoChat: 'grupo', remetente: '5511888880000' })
  })

  it('chat @lid usa o telefone alternativo como remetente', () => {
    const [ev] = evolutionAdapter.parse(
      upsert({
        key: { remoteJid: '123456@lid', remoteJidAlt: '5511777770000@s.whatsapp.net', id: 'L1' },
        message: { conversation: 'oi' },
      }),
      AGORA,
    )
    expect(ev).toMatchObject({ remetente: '5511777770000' })
  })

  it('ack DELIVERY_ACK', () => {
    expect(
      evolutionAdapter.parse({ ...base, event: 'messages.update', data: { keyId: 'ABC', status: 'DELIVERY_ACK' } }),
    ).toEqual([{ tipo: 'status', externalId: 'ABC', status: 'delivered' }])
  })

  it('ack com key.id, READ e status desconhecido', () => {
    expect(
      evolutionAdapter.parse({ ...base, event: 'messages.update', data: { key: { id: 'ABC' }, status: 'READ' } }),
    ).toEqual([{ tipo: 'status', externalId: 'ABC', status: 'read' }])
    expect(
      evolutionAdapter.parse({ ...base, event: 'messages.update', data: { keyId: 'ABC', status: 'OUTRO' } }),
    ).toEqual([])
  })

  it('connection.update open e close', () => {
    expect(evolutionAdapter.parse({ ...base, event: 'connection.update', data: { state: 'open' } })).toEqual([
      { tipo: 'conexao', externalId: 'loja', conectado: true },
    ])
    expect(evolutionAdapter.parse({ ...base, event: 'connection.update', data: { state: 'close' } })).toEqual([
      { tipo: 'conexao', externalId: 'loja', conectado: false },
    ])
  })

  it('evento desconhecido e lixo dão []', () => {
    expect(evolutionAdapter.parse({ ...base, event: 'presence.update', data: {} })).toEqual([])
    expect(evolutionAdapter.parse(null)).toEqual([])
    expect(evolutionAdapter.parse('x')).toEqual([])
    expect(evolutionAdapter.parse(upsert({ key: { id: 'semchat' } }))).toEqual([])
  })
})

describe('evolutionAdapter.enviarTexto', () => {
  it('sucesso devolve key.id e manda apikey', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ key: { id: 'OUT1' } }), { status: 201 }))
    const r = await evolutionAdapter.enviarTexto(creds, '5511999990000', 'olá', { fetchFn })
    expect(r).toEqual({ ok: true, externalId: 'OUT1' })
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://evo.exemplo.com/message/sendText/loja')
    expect(init.headers).toMatchObject({ apikey: 'chave-da-instancia' })
    expect(JSON.parse(init.body as string)).toEqual({ number: '5511999990000', text: 'olá' })
  })

  it('erro de rede não vaza a chave', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('falhou chave-da-instancia')
    })
    const r = await evolutionAdapter.enviarTexto(creds, '5511999990000', 'olá', { fetchFn })
    expect(r.ok).toBe(false)
    expect(JSON.stringify(r)).not.toContain('chave-da-instancia')
  })

  it('HTTP de erro devolve o código', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 400 }))
    const r = await evolutionAdapter.enviarTexto(creds, '5511999990000', 'olá', { fetchFn })
    expect(r).toMatchObject({ ok: false, codigoHttp: 400 })
  })

  it('200 sem key.id não confirma o envio', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }))
    const r = await evolutionAdapter.enviarTexto(creds, '5511999990000', 'olá', { fetchFn })
    expect(r).toMatchObject({ ok: false, codigoHttp: 200 })
  })

  it('creds de outro tipo é recusado', async () => {
    const uaz = credenciaisDeCanal({ serverUrl: 'https://uaz.exemplo.com', token: 'token-longo-1' })
    const r = await evolutionAdapter.enviarTexto(uaz, '5511999990000', 'olá')
    expect(r).toEqual({ ok: false, erro: 'canal sem credencial configurada', codigoHttp: null })
  })
})
