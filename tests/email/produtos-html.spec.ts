import { describe, it, expect } from 'vitest'
import { listarProdutosHtml, listarProdutosTexto } from '@/lib/email/produtos-html'
import { renderizarHtml, renderizarTexto } from '@/lib/email/merge'

describe('listarProdutosHtml', () => {
  it('um produto vira uma lista de um item', () => {
    expect(listarProdutosHtml(['Calculadora 2025'])).toBe('<ul><li>Calculadora 2025</li></ul>')
  })

  it('dois produtos viram dois itens', () => {
    expect(listarProdutosHtml(['Curso A', 'Curso B'])).toBe('<ul><li>Curso A</li><li>Curso B</li></ul>')
  })

  it('lista vazia é string vazia — não desenha uma <ul> sem item', () => {
    expect(listarProdutosHtml([])).toBe('')
  })

  it('🔴 ESCAPA cada nome: um nome com marcação não vira marcação no e-mail', () => {
    // O nome do produto é dado do dono do CRM. Se passasse cru, isto injetaria um script no e-mail
    // do comprador — e o campo é a exceção ao escape do `renderizarHtml`, então a defesa é AQUI.
    expect(listarProdutosHtml(['<script>alert(1)</script>']))
      .toBe('<ul><li>&lt;script&gt;alert(1)&lt;/script&gt;</li></ul>')
  })

  it('🔴 escapa nome a nome, e não a lista montada', () => {
    // Escapar DEPOIS de montar destruiria as próprias tags e o comprador leria "&lt;ul&gt;".
    const r = listarProdutosHtml(['A & B', 'C < D'])
    expect(r).toBe('<ul><li>A &amp; B</li><li>C &lt; D</li></ul>')
    expect(r.startsWith('<ul><li>')).toBe(true)
  })

  it('as aspas também são escapadas (nome com aspas não quebra o HTML)', () => {
    expect(listarProdutosHtml(['Curso "Execução"'])).toBe('<ul><li>Curso &quot;Execução&quot;</li></ul>')
  })
})

describe('listarProdutosTexto', () => {
  it('devolve a mesma lista separada por vírgula, SEM marcação', () => {
    expect(listarProdutosTexto(['Curso A', 'Curso B'])).toBe('Curso A, Curso B')
  })

  it('lista vazia é string vazia', () => {
    expect(listarProdutosTexto([])).toBe('')
  })
})

describe('PRODUCTS_LIST no renderizador', () => {
  it('🔴 no HTML sai como marcação de verdade', () => {
    const saida = renderizarHtml('<p>[PRODUCTS_LIST]</p>', { PRODUCTS_LIST: '<ul><li>Curso A</li></ul>' })
    expect(saida).toBe('<p><ul><li>Curso A</li></ul></p>')
  })

  it('🔴 no TEXTO sai sem marcação, e não é a mesma coisa que o HTML', () => {
    // O assunto do e-mail usa `renderizarTexto`; uma `<ul>` ali apareceria como texto literal.
    const saida = renderizarTexto('[PRODUCTS_LIST]', { PRODUCTS_LIST: 'Curso A, Curso B' })
    expect(saida).toBe('Curso A, Curso B')
  })

  it('os OUTROS campos continuam escapados — a exceção é só este', () => {
    // Guarda da garantia central do e-mail: abrir a exceção não afrouxou o resto.
    const saida = renderizarHtml('[MEMBER_NAME] [PRODUCTS_LIST]', {
      MEMBER_NAME: '<script>alert(1)</script>',
      PRODUCTS_LIST: '<ul><li>ok</li></ul>',
    })
    expect(saida).toBe('&lt;script&gt;alert(1)&lt;/script&gt; <ul><li>ok</li></ul>')
  })
})
