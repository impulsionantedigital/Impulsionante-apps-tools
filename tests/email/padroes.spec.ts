import { describe, it, expect } from 'vitest'
import { PADROES } from '@/lib/email/padroes'
import { TIPOS, CAMPOS } from '@/lib/email/tipos'

const CAMPO = /\[([A-Z][A-Z_]*)\]/g

describe('modelos padrão', () => {
  it('existe um padrão para cada tipo, e nenhum a mais', () => {
    expect(Object.keys(PADROES).sort()).toEqual([...TIPOS].sort())
  })

  it('todo padrão tem assunto e corpo não vazios', () => {
    for (const tipo of TIPOS) {
      expect(PADROES[tipo].assunto.trim().length).toBeGreaterThan(0)
      expect(PADROES[tipo].html.trim().length).toBeGreaterThan(0)
    }
  })

  it('nenhum padrão cita campo que o tipo dele não oferece', () => {
    for (const tipo of TIPOS) {
      const { assunto, html } = PADROES[tipo]
      const citados = [...`${assunto} ${html}`.matchAll(CAMPO)].map((m) => m[1])
      for (const campo of citados) expect(CAMPOS[tipo]).toContain(campo)
    }
  })

  it('os dois e-mails com senha temporária de facto a mostram', () => {
    expect(PADROES.boas_vindas.html).toContain('[TEMP_PASSWORD]')
    expect(PADROES.recuperacao_senha.html).toContain('[TEMP_PASSWORD]')
  })

  it('nenhum padrão vaza senha temporária para o assunto', () => {
    for (const tipo of TIPOS) expect(PADROES[tipo].assunto).not.toContain('[TEMP_PASSWORD]')
  })
})
