import { describe, expect, it } from 'vitest'
import { decodificarTexto, extrairMarkdown, extrairTextoSimples } from '@/lib/base-documentos/extrair/texto'
import { conferirConteudo, extrairSecoes } from '@/lib/base-documentos/extrair'
import { ErroDeExtracao } from '@/lib/base-documentos/extrair/erro'

describe('decodificarTexto', () => {
  it('lê UTF-8 com BOM', () =>
    expect(decodificarTexto(new Uint8Array([0xef, 0xbb, 0xbf, 0x63, 0x61, 0xc3, 0xa7, 0xc3, 0xa3]))).toBe('caçã'))
  it('lê Windows-1252', () =>
    expect(decodificarTexto(new Uint8Array([0x4f, 0x78, 0x75, 0x6d, 0x20, 0xe9, 0x20, 0xe1, 0x67, 0x75, 0x61]))).toBe('Oxum é água'))
})

describe('extrairMarkdown', () => {
  it('caminho segue os títulos', () => {
    const s = extrairMarkdown('# Ervas\n## Arruda\nQuente. Ogum.\n## Alecrim\nMorna.')
    expect(s.filter((x) => x.texto.trim())).toEqual([
      { caminho: ['Ervas', 'Arruda'], texto: 'Quente. Ogum.' },
      { caminho: ['Ervas', 'Alecrim'], texto: 'Morna.' },
    ])
  })
  it('# dentro de bloco de código não é título', () =>
    expect(extrairMarkdown('# A\n```\n# não\n```').map((x) => x.caminho)).not.toContainEqual(['não']))
  it('front matter é descartado', () =>
    expect(extrairMarkdown('---\ntitle: x\n---\n# A\ntexto').map((x) => x.texto).join('')).not.toContain('title: x'))
  it('texto antes do primeiro título tem caminho vazio e CRLF é normalizado', () => {
    expect(extrairMarkdown('intro\r\n# A\r\nb')).toEqual([
      { caminho: [], texto: 'intro' },
      { caminho: ['A'], texto: 'b' },
    ])
  })
  it('título de nível menor volta a pilha', () => {
    const s = extrairMarkdown('# A\n## B\nx\n# C\ny').filter((x) => x.texto)
    expect(s.map((x) => x.caminho)).toEqual([['A', 'B'], ['C']])
  })
})

describe('extrairTextoSimples', () => {
  it('uma seção só', () => expect(extrairTextoSimples('a\nb')).toEqual([{ caminho: [], texto: 'a\nb' }]))
})

describe('conferirConteudo / extrairSecoes', () => {
  it('pdf que não começa com %PDF- é recusado', () =>
    expect(() => conferirConteudo('pdf', new TextEncoder().encode('oi'))).toThrow('não parece um arquivo .pdf'))
  it('docx precisa de PK', () =>
    expect(() => conferirConteudo('docx', new TextEncoder().encode('oi'))).toThrow(ErroDeExtracao))
  it('texto com byte 0 é recusado', () =>
    expect(() => conferirConteudo('txt', new Uint8Array([0x61, 0x00]))).toThrow('não parece um arquivo .txt'))
  it('extrairSecoes despacha txt', async () =>
    expect(await extrairSecoes('txt', new TextEncoder().encode('oi'))).toEqual([{ caminho: [], texto: 'oi' }]))
})

describe('extrairMarkdown: títulos', () => {
  it('fechamento com # é removido e #hash não é título', () => {
    expect(extrairMarkdown('## T ##\nx')[0].caminho).toEqual(['T'])
    expect(extrairMarkdown('# C#\nx')[0].caminho).toEqual(['C#'])
    expect(extrairMarkdown('#hash')).toEqual([{ caminho: [], texto: '#hash' }])
  })
  it.each([
    ['repetição de " #"', '# ' + 'a #'.repeat(50_000) + 'x'],
    ['espaços/tabs e #', '# ' + ' \t#'.repeat(33_000) + 'x'],
  ])('linha patológica (%s) é rápida', (_n, linha) => {
    const t0 = performance.now()
    extrairMarkdown(linha)
    expect(performance.now() - t0).toBeLessThan(200)
  })
})
