import { describe, expect, it } from 'vitest'
import { cortarEmTrechos, MAXIMO_TRECHO, SOBREPOSICAO_TRECHO } from '@/lib/base-documentos/cortar'

describe('cortarEmTrechos', () => {
  it('verbete curto vira um trecho só, com o caminho', () => {
    const t = cortarEmTrechos([{ caminho: ['Ervas', 'Arruda'], texto: 'Erva quente de Ogum.' }])
    expect(t).toEqual([{ caminho: ['Ervas', 'Arruda'], pagina: null, secao: 0, posicao: 0, texto: 'Erva quente de Ogum.' }])
  })
  it('não junta verbetes vizinhos', () => {
    const t = cortarEmTrechos([{ caminho: ['A'], texto: 'um.' }, { caminho: ['B'], texto: 'dois.' }])
    expect(t.map((x) => [x.secao, x.posicao])).toEqual([[0, 0], [1, 1]])
  })
  it('seção longa é recortada em fim de parágrafo, todos herdam o caminho', () => {
    const par = 'Frase de teste. '.repeat(50).trim()
    const t = cortarEmTrechos([{ caminho: ['Xangô', 'Oferendas'], texto: [par, par, par, par].join('\n\n') }])
    expect(t.length).toBeGreaterThan(1)
    for (const x of t) {
      expect(x.caminho).toEqual(['Xangô', 'Oferendas'])
      expect(x.texto.length).toBeLessThanOrEqual(MAXIMO_TRECHO + SOBREPOSICAO_TRECHO)
    }
    expect(new Set(t.map((x) => x.secao))).toEqual(new Set([0]))
  })
  it('o segundo pedaço repete o fim do primeiro (sobreposição)', () => {
    const par = 'Frase de teste. '.repeat(50).trim()
    const t = cortarEmTrechos([{ caminho: [], texto: [par, par, par, par].join('\n\n') }])
    expect(t.length).toBeGreaterThan(1)
    const primeiraFrase = t[1].texto.split(/(?<=[.!?…])\s+/)[0]
    expect(primeiraFrase.length).toBeGreaterThan(0)
    expect(t[0].texto.endsWith(primeiraFrase)).toBe(true)
  })
  it('transcrição sem parágrafo nem título é partida em frases', () => {
    const t = cortarEmTrechos([{ caminho: [], texto: 'Hoje falamos de prazo. '.repeat(300) }])
    expect(t.length).toBeGreaterThan(1)
    expect(t.every((x) => /[.!?…]$/.test(x.texto.trim()))).toBe(true)
  })
  it('frase gigante é partida no último espaço, respeitando o limite', () => {
    const t = cortarEmTrechos([{ caminho: [], texto: 'palavra '.repeat(1000).trim() }])
    expect(t.length).toBeGreaterThan(1)
    for (const x of t) expect(x.texto.length).toBeLessThanOrEqual(MAXIMO_TRECHO + SOBREPOSICAO_TRECHO)
  })
  it('texto enorme sem espaço nem pontuação é cortado em tempo linear', () => {
    const texto = 'x'.repeat(2_000_000)
    const ini = performance.now()
    const t = cortarEmTrechos([{ caminho: [], texto }])
    expect(performance.now() - ini).toBeLessThan(200)
    for (const x of t) expect(x.texto.length).toBeLessThanOrEqual(MAXIMO_TRECHO + SOBREPOSICAO_TRECHO)
    expect(t.map((x) => x.texto).join('')).toBe(texto)
  })
  it('registros (csv) agrupam sem sobreposição e sem partir registro', () => {
    const regs = Array.from({ length: 30 }, (_, i) => `nome: item ${i}; uso: banho`)
    const t = cortarEmTrechos([{ caminho: [], texto: regs.join('\n\n'), registros: true }])
    expect(t.flatMap((x) => x.texto.split('\n\n'))).toEqual(regs)
  })
  it('pagina é a do início do pedaço', () => {
    const texto = 'a. '.repeat(500) + '\n\n' + 'b. '.repeat(500)
    const t = cortarEmTrechos([{ caminho: [], texto, paginas: [{ offset: 0, pagina: 1 }, { offset: 1502, pagina: 2 }] }])
    expect(t[0].pagina).toBe(1)
    expect(t.at(-1)!.pagina).toBe(2)
  })
  it('seção vazia não gera trecho', () => {
    expect(cortarEmTrechos([{ caminho: ['Só título'], texto: '  \n ' }])).toEqual([])
  })
})
