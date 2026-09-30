import { describe, it, expect } from 'vitest'
import { INTERVALO_ENTRE_EMAILS_MS, instanteDoEmail } from '@/lib/email/espacamento'

/**
 * O espaçamento entre os e-mails de um MESMO evento.
 *
 * 🔴 Fixado a partir do defeito real de 2026-09-23: uma compra com brinde enfileirava três e-mails
 * no mesmo segundo, do mesmo remetente, e o Gmail mandou os últimos para o SPAM — inclusive o do
 * brinde. Estes testes existem para que ninguém "simplifique" o espaçamento de volta.
 */
describe('intervalo entre os e-mails de um evento', () => {
  const T0 = 1_700_000_000_000

  it('o primeiro e-mail sai na hora — o atraso é para desfazer a rajada, não para atrasar tudo', () => {
    expect(instanteDoEmail(0, T0).getTime()).toBe(T0)
  })

  it('cada e-mail seguinte sai um intervalo depois do anterior', () => {
    expect(instanteDoEmail(1, T0).getTime()).toBe(T0 + INTERVALO_ENTRE_EMAILS_MS)
    expect(instanteDoEmail(2, T0).getTime()).toBe(T0 + 2 * INTERVALO_ENTRE_EMAILS_MS)
  })

  it('🔴 três e-mails do mesmo evento caem em três instantes DIFERENTES', () => {
    // É o defeito exato: os três no mesmo segundo viravam um só, do ponto de vista do provedor.
    const instantes = [0, 1, 2].map((i) => instanteDoEmail(i, T0).getTime())
    expect(new Set(instantes).size).toBe(3)
    expect(instantes[1] - instantes[0]).toBeGreaterThanOrEqual(60_000)
  })

  it('índice negativo não inventa passado — trata como o primeiro', () => {
    expect(instanteDoEmail(-5, T0).getTime()).toBe(T0)
  })

  it('o intervalo é folgado o bastante para o provedor não ler rajada', () => {
    // Um minuto é o piso prático; abaixo disso o Gmail volta a agrupar. O valor é decisão de
    // produto, e o teste o trava para que uma "otimização" não o encolha sem querer.
    expect(INTERVALO_ENTRE_EMAILS_MS).toBeGreaterThanOrEqual(60_000)
  })
})
