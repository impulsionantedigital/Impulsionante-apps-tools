import { describe, it, expect } from 'vitest'
import { lerConfigSmtp, avisoDeTls } from '@/lib/email/smtp'

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

  it('aceita 1, yes e on como verdadeiro, sem distinção de maiúsculas', () => {
    for (const valor of ['1', 'yes', 'on', 'TRUE', 'Yes', 'ON']) {
      const r = lerConfigSmtp({ ...COMPLETO, SMTP_PORT: '587', SMTP_SECURE: valor })
      if (!r.ok) throw new Error(`inesperado para "${valor}"`)
      expect(r.config.seguro).toBe(true)
    }
  })

  it('aceita 0, no e off como falso, sem distinção de maiúsculas', () => {
    for (const valor of ['0', 'no', 'off', 'FALSE', 'No', 'OFF']) {
      const r = lerConfigSmtp({ ...COMPLETO, SMTP_PORT: '465', SMTP_SECURE: valor })
      if (!r.ok) throw new Error(`inesperado para "${valor}"`)
      expect(r.config.seguro).toBe(false)
    }
  })

  it('recusa um SMTP_SECURE não reconhecido em vez de assumir falso em silêncio', () => {
    const r = lerConfigSmtp({ ...COMPLETO, SMTP_PORT: '465', SMTP_SECURE: 'talvez' })
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('inesperado')
    expect(r.faltando).toEqual(['SMTP_SECURE'])
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

// ── aviso de porta x SMTP_SECURE ────────────────────────────────────────────────────────────
//
// 🔴 Esta é a lacuna que escondeu o defeito real de 13/09/2026: `SMTP_SECURE=true` na porta 587.
// A configuração é VÁLIDA (`lerConfigSmtp` devolve `ok`), o CRM diz "SMTP configurado", e todo
// envio falha no handshake com "wrong version number" — que só aparece no `ultimo_erro` de cada
// linha da fila, onde ninguém olha. O aviso não recusa a configuração: só a denuncia na tela.
describe('avisoDeTls', () => {
  const base = { host: 'smtp.exemplo.com', usuario: 'u', senha: 'p', remetente: 'a@b.c' }

  it('denuncia TLS implícito na 587 — o caso que aconteceu de verdade', () => {
    const aviso = avisoDeTls({ ...base, porta: 587, seguro: true })
    expect(aviso).not.toBeNull()
    expect(aviso).toContain('587')
    expect(aviso).toContain('SMTP_SECURE')
  })

  it('denuncia texto claro na 465, que espera TLS desde o handshake', () => {
    const aviso = avisoDeTls({ ...base, porta: 465, seguro: false })
    expect(aviso).not.toBeNull()
    expect(aviso).toContain('465')
  })

  it('denuncia TLS implícito na 25', () => {
    expect(avisoDeTls({ ...base, porta: 25, seguro: true })).not.toBeNull()
  })

  it('cala nas combinações corretas', () => {
    expect(avisoDeTls({ ...base, porta: 587, seguro: false })).toBeNull()
    expect(avisoDeTls({ ...base, porta: 465, seguro: true })).toBeNull()
    expect(avisoDeTls({ ...base, porta: 25, seguro: false })).toBeNull()
    expect(avisoDeTls({ ...base, porta: 2525, seguro: false })).toBeNull()
  })

  it('cala numa porta que não é convenção conhecida, nos dois modos', () => {
    // Não inventar regra para porta fora de convenção: avisar ali seria ruído, e ruído
    // treina o dono do servidor a ignorar o aviso justamente quando ele importa.
    expect(avisoDeTls({ ...base, porta: 2465, seguro: true })).toBeNull()
    expect(avisoDeTls({ ...base, porta: 2465, seguro: false })).toBeNull()
  })

  it('o aviso diz o que fazer, não só que está errado', () => {
    const aviso = avisoDeTls({ ...base, porta: 587, seguro: true }) ?? ''
    expect(aviso.toLowerCase()).toMatch(/false|vazi|em branco/)
  })
})
