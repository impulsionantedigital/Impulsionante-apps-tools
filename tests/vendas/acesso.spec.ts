import { describe, it, expect } from 'vitest'
import { detalheDeAcesso, estadoDeAcesso, type PeriodoDoMembro } from '@/lib/vendas/acesso'

const d = (iso: string) => new Date(iso)
const A = 'indulto-comutacao-2025'
const AGORA = d('2027-03-15T12:00:00Z')

/** Período da venda, que é o caso comum — os testes só declaram `origem` quando ela importa. */
function periodo(p: Omit<PeriodoDoMembro, 'origem'> & { origem?: PeriodoDoMembro['origem'] }): PeriodoDoMembro {
  return { origem: 'venda', ...p }
}

function estado(periodos: PeriodoDoMembro[], ehDonoDoServidor = false) {
  return estadoDeAcesso({ produto: A, ehDonoDoServidor, periodos, agora: AGORA })
}

function detalhe(periodos: PeriodoDoMembro[], ehDonoDoServidor = false) {
  return detalheDeAcesso({ produto: A, ehDonoDoServidor, periodos, agora: AGORA })
}

describe('estadoDeAcesso', () => {
  it('sem período nenhum do produto: nunca', () => {
    expect(estado([])).toBe('nunca')
    expect(estado([periodo({ produtoId: 'outro', iniciaEm: d('2027-01-01T00:00:00Z'), expiraEm: null, vendaAtiva: true })])).toBe('nunca')
  })

  it('período ativo cobrindo agora: ativo', () => {
    expect(estado([periodo({ produtoId: A, iniciaEm: d('2027-03-01T00:00:00Z'), expiraEm: d('2027-04-01T00:00:00Z'), vendaAtiva: true })])).toBe('ativo')
  })

  it('vitalício de venda ativa: ativo', () => {
    expect(estado([periodo({ produtoId: A, iniciaEm: d('2026-01-01T00:00:00Z'), expiraEm: null, vendaAtiva: true })])).toBe('ativo')
  })

  it('vencimento é fronteira exclusiva', () => {
    expect(estado([periodo({ produtoId: A, iniciaEm: d('2027-02-15T12:00:00Z'), expiraEm: AGORA, vendaAtiva: true })])).toBe('encerrado')
    expect(estado([periodo({ produtoId: A, iniciaEm: AGORA, expiraEm: d('2027-04-15T12:00:00Z'), vendaAtiva: true })])).toBe('ativo')
  })

  it('já venceu: encerrado', () => {
    expect(estado([periodo({ produtoId: A, iniciaEm: d('2027-01-01T00:00:00Z'), expiraEm: d('2027-02-01T00:00:00Z'), vendaAtiva: true })])).toBe('encerrado')
  })

  it('venda cancelada não dá acesso, mesmo dentro do período', () => {
    expect(estado([periodo({ produtoId: A, iniciaEm: d('2027-03-01T00:00:00Z'), expiraEm: d('2027-04-01T00:00:00Z'), vendaAtiva: false })])).toBe('encerrado')
  })

  it('período que só começa no futuro não cobre agora', () => {
    expect(estado([periodo({ produtoId: A, iniciaEm: d('2027-04-01T00:00:00Z'), expiraEm: d('2027-05-01T00:00:00Z'), vendaAtiva: true })])).toBe('encerrado')
  })

  it('o dono do servidor passa por cima', () => {
    expect(estado([], true)).toBe('ativo')
  })

  // 🔴 A degustação é acesso PLENO enquanto vale: o estado continua sendo 'ativo'. Se 'trial'
  // virasse um quarto valor do enum, os seis pontos que hoje perguntam `=== 'ativo'` passariam a
  // recusá-lo, e o membro em degustação não conseguiria criar nem editar cálculo.
  it('degustação vigente é estado ATIVO — trial é rótulo, não permissão', () => {
    expect(estado([periodo({ produtoId: A, iniciaEm: d('2027-03-10T00:00:00Z'), expiraEm: d('2027-03-17T00:00:00Z'), vendaAtiva: true, origem: 'degustacao' })])).toBe('ativo')
  })

  it('degustação vencida é encerrado, como qualquer outro acesso', () => {
    expect(estado([periodo({ produtoId: A, iniciaEm: d('2027-03-01T00:00:00Z'), expiraEm: d('2027-03-08T00:00:00Z'), vendaAtiva: true, origem: 'degustacao' })])).toBe('encerrado')
  })
})

describe('detalheDeAcesso', () => {
  it('sem acesso vigente: sem trial, sem vencimento', () => {
    expect(detalhe([periodo({ produtoId: A, iniciaEm: d('2027-01-01T00:00:00Z'), expiraEm: d('2027-02-01T00:00:00Z'), vendaAtiva: true })])).toEqual({
      trial: false,
      degustou: false,
      expiraEm: null,
      diasRestantes: null,
    })
  })

  it('acesso de venda vigente: não é trial, mas informa o vencimento', () => {
    const r = detalhe([periodo({ produtoId: A, iniciaEm: d('2027-03-01T00:00:00Z'), expiraEm: d('2027-04-01T00:00:00Z'), vendaAtiva: true })])
    expect(r.trial).toBe(false)
    expect(r.expiraEm).toEqual(d('2027-04-01T00:00:00Z'))
    // 17 dias de 15/03 12:00 a 01/04 12:00, arredondado para cima.
    expect(r.diasRestantes).toBe(17)
  })

  it('degustação vigente: marca o trial e conta os dias restantes', () => {
    // De 15/03 12:00 a 17/03 12:00 são exatamente 2 dias.
    const r = detalhe([periodo({ produtoId: A, iniciaEm: d('2027-03-10T00:00:00Z'), expiraEm: d('2027-03-17T12:00:00Z'), vendaAtiva: true, origem: 'degustacao' })])
    expect(r.trial).toBe(true)
    expect(r.diasRestantes).toBe(2)
  })

  it('últimas horas contam como 1 dia — arredonda para cima, para não anunciar "0 dias" com acesso vivo', () => {
    const r = detalhe([periodo({ produtoId: A, iniciaEm: d('2027-03-01T00:00:00Z'), expiraEm: d('2027-03-15T18:00:00Z'), vendaAtiva: true, origem: 'degustacao' })])
    expect(r.diasRestantes).toBe(1)
  })

  it('degustação JÁ VENCIDA não é mais trial — é histórico', () => {
    // Quem pergunta "posso mostrar a tela de degustação?" quer a resposta sobre o acesso de agora.
    expect(detalhe([periodo({ produtoId: A, iniciaEm: d('2027-03-01T00:00:00Z'), expiraEm: d('2027-03-08T00:00:00Z'), vendaAtiva: true, origem: 'degustacao' })])).toEqual({
      trial: false,
      // 🔴 Mas `degustou` continua verdadeiro: é o que permite o recado "sua degustação acabou",
      // que é diferente de "seu acesso expirou".
      degustou: true,
      expiraEm: null,
      diasRestantes: null,
    })
  })

  it('degustação vencida E período de venda vigente: o detalhe fala do acesso de agora', () => {
    const r = detalhe([
      periodo({ produtoId: A, iniciaEm: d('2027-01-01T00:00:00Z'), expiraEm: d('2027-01-08T00:00:00Z'), vendaAtiva: true, origem: 'degustacao' }),
      periodo({ produtoId: A, iniciaEm: d('2027-03-01T00:00:00Z'), expiraEm: d('2027-06-01T00:00:00Z'), vendaAtiva: true }),
    ])
    expect(r.trial).toBe(false)
    expect(r.degustou).toBe(true)
    expect(r.diasRestantes).toBe(78)
  })

  it('vitalício vigente: trial false e sem vencimento, mas sem erro', () => {
    expect(detalhe([periodo({ produtoId: A, iniciaEm: d('2026-01-01T00:00:00Z'), expiraEm: null, vendaAtiva: true })])).toEqual({
      trial: false,
      degustou: false,
      expiraEm: null,
      diasRestantes: null,
    })
  })

  it('o dono do servidor não tem trial: ele passa por cima, não é degustação de ninguém', () => {
    expect(detalhe([], true)).toEqual({ trial: false, degustou: false, expiraEm: null, diasRestantes: null })
  })

  it('venda paga cobre agora, e o trial é posterior: o acesso vigente é o da venda', () => {
    // Dois períodos do mesmo produto: quem responde é o que cobre agora. É o caso de quem ganhou
    // o brinde e já tinha comprado — a tela não deve anunciar degustação para quem pagou.
    const r = detalhe([
      periodo({ produtoId: A, iniciaEm: d('2027-03-01T00:00:00Z'), expiraEm: d('2027-09-01T00:00:00Z'), vendaAtiva: true }),
      periodo({ produtoId: A, iniciaEm: d('2027-03-10T00:00:00Z'), expiraEm: d('2027-03-17T00:00:00Z'), vendaAtiva: true, origem: 'degustacao' }),
    ])
    expect(r.trial).toBe(false)
  })
})
