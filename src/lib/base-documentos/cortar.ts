// Corta as seções extraídas de um documento em trechos prontos para virar linhas pesquisáveis.
// Função pura: roda dentro do worker de extração, sem acesso a banco nem rede.

import type { Secao, Trecho } from './tipos'

export const ALVO_TRECHO = 1200
export const MAXIMO_TRECHO = 2000
export const SOBREPOSICAO_TRECHO = 200

type Faixa = { inicio: number; fim: number }

const FIM_DE_FRASE = /(?<=[.!?…])\s+/g
const FIM_DE_PARAGRAFO = /\n\s*\n/g

/** Parte `texto[inicio, fim)` nos separadores e devolve as faixas não vazias, sem espaço nas pontas. */
function dividir(texto: string, inicio: number, fim: number, separador: RegExp): Faixa[] {
  const faixas: Faixa[] = []
  const trecho = texto.slice(inicio, fim)
  let corte = 0
  const empurra = (de: number, ate: number) => {
    const bruto = trecho.slice(de, ate)
    const esq = bruto.length - bruto.trimStart().length
    const limpo = bruto.trim()
    if (limpo) faixas.push({ inicio: inicio + de + esq, fim: inicio + de + esq + limpo.length })
  }
  for (const m of trecho.matchAll(new RegExp(separador.source, 'g'))) {
    empurra(corte, m.index)
    corte = m.index + m[0].length
  }
  empurra(corte, trecho.length)
  return faixas
}

/** Parte uma faixa maior que o máximo no último espaço antes do limite (ou no limite, sem espaço). */
function partirNoEspaco(texto: string, faixa: Faixa): Faixa[] {
  const saida: Faixa[] = []
  let inicio = faixa.inicio
  while (faixa.fim - inicio > MAXIMO_TRECHO) {
    let corte = texto.lastIndexOf(' ', inicio + MAXIMO_TRECHO)
    if (corte <= inicio) corte = inicio + MAXIMO_TRECHO
    saida.push({ inicio, fim: corte })
    inicio = corte
    while (inicio < faixa.fim && /\s/.test(texto[inicio])) inicio++
  }
  if (inicio < faixa.fim) saida.push({ inicio, fim: faixa.fim })
  return saida
}

/** Unidades indivisíveis da seção: parágrafos; o que passa do máximo vira frases; frase grande vira pedaços. */
function unidades(texto: string): Faixa[] {
  const saida: Faixa[] = []
  for (const par of dividir(texto, 0, texto.length, FIM_DE_PARAGRAFO)) {
    if (par.fim - par.inicio <= MAXIMO_TRECHO) {
      saida.push(par)
      continue
    }
    for (const frase of dividir(texto, par.inicio, par.fim, FIM_DE_FRASE)) {
      if (frase.fim - frase.inicio <= MAXIMO_TRECHO) saida.push(frase)
      else saida.push(...partirNoEspaco(texto, frase))
    }
  }
  return saida
}

/** O fim do pedaço anterior, a partir de um início de frase, com no máximo SOBREPOSICAO_TRECHO caracteres. */
function sobreposicao(anterior: string): string {
  const cauda = anterior.slice(-SOBREPOSICAO_TRECHO)
  if (cauda.length === anterior.length) return ''
  const m = new RegExp(FIM_DE_FRASE.source).exec(cauda)
  return m ? cauda.slice(m.index + m[0].length) : ''
}

function paginaEm(secao: Secao, offset: number): number | null {
  let pagina: number | null = null
  let melhor = -1
  for (const p of secao.paginas ?? []) {
    if (p.offset <= offset && p.offset > melhor) {
      melhor = p.offset
      pagina = p.pagina
    }
  }
  return pagina
}

export function cortarEmTrechos(secoes: Secao[]): Trecho[] {
  const trechos: Trecho[] = []
  secoes.forEach((secao, indice) => {
    const texto = secao.texto
    if (!texto.trim()) return
    const empurra = (conteudo: string, inicio: number) => {
      trechos.push({
        caminho: secao.caminho,
        pagina: paginaEm(secao, inicio),
        secao: indice,
        posicao: trechos.length,
        texto: conteudo.trim(),
      })
    }

    if (texto.length <= MAXIMO_TRECHO) {
      empurra(texto, texto.length - texto.trimStart().length)
      return
    }

    // Agrupa unidades contíguas até o alvo; o texto do grupo é a fatia do original (separadores intactos).
    const grupos: Faixa[] = []
    let atual: Faixa | null = null
    for (const u of unidades(texto)) {
      if (atual && u.fim - atual.inicio <= ALVO_TRECHO) atual.fim = u.fim
      else {
        if (atual) grupos.push(atual)
        atual = { ...u }
      }
    }
    if (atual) grupos.push(atual)

    let anterior = ''
    for (const g of grupos) {
      const proprio = texto.slice(g.inicio, g.fim)
      const prefixo = secao.registros || !anterior ? '' : sobreposicao(anterior)
      empurra(prefixo ? `${prefixo} ${proprio}` : proprio, g.inicio)
      anterior = proprio
    }
  })
  return trechos
}
