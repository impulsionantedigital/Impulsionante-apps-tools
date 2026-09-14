import { describe, it, expect } from 'vitest'
import { deveRedirecionar, deveRestringirAoComprador, ehIngressPublico } from '@/proxy'

describe('rotas públicas do proxy', () => {
  it('a recuperação de senha abre sem sessão', () => {
    expect(deveRedirecionar('/recuperar', false)).toBe(false)
  })

  it('definir senha exige sessão', () => {
    expect(deveRedirecionar('/trocar-senha', false)).toBe(true)
  })

  it('as rotas que já eram públicas continuam', () => {
    expect(deveRedirecionar('/entrar', false)).toBe(false)
    expect(deveRedirecionar('/convite/abc', false)).toBe(false)
  })

  it('não confunde prefixo com rota pública', () => {
    expect(deveRedirecionar('/recuperarx', false)).toBe(true)
  })
})

describe('ingresso público do webhook de compras', () => {
  it('o webhook da Hotmart entra sem sessão', () => {
    expect(ehIngressPublico('/api/webhook/hotmart')).toBe(true)
    expect(ehIngressPublico('/api/webhook/hotmart/')).toBe(true)
  })

  it('não abre caminhos vizinhos', () => {
    expect(ehIngressPublico('/api/webhookx/hotmart')).toBe(false)
    expect(ehIngressPublico('/api/webhook/hotmart/outra-coisa')).toBe(false)
  })

  it('só vale a partir da raiz do caminho', () => {
    expect(ehIngressPublico('/x/api/webhook/hotmart')).toBe(false)
  })

  it('os webhooks de canais continuam públicos', () => {
    expect(ehIngressPublico('/api/canais/evolution/webhook')).toBe(true)
  })
})

describe('rotas do comprador', () => {
  it('fecha o CRM e as configurações', () => {
    for (const rota of ['/', '/painel', '/negocios', '/conversas', '/contatos', '/config', '/agentes', '/x/qualquer']) {
      expect(deveRestringirAoComprador(rota)).toBe(true)
    }
  })

  it('abre as ferramentas e o que o fluxo de acesso precisa', () => {
    for (const rota of ['/ferramentas', '/ferramentas/indulto-comutacao/abc', '/trocar-senha', '/recuperar', '/entrar', '/licenca', '/sem-workspace']) {
      expect(deveRestringirAoComprador(rota)).toBe(false)
    }
  })

  it('não confunde prefixo com rota do comprador', () => {
    expect(deveRestringirAoComprador('/ferramentasx')).toBe(true)
  })

  it('não mexe nas APIs, que têm autenticação própria', () => {
    expect(deveRestringirAoComprador('/api/webhook/hotmart')).toBe(false)
  })
})
