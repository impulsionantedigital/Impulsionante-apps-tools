import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSecret: vi.fn(),
  receberCompra: vi.fn(),
}))

vi.mock('@/server/secrets', () => ({ getSecret: mocks.getSecret }))
vi.mock('@/server/vendas/processar', () => ({ receberCompra: mocks.receberCompra }))

import { POST } from '@/app/api/webhook/[plataforma]/route'
import { esquecerTokenHotmart } from '@/server/vendas/token-hotmart'

const TOKEN = 'token-da-hotmart'
const CORPO = JSON.stringify({ id: 'evt-1', event: 'PURCHASE_APPROVED' })

function chamar(opcoes: { plataforma?: string; corpo?: string; token?: string | null; url?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opcoes.token !== null) headers['x-hotmart-hottok'] = opcoes.token ?? TOKEN
  const req = new Request(opcoes.url ?? 'http://localhost/api/webhook/hotmart', {
    method: 'POST',
    headers,
    body: opcoes.corpo ?? CORPO,
  })
  return POST(req, { params: Promise.resolve({ plataforma: opcoes.plataforma ?? 'hotmart' }) })
}

beforeEach(() => {
  esquecerTokenHotmart()
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

  it('token configurado em branco conta como não configurado', async () => {
    mocks.getSecret.mockResolvedValue('')
    expect((await chamar({ token: '' })).status).toBe(503)
    expect(mocks.receberCompra).not.toHaveBeenCalled()
  })

  it('token errado ou ausente: 401, sem processar', async () => {
    expect((await chamar({ token: 'errado' })).status).toBe(401)
    expect((await chamar({ token: null })).status).toBe(401)
    expect(mocks.receberCompra).not.toHaveBeenCalled()
  })

  it('token na URL não autentica', async () => {
    const r = await chamar({ token: null, url: `http://localhost/api/webhook/hotmart?hottok=${TOKEN}` })
    expect(r.status).toBe(401)
    expect(mocks.receberCompra).not.toHaveBeenCalled()
  })

  it('corpo acima do teto: 413', async () => {
    expect((await chamar({ corpo: 'x'.repeat(1_000_001) })).status).toBe(413)
    expect(mocks.receberCompra).not.toHaveBeenCalled()
  })

  it('compra válida: processa o payload lido e devolve 200', async () => {
    const r = await chamar()
    expect(r.status).toBe(200)
    expect(mocks.receberCompra).toHaveBeenCalledWith('hotmart', { id: 'evt-1', event: 'PURCHASE_APPROVED' }, CORPO)
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

  it('o token é lido do cofre no máximo uma vez por minuto', async () => {
    await chamar()
    await chamar({ token: 'errado' })
    await chamar()
    expect(mocks.getSecret).toHaveBeenCalledTimes(1)
  })

  it('confere o token ANTES de ler o corpo: sem token, corpo gigante é 401 e não 413', async () => {
    const r = await chamar({ token: 'errado', corpo: 'x'.repeat(1_000_001) })
    expect(r.status).toBe(401)
  })

  // Por último: gasta o balde do limitador, que é do módulo.
  it('chamadas sem token não gastam o limitador das legítimas', async () => {
    for (let i = 0; i < 130; i++) expect((await chamar({ token: 'errado' })).status).toBe(401)
    expect((await chamar()).status).toBe(200)
  })
})
