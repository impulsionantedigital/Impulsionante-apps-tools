import { describe, it, expect } from 'vitest'
import { deveRedirecionar, ehIngressPublico } from '@/proxy'

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

  it('os webhooks de canais continuam públicos', () => {
    expect(ehIngressPublico('/api/canais/evolution/webhook')).toBe(true)
  })
})
