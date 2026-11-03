import { beforeEach, describe, expect, it, vi } from 'vitest'
import { estimarCustoUsd, mensagensDoContexto, textoParaBusca } from '@/lib/base-documentos/contexto'

const getSecret = vi.fn()
const registrarCusto = vi.fn()
vi.mock('@/server/secrets', () => ({ getSecret: (...a: unknown[]) => getSecret(...a) }))
vi.mock('@/server/agente/custo', () => ({ registrarCusto: (...a: unknown[]) => registrarCusto(...a) }))

import { embedarLote } from '@/server/agente/embed'
import { gerarFraseDeContexto } from '@/server/base-documentos/frase-contexto'

describe('puro', () => {
  it('mensagens levam documento, títulos e trecho', () => {
    const [sys, user] = mensagensDoContexto({ documento: 'Almanaque das Ervas', caminho: ['Ervas', 'Arruda'], texto: 'Quente.' })
    expect(sys.content).toContain('UMA ou DUAS frases')
    expect(user.content).toBe('Documento: Almanaque das Ervas\nTitulos: Ervas › Arruda\n\nTrecho:\nQuente.')
  })
  it('sem título diz (sem titulo)', () =>
    expect(mensagensDoContexto({ documento: 'Aula 3', caminho: [], texto: 'x' })[1].content).toContain('Titulos: (sem titulo)'))
  it('texto para busca junta caminho, contexto e texto', () =>
    expect(textoParaBusca({ caminho: ['A', 'B'], contexto: 'Sobre B.', texto: 't' })).toBe('A › B\nSobre B.\nt'))
  it('texto para busca corta em 8000', () =>
    expect(textoParaBusca({ caminho: [], contexto: null, texto: 'x'.repeat(9000) }).length).toBe(8000))
  it('custo estimado de 2000 trechos de 1200 caracteres fica abaixo de 1 dólar', () => {
    const v = estimarCustoUsd(Array.from({ length: 2000 }, () => ({ texto: 'x'.repeat(1200) })))
    expect(v).toBeGreaterThan(0.1)
    expect(v).toBeLessThan(1)
  })
})

function resp(status: number, corpo: unknown) {
  return { ok: status === 200, status, json: async () => corpo }
}
const vec = (n: number) => Array.from({ length: 1536 }, () => n)

describe('servidor', () => {
  beforeEach(() => {
    getSecret.mockReset().mockResolvedValue('sk-x')
    registrarCusto.mockReset().mockResolvedValue(undefined)
    vi.unstubAllGlobals()
  })

  it('embedarLote ordena por index e registra um custo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resp(200, {
      data: [{ index: 1, embedding: vec(2) }, { index: 0, embedding: vec(1) }],
      usage: { prompt_tokens: 10 },
    })))
    const r = await embedarLote(['a', 'b'], { ws: 'w' })
    expect(r).not.toBeNull()
    expect(r).not.toBe('sem_chave')
    if (r && r !== 'sem_chave') expect([r.vetores[0][0], r.vetores[1][0]]).toEqual([1, 2])
    expect(registrarCusto).toHaveBeenCalledTimes(1)
    expect(registrarCusto.mock.calls[0][0]).toMatchObject({ conversaId: null, tokensEntrada: 10 })
  })
  it('embedarLote: sem chave, erro de programação e falha HTTP', async () => {
    getSecret.mockResolvedValue(null)
    expect(await embedarLote(['a'], { ws: 'w' })).toBe('sem_chave')
    getSecret.mockResolvedValue('sk-x')
    await expect(embedarLote([], { ws: 'w' })).rejects.toThrow()
    await expect(embedarLote(Array(65).fill('a'), { ws: 'w' })).rejects.toThrow()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resp(500, {})))
    expect(await embedarLote(['a'], { ws: 'w' })).toBeNull()
  })
  it('frase: sem chave, aparada, cortada em 400 e 500 falha', async () => {
    const p = { ws: 'w', documento: 'd', caminho: [], texto: 't' }
    getSecret.mockResolvedValue(null)
    expect(await gerarFraseDeContexto(p)).toBe('sem_chave')
    getSecret.mockResolvedValue('sk-x')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resp(200, {
      choices: [{ message: { content: '  Oi.  ' } }], usage: { prompt_tokens: 5, completion_tokens: 3 },
    })))
    expect(await gerarFraseDeContexto(p)).toBe('Oi.')
    expect(registrarCusto.mock.calls[0][0]).toMatchObject({ tokensEntrada: 5, tokensSaida: 3, conversaId: null })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resp(200, { choices: [{ message: { content: 'y'.repeat(900) } }] })))
    expect((await gerarFraseDeContexto(p) as string).length).toBe(400)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resp(500, {})))
    expect(await gerarFraseDeContexto(p)).toBe('falhou')
  })
})
