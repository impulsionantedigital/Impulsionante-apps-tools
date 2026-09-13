import { describe, it, expect } from 'vitest'
import { VEREDITOS, ehVeredito } from '@/lib/indulto-comutacao/tipos'

describe('VEREDITOS', () => {
  it('traz os quatro estados do decreto, com o rótulo que a POC exibia', () => {
    expect(Object.keys(VEREDITOS).sort()).toEqual(
      ['a_analisar', 'nao_preenche', 'preenche', 'sem_previsao'].sort(),
    )
    expect(VEREDITOS.preenche).toBe('Preenche os requisitos')
    expect(VEREDITOS.nao_preenche).toBe('Não preenche os requisitos')
    expect(VEREDITOS.a_analisar).toBe('A analisar')
    expect(VEREDITOS.sem_previsao).toBe('Sem previsão no Decreto')
  })
})

describe('ehVeredito()', () => {
  it('aceita os quatro e recusa o resto', () => {
    expect(ehVeredito('preenche')).toBe(true)
    expect(ehVeredito('sem_previsao')).toBe(true)
    expect(ehVeredito('talvez')).toBe(false)
    expect(ehVeredito('Preenche os requisitos')).toBe(false)
    expect(ehVeredito(null)).toBe(false)
    expect(ehVeredito(undefined)).toBe(false)
  })
})
