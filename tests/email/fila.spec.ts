import { describe, it, expect } from 'vitest'
import { renderizarParaFila } from '@/server/email/fila'
import type { Modelo } from '@/lib/email/padroes'

// enfileirar() não pode depender de configuração de SMTP: o remetente só é relido dentro de
// drenarEmail, na hora do envio. Este teste fixa que a renderização do que vai para a fila
// (assunto + html) é uma função pura de modelo + valores — sem tocar em configAtual, sem
// precisar de SMTP configurado, e sem precisar mockar a cadeia do cliente Supabase (não há
// precedente disso no repositório; ver relatório da Task 8, ronda de correção).
describe('renderizarParaFila', () => {
  const MODELO: Modelo = {
    assunto: 'Olá [MEMBER_NAME]',
    html: '<p>Bem-vindo, [MEMBER_NAME]</p><p>Seu e-mail: [MEMBER_EMAIL]</p>',
  }

  it('renderiza assunto e html a partir dos valores, sem SMTP nenhum envolvido', () => {
    const resultado = renderizarParaFila(MODELO, {
      MEMBER_NAME: 'Ana',
      MEMBER_EMAIL: 'ana@exemplo.com',
    })

    expect(resultado).toEqual({
      assunto: 'Olá Ana',
      html: '<p>Bem-vindo, Ana</p><p>Seu e-mail: ana@exemplo.com</p>',
    })
  })

  it('escapa HTML dentro do valor substituído, no html, mas não no assunto', () => {
    const resultado = renderizarParaFila(MODELO, {
      MEMBER_NAME: '<script>alert(1)</script>',
      MEMBER_EMAIL: 'ana@exemplo.com',
    })

    expect(resultado.html).toContain('&lt;script&gt;')
    expect(resultado.html).not.toContain('<script>')
    expect(resultado.assunto).toBe('Olá <script>alert(1)</script>')
  })

  it('deixa os placeholders sem valor correspondente intactos', () => {
    const resultado = renderizarParaFila(MODELO, { MEMBER_NAME: 'Ana' })
    expect(resultado.html).toContain('[MEMBER_EMAIL]')
  })
})
