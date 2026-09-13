import { describe, it, expect } from 'vitest'
import { lerConfigSmtp } from '@/lib/email/smtp'

const COMPLETO = {
  SMTP_HOST: 'smtp.exemplo.com',
  SMTP_PORT: '587',
  SMTP_USER: 'apikey',
  SMTP_PASS: 'segredo',
  SMTP_FROM: 'GPS da Pena <nao-responda@exemplo.com>',
}

describe('lerConfigSmtp', () => {
  it('lê a configuração completa', () => {
    const r = lerConfigSmtp(COMPLETO)
    expect(r).toEqual({
      ok: true,
      config: {
        host: 'smtp.exemplo.com',
        porta: 587,
        seguro: false,
        usuario: 'apikey',
        senha: 'segredo',
        remetente: 'GPS da Pena <nao-responda@exemplo.com>',
      },
    })
  })

  it('nomeia TODAS as variáveis que faltam, não só a primeira', () => {
    const r = lerConfigSmtp({ SMTP_HOST: 'h' })
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('inesperado')
    expect(r.faltando).toEqual(['SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'])
  })

  it('trata variável só com espaços como ausente', () => {
    const r = lerConfigSmtp({ ...COMPLETO, SMTP_HOST: '   ' })
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('inesperado')
    expect(r.faltando).toEqual(['SMTP_HOST'])
  })

  it('recusa porta não numérica', () => {
    const r = lerConfigSmtp({ ...COMPLETO, SMTP_PORT: 'quinhentos' })
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('inesperado')
    expect(r.faltando).toEqual(['SMTP_PORT'])
  })

  it('recusa porta fora da faixa', () => {
    for (const porta of ['0', '65536', '-1', '587.5']) {
      expect(lerConfigSmtp({ ...COMPLETO, SMTP_PORT: porta }).ok).toBe(false)
    }
  })

  it('deduz seguro=true na 465 quando SMTP_SECURE não foi dito', () => {
    const r = lerConfigSmtp({ ...COMPLETO, SMTP_PORT: '465' })
    if (!r.ok) throw new Error('inesperado')
    expect(r.config.seguro).toBe(true)
  })

  it('deixa SMTP_SECURE explícito vencer a dedução, nos dois sentidos', () => {
    const a = lerConfigSmtp({ ...COMPLETO, SMTP_PORT: '465', SMTP_SECURE: 'false' })
    const b = lerConfigSmtp({ ...COMPLETO, SMTP_PORT: '587', SMTP_SECURE: 'true' })
    if (!a.ok || !b.ok) throw new Error('inesperado')
    expect(a.config.seguro).toBe(false)
    expect(b.config.seguro).toBe(true)
  })

  it('apara espaços em volta dos valores', () => {
    const r = lerConfigSmtp({
      SMTP_HOST: '  smtp.exemplo.com  ',
      SMTP_PORT: '  587  ',
      SMTP_USER: '  apikey  ',
      SMTP_PASS: '  segredo  ',
      SMTP_FROM: '  GPS da Pena <nao-responda@exemplo.com>  ',
    })
    if (!r.ok) throw new Error('inesperado')
    expect(r.config).toEqual({
      host: 'smtp.exemplo.com',
      porta: 587,
      seguro: false,
      usuario: 'apikey',
      senha: 'segredo',
      remetente: 'GPS da Pena <nao-responda@exemplo.com>',
    })
  })

  it('aceita as fronteiras válidas da porta (1 e 65535)', () => {
    const r1 = lerConfigSmtp({ ...COMPLETO, SMTP_PORT: '1' })
    const r65535 = lerConfigSmtp({ ...COMPLETO, SMTP_PORT: '65535' })
    if (!r1.ok || !r65535.ok) throw new Error('inesperado')
    expect(r1.config.porta).toBe(1)
    expect(r65535.config.porta).toBe(65535)
  })
})
