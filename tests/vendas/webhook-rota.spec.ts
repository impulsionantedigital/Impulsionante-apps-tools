import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSecret: vi.fn(),
  receberCompra: vi.fn(),
}))

vi.mock('@/server/secrets', () => ({ getSecret: mocks.getSecret }))
vi.mock('@/server/vendas/processar', () => ({ receberCompra: mocks.receberCompra }))

import { POST } from '@/app/api/webhook/[plataforma]/route'

const TOKEN = 'token-da-hotmart'

function chamar(opcoes: { plataforma?: string; corpo?: string; token?: string | null } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opcoes.token !== null) headers['x-hotmart-hottok'] = opcoes.token ?? TOKEN
  const req = new Request('http://localhost/api/webhook/hotmart', {
    method: 'POST',
    headers,
    body: opcoes.corpo ?? JSON.stringify({ id: 'evt-1', event: 'PURCHASE_APPROVED' }),
  })
  return POST(req, { params: Promise.resolve({ plataforma: opcoes.plataforma ?? 'hotmart' }) })
}

beforeEach(() => {
  mocks.getSecret.mockReset()
  mocks.receberCompra.mockReset()
  mocks.getSecret.mockResolvedValue(TOKEN)
  mocks.receberCompra.mockResolvedValue('ok')
})

describe('POST /api/webhook/[plataforma]', () => {
  it('plataforma desconhecida: 404, sem ler segredo nem processar', async () => {
    const r = await chamar({ plataforma: 'kiwify' })
    expect(r.status).toBe(404)
    expect(mocks.getSecret).not.toHaveBeenCalled()
    expect(mocks.receberCompra).not.toHaveBeenCalled()
  })

  it('sem token configurado: 503', async () => {
    mocks.getSecret.mockResolvedValue(null)
    expect((await chamar()).status).toBe(503)
    expect(mocks.receberCompra).not.toHaveBeenCalled()
  })

  it('token errado ou ausente: 401, sem processar', async () => {
    expect((await chamar({ token: 'errado' })).status).toBe(401)
    expect((await chamar({ token: null })).status).toBe(401)
    expect(mocks.receberCompra).not.toHaveBeenCalled()
  })

  it('corpo acima do teto: 413', async () => {
    expect((await chamar({ corpo: 'x'.repeat(1_000_001) })).status).toBe(413)
    expect(mocks.receberCompra).not.toHaveBeenCalled()
  })

  it('compra válida: processa o payload lido e devolve 200', async () => {
    const r = await chamar()
    expect(r.status).toBe(200)
    expect(mocks.receberCompra).toHaveBeenCalledWith(
      'hotmart',
      { id: 'evt-1', event: 'PURCHASE_APPROVED' },
      JSON.stringify({ id: 'evt-1', event: 'PURCHASE_APPROVED' }),
    )
  })

  it('JSON inválido ainda é auditado: processa com payload nulo e o corpo bruto', async () => {
    const r = await chamar({ corpo: '{isto não é json' })
    expect(r.status).toBe(200)
    expect(mocks.receberCompra).toHaveBeenCalledWith('hotmart', null, '{isto não é json')
  })

  it('falha no processamento devolve 500, para a Hotmart reenviar', async () => {
    mocks.receberCompra.mockResolvedValue('falhou')
    expect((await chamar()).status).toBe(500)
  })

  it('exceção inesperada também devolve 500, sem vazar detalhe', async () => {
    mocks.receberCompra.mockRejectedValue(new Error('banco caiu'))
    const r = await chamar()
    expect(r.status).toBe(500)
    expect(await r.text()).toBe('')
  })
})
