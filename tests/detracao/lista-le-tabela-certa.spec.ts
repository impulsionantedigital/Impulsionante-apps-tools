// Prova que a LISTAGEM de detração lê a tabela de detração — e não a do CIC.
//
// 🔴 O defeito que este teste tranca (corrigido em 2026-09-16): `page.tsx` importava
// `listarCalculos` de `../../[calculadora]/calculos` (o módulo do CIC), que lê
// `indulto_comutacao_calculos` e filtra por `decreto_id`. O cálculo de recolhimento noturno
// SALVAVA com sucesso em `detracao_calculos` e dava "ok" — mas a lista lia a tabela errada e
// nunca mostrava nada, como se o cálculo tivesse sumido.
//
// Nenhum teste de unidade pegava isso: as funções `listarCalculos` dos dois módulos passavam
// cada uma no seu próprio teste. O que faltava era fixar QUAL delas a página importa — que é
// exatamente o que este teste faz, pela tabela que a consulta usa.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const tabelasConsultadas: string[] = []
const filtros: Array<[string, unknown]> = []

const consulta = {
  select: vi.fn(() => consulta),
  eq: vi.fn((coluna: string, valor: unknown) => {
    filtros.push([coluna, valor])
    return consulta
  }),
  order: vi.fn(() => Promise.resolve({ data: [], error: null })),
}

function clienteFalso() {
  return {
    from: (tabela: string) => {
      tabelasConsultadas.push(tabela)
      return consulta
    },
  }
}

vi.mock('server-only', () => ({}))
vi.mock('@/server/supabase-session', () => ({
  criarClienteServidor: async () => clienteFalso(),
}))
vi.mock('@/server/auth/workspace-ativo', () => ({
  resolverWorkspaceAtivo: async () => 'ws-1',
}))

// O módulo de listagem que a PÁGINA usa. Importá-lo aqui é o que prova qual foi escolhido:
// se a página voltar a apontar para o CIC, este import continua válido (o arquivo existe),
// então o que realmente trava o contrato é a asserção sobre a TABELA abaixo.
const { listarCalculos } = await import('@/app/(app)/ferramentas/detracao/[calculadora]/calculos')

describe('listagem de detração', () => {
  beforeEach(() => {
    tabelasConsultadas.length = 0
    filtros.length = 0
  })

  it('lê a tabela detracao_calculos — NUNCA a do CIC', async () => {
    await listarCalculos('recolhimento-noturno')
    expect(tabelasConsultadas).toEqual(['detracao_calculos'])
    expect(tabelasConsultadas).not.toContain('indulto_comutacao_calculos')
  })

  it('filtra por workspace ativo E por calculo_tipo (não por decreto_id)', async () => {
    await listarCalculos('recolhimento-noturno')
    expect(filtros).toEqual([
      ['workspace_id', 'ws-1'],
      ['calculo_tipo', 'recolhimento-noturno'],
    ])
  })
})

// O texto-fonte da página é a prova direta de qual módulo ela importa: um segundo guarda,
// independente do comportamento em runtime, que falha junto com a causa (o import).
describe('page.tsx da listagem de detração', () => {
  it('importa listarCalculos do módulo LOCAL, não do CIC', async () => {
    const fs = await import('node:fs/promises')
    const { fileURLToPath } = await import('node:url')
    const path = fileURLToPath(
      new URL(
        '../../src/app/(app)/ferramentas/detracao/[calculadora]/page.tsx',
        import.meta.url,
      ),
    )
    const fonte = await fs.readFile(path, 'utf8')
    expect(fonte).toContain("from './calculos'")
    expect(fonte).not.toContain('[calculadora]/calculos')
  })
})

describe('BotaoExcluirCalculo da detração', () => {
  it('importa excluirCalculo do módulo LOCAL, não do CIC', async () => {
    const fs = await import('node:fs/promises')
    const { fileURLToPath } = await import('node:url')
    const path = fileURLToPath(
      new URL(
        '../../src/app/(app)/ferramentas/detracao/[calculadora]/BotaoExcluirCalculo.tsx',
        import.meta.url,
      ),
    )
    const fonte = await fs.readFile(path, 'utf8')
    expect(fonte).toContain("from './acoes'")
    expect(fonte).not.toContain('[calculadora]/acoes')
  })
})
