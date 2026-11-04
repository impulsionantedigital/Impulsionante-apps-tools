import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const rpc = vi.fn()
const embedar = vi.fn()
vi.mock('@/server/supabase', () => ({ admin: () => ({ rpc }) }))
vi.mock('@/server/agente/embed', () => ({ embedar: (...a: unknown[]) => embedar(...a) }))

import { consultasDoTurno } from '@/server/agente/contexto'
import { buscarDoTurno } from '@/server/agente/busca-base'
import type { MensagemDoPrompt } from '@/lib/canais/historico-agente'

const cliente = (texto: string): MensagemDoPrompt => ({ direcao: 'entrada', autor: 'contato', texto, status: 'recebida' })
const agente = (texto: string, status = 'enviada'): MensagemDoPrompt => ({ direcao: 'saida', autor: 'agente', texto, status })

describe('consultasDoTurno', () => {
  it('continuação leva o assunto da conversa na segunda consulta', () => {
    const c = consultasDoTurno([
      cliente('tem alguma planta para abrir caminhos?'),
      agente('*Ana:*\nTem sim: o Item X é indicado para isso.\n\n_Sou um assistente virtual com inteligência artificial. Se preferir falar com uma pessoa, escreva "falar com atendente" e alguém do time segue por aqui._'),
      cliente('com quais eu poderia combinar então?'),
    ])
    expect(c[0]).toBe('com quais eu poderia combinar então?')
    expect(c[1]).toContain('com quais eu poderia combinar então?')
    expect(c[1]).toContain('tem alguma planta para abrir caminhos?')
    expect(c[1]).toContain('o Item X é indicado')
    expect(c[1]).not.toContain('*Ana:*')
    expect(c[1]).not.toContain('assistente virtual')
  })

  it('primeira mensagem da conversa fica com uma consulta só', () => {
    expect(consultasDoTurno([cliente('oi'), cliente('quanto custa?')])).toEqual(['oi quanto custa?'])
  })

  it('resposta que não chegou ao cliente não entra como assunto', () => {
    const c = consultasDoTurno([cliente('a'), agente('falhou aqui', 'falhou'), cliente('b')])
    expect(c).toEqual(['a b'])
  })

  it('sem texto novo não busca', () => {
    expect(consultasDoTurno([cliente('a'), agente('b')])).toEqual([])
  })
})

describe('buscarDoTurno', () => {
  const linha = (id: string) => ({ id, titulo: id, conteudo: id, tipo: 'fato', documento: null, caminho_titulos: null, pagina: null })
  const resposta = (data: unknown, error: unknown = null) => ({ abortSignal: () => Promise.resolve({ data, error }) })

  beforeEach(() => {
    rpc.mockReset()
    embedar.mockReset()
    embedar.mockResolvedValue({ vetor: [0.1], versao: 'v1' })
  })

  it('intercala as duas consultas, sem repetir, primeira na frente', async () => {
    rpc
      .mockReturnValueOnce(resposta([linha('a'), linha('b')]))
      .mockReturnValueOnce(resposta([linha('b'), linha('c')]))
    const r = await buscarDoTurno('w', ['q1', 'q2'], { conversaId: null, tipos: null, assistenteId: null })
    expect(r !== 'indisponivel' && r.map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('uma consulta falhando não derruba a outra', async () => {
    rpc.mockReturnValueOnce(resposta(null, { message: 'x' })).mockReturnValueOnce(resposta([linha('c')]))
    const r = await buscarDoTurno('w', ['q1', 'q2'], { conversaId: null, tipos: null, assistenteId: null })
    expect(r !== 'indisponivel' && r.map((x) => x.id)).toEqual(['c'])
  })

  it('todas falhando é indisponível; nenhuma consulta é lista vazia', async () => {
    rpc.mockReturnValue(resposta(null, { message: 'x' }))
    expect(await buscarDoTurno('w', ['q1', 'q2'], { conversaId: null, tipos: null, assistenteId: null })).toBe('indisponivel')
    expect(await buscarDoTurno('w', [], { conversaId: null, tipos: null, assistenteId: null })).toEqual([])
  })
})
