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

/**
 * Campos cujo valor é MARCAÇÃO pronta, montada pelo próprio código, e não texto do usuário.
 *
 * 🔴 Só entram aqui valores construídos pelo CRM a partir de dados que ELE MESMO escapou antes de
 * montar a marcação — hoje, apenas `PRODUCTS_LIST`, que é uma `<ul>` de nomes de produto já
 * escapados um a um por quem a monta (`listarProdutosHtml`).
 *
 * 🔴 É uma EXCEÇÃO ao escape, e por isso a lista é fechada e explícita: um campo NÃO listado aqui
 * continua sendo escapado, que é o comportamento seguro. NUNCA acrescente um campo que carregue
 * texto digitado pelo usuário (nome de membro, da oferta, da empresa) — seria abrir XSS no e-mail
 * do comprador.
 */
const CAMPOS_HTML: ReadonlySet<string> = new Set(['PRODUCTS_LIST'])

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
  return modelo.replace(CAMPO, (inteiro, campo: string) => {
    if (!Object.prototype.hasOwnProperty.call(valores, campo)) return inteiro
    // A marcação já vem pronta e já escapada por dentro — escapar de novo transformaria a `<ul>` em
    // texto literal (o comprador leria "&lt;ul&gt;"). Ver `CAMPOS_HTML` para a razão do porquê
    // isto é seguro, e por que a lista é fechada.
    return CAMPOS_HTML.has(campo) ? valores[campo] : escaparHtml(valores[campo])
  })
}

/**
 * A mesma lista de produtos, em texto puro — para o assunto do e-mail e para a alternativa sem
 * HTML. Os nomes vêm separados por vírgula, e NÃO em `<ul>`: aqui não há marcação nenhuma.
 */
export function renderizarTexto(modelo: string, valores: Record<string, string>): string {
  return substituir(modelo, valores, (valor) => valor)
}
