const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escaparHtml(valor: string): string {
  return valor.replace(/[&<>"']/g, (caractere) => ESCAPES[caractere])
}

const CAMPO = /\[([A-Z][A-Z_]*)\]/g

function substituir(
  modelo: string,
  valores: Record<string, string>,
  transformar: (valor: string) => string,
): string {
  return modelo.replace(CAMPO, (inteiro, campo: string) =>
    Object.prototype.hasOwnProperty.call(valores, campo) ? transformar(valores[campo]) : inteiro,
  )
}

export function renderizarHtml(modelo: string, valores: Record<string, string>): string {
  return substituir(modelo, valores, escaparHtml)
}

export function renderizarTexto(modelo: string, valores: Record<string, string>): string {
  return substituir(modelo, valores, (valor) => valor)
}
