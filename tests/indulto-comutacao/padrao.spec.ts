import { describe, expect, it } from 'vitest'
import { padraoDoCampo } from '@/lib/indulto-comutacao/padrao'
import type { Campo } from '@/lib/indulto-comutacao/tipos'

// Campos montados à mão — não o questionário de 2025 — porque o que se testa
// aqui é o mecanismo, não o dado de um decreto específico.

describe('padraoDoCampo', () => {
  it('o padrao declarado no campo vence, mesmo com NÃO nas opções', () => {
    const campo: Campo = {
      tipo: 'selecao',
      chave: 'teste',
      rotulo: 'Teste',
      opcoes: ['SIM', 'NÃO'],
      padrao: 'SIM',
    }
    expect(padraoDoCampo(campo)).toBe('SIM')
  })

  it('sem padrao, usa NÃO quando NÃO está entre as opções', () => {
    const campo: Campo = {
      tipo: 'selecao',
      chave: 'teste',
      rotulo: 'Teste',
      opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    }
    expect(padraoDoCampo(campo)).toBe('NÃO')
  })

  it('sem padrao e sem NÃO nas opções, usa a primeira opção', () => {
    const campo: Campo = {
      tipo: 'selecao',
      chave: 'teste',
      rotulo: 'Teste',
      opcoes: ['MASCULINO', 'FEMININO'],
    }
    expect(padraoDoCampo(campo)).toBe('MASCULINO')
  })

  it('campo que não é seleção devolve string vazia', () => {
    const campos: Campo[] = [
      { tipo: 'texto', chave: 'a', rotulo: 'A' },
      { tipo: 'numero', chave: 'b', rotulo: 'B' },
      { tipo: 'data', chave: 'c', rotulo: 'C' },
      { tipo: 'tempo', chave: 'd', rotulo: 'D' },
    ]
    for (const campo of campos) {
      expect(padraoDoCampo(campo)).toBe('')
    }
  })
})
