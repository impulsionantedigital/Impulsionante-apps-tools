import { describe, expect, it } from 'vitest'
import { extrairDocx } from '@/lib/base-documentos/extrair/docx'
import { extrairPdf } from '@/lib/base-documentos/extrair/pdf'
import { ErroDeExtracao, extrairSecoes } from '@/lib/base-documentos/extrair'
import { docxMinimo, pdfMinimo, zipSemDocumento } from './fixtures'

describe('extrairDocx', () => {
  it('docx: estilos de título viram caminho e tabela vira texto tabular', async () => {
    const s = await extrairDocx(docxMinimo([{ estilo: 'Heading1', texto: 'Ogum' }, { texto: 'Senhor dos caminhos.' }, { tabela: [['Comida','Bebida'],['feijoada','cerveja']] }]))
    expect(s.find((x) => x.texto.includes('feijoada'))).toMatchObject({ caminho: ['Ogum'] })
    expect(s.map((x) => x.texto).join('\n')).toContain('feijoada | cerveja')
  })

  it('títulos aninhados empilham e o mesmo nível substitui', async () => {
    const s = await extrairDocx(
      docxMinimo([
        { texto: 'Antes de tudo.' },
        { estilo: 'Heading1', texto: 'A' },
        { estilo: 'Heading2', texto: 'B' },
        { texto: 'em B' },
        { estilo: 'Heading2', texto: 'C' },
        { texto: 'em C' },
        { estilo: 'Heading1', texto: 'D' },
        { texto: 'em D' },
      ]),
    )
    expect(s).toEqual([
      { caminho: [], texto: 'Antes de tudo.' },
      { caminho: ['A', 'B'], texto: 'em B' },
      { caminho: ['A', 'C'], texto: 'em C' },
      { caminho: ['D'], texto: 'em D' },
    ])
  })

  it('tabela tem uma linha por tr', async () => {
    const s = await extrairDocx(docxMinimo([{ tabela: [['a', 'b'], ['c', 'd']] }]))
    expect(s).toEqual([{ caminho: [], texto: 'a | b\nc | d' }])
  })

  it('zip sem documento Word dá erro em português', async () => {
    const p = extrairDocx(zipSemDocumento())
    await expect(p).rejects.toBeInstanceOf(ErroDeExtracao)
    await expect(extrairDocx(zipSemDocumento())).rejects.toThrow('Não consegui ler este arquivo Word')
  })

  it('bytes que não são zip dão erro em português', async () => {
    await expect(extrairDocx(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).rejects.toThrow(ErroDeExtracao)
  })
})

describe('extrairPdf', () => {
  it('pdf: guarda a página e não corta frase na quebra', async () => {
    const s = await extrairPdf(pdfMinimo(['Ogum gosta de', 'feijoada com cerveja. ' + 'x '.repeat(250)]))
    expect(s[0].texto).toContain('Ogum gosta de feijoada')
    expect(s[0].paginas?.map((p) => p.pagina)).toEqual([1, 2])
  })

  it('fim de frase separa páginas com linha em branco e registra o offset', async () => {
    const s = await extrairPdf(pdfMinimo(['Primeira página termina aqui.', 'Segunda. ' + 'y '.repeat(250)]))
    expect(s).toHaveLength(1)
    expect(s[0].caminho).toEqual([])
    expect(s[0].texto.startsWith('Primeira página termina aqui.\n\nSegunda.')).toBe(true)
    const p2 = s[0].paginas![1]
    expect(p2.pagina).toBe(2)
    expect(s[0].texto.slice(p2.offset).startsWith('Segunda.')).toBe(true)
    expect(s[0].paginas![0]).toEqual({ offset: 0, pagina: 1 })
  })

  it('pdf: contorno vira caminho', async () => {
    const s = await extrairPdf(pdfMinimo(['Intro '.repeat(60), 'Ogum '.repeat(60)], { contorno: [{ titulo: 'Introdução', pagina: 1 }, { titulo: 'Ogum', pagina: 2 }] }))
    expect(s.map((x) => x.caminho)).toEqual([['Introdução'], ['Ogum']])
  })

  it('contorno aninhado, capa antes do primeiro item e offsets relativos à seção', async () => {
    const s = await extrairPdf(
      pdfMinimo(['Capa', 'a '.repeat(80), 'b '.repeat(80), 'c '.repeat(80)], {
        contorno: [{ titulo: 'Parte 1', pagina: 2, filhos: [{ titulo: 'Capítulo 2', pagina: 3 }] }],
      }),
    )
    expect(s.map((x) => x.caminho)).toEqual([[], ['Parte 1'], ['Parte 1', 'Capítulo 2']])
    expect(s[0]).toMatchObject({ texto: 'Capa', paginas: [{ offset: 0, pagina: 1 }] })
    expect(s[1].paginas).toEqual([{ offset: 0, pagina: 2 }])
    expect(s[2].paginas?.map((p) => p.pagina)).toEqual([3, 4])
    expect(s[2].paginas![0].offset).toBe(0)
    expect(s[2].texto.slice(s[2].paginas![1].offset).startsWith('c')).toBe(true)
  })

  it('item de contorno sem destino é pulado; se nenhum resolve, uma seção só', async () => {
    const parcial = await extrairPdf(
      pdfMinimo(['a '.repeat(120), 'b '.repeat(120)], {
        contorno: [{ titulo: 'Fantasma', pagina: 99 }, { titulo: 'B', pagina: 2 }],
      }),
    )
    expect(parcial.map((x) => x.caminho)).toEqual([[], ['B']])
    const nenhum = await extrairPdf(pdfMinimo(['a '.repeat(120), 'b '.repeat(120)], { contorno: [{ titulo: 'Fantasma', pagina: 99 }] }))
    expect(nenhum.map((x) => x.caminho)).toEqual([[]])
    expect(nenhum[0].paginas?.map((p) => p.pagina)).toEqual([1, 2])
  })

  it('pdf só com imagem dá erro claro', async () => {
    await expect(extrairPdf(pdfMinimo(['', '']))).rejects.toThrow('não tem texto selecionável')
  })

  it('falha de extração passa pelo finally e só rejeita com ErroDeExtracao', async () => {
    const soltas: unknown[] = []
    const ouvir = (e: unknown) => soltas.push(e)
    process.on('unhandledRejection', ouvir)
    try {
      const erro = await extrairPdf(pdfMinimo(['', ''])).catch((e: unknown) => e)
      expect(erro).toBeInstanceOf(ErroDeExtracao)
      await new Promise((r) => setTimeout(r, 20))
      expect(soltas).toEqual([])
    } finally {
      process.off('unhandledRejection', ouvir)
    }
  })

  it('pouco texto também dá o erro', async () => {
    await expect(extrairPdf(pdfMinimo(['curto demais']))).rejects.toThrow(ErroDeExtracao)
  })
})

describe('extrairSecoes despacha docx e pdf', () => {
  it('docx', async () => {
    const s = await extrairSecoes('docx', docxMinimo([{ texto: 'olá' }]))
    expect(s).toEqual([{ caminho: [], texto: 'olá' }])
  })
  it('pdf', async () => {
    const s = await extrairSecoes('pdf', pdfMinimo(['z '.repeat(250)]))
    expect(s[0].paginas).toEqual([{ offset: 0, pagina: 1 }])
  })
})
