export interface Envelope {
  de: string
  para: string
  assunto: string
  html: string
  texto: string
}

const ENTIDADES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}

export function htmlParaTexto(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39);/g, (entidade) => ENTIDADES[entidade])
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => linha !== '')
    .join('\n')
}
