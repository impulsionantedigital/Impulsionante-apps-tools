import { describe, it, expect } from 'vitest'
import { valoresDeTeste } from '@/lib/email/valores-teste'

describe('valoresDeTeste', () => {
  it('marca cada campo do modelo com «CAMPO»', () => {
    const v = valoresDeTeste('entrega_produto', 'pessoa@exemplo.com')
    expect(v.PRODUCT_NAME).toBe('«PRODUCT_NAME»')
    expect(v.OFFER_NAME).toBe('«OFFER_NAME»')
    expect(v.EXPIRES_AT).toBe('«EXPIRES_AT»')
    expect(v.TOOL_URL).toBe('«TOOL_URL»')
  })

  it('substitui MEMBER_EMAIL pelo e-mail de quem pediu o teste', () => {
    const v = valoresDeTeste('boas_vindas', 'pessoa@exemplo.com')
    expect(v.MEMBER_EMAIL).toBe('pessoa@exemplo.com')
  })

  it('substitui MEMBER_NAME por "Teste", mesmo quando o campo existe no modelo', () => {
    const v = valoresDeTeste('boas_vindas', 'pessoa@exemplo.com')
    expect(v.MEMBER_NAME).toBe('Teste')
  })

  it('não inclui campos de outros modelos', () => {
    const v = valoresDeTeste('recuperacao_senha', 'pessoa@exemplo.com')
    expect(v).not.toHaveProperty('PRODUCT_NAME')
    expect(v).not.toHaveProperty('OFFER_NAME')
  })

  it('cobre os quatro tipos sem lançar', () => {
    for (const tipo of ['boas_vindas', 'recuperacao_senha', 'entrega_produto', 'pagamento_recebido'] as const) {
      expect(() => valoresDeTeste(tipo, 'pessoa@exemplo.com')).not.toThrow()
    }
  })
})
