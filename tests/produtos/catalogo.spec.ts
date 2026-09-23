import { describe, it, expect } from 'vitest'
import {
  PRODUTOS,
  caminhoDoProduto,
  ehProdutoInterno,
  produtoPorSlug,
  slugDoMotor,
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

  it('todo produto de indulto-comutacao tem motor no registro', () => {
    const idsMotor = REGISTRO.map((m) => m.id)
    for (const p of PRODUTOS.filter((p) => p.familia === 'indulto-comutacao')) {
      expect(idsMotor, `produto ${p.id} sem motor`).toContain(p.id)
    }
  })

  it('todo motor do registro tem produto no catálogo', () => {
    for (const m of REGISTRO) {
      expect(ehProdutoInterno(m.id), `motor ${m.id} sem produto`).toBe(true)
    }
  })

  it('monta o caminho de produto de detração com o prefixo da família', () => {
    expect(caminhoDoProduto('recolhimento-noturno')).toBe('/ferramentas/detracao/recolhimento-noturno')
  })

  it('não muda o caminho de produtos de indulto-comutacao já publicados', () => {
    expect(caminhoDoProduto('cic-2025')).toBe('/ferramentas/cic-2025')
    expect(caminhoDoProduto('cic-2024')).toBe('/ferramentas/cic-2024')
  })
})
