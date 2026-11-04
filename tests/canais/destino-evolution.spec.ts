import { describe, it, expect, vi } from 'vitest'

vi.mock('@/server/supabase', () => ({ admin: vi.fn() }))
vi.mock('@/server/secrets', () => ({ getSecret: vi.fn(), setSecret: vi.fn(), deleteSecret: vi.fn() }))

import { destinoDe } from '@/server/canais/envio'

describe('destinoDe', () => {
  it('uazapi e os outros continuam cortando no @', () => {
    expect(destinoDe('5511999990000@s.whatsapp.net')).toBe('5511999990000')
    expect(destinoDe('5511999990000@s.whatsapp.net', 'uazapi')).toBe('5511999990000')
  })

  it('evolution recebe o JID inteiro (grupo e @lid precisam do sufixo)', () => {
    expect(destinoDe('123456@lid', 'evolution')).toBe('123456@lid')
    expect(destinoDe('1203630@g.us', 'evolution')).toBe('1203630@g.us')
    expect(destinoDe('5511999990000@s.whatsapp.net', 'evolution')).toBe('5511999990000@s.whatsapp.net')
  })
})
