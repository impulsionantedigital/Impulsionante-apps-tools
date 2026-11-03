// Tipos e constantes compartilhados pelos documentos da base de conhecimento: a tela de envio,
// o processador que corta o arquivo em trechos e a migration 0076 (que repete os mesmos mime no
// bucket — o teste `tests/base-documentos/migracao.spec.ts` cruza as duas pontas).

export const TIPOS_ACEITOS = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  md: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
  csv: 'text/csv',
} as const

export type Extensao = keyof typeof TIPOS_ACEITOS

export const BUCKET_ARQUIVOS = 'base-arquivos'

export type StatusVersao = 'enviando' | 'na_fila' | 'processando' | 'pronto' | 'erro'

export type Etapa = 'extraindo' | 'contextualizando' | 'vetorizando'

export type Secao = {
  caminho: string[]
  texto: string
  paginas?: Array<{ offset: number; pagina: number }>
  registros?: true
}

export type Trecho = { caminho: string[]; pagina: number | null; secao: number; posicao: number; texto: string }

/** A extensão do arquivo (só a última, em minúsculas) quando ela é uma das aceitas; senão `null`. */
export function extensaoDe(nomeArquivo: string): Extensao | null {
  const ponto = nomeArquivo.lastIndexOf('.')
  if (ponto < 0) return null
  const ext = nomeArquivo.slice(ponto + 1).toLowerCase()
  return Object.hasOwn(TIPOS_ACEITOS, ext) ? (ext as Extensao) : null
}

/** Onde o objeto da versão mora no bucket: `<ws>/<documento>/<versao>.<ext>`. */
export function caminhoDoObjeto(ws: string, documentoId: string, versaoId: string, ext: Extensao): string {
  return `${ws}/${documentoId}/${versaoId}.${ext}`
}
