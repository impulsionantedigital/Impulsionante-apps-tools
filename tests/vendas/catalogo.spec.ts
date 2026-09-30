import { describe, it, expect } from 'vitest'
import { PRODUTOS, ehProdutoInterno, rotuloDoProduto } from '@/lib/produtos/catalogo'
import { REGISTRO } from '@/lib/indulto-comutacao/registro'

describe('catálogo de produtos', () => {
  it('todo produto de indulto-comutacao é um motor do REGISTRO, e todo motor é vendável', () => {
    const produtosIndulto = PRODUTOS.filter((p) => p.familia === 'indulto-comutacao').map((p) => p.id).sort()
    expect(produtosIndulto).toEqual(REGISTRO.map((m) => m.id).sort())
  })

  it('fixa o id do produto de 2025', () => {
    expect(PRODUTOS.map((p) => p.id)).toContain('indulto-comutacao-2025')
  })

  it('não repete id', () => {
    expect(new Set(PRODUTOS.map((p) => p.id)).size).toBe(PRODUTOS.length)
  })

  it('reconhece só ids do catálogo — e um UUID de produto externo é FALSE', () => {
    expect(ehProdutoInterno('indulto-comutacao-2025')).toBe(true)
    expect(ehProdutoInterno('indulto-comutacao-2024')).toBe(true)
    expect(ehProdutoInterno('indulto-comutacao-1988')).toBe(false)
    expect(ehProdutoInterno(42)).toBe(false)
    // 🔴 O teste que fixa a separação dos dois significados: id de produto EXTERNO é válido, e
    // mesmo assim `ehProdutoInterno` tem de dizer false — o CRM não entrega esse produto.
    expect(ehProdutoInterno('8c4d2f1e-4b2a-4f6e-9d3c-1a2b3c4d5e6f')).toBe(false)
  })

  it('🔴 o nome do produto é o menuTitulo, e não o rotulo por extenso', () => {
    // Decisão de 2026-09-30: e-mails e a tela de ofertas mostram o nome CURTO, o mesmo que a pessoa
    // já vê no menu e na vitrine. O `rotulo` continua no catálogo, com o texto que sempre teve.
    expect(rotuloDoProduto('indulto-comutacao-2025')).toBe('GPS CIC - Calculadora 2025')
    expect(rotuloDoProduto('indulto-comutacao-2025')).not.toContain('12.970/2025')
    expect(rotuloDoProduto('indulto-comutacao-2024')).toBe('GPS CIC - Calculadora 2024')
    expect(rotuloDoProduto('detracao-recolhimento-noturno')).toBe('Recolhimento Noturno')
  })

  it('o rótulo por extenso continua no catálogo, intacto', () => {
    // Nada foi apagado do catálogo: o texto longo ainda está lá, para quem precisar dele.
    const p = PRODUTOS.find((x) => x.id === 'indulto-comutacao-2025')!
    expect(p.rotulo).toBe('Calculadora de Indulto e Comutação — Decreto 12.970/2025')
  })
})
