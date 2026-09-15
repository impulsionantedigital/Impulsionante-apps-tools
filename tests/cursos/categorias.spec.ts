import { describe, it, expect } from 'vitest'
import { CATEGORIAS_CURSO, ehCategoriaConhecida, rotuloDaCategoria } from '@/lib/cursos/categorias'

describe('categorias de curso', () => {
  it('conhece exatamente curso e formação', () => {
    expect(CATEGORIAS_CURSO.map((c) => c.id)).toEqual(['curso', 'formacao'])
  })

  it('reconhece só categorias do registro', () => {
    expect(ehCategoriaConhecida('curso')).toBe(true)
    expect(ehCategoriaConhecida('formacao')).toBe(true)
    expect(ehCategoriaConhecida('workshop')).toBe(false)
    expect(ehCategoriaConhecida(null)).toBe(false)
    expect(ehCategoriaConhecida(42)).toBe(false)
  })

  it('não repete id', () => {
    expect(new Set(CATEGORIAS_CURSO.map((c) => c.id)).size).toBe(CATEGORIAS_CURSO.length)
  })

  it('traduz para o rótulo', () => {
    expect(rotuloDaCategoria('curso')).toBe('Curso')
    expect(rotuloDaCategoria('formacao')).toBe('Formação')
  })
})
