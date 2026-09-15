import { describe, it, expect } from 'vitest'
import {
  PRODUTOS,
  caminhoDoProduto,
  produtoPorSlug,
  slugDoMotor,
  produtoDoMotor,
} from '@/lib/produtos/catalogo'
import { REGISTRO } from '@/lib/indulto-comutacao/registro'

describe('catálogo de produtos', () => {
  it('não repete slug', () => {
    const slugs = PRODUTOS.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('usa slug em forma de segmento de URL', () => {
    for (const p of PRODUTOS) {
      expect(p.slug, p.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it('monta o caminho a partir do slug', () => {
    expect(caminhoDoProduto('cic-2025')).toBe('/ferramentas/cic-2025')
  })

  it('resolve slug para produto, e devolve null para o resto', () => {
    expect(produtoPorSlug('cic-2025')?.id).toBe('indulto-comutacao-2025')
    expect(produtoPorSlug('nao-existe')).toBeNull()
    expect(produtoPorSlug('')).toBeNull()
  })

  it('resolve motor para slug, e devolve null para o resto', () => {
    expect(slugDoMotor('indulto-comutacao-2025')).toBe('cic-2025')
    expect(slugDoMotor('indulto-comutacao-1988')).toBeNull()
  })

  it('todo produto do catálogo tem motor no registro', () => {
    const idsMotor = REGISTRO.map((m) => m.id)
    for (const p of PRODUTOS) {
      expect(idsMotor, `produto ${p.id} sem motor`).toContain(p.id)
    }
  })

  // 🔴 `it.fails` é TEMPORÁRIO, só entre a Task 11 e a Task 14. O motor de 2024 entra
  // no REGISTRO antes de virar produto, de propósito: assim ele é validado contra a
  // planilha sem que a rota /ferramentas/cic-2024 responda a ninguém. A Task 14
  // acrescenta o produto e devolve este teste para `it`.
  it.fails('todo motor do registro tem produto no catálogo (volta a `it` na Task 14)', () => {
    for (const m of REGISTRO) {
      expect(produtoDoMotor(m.id), `motor ${m.id} sem produto`).toBe(m.id)
    }
  })
})
