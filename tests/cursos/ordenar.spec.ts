import { describe, it, expect } from 'vitest'
import { reordenarLista } from '@/lib/cursos/ordenar'

describe('reordenarLista', () => {
  it('move um item para o meio', () => {
    expect(reordenarLista(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('move um item para o início', () => {
    expect(reordenarLista(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('move um item para o fim', () => {
    expect(reordenarLista(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
  })

  it('índice fora do alcance não quebra e devolve a lista original', () => {
    expect(reordenarLista(['a', 'b'], -1, 1)).toEqual(['a', 'b'])
    expect(reordenarLista(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
  })

  it('lista vazia não quebra', () => {
    expect(reordenarLista([], 0, 0)).toEqual([])
  })

  it('não modifica a lista recebida (imutável)', () => {
    const original = ['a', 'b', 'c']
    reordenarLista(original, 0, 2)
    expect(original).toEqual(['a', 'b', 'c'])
  })
})
