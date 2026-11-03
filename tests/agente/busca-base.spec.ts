import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const embedar = vi.fn()
vi.mock('@/server/supabase', () => ({ admin: () => ({ rpc }) }))
vi.mock('@/server/agente/embed', () => ({ embedar: (...a: unknown[]) => embedar(...a) }))

import { buscarNaBase, buscarVarias, juntarSecao, juntarSemSobreposicao, lerSecao, listarPorTermos } from '@/server/agente/busca-base'
import { TETO_SECAO } from '@/lib/canais/bloco-conhecimento'

function resposta(r: { data: unknown; error?: unknown }) {
  return { abortSignal: () => Promise.resolve({ data: r.data, error: r.error ?? null }) }
}

beforeEach(() => {
  rpc.mockReset()
  embedar.mockReset()
  embedar.mockResolvedValue({ vetor: [0.1], versao: 'v1' })
})

describe('buscarNaBase', () => {
  it('mapeia as colunas novas: id e fonte (card sem fonte)', async () => {
    rpc.mockReturnValue(
      resposta({
        data: [
          { id: 'a', titulo: 'T', conteudo: 'C', tipo: 'fato', documento: 'Doc', caminho_titulos: 'X › Y', pagina: 4 },
          { id: 'b', titulo: 'P', conteudo: 'Q', tipo: 'playbook', documento: null, caminho_titulos: null, pagina: null },
        ],
      }),
    )
    const r = await buscarNaBase('w', 'q', { conversaId: null, tipos: null, assistenteId: null })
    expect(r).toEqual([
      { id: 'a', titulo: 'T', conteudo: 'C', tipo: 'fato', fonte: { documento: 'Doc', caminho: 'X › Y', pagina: 4 } },
      { id: 'b', titulo: 'P', conteudo: 'Q', tipo: 'playbook', fonte: null },
    ])
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_ws: 'w', p_limite: 5 })
  })

  it('erro do banco vira indisponivel', async () => {
    rpc.mockReturnValue(resposta({ data: null, error: { message: 'x' } }))
    expect(await buscarNaBase('w', 'q', { conversaId: null, tipos: null, assistenteId: null })).toBe('indisponivel')
  })
})

describe('buscarVarias', () => {
  it('cada consulta com limite 8; devolve o que veio quando só uma falha', async () => {
    rpc
      .mockReturnValueOnce(resposta({ data: [{ id: 'a', titulo: '', conteudo: '', tipo: 'fato' }] }))
      .mockReturnValueOnce(resposta({ data: null, error: { message: 'x' } }))
    const r = await buscarVarias('w', ['um', 'dois', 'tres', 'quatro'], { conversaId: null, assistenteId: null })
    expect(rpc).toHaveBeenCalledTimes(3)
    expect(rpc.mock.calls.every((c) => c[1].p_limite === 8)).toBe(true)
    expect(Array.isArray(r) && r.map((x) => x.id)).toEqual(['a'])
  })

  it('todas falham → indisponivel', async () => {
    rpc.mockReturnValue(resposta({ data: null, error: { message: 'x' } }))
    expect(await buscarVarias('w', ['a', 'b'], { conversaId: null, assistenteId: null })).toBe('indisponivel')
  })
})

describe('listarPorTermos', () => {
  it('sem tema: 25 por página, deslocamento pela página, sem embedding', async () => {
    rpc.mockReturnValue(resposta({ data: [{ id: 'a', documento: 'D', titulo: 't', caminho_titulos: '', pagina: null, recorte: 'r', total: '30' }] }))
    const r = await listarPorTermos('w', ['x', 'y', 'z', 'k'], { assistenteId: null, pagina: 2, conversaId: null })
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_termos: ['x', 'y', 'z'], p_limite: 25, p_deslocamento: 25, p_embedding: null })
    expect(embedar).not.toHaveBeenCalled()
    expect(r).toEqual({ total: 30, porPagina: 25, itens: [{ id: 'a', titulo: 't', fonte: { documento: 'D', caminho: '', pagina: null }, recorte: 'r' }] })
  })

  it('com tema: embeda o tema e pagina de 18', async () => {
    rpc.mockReturnValue(resposta({ data: [] }))
    await listarPorTermos('w', ['x'], { assistenteId: null, pagina: 1, tema: 'assunto', conversaId: 'c' })
    expect(embedar.mock.calls[0][0]).toBe('assunto')
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_limite: 18, p_deslocamento: 0, p_embedding: [0.1], p_versao: 'v1' })
  })

  it('embedding do tema falhou: segue sem tema', async () => {
    embedar.mockRejectedValue(new Error('caiu'))
    rpc.mockReturnValue(resposta({ data: [] }))
    expect(await listarPorTermos('w', ['x'], { assistenteId: null, pagina: 1, tema: 'assunto', conversaId: null })).toEqual({
      total: 0,
      itens: [],
      porPagina: 18,
    })
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_embedding: null, p_versao: null })
  })

  it('página além do fim: total desconhecido (null)', async () => {
    rpc.mockReturnValue(resposta({ data: [] }))
    expect(await listarPorTermos('w', ['x'], { assistenteId: null, pagina: 5, conversaId: null })).toEqual({ total: null, itens: [], porPagina: 25 })
  })

  it('página menor que 1 vira 1', async () => {
    rpc.mockReturnValue(resposta({ data: [] }))
    await listarPorTermos('w', ['x'], { assistenteId: null, pagina: -3, conversaId: null })
    expect(rpc.mock.calls[0][1].p_deslocamento).toBe(0)
  })
})

describe('lerSecao', () => {
  it('junta os trechos tirando a sobreposição', () => {
    const comum = 'fim do primeiro trecho com sobra'
    expect(juntarSemSobreposicao(`Começo. ${comum}`, `${comum} e o resto.`)).toBe(`Começo. ${comum} e o resto.`)
    expect(juntarSemSobreposicao('abc', 'def')).toBe('abc\ndef')
  })

  it('parte do alvo, alterna anterior/seguinte e marca cortado quando não cabe', () => {
    const grande = 'x'.repeat(3000)
    const linhas = ['A', 'B', 'C', 'D', 'E'].map((l, i) => ({
      documento: 'Doc',
      caminho_titulos: 'S',
      pagina: 2,
      conteudo: l + grande,
      alvo: i === 2,
    }))
    const r = juntarSecao(linhas)
    expect(r).not.toBe('nao_encontrado')
    if (r === 'nao_encontrado') return
    expect(r.cortado).toBe(true)
    expect(r.texto.length).toBeLessThanOrEqual(TETO_SECAO)
    expect(r.texto.startsWith('B')).toBe(true)
    expect(r.texto).toContain('\nC')
    expect(r.fonte).toEqual({ documento: 'Doc', caminho: 'S', pagina: 2 })
  })

  it('seção que cabe inteira não é cortada', () => {
    const r = juntarSecao([
      { conteudo: 'um', alvo: false },
      { conteudo: 'dois', alvo: true },
      { conteudo: 'tres', alvo: false },
    ])
    expect(r).toEqual({ fonte: null, texto: 'um\ndois\ntres', cortado: false })
  })

  it('trecho invisível → nao_encontrado; erro → indisponivel', async () => {
    rpc.mockReturnValueOnce(resposta({ data: [] }))
    expect(await lerSecao('w', 't', 'secao', { assistenteId: null })).toBe('nao_encontrado')
    rpc.mockReturnValueOnce(resposta({ data: null, error: { message: 'x' } }))
    expect(await lerSecao('w', 't', 'vizinhos', { assistenteId: null })).toBe('indisponivel')
  })
})
