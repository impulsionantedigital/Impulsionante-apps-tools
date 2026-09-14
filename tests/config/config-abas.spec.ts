import { describe, it, expect } from 'vitest'
import { abasDisponiveis, resolverAba, ROTULO_ABA } from '@/lib/config-abas'

describe('abas de configuração', () => {
  it('a aba comercial só aparece para quem pode vê-la', () => {
    expect(abasDisponiveis({ pessoas: true, servidor: false })).toEqual(['espaco', 'pessoas'])
    expect(abasDisponiveis({ pessoas: true, servidor: true, comercial: true })).toEqual(['espaco', 'pessoas', 'comercial', 'servidor'])
  })

  it('não se chega à aba comercial pela URL sem permissão', () => {
    expect(resolverAba('comercial', abasDisponiveis({ pessoas: true, servidor: false }))).toBe('espaco')
  })

  it('tem rótulo', () => {
    expect(ROTULO_ABA.comercial).toBe('Comercial')
  })
})
