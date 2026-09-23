import { describe, it, expect } from 'vitest'
import { decidirEmails } from '@/lib/vendas/emails'

const A = 'indulto-comutacao-2025'
const B = 'indulto-comutacao-2024'
// Id de produto EXTERNO: válido, e que este CRM NÃO entrega. Um UUID nunca colide com id de código.
const CURSO = '8c4d2f1e-4b2a-4f6e-9d3c-1a2b3c4d5e6f'

describe('decidirEmails', () => {
  it('comprador novo: boas-vindas e entrega de tudo o que comprou', () => {
    expect(decidirEmails({ vendaAtiva: true, nuncaEntrou: true, produtosOferta: [A], produtosJaTidos: [] }))
      .toEqual({ boasVindas: true, entrega: [A], degustacao: [], pagamentoRecebido: false })
  })

  it('membro que já entrou e compra produto novo: só a entrega', () => {
    expect(decidirEmails({ vendaAtiva: true, nuncaEntrou: false, produtosOferta: [B], produtosJaTidos: [A] }))
      .toEqual({ boasVindas: false, entrega: [B], degustacao: [], pagamentoRecebido: false })
  })

  it('renovação do mesmo produto: só pagamento recebido', () => {
    expect(decidirEmails({ vendaAtiva: true, nuncaEntrou: false, produtosOferta: [A], produtosJaTidos: [A] }))
      .toEqual({ boasVindas: false, entrega: [], degustacao: [], pagamentoRecebido: true })
  })

  it('combo parcial: a entrega cita SÓ o produto novo', () => {
    expect(decidirEmails({ vendaAtiva: true, nuncaEntrou: false, produtosOferta: [A, B], produtosJaTidos: [A] }))
      .toEqual({ boasVindas: false, entrega: [B], degustacao: [], pagamentoRecebido: false })
  })

  it('quem nunca entrou e renova recebe as boas-vindas de novo, com o recibo', () => {
    expect(decidirEmails({ vendaAtiva: true, nuncaEntrou: true, produtosOferta: [A], produtosJaTidos: [A] }))
      .toEqual({ boasVindas: true, entrega: [], degustacao: [], pagamentoRecebido: true })
  })

  it('venda que já nasce encerrada não dispara e-mail nenhum', () => {
    expect(decidirEmails({ vendaAtiva: false, nuncaEntrou: true, produtosOferta: [A], produtosJaTidos: [] }))
      .toEqual({ boasVindas: false, entrega: [], degustacao: [], pagamentoRecebido: false })
  })

  it('produto repetido na oferta aparece uma vez na entrega', () => {
    expect(decidirEmails({ vendaAtiva: true, nuncaEntrou: false, produtosOferta: [A, A], produtosJaTidos: [] }).entrega)
      .toEqual([A])
  })

  it('venda 100% externa: sem entrega, e pagamento recebido', () => {
    const d = decidirEmails({ vendaAtiva: true, nuncaEntrou: false, produtosOferta: [CURSO], produtosJaTidos: [] })
    // 🔴 Externo nunca entra em `entrega`: não há o que liberar, e o TOOL_URL apontaria para rota
    // inexistente. A venda 100% externa só diz "pagamento recebido".
    expect(d.entrega).toEqual([])
    expect(d.pagamentoRecebido).toBe(true)
  })

  it('venda mista: só os INTERNOS novos na entrega', () => {
    const d = decidirEmails({ vendaAtiva: true, nuncaEntrou: false, produtosOferta: [A, CURSO], produtosJaTidos: [] })
    expect(d.entrega).toEqual([A])
  })

  it('brinde: os produtos de degustação da venda viram o e-mail próprio', () => {
    const d = decidirEmails({
      vendaAtiva: true,
      nuncaEntrou: false,
      produtosOferta: [A],
      produtosJaTidos: [A],
      produtosDegustacao: [B],
    })
    expect(d.degustacao).toEqual([B])
    expect(d.pagamentoRecebido).toBe(true)
  })

  it('brinde de produto EXTERNO é descartado — o CRM não entrega o acesso', () => {
    const d = decidirEmails({
      vendaAtiva: true,
      nuncaEntrou: false,
      produtosOferta: [A],
      produtosJaTidos: [A],
      produtosDegustacao: [CURSO],
    })
    expect(d.degustacao).toEqual([])
  })

  it('venda encerrada não dispara brinde', () => {
    const d = decidirEmails({
      vendaAtiva: false,
      nuncaEntrou: true,
      produtosOferta: [A],
      produtosJaTidos: [],
      produtosDegustacao: [B],
    })
    expect(d.degustacao).toEqual([])
  })
})
