import { ehProdutoInterno } from './catalogo'

/**
 * Um id de produto é aceitável numa oferta?
 *
 * Duas origens, dois significados: id do catálogo de código (produto INTERNO, que este CRM entrega)
 * ou UUID de um produto externo do MESMO espaço de trabalho. Qualquer outra coisa é recusada — e o
 * conjunto de externos válidos só pode ser montado consultando o banco, que é por que a conferência
 * acontece depois do parse do Zod.
 *
 * 🔴 Um UUID de OUTRO espaço de trabalho cai no `false`: o conjunto vem filtrado por
 * `workspace_id`, e o isolamento entre clientes é o que separa as instalações.
 */
export function ehIdDeProdutoAceito(id: string, externosValidos: ReadonlySet<string>): boolean {
  return ehProdutoInterno(id) || externosValidos.has(id)
}

/**
 * Todos os ids marcados como degustação são produtos INTERNOS?
 *
 * 🔴 Produto externo NUNCA é degustação: o CRM não entrega o acesso dele, então não pode concedê-lo
 * nem revogá-lo. Um "brinde" de curso externo seria um período que ninguém consulta.
 */
export function ehDegustacaoValida(ids: readonly string[]): boolean {
  return ids.every((id) => ehProdutoInterno(id))
}

export const MENSAGEM_DEGUSTACAO_EXTERNA =
  'Produto externo não pode ser degustação: este CRM não entrega o acesso dele.'
