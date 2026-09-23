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

  it('traduz motor para produto e devolve o rótulo', () => {
    expect(rotuloDoProduto('indulto-comutacao-2025')).toContain('12.970/2025')
  })
})
