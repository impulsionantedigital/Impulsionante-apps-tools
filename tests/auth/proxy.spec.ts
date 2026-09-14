import { describe, it, expect } from 'vitest'
import { deveRedirecionar } from '@/proxy'

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
