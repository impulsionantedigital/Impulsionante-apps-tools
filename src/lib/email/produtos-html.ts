import { escaparHtml } from './merge'

/**
 * Monta a `<ul><li>` dos produtos de um e-mail, para o campo `PRODUCTS_LIST`.
 *
 * 🔴 O ESCAPE ACONTECE AQUI, nome a nome, ANTES de montar a marcação — e é isto que torna o campo
 * seguro sendo a exceção ao escape do `renderizarHtml`. O nome do produto é dado do dono do CRM
 * (produto externo cadastrado à mão, rótulo do catálogo), e um nome com `<` viraria marcação no
 * e-mail do comprador se passasse cru. Escapando cada um, a ÚNICA marcação que sobra na string
 * final é a `<ul>`/`<li>` que este arquivo escreve.
 *
 * 🔴 NÃO use este valor em `renderizarTexto`: ele devolveria as tags como texto. O assunto do
 * e-mail usa `PRODUCT_NAME`, que é a mesma lista separada por vírgula e sem marcação.
 */
export function listarProdutosHtml(nomes: readonly string[]): string {
  if (nomes.length === 0) return ''
  const itens = nomes.map((nome) => `<li>${escaparHtml(nome)}</li>`).join('')
  return `<ul>${itens}</ul>`
}

/** A mesma lista em texto puro, para o assunto e para a versão sem HTML do e-mail. */
export function listarProdutosTexto(nomes: readonly string[]): string {
  return nomes.join(', ')
}
