import type { Secao } from '../tipos'

/** Decodifica bytes de texto: tira o BOM; UTF-8 estrito, senão Windows-1252. */
export function decodificarTexto(dados: Uint8Array): string {
  let bytes = dados
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) bytes = bytes.subarray(3)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

export function extrairTextoSimples(texto: string): Secao[] {
  return [{ caminho: [], texto: texto.replace(/\r\n?/g, '\n').trim() }]
}

/** Tira espaços e a sequência de `#` de fechamento (só quando precedida de espaço/tab). */
function limparTitulo(bruto: string): string {
  let fim = bruto.trimEnd()
  let i = fim.length
  while (i > 0 && fim[i - 1] === '#') i--
  if (i < fim.length && (i === 0 || fim[i - 1] === ' ' || fim[i - 1] === '\t')) fim = fim.slice(0, i).trimEnd()
  return fim.trim()
}

export function extrairMarkdown(entrada: string): Secao[] {
  let texto = entrada.replace(/\r\n?/g, '\n')
  if (texto.startsWith('﻿')) texto = texto.slice(1)
  texto = texto.replace(/^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/, '')

  const secoes: Secao[] = []
  const pilha: Array<{ nivel: number; titulo: string }> = []
  let linhas: string[] = []
  let cerca: string | null = null

  const fechar = () => {
    const corpo = linhas.join('\n').trim()
    const caminho = pilha.map((p) => p.titulo)
    linhas = []
    if (!corpo && caminho.length === 0) return
    secoes.push({ caminho, texto: corpo })
  }

  for (const linha of texto.split('\n')) {
    const abre = /^ {0,3}(`{3,}|~{3,})/.exec(linha)
    if (cerca) {
      if (abre && abre[1][0] === cerca[0] && abre[1].length >= cerca.length && linha.trim() === abre[1]) cerca = null
      linhas.push(linha)
      continue
    }
    if (abre) {
      cerca = abre[1]
      linhas.push(linha)
      continue
    }
    const t = /^ {0,3}(#{1,6})[ \t]+(.*)$/.exec(linha)
    if (t) {
      fechar()
      const nivel = t[1].length
      while (pilha.length && pilha[pilha.length - 1].nivel >= nivel) pilha.pop()
      pilha.push({ nivel, titulo: limparTitulo(t[2]) })
      continue
    }
    linhas.push(linha)
  }
  fechar()
  return secoes
}
