import Papa from 'papaparse'
import type { Secao } from '../tipos'
import { ErroDeExtracao } from './erro'

type Primitivo = string | number | boolean | null
const ehPrimitivo = (v: unknown): v is Primitivo => v === null || ['string', 'number', 'boolean'].includes(typeof v)
const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const ehListaPrimitiva = (v: unknown): v is Primitivo[] => Array.isArray(v) && v.every(ehPrimitivo)
const ehCampo = (v: unknown) => ehPrimitivo(v) || ehListaPrimitiva(v)
const mostrar = (v: Primitivo) => (v === null ? '' : String(v))
const CAMPOS_TITULO = ['titulo', 'title', 'nome', 'name']

function linhaDe(chave: string, v: Primitivo | Primitivo[]): string {
  return `${chave}: ${Array.isArray(v) ? v.map(mostrar).join(', ') : mostrar(v)}`
}

function tituloDe(item: Record<string, unknown>): string | null {
  for (const campo of CAMPOS_TITULO) {
    const v = item[campo]
    if ((typeof v === 'string' && v.trim()) || typeof v === 'number') return String(v).trim()
  }
  return null
}

function percorrer(valor: unknown, caminho: string[], saida: Secao[]): void {
  if (ehPrimitivo(valor)) {
    const texto = mostrar(valor)
    if (texto) saida.push({ caminho, texto })
    return
  }
  if (Array.isArray(valor)) {
    if (ehListaPrimitiva(valor)) {
      const texto = valor.map(mostrar).join(', ')
      if (texto) saida.push({ caminho, texto })
      return
    }
    valor.forEach((item, i) => {
      const titulo = ehObjeto(item) ? tituloDe(item) : null
      percorrer(item, [...caminho, titulo ?? `#${i + 1}`], saida)
    })
    return
  }
  if (!ehObjeto(valor)) return
  const entradas = Object.entries(valor)
  const campos = entradas.filter(([, v]) => ehCampo(v))
  if (campos.length) {
    saida.push({ caminho, texto: campos.map(([k, v]) => linhaDe(k, v as Primitivo | Primitivo[])).join('\n') })
  }
  for (const [chave, v] of entradas) if (!ehCampo(v)) percorrer(v, [...caminho, chave], saida)
}

export function extrairJson(texto: string): Secao[] {
  let raiz: unknown
  try {
    raiz = JSON.parse(texto)
  } catch (e) {
    throw new ErroDeExtracao(`O arquivo JSON não é válido: ${e instanceof Error ? e.message : String(e)}`)
  }
  const saida: Secao[] = []
  percorrer(raiz, [], saida)
  return saida
}

export function extrairCsv(texto: string): Secao[] {
  const { data } = Papa.parse<Record<string, string>>(texto, { header: true, skipEmptyLines: true })
  const linhas = data
    .map((reg) =>
      Object.entries(reg)
        .filter(([coluna, v]) => coluna && typeof v === 'string' && v.trim() !== '')
        .map(([coluna, v]) => `${coluna}: ${v.trim()}`)
        .join('; '),
    )
    .filter(Boolean)
  return [{ caminho: [], texto: linhas.join('\n\n'), registros: true }]
}
