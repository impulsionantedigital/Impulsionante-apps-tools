import { describe, it, expect } from 'vitest'
import { criarOrcamento, PIORES_CASOS, PORTOES } from '@/lib/orcamento-tick'

describe('braço de e-mail no orçamento do tick', () => {
  it('declara o pior caso do braço de e-mail', () => {
    expect(PIORES_CASOS.email).toBeGreaterThan(0)
    expect(PIORES_CASOS.email).toBe(8_000)
  })

  it('declara o portão do braço de e-mail', () => {
    expect(PORTOES.email).toBeGreaterThan(0)
  })

  it('cabe no início do tick', () => {
    const o = criarOrcamento(1000, () => 1000)
    expect(o.cabe('email')).toBe(true)
  })

  it('não cabe quando o tick está no fim', () => {
    const o = criarOrcamento(1000, () => 1000 + 44_000)
    expect(o.cabe('email')).toBe(false)
  })
})
