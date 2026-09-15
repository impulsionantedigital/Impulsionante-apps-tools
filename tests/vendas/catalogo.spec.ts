import { describe, it, expect } from 'vitest'
import { PRODUTOS, ehProdutoConhecido, produtoDoMotor, rotuloDoProduto } from '@/lib/produtos/catalogo'
import { REGISTRO } from '@/lib/indulto-comutacao/registro'

describe('catálogo de produtos', () => {
  // 🔴 `it.fails` é TEMPORÁRIO, só entre a Task 11 e a Task 14 da calculadora de 2024
  // (docs/superpowers/plans/2026-09-14-calculadora-cic-2024.md). O motor
  // `indulto-comutacao-2024` entra no REGISTRO antes de virar produto, de propósito:
  // assim ele é validado contra a planilha sem que a rota /ferramentas/cic-2024
  // responda a ninguém. A Task 14 acrescenta o produto e devolve este teste para `it`.
  it.fails('todo produto é um motor do REGISTRO, e todo motor é vendável', () => {
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
