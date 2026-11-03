import { getDocumentProxy } from 'unpdf'
import type { Secao } from '../tipos'
import { ErroDeExtracao } from './erro'

type Documento = Awaited<ReturnType<typeof getDocumentProxy>>
type ItemContorno = { title: string; dest: unknown; items?: ItemContorno[] }
/** Um item do contorno já resolvido: o caminho dele e o índice (0-based) da página onde começa. */
type Marco = { caminho: string[]; indice: number }

const MINIMO_NAO_BRANCOS = 200
const SEM_TEXTO = 'O arquivo não tem texto selecionável (parece ser só imagem). Envie uma versão com texto.'
const FIM_DE_FRASE = /[.!?…:]$/

async function textoDaPagina(pdf: Documento, numero: number): Promise<string> {
  const pagina = await pdf.getPage(numero)
  const conteudo = await pagina.getTextContent()
  let texto = ''
  for (const item of conteudo.items) {
    if (!('str' in item)) continue
    texto += item.str + (item.hasEOL ? '\n' : ' ')
  }
  return texto
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function paginaDoDestino(pdf: Documento, dest: unknown): Promise<number | null> {
  try {
    const explicito = typeof dest === 'string' ? await pdf.getDestination(dest) : dest
    if (!Array.isArray(explicito) || explicito.length === 0) return null
    const alvo = explicito[0]
    if (Number.isInteger(alvo)) return alvo as number
    if (alvo && typeof alvo === 'object') return await pdf.getPageIndex(alvo as Parameters<Documento['getPageIndex']>[0])
    return null
  } catch {
    return null
  }
}

async function marcosDoContorno(pdf: Documento): Promise<Marco[]> {
  let contorno: ItemContorno[] | null
  try {
    contorno = (await pdf.getOutline()) as ItemContorno[] | null
  } catch {
    return []
  }
  const marcos: Marco[] = []
  const percorrer = async (itens: ItemContorno[], pais: string[]) => {
    for (const item of itens) {
      const titulo = (item.title ?? '').replace(/\s+/g, ' ').trim()
      const caminho = titulo ? [...pais, titulo] : pais
      const indice = await paginaDoDestino(pdf, item.dest)
      if (indice !== null && indice >= 0 && indice < pdf.numPages) marcos.push({ caminho, indice })
      if (item.items?.length) await percorrer(item.items, caminho)
    }
  }
  await percorrer(contorno ?? [], [])
  // Ordem estável por página: o contorno costuma vir em ordem, mas não é garantido.
  return marcos.map((m, i) => ({ m, i })).sort((a, b) => a.m.indice - b.m.indice || a.i - b.i).map(({ m }) => m)
}

/** Junta páginas numa seção: `' '` se a anterior não fecha frase, senão linha em branco. */
function montarSecao(caminho: string[], paginas: Array<{ pagina: number; texto: string }>): Secao | null {
  let texto = ''
  const marcas: Array<{ offset: number; pagina: number }> = []
  for (const p of paginas) {
    if (!p.texto) continue
    if (texto) texto += FIM_DE_FRASE.test(texto) ? '\n\n' : ' '
    marcas.push({ offset: texto.length, pagina: p.pagina })
    texto += p.texto
  }
  return texto ? { caminho, texto, paginas: marcas } : null
}

export async function extrairPdf(dados: Uint8Array): Promise<Secao[]> {
  let pdf: Documento | null = null
  try {
    try {
      // Cópia: o pdfjs pode transferir (e esvaziar) o buffer que recebe.
      pdf = await getDocumentProxy(new Uint8Array(dados))
    } catch {
      throw new ErroDeExtracao('Não consegui abrir este PDF. Confira se ele abre normalmente no computador.')
    }

    const textos: Array<{ pagina: number; texto: string }> = []
    for (let n = 1; n <= pdf.numPages; n++) textos.push({ pagina: n, texto: await textoDaPagina(pdf, n) })
    if (textos.map((t) => t.texto).join('').replace(/\s/g, '').length < MINIMO_NAO_BRANCOS) {
      throw new ErroDeExtracao(SEM_TEXTO)
    }

    const marcos = await marcosDoContorno(pdf)
    if (!marcos.length) return [montarSecao([], textos)].filter((s): s is Secao => s !== null)

    // Cada página pertence ao último marco que começa nela ou antes; antes do primeiro, caminho [].
    const grupos: Array<{ caminho: string[]; paginas: typeof textos }> = []
    if (marcos[0].indice > 0) grupos.push({ caminho: [], paginas: textos.slice(0, marcos[0].indice) })
    marcos.forEach((m, i) => {
      const fim = i + 1 < marcos.length ? marcos[i + 1].indice : textos.length
      grupos.push({ caminho: m.caminho, paginas: textos.slice(m.indice, Math.max(m.indice, fim)) })
    })
    return grupos.map((g) => montarSecao(g.caminho, g.paginas)).filter((s): s is Secao => s !== null)
  } finally {
    // Libera o documento e o worker interno do pdfjs.
    if (pdf) await pdf.loadingTask.destroy().catch(() => {})
  }
}
