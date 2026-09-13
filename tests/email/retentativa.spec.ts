import { describe, it, expect } from 'vitest'
import { backoff, deveDesistir, MAX_TENTATIVAS, IDADE_MAX_MS } from '@/lib/retentativa'
import { backoff as backoffDoNucleo } from '@/server/webhook/nucleo'

const MIN = 60_000

describe('backoff', () => {
  it('sobe pela escada de 1, 5, 15, 30, 60, 120, 360 e 720 minutos', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(backoff))
      .toEqual([1, 5, 15, 30, 60, 120, 360, 720].map((m) => m * MIN))
  })

  it('satura no último degrau em vez de estourar o índice', () => {
    expect(backoff(8)).toBe(720 * MIN)
    expect(backoff(999)).toBe(720 * MIN)
  })

  it('trata tentativa negativa como zero', () => {
    expect(backoff(-3)).toBe(1 * MIN)
  })

  it('é a MESMA função que o outbox de webhook usa', () => {
    expect(backoffDoNucleo).toBe(backoff)
  })
})

describe('deveDesistir', () => {
  const agora = 1_800_000_000_000

  it('não desiste antes do teto de tentativas nem do teto de idade', () => {
    expect(deveDesistir(0, agora, agora)).toBe(false)
    expect(deveDesistir(MAX_TENTATIVAS - 1, agora - 1000, agora)).toBe(false)
  })

  it('desiste ao atingir o teto de tentativas', () => {
    expect(deveDesistir(MAX_TENTATIVAS, agora, agora)).toBe(true)
  })

  it('desiste quando a linha passa da idade máxima, mesmo com poucas tentativas', () => {
    expect(deveDesistir(1, agora - IDADE_MAX_MS - 1, agora)).toBe(true)
  })

  it('não desiste exatamente na idade máxima — a fronteira é exclusiva', () => {
    expect(deveDesistir(1, agora - IDADE_MAX_MS, agora)).toBe(false)
  })
})
