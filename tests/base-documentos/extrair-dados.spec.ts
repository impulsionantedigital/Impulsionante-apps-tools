import { describe, expect, it } from 'vitest'
import { extrairCsv, extrairJson } from '@/lib/base-documentos/extrair/dados'
import { ErroDeExtracao } from '@/lib/base-documentos/extrair/erro'

describe('extrairJson', () => {
  it('lista de objetos usa o campo nome no caminho', () => {
    const s = extrairJson(JSON.stringify({ ervas: [{ nome: 'Arruda', orixas: ['Ogum', 'Oxóssi'], temperatura: 'quente' }] }))
    expect(s).toEqual([{ caminho: ['ervas', 'Arruda'], texto: 'nome: Arruda\norixas: Ogum, Oxóssi\ntemperatura: quente' }])
  })
  it('inválido dá erro com motivo', () => {
    expect(() => extrairJson('{x')).toThrow(ErroDeExtracao)
    expect(() => extrairJson('{x')).toThrow('O arquivo JSON não é válido')
  })
  it('lista sem título usa #n e objetos aninhados descem', () => {
    const s = extrairJson(JSON.stringify({ a: { b: [{ x: 1 }, { x: 2 }] } }))
    expect(s).toEqual([
      { caminho: ['a', 'b', '#1'], texto: 'x: 1' },
      { caminho: ['a', 'b', '#2'], texto: 'x: 2' },
    ])
  })
  it('array no topo e primitivos soltos', () => {
    expect(extrairJson('[{"title":"T","k":"v"}]')).toEqual([{ caminho: ['T'], texto: 'title: T\nk: v' }])
    expect(extrairJson('"oi"')).toEqual([{ caminho: [], texto: 'oi' }])
  })
})

describe('extrairCsv', () => {
  it('ponto e vírgula vira registros', () => {
    const [s] = extrairCsv('nome;orixa;uso\nArruda;Ogum;banho\nAlfazema;;defumação\n')
    expect(s.registros).toBe(true)
    expect(s.texto).toBe('nome: Arruda; orixa: Ogum; uso: banho\n\nnome: Alfazema; uso: defumação')
  })
})
