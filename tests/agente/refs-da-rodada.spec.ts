import { describe, expect, it } from 'vitest'
import { criarRefs } from '@/lib/canais/refs-da-rodada'

describe('refs da rodada', () => {
  it('refs: mesmo id, mesma ref; ref desconhecida é null', () => {
    const r = criarRefs()
    expect(r.ref('a')).toBe('r1')
    expect(r.ref('b')).toBe('r2')
    expect(r.ref('a')).toBe('r1')
    expect(r.id('r2')).toBe('b')
    expect(r.id('r9')).toBeNull()
  })

  it('cada rodada começa do r1', () => {
    criarRefs().ref('a')
    expect(criarRefs().ref('z')).toBe('r1')
  })

  it('aceita a ref com espaço ou maiúscula', () => {
    const r = criarRefs()
    r.ref('a')
    expect(r.id(' R1 ')).toBe('a')
  })
})
