import { describe, it, expect } from 'vitest'
import { normalizar, ehValido, formatar, tipo } from '@/lib/documento'

describe('normalizar', () => {
  it('retira pontuação e espaços das pontas', () => {
    expect(normalizar(' 529.982.247-25 ')).toBe('52998224725')
    expect(normalizar('11.222.333/0001-81')).toBe('11222333000181')
  })

  it('põe em maiúscula as letras do CNPJ alfanumérico', () => {
    expect(normalizar('12.abc.345/01de-35')).toBe('12ABC34501DE35')
  })
})

describe('tipo', () => {
  it('reconhece CPF, CNPJ numérico e CNPJ alfanumérico', () => {
    expect(tipo('52998224725')).toBe('cpf')
    expect(tipo('11222333000181')).toBe('cnpj')
    expect(tipo('12ABC34501DE35')).toBe('cnpj')
  })

  it('recusa comprimento errado, letra no CPF e letra nos dígitos verificadores', () => {
    expect(tipo('1234')).toBeNull()
    expect(tipo('5299822472A')).toBeNull()
    expect(tipo('12ABC34501DEA5')).toBeNull()
    expect(tipo('')).toBeNull()
  })
})

describe('ehValido', () => {
  it('aceita documentos com dígito verificador correto', () => {
    expect(ehValido('52998224725')).toBe(true)
    expect(ehValido('00048775193')).toBe(true)
    expect(ehValido('11222333000181')).toBe(true)
    expect(ehValido('58091014000148')).toBe(true)
  })

  it('aceita o exemplo oficial da Receita de CNPJ alfanumérico', () => {
    expect(ehValido(normalizar('12.ABC.345/01DE-35'))).toBe(true)
  })

  it('recusa o primeiro e o segundo dígito verificador errados', () => {
    expect(ehValido('52998224735')).toBe(false)
    expect(ehValido('52998224726')).toBe(false)
    expect(ehValido('11222333000191')).toBe(false)
    expect(ehValido('11222333000182')).toBe(false)
    expect(ehValido('12ABC34501DE36')).toBe(false)
  })

  it('recusa sequências repetidas, que passam na aritmética', () => {
    expect(ehValido('11111111111')).toBe(false)
    expect(ehValido('00000000000')).toBe(false)
    expect(ehValido('00000000000000')).toBe(false)
  })

  it('recusa o que não é documento', () => {
    expect(ehValido('')).toBe(false)
    expect(ehValido(normalizar('foo00048775193'))).toBe(false)
    expect(ehValido('ABCDEFGHIJK')).toBe(false)
  })
})

describe('formatar', () => {
  it('formata CPF, CNPJ numérico e alfanumérico', () => {
    expect(formatar('52998224725')).toBe('529.982.247-25')
    expect(formatar('11222333000181')).toBe('11.222.333/0001-81')
    expect(formatar('12ABC34501DE35')).toBe('12.ABC.345/01DE-35')
  })

  it('devolve intacto o que não reconhece', () => {
    expect(formatar('1234')).toBe('1234')
  })
})

describe('normalizar — espaços internos', () => {
  it('retira espaços no meio do documento', () => {
    expect(normalizar('529 982 247 25')).toBe('52998224725')
  })
})
