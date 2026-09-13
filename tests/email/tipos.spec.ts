import { describe, it, expect } from 'vitest'
import { TIPOS, CAMPOS, ehTipoConhecido, type TipoModelo } from '@/lib/email/tipos'

describe('catálogo de tipos de modelo', () => {
  it('tem exatamente os quatro tipos do spec', () => {
    expect([...TIPOS]).toEqual([
      'boas_vindas', 'recuperacao_senha', 'entrega_produto', 'pagamento_recebido',
    ])
  })

  it('define campos para todos os tipos, sem tipo órfão nos dois sentidos', () => {
    expect(Object.keys(CAMPOS).sort()).toEqual([...TIPOS].sort())
  })

  it('nomeia todo campo em CAIXA_ALTA com sublinhado', () => {
    for (const tipo of TIPOS) {
      for (const campo of CAMPOS[tipo]) expect(campo).toMatch(/^[A-Z][A-Z_]*$/)
    }
  })

  it('não repete campo dentro do mesmo tipo', () => {
    for (const tipo of TIPOS) {
      expect(new Set(CAMPOS[tipo]).size).toBe(CAMPOS[tipo].length)
    }
  })

  it('oferece MEMBER_NAME e LOGIN_URL em todos os tipos', () => {
    for (const tipo of TIPOS) {
      expect(CAMPOS[tipo]).toContain('MEMBER_NAME')
      expect(CAMPOS[tipo]).toContain('LOGIN_URL')
    }
  })

  it('só o e-mail de boas-vindas e o de recuperação levam a senha temporária', () => {
    const comSenha = TIPOS.filter((t) => CAMPOS[t].includes('TEMP_PASSWORD'))
    expect(comSenha).toEqual(['boas_vindas', 'recuperacao_senha'])
  })

  it('fixa a lista COMPLETA de campos para cada tipo, na ordem exata', () => {
    expect([...CAMPOS['boas_vindas']]).toEqual([
      'MEMBER_NAME', 'MEMBER_EMAIL', 'TEMP_PASSWORD', 'LOGIN_URL',
    ])
    expect([...CAMPOS['recuperacao_senha']]).toEqual([
      'MEMBER_NAME', 'TEMP_PASSWORD', 'LOGIN_URL',
    ])
    expect([...CAMPOS['entrega_produto']]).toEqual([
      'MEMBER_NAME', 'PRODUCT_NAME', 'OFFER_NAME', 'EXPIRES_AT', 'TOOL_URL', 'LOGIN_URL',
    ])
    expect([...CAMPOS['pagamento_recebido']]).toEqual([
      'MEMBER_NAME', 'OFFER_NAME', 'PRODUCT_NAME', 'EXPIRES_AT', 'VALUE', 'TRANSACTION', 'LOGIN_URL',
    ])
  })

  it('reconhece tipo conhecido e recusa desconhecido', () => {
    expect(ehTipoConhecido('boas_vindas')).toBe(true)
    expect(ehTipoConhecido('cobranca')).toBe(false)
    expect(ehTipoConhecido('')).toBe(false)
  })
})
