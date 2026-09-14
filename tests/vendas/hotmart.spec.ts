import { describe, it, expect } from 'vitest'
import { lerEventoHotmart, statusInicialDaVenda, statusDoEncerramento } from '@/lib/vendas/hotmart'

// Formato real da Hotmart (2.0.0), com dados pessoais fictícios.
const APROVADA = {
  id: '98bb7d8e-de02-483c-bc50-6dde8e7c6dec',
  creation_date: 1784814112292,
  event: 'PURCHASE_APPROVED',
  version: '2.0.0',
  data: {
    product: { id: 7840649, name: 'Produto qualquer' },
    buyer: { name: 'Fulana de Tal', email: 'Fulana@Exemplo.com', document: '529.982.247-25', document_type: 'CPF' },
    purchase: {
      approved_date: 1784814101000,
      price: { value: 97, currency_value: 'BRL' },
      status: 'APPROVED',
      transaction: 'HP0999999999',
      offer: { code: 'h2p73ki9', name: 'Orderbump' },
    },
  },
}

function com(mudar: (p: any) => void): unknown {
  const copia = structuredClone(APROVADA)
  mudar(copia)
  return copia
}

describe('lerEventoHotmart — aprovação', () => {
  it('lê a compra aprovada', () => {
    expect(lerEventoHotmart(APROVADA)).toEqual({
      tipo: 'aprovada',
      eventId: '98bb7d8e-de02-483c-bc50-6dde8e7c6dec',
      evento: 'PURCHASE_APPROVED',
      transacao: 'HP0999999999',
      codigoOferta: 'h2p73ki9',
      aprovadaEm: new Date(1784814101000),
      valor: 97,
      moeda: 'BRL',
      comprador: { nome: 'Fulana de Tal', email: 'fulana@exemplo.com', documento: '52998224725' },
    })
  })

  it('usa a data do envelope quando a de aprovação falta', () => {
    const r = lerEventoHotmart(com((p) => { delete p.data.purchase.approved_date }))
    expect(r.tipo === 'aprovada' && r.aprovadaEm).toEqual(new Date(1784814112292))
  })

  it('aceita comprador sem documento e sem preço', () => {
    const r = lerEventoHotmart(com((p) => { delete p.data.buyer.document; delete p.data.purchase.price }))
    expect(r.tipo).toBe('aprovada')
    if (r.tipo !== 'aprovada') return
    expect(r.comprador.documento).toBeNull()
    expect(r.valor).toBeNull()
    expect(r.moeda).toBeNull()
  })

  it.each([
    ['sem transação', (p: any) => { delete p.data.purchase.transaction }],
    ['sem código de oferta', (p: any) => { delete p.data.purchase.offer }],
    ['sem e-mail', (p: any) => { delete p.data.buyer.email }],
    ['e-mail sem arroba', (p: any) => { p.data.buyer.email = 'nao-e-email' }],
    ['sem nenhuma data', (p: any) => { delete p.data.purchase.approved_date; delete p.creation_date }],
    ['data como texto', (p: any) => { p.data.purchase.approved_date = '2027-01-01'; delete p.creation_date }],
  ])('marca como inválido quando vem %s', (_, mudar) => {
    const r = lerEventoHotmart(com(mudar))
    expect(r.tipo).toBe('ignorado')
    expect(r.tipo === 'ignorado' && r.motivo).toBe('payload_invalido')
  })
})

describe('lerEventoHotmart — encerramentos', () => {
  it.each([
    ['PURCHASE_CANCELED', 'cancelada'],
    ['PURCHASE_REFUNDED', 'reembolsada'],
    ['PURCHASE_PROTEST', 'reembolsada'],
    ['PURCHASE_CHARGEBACK', 'chargeback'],
  ])('%s encerra como %s', (evento, status) => {
    expect(lerEventoHotmart(com((p) => { p.event = evento }))).toEqual({
      tipo: 'encerrada', eventId: APROVADA.id, evento, transacao: 'HP0999999999', status,
    })
  })

  it('encerramento sem transação é inválido', () => {
    const r = lerEventoHotmart(com((p) => { p.event = 'PURCHASE_CANCELED'; delete p.data.purchase.transaction }))
    expect(r.tipo === 'ignorado' && r.motivo).toBe('payload_invalido')
  })
})

describe('lerEventoHotmart — o que não é deste sistema', () => {
  it('evento desconhecido é ignorado, preservando o que der para auditar', () => {
    expect(lerEventoHotmart(com((p) => { p.event = 'PURCHASE_COMPLETE' }))).toEqual({
      tipo: 'ignorado', eventId: APROVADA.id, evento: 'PURCHASE_COMPLETE', transacao: 'HP0999999999', motivo: 'evento_desconhecido',
    })
  })

  it.each([null, undefined, 'texto', 42, [], {}])('nunca lança com payload %j', (payload) => {
    const r = lerEventoHotmart(payload)
    expect(r.tipo).toBe('ignorado')
  })
})

describe('statusInicialDaVenda', () => {
  it('sem encerramento anterior, a venda nasce ativa', () => {
    expect(statusInicialDaVenda([])).toBe('ativa')
    expect(statusInicialDaVenda(['PURCHASE_APPROVED'])).toBe('ativa')
  })

  it('encerramento que chegou antes da aprovação vence', () => {
    expect(statusInicialDaVenda(['PURCHASE_CHARGEBACK'])).toBe('chargeback')
  })

  it('vale o PRIMEIRO encerramento', () => {
    expect(statusInicialDaVenda(['PURCHASE_CANCELED', 'PURCHASE_CHARGEBACK'])).toBe('cancelada')
  })

  it('não reconhece evento que não é de encerramento', () => {
    expect(statusDoEncerramento('PURCHASE_APPROVED')).toBeNull()
    expect(statusDoEncerramento(null)).toBeNull()
  })
})
