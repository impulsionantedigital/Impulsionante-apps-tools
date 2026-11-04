import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

vi.mock('@/server/supabase', () => ({ admin: vi.fn() }))
vi.mock('@/server/secrets', () => ({ getSecret: vi.fn(), setSecret: vi.fn(), deleteSecret: vi.fn() }))

import { rotasDoProvider } from '@/server/canais/conexao'

const FONTE = readFileSync(
  fileURLToPath(new URL('../../src/server/canais/conexao.ts', import.meta.url)),
  'utf8',
)

function corpoDe(nome: string): string {
  const inicio = FONTE.indexOf(`export async function ${nome}(`)
  expect(inicio).toBeGreaterThan(-1)
  const fim = FONTE.indexOf('\nexport ', inicio + 10)
  return FONTE.slice(inicio, fim === -1 ? undefined : fim)
}

describe('rotasDoProvider', () => {
  it('evolution usa as rotas da Evolution; o resto, as da uazapi', () => {
    expect(rotasDoProvider('evolution')).toBe('evolution')
    expect(rotasDoProvider('uazapi')).toBe('uazapi')
  })

  it.each(['reconectarCanal', 'registrarWebhookDoCanal', 'excluirCanal'])(
    '%s decide o ramo por rotasDoProvider antes de chamar o servidor',
    (nome) => {
      const corpo = corpoDe(nome)
      expect(corpo).toContain('rotasDoProvider(')
    },
  )

  it('criarCanalEvolution grava provider evolution e nunca chama /instance/init', () => {
    const corpo = corpoDe('criarCanalEvolution')
    expect(corpo).toContain("provider: SLUG_EVOLUTION")
    expect(corpo).not.toContain('/instance/init')
    expect(corpo).toContain('CHAVE_EVOLUTION_GLOBAL')
  })
})
