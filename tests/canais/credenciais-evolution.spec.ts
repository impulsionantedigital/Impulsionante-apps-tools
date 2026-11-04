import { describe, it, expect, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getSecret: vi.fn(async () => 'chave-da-instancia') }))
vi.mock('@/server/secrets', () => ({
  getSecret: mocks.getSecret,
  setSecret: vi.fn(),
  deleteSecret: vi.fn(),
}))

import { credenciaisEvolution, segredosDe, SLUGS } from '@/server/canais/types'
import { lerCredenciais, CHAVE_EVOLUTION_GLOBAL } from '@/server/canais/segredos'
import { origemDoCanal } from '@/server/canais/origem-do-canal'

describe('credenciais da Evolution', () => {
  it('o slug evolution existe', () => {
    expect(SLUGS).toContain('evolution')
    expect(CHAVE_EVOLUTION_GLOBAL).toBe('evolution_global_key')
    expect(origemDoCanal('evolution')).toBe('whatsapp')
  })

  it('credenciaisEvolution monta creds válidas', () => {
    const c = credenciaisEvolution({
      serverUrl: 'https://evo.exemplo.com',
      instancia: 'loja',
      apiKey: 'chave-da-instancia',
    })
    expect(c && c.tipo).toBe('evolution')
    expect(segredosDe(c!)).toEqual(['chave-da-instancia', 'https://evo.exemplo.com'])
  })

  it('recusa chave curta ou instância vazia', () => {
    expect(
      credenciaisEvolution({ serverUrl: 'https://evo.exemplo.com', instancia: 'loja', apiKey: 'curta' }),
    ).toBeNull()
    expect(
      credenciaisEvolution({
        serverUrl: 'https://evo.exemplo.com',
        instancia: ' ',
        apiKey: 'chave-da-instancia',
      }),
    ).toBeNull()
  })

  it('lerCredenciais de evolution sem external_id dá sem_config', async () => {
    expect(
      await lerCredenciais({
        id: 'c1',
        provider: 'evolution',
        serverUrl: 'https://evo.exemplo.com',
        externalId: null,
      }),
    ).toEqual({ creds: null, motivo: 'sem_config' })
  })

  it('lerCredenciais de evolution completo devolve creds', async () => {
    const r = await lerCredenciais({
      id: 'c1',
      provider: 'evolution',
      serverUrl: 'https://evo.exemplo.com',
      externalId: 'loja',
    })
    expect(r.creds && (r.creds as unknown as { instancia: string }).instancia).toBe('loja')
    expect(r.creds && (r.creds as unknown as { apiKey: string }).apiKey).toBe('chave-da-instancia')
  })
})
