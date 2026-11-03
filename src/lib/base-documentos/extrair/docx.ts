import mammoth from 'mammoth'
import { parse, type HTMLElement, NodeType, type Node } from 'node-html-parser'
import type { Secao } from '../tipos'
import { ErroDeExtracao } from './erro'

const ERRO_WORD = 'Não consegui ler este arquivo Word. Confira se ele abre normalmente no computador.'

const ehElemento = (n: Node): n is HTMLElement => n.nodeType === NodeType.ELEMENT_NODE
const limpar = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Texto do item de lista sem as sublistas (cada sublista tem os próprios `li`). */
function textoDoItem(li: HTMLElement): string {
  return limpar(
    li.childNodes
      .filter((n) => !(ehElemento(n) && (n.tagName === 'UL' || n.tagName === 'OL')))
      .map((n) => n.text)
      .join(' '),
  )
}

function textoDoBloco(el: HTMLElement): string {
  switch (el.tagName) {
    case 'UL':
    case 'OL':
      return el
        .querySelectorAll('li')
        .map(textoDoItem)
        .filter(Boolean)
        .map((t) => `- ${t}`)
        .join('\n')
    case 'TABLE':
      return el
        .querySelectorAll('tr')
        .map((tr) =>
          tr.childNodes
            .filter((n): n is HTMLElement => ehElemento(n) && (n.tagName === 'TD' || n.tagName === 'TH'))
            .map((c) => limpar(c.text))
            .join(' | '),
        )
        .filter((linha) => linha.replace(/[|\s]/g, ''))
        .join('\n')
    default:
      return limpar(el.text)
  }
}

export async function extrairDocx(dados: Uint8Array): Promise<Secao[]> {
  let html: string
  try {
    html = (await mammoth.convertToHtml({ buffer: Buffer.from(dados) })).value
  } catch {
    throw new ErroDeExtracao(ERRO_WORD)
  }

  const secoes: Secao[] = []
  const pilha: Array<{ nivel: number; titulo: string }> = []
  let paragrafos: string[] = []
  const fechar = () => {
    const texto = paragrafos.join('\n\n').trim()
    paragrafos = []
    if (texto) secoes.push({ caminho: pilha.map((p) => p.titulo), texto })
  }

  for (const no of parse(html).childNodes) {
    if (!ehElemento(no)) {
      const t = limpar(no.text)
      if (t) paragrafos.push(t)
      continue
    }
    const titulo = /^H([1-6])$/.exec(no.tagName)
    if (titulo) {
      fechar()
      const nivel = Number(titulo[1])
      while (pilha.length && pilha[pilha.length - 1].nivel >= nivel) pilha.pop()
      const texto = limpar(no.text)
      if (texto) pilha.push({ nivel, titulo: texto })
      continue
    }
    const texto = textoDoBloco(no)
    if (texto) paragrafos.push(texto)
  }
  fechar()
  return secoes
}
