export interface DecisaoEmails {
  boasVindas: boolean
  /** Produtos que o membro nunca teve — são os que o e-mail de entrega anuncia. */
  entrega: string[]
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
 */
export function decidirEmails(args: {
  vendaAtiva: boolean
  nuncaEntrou: boolean
  produtosOferta: readonly string[]
  produtosJaTidos: Iterable<string>
}): DecisaoEmails {
  if (!args.vendaAtiva) return { boasVindas: false, entrega: [], pagamentoRecebido: false }
  const tidos = new Set(args.produtosJaTidos)
  const novos = [...new Set(args.produtosOferta)].filter((p) => !tidos.has(p))
  return { boasVindas: args.nuncaEntrou, entrega: novos, pagamentoRecebido: novos.length === 0 }
}
