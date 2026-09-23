import { ehProdutoInterno } from '@/lib/produtos/catalogo'

export interface DecisaoEmails {
  boasVindas: boolean
  /** Produtos INTERNOS que o membro nunca teve — são os que o e-mail de entrega anuncia. */
  entrega: string[]
  /** Produtos internos concedidos como brinde por ESTA venda. */
  degustacao: string[]
  pagamentoRecebido: boolean
}

/**
 * Que e-mails uma aprovação dispara (§7.5.2, com as correções da §16).
 *
 * - Venda que já nasce encerrada (encerramento chegou antes da aprovação) não dispara nada.
 * - Boas-vindas para quem nunca entrou no sistema.
 * - Entrega com os produtos NOVOS — a subtração é o que acerta o combo parcial.
 * - Sem produto novo, é renovação: só "pagamento recebido".
 *
 * 🔴 `produtosJaTidos` tem de ser calculado ANTES de gravar a venda, senão ela entra na própria
 * conta e nada é novo.
 *
 * 🔴 Só produto INTERNO entra em `entrega` e em `degustacao`. O produto externo tem id válido, mas
 * este CRM não o entrega: não há acesso a liberar, e o `TOOL_URL` apontaria para uma rota que não
 * existe. A venda 100% externa não dispara `entrega_produto` — só o recibo.
 */
export function decidirEmails(args: {
  vendaAtiva: boolean
  nuncaEntrou: boolean
  produtosOferta: readonly string[]
  produtosJaTidos: Iterable<string>
  /** Produtos concedidos como BRINDE por esta venda (origem degustação em `vendas_periodos`). */
  produtosDegustacao?: readonly string[]
}): DecisaoEmails {
  if (!args.vendaAtiva) return { boasVindas: false, entrega: [], degustacao: [], pagamentoRecebido: false }
  const tidos = new Set(args.produtosJaTidos)
  const novos = [...new Set(args.produtosOferta)].filter((p) => !tidos.has(p) && ehProdutoInterno(p))
  const degustacao = [...new Set(args.produtosDegustacao ?? [])].filter(ehProdutoInterno)
  return { boasVindas: args.nuncaEntrou, entrega: novos, degustacao, pagamentoRecebido: novos.length === 0 }
}
