import { describe, it, expect } from 'vitest'
import { PRODUTOS, ehProdutoConhecido, produtoDoMotor, rotuloDoProduto } from '@/lib/produtos/catalogo'
import { REGISTRO } from '@/lib/indulto-comutacao/registro'

describe('catálogo de produtos', () => {
  it('todo produto é um motor do REGISTRO, e todo motor é vendável', () => {
    expect(PRODUTOS.map((p) => p.id).sort()).toEqual(REGISTRO.map((m) => m.id).sort())
  })

  it('fixa o id do produto de 2025', () => {
    expect(PRODUTOS.map((p) => p.id)).toContain('indulto-comutacao-2025')
  })

  it('não repete id', () => {
    expect(new Set(PRODUTOS.map((p) => p.id)).size).toBe(PRODUTOS.length)
  })

  it('reconhece só ids do catálogo', () => {
    expect(ehProdutoConhecido('indulto-comutacao-2025')).toBe(true)
    expect(ehProdutoConhecido('indulto-comutacao-2024')).toBe(false)
    expect(ehProdutoConhecido(42)).toBe(false)
  })

  it('traduz motor para produto e devolve o rótulo', () => {
    expect(produtoDoMotor('indulto-comutacao-2025')).toBe('indulto-comutacao-2025')
    expect(produtoDoMotor('inexistente')).toBeNull()
    expect(rotuloDoProduto('indulto-comutacao-2025')).toContain('12.970/2025')
  })
})
