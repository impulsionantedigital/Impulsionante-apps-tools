import { ehProdutoInterno, rotuloDoProduto } from './catalogo'

/**
 * O nome de um produto, seja ele interno (catálogo de código) ou externo (tabela do workspace).
 *
 * 🔴 O último recurso é o PRÓPRIO ID, e não uma string vazia: um produto externo excluído de um
 * histórico antigo não pode quebrar a lista de vendas — ela mostra o id cru, que ainda identifica a
 * venda, e a venda continua legível.
 */
export function rotuloDeId(id: string, nomesExternos: ReadonlyMap<string, string>): string {
  if (ehProdutoInterno(id)) return rotuloDoProduto(id)
  return nomesExternos.get(id) ?? id
}