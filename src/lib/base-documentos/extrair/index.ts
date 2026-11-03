import type { Extensao, Secao } from '../tipos'
import { extrairCsv, extrairJson } from './dados'
import { ErroDeExtracao } from './erro'
import { decodificarTexto, extrairMarkdown, extrairTextoSimples } from './texto'

export { ErroDeExtracao } from './erro'
export { decodificarTexto, extrairMarkdown, extrairTextoSimples } from './texto'
export { extrairCsv, extrairJson } from './dados'

/** Confere se os primeiros bytes combinam com a extensão declarada. */
export function conferirConteudo(ext: Extensao, dados: Uint8Array): void {
  const comeca = (assinatura: number[]) => assinatura.every((b, i) => dados[i] === b)
  let ok: boolean
  if (ext === 'pdf') ok = comeca([0x25, 0x50, 0x44, 0x46, 0x2d])
  else if (ext === 'docx') ok = comeca([0x50, 0x4b, 0x03, 0x04])
  else ok = !dados.subarray(0, 8192).includes(0)
  if (!ok) throw new ErroDeExtracao(`O conteúdo não parece um arquivo .${ext}. Confira se a extensão está certa.`)
}

export async function extrairSecoes(ext: Extensao, dados: Uint8Array): Promise<Secao[]> {
  conferirConteudo(ext, dados)
  switch (ext) {
    case 'md':
      return extrairMarkdown(decodificarTexto(dados))
    case 'txt':
      return extrairTextoSimples(decodificarTexto(dados))
    case 'json':
      return extrairJson(decodificarTexto(dados))
    case 'csv':
      return extrairCsv(decodificarTexto(dados))
    case 'pdf':
    case 'docx':
      throw new ErroDeExtracao('Tipo ainda não suportado.')
  }
}
