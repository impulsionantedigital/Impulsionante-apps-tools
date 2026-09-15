// Prova que a listagem restringe por DECRETO, além de por workspace.
//
// Sem isto, a tela de 2024 mostraria cálculos de 2025 misturados — cada cartão
// abrindo num motor diferente, sob o cabeçalho errado.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const filtros: Array<[string, unknown]> = []

const consulta = {
  select: vi.fn(() => consulta),
  eq: vi.fn((coluna: string, valor: unknown) => {
    filtros.push([coluna, valor])
    return consulta
  }),
  order: vi.fn(() => Promise.resolve({ data: [], error: null })),
}

vi.mock('server-only', () => ({}))
vi.mock('@/server/supabase-session', () => ({
  criarClienteServidor: async () => ({ from: () => consulta }),
}))
vi.mock('@/server/auth/workspace-ativo', () => ({
  resolverWorkspaceAtivo: async () => 'ws-1',
}))

const { listarCalculos } = await import('@/app/(app)/ferramentas/cic-2025/calculos')

describe('listarCalculos', () => {
  beforeEach(() => {
    filtros.length = 0
  })

  it('filtra por workspace ativo E por decreto', async () => {
    await listarCalculos('indulto-comutacao-2024')
    expect(filtros).toEqual([
      ['workspace_id', 'ws-1'],
      ['decreto_id', 'indulto-comutacao-2024'],
    ])
  })
})
