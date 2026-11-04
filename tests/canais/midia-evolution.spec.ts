import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@/server/secrets', () => ({ getSecret: vi.fn(async () => 'chave-da-instancia'), setSecret: vi.fn(), deleteSecret: vi.fn() }))

import { baixarMidiaEvolution, decodificarComTeto } from '@/server/canais/midia-evolution'

afterEach(() => vi.restoreAllMocks())

describe('decodificarComTeto', () => {
  it('decodifica base64 simples', () => {
    const r = decodificarComTeto(btoa('abc'), 10)
    expect(r.ok && Buffer.from(r.bytes).toString()).toBe('abc')
  })

  it('remove o prefixo data:…;base64,', () => {
    const r = decodificarComTeto(`data:image/jpeg;base64,${btoa('xyz')}`, 10)
    expect(r.ok && Buffer.from(r.bytes).toString()).toBe('xyz')
  })

  it('recusa pelo tamanho antes de decodificar', () => {
    const espiao = vi.spyOn(Buffer, 'from')
    expect(decodificarComTeto('A'.repeat(4000), 100)).toEqual({ ok: false, motivo: 'grande' })
    expect(espiao).not.toHaveBeenCalled()
  })

  it('vazio ou fora do alfabeto é inválido', () => {
    expect(decodificarComTeto('', 100)).toEqual({ ok: false, motivo: 'invalido' })
    expect(decodificarComTeto('não é base64!', 100)).toEqual({ ok: false, motivo: 'invalido' })
  })
})

describe('baixarMidiaEvolution', () => {
  const canal = { id: 'c1', serverUrl: 'https://evo.exemplo.com', externalId: 'loja' }
  const resposta = (corpo: unknown, status = 201, headers: Record<string, string> = {}) =>
    vi.fn(async () => new Response(JSON.stringify(corpo), { status, headers })) as unknown as typeof fetch

  it('devolve os bytes e o mime', async () => {
    const fetchFn = resposta({ base64: btoa('abc'), mimetype: 'image/jpeg' })
    expect(await baixarMidiaEvolution(canal, 'MSG1', 1000, { fetchFn })).toEqual({
      ok: true,
      bytes: new Uint8Array(Buffer.from('abc')),
      mime: 'image/jpeg',
    })
  })

  it('maior que a folga mas dentro do teto dá sem_cota', async () => {
    const fetchFn = resposta({ base64: btoa('a'.repeat(300)), mimetype: 'image/jpeg' })
    expect(await baixarMidiaEvolution(canal, 'MSG1', 10, { fetchFn })).toEqual({ ok: false, motivo: 'sem_cota' })
  })

  it('resposta anunciada maior que o teto é recusada sem ler o corpo', async () => {
    const fetchFn = resposta({ base64: 'x' }, 201, { 'content-length': String(200 * 1024 * 1024) })
    expect(await baixarMidiaEvolution(canal, 'MSG1', Number.POSITIVE_INFINITY, { fetchFn })).toEqual({
      ok: false,
      motivo: 'grande',
    })
  })

  it('erro HTTP vira http; canal sem instância vira destino_recusado', async () => {
    expect(await baixarMidiaEvolution(canal, 'MSG1', 1000, { fetchFn: resposta({}, 500) })).toEqual({
      ok: false,
      motivo: 'http',
    })
    expect(await baixarMidiaEvolution({ ...canal, externalId: null }, 'MSG1', 1000)).toEqual({
      ok: false,
      motivo: 'destino_recusado',
    })
  })
})
