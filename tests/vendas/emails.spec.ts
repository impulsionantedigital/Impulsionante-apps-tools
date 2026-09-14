import { describe, it, expect } from 'vitest'
import { decidirEmails } from '@/lib/vendas/emails'

const A = 'indulto-comutacao-2025'
const B = 'indulto-comutacao-2024'

describe('decidirEmails', () => {
  it('comprador novo: boas-vindas e entrega de tudo o que comprou', () => {
    expect(decidirEmails({ vendaAtiva: true, nuncaEntrou: true, produtosOferta: [A], produtosJaTidos: [] }))
      .toEqual({ boasVindas: true, entrega: [A], pagamentoRecebido: false })
  })

  it('membro que já entrou e compra produto novo: só a entrega', () => {
    expect(decidirEmails({ vendaAtiva: true, nuncaEntrou: false, produtosOferta: [B], produtosJaTidos: [A] }))
      .toEqual({ boasVindas: false, entrega: [B], pagamentoRecebido: false })
  })

  it('renovação do mesmo produto: só pagamento recebido', () => {
    expect(decidirEmails({ vendaAtiva: true, nuncaEntrou: false, produtosOferta: [A], produtosJaTidos: [A] }))
      .toEqual({ boasVindas: false, entrega: [], pagamentoRecebido: true })
  })

  it('combo parcial: a entrega cita SÓ o produto novo', () => {
    expect(decidirEmails({ vendaAtiva: true, nuncaEntrou: false, produtosOferta: [A, B], produtosJaTidos: [A] }))
      .toEqual({ boasVindas: false, entrega: [B], pagamentoRecebido: false })
  })

  it('quem nunca entrou e renova recebe as boas-vindas de novo, com o recibo', () => {
    expect(decidirEmails({ vendaAtiva: true, nuncaEntrou: true, produtosOferta: [A], produtosJaTidos: [A] }))
      .toEqual({ boasVindas: true, entrega: [], pagamentoRecebido: true })
  })

  it('venda que já nasce encerrada não dispara e-mail nenhum', () => {
    expect(decidirEmails({ vendaAtiva: false, nuncaEntrou: true, produtosOferta: [A], produtosJaTidos: [] }))
      .toEqual({ boasVindas: false, entrega: [], pagamentoRecebido: false })
  })

  it('produto repetido na oferta aparece uma vez na entrega', () => {
    expect(decidirEmails({ vendaAtiva: true, nuncaEntrou: false, produtosOferta: [A, A], produtosJaTidos: [] }).entrega)
      .toEqual([A])
  })
})
