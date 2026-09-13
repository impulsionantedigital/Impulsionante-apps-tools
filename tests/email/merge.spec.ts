import { describe, it, expect } from 'vitest'
import { escaparHtml, renderizarHtml, renderizarTexto } from '@/lib/email/merge'

describe('escaparHtml', () => {
  it('escapa os cinco caracteres perigosos', () => {
    expect(escaparHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })

  it('escapa o & uma vez só, sem duplo escape', () => {
    expect(escaparHtml('Bar & Cia')).toBe('Bar &amp; Cia')
    expect(escaparHtml('&lt;')).toBe('&amp;lt;')
  })

  it('deixa texto comum intacto', () => {
    expect(escaparHtml('Alexandre Pavon')).toBe('Alexandre Pavon')
  })
})

describe('renderizarHtml', () => {
  it('substitui campo conhecido', () => {
    expect(renderizarHtml('Olá [MEMBER_NAME]!', { MEMBER_NAME: 'Ana' })).toBe('Olá Ana!')
  })

  it('substitui todas as ocorrências do mesmo campo', () => {
    expect(renderizarHtml('[A] e [A]', { A: 'x' })).toBe('x e x')
  })

  it('deixa literal o campo sem valor', () => {
    expect(renderizarHtml('Olá [MEMBER_NAME]!', {})).toBe('Olá [MEMBER_NAME]!')
  })

  it('aceita valor vazio como substituição legítima', () => {
    expect(renderizarHtml('[A]!', { A: '' })).toBe('!')
  })

  it('ESCAPA o valor — marcação vinda do comprador não vira marcação', () => {
    expect(renderizarHtml('<p>[MEMBER_NAME]</p>', { MEMBER_NAME: '<script>alert(1)</script>' }))
      .toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
  })

  it('NÃO escapa o modelo — o HTML que o dono escreve continua HTML', () => {
    expect(renderizarHtml('<b>Olá</b> [A]', { A: 'x' })).toBe('<b>Olá</b> x')
  })

  it('ignora colchetes que não são campo', () => {
    expect(renderizarHtml('[nao-campo] [A1] [ ]', { A: 'x' })).toBe('[nao-campo] [A1] [ ]')
  })
})

describe('renderizarTexto', () => {
  it('substitui SEM escapar, porque assunto não é HTML', () => {
    expect(renderizarTexto('Compra de [OFFER_NAME]', { OFFER_NAME: 'Bar & Cia' }))
      .toBe('Compra de Bar & Cia')
  })

  it('deixa literal o campo sem valor', () => {
    expect(renderizarTexto('[X]', {})).toBe('[X]')
  })
})
