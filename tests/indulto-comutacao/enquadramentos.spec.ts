import { describe, it, expect } from 'vitest'
import { enquadramentosDe, temAplicavel, primeiroAplicavel } from '@/lib/indulto-comutacao/enquadramentos'
import type { MotorDecreto, Resultado } from '@/lib/indulto-comutacao/tipos'

const motorFalso: MotorDecreto = {
  id: 'falso',
  ano: 2025,
  rotulo: 'Decreto de teste',
  versao: '0.0.0',
  dataBase: '2025-01-01',
  questionario: [],
  incisos: {
    indulto: [
      { id: 'i1', rotulo: 'Inciso 1', descricao: 'Descrição 1', temRegraEspecial: false },
      { id: 'i2', rotulo: 'Inciso 2', descricao: 'Descrição 2', temRegraEspecial: false },
    ],
    comutacao: [{ id: 'c1', rotulo: 'Comutação 1', descricao: 'Descrição C1', temRegraEspecial: false }],
  },
  avisos: { fixos: [], validarJuridicamente: [] },
  calcular: () => ({ incisos: [], resumo: {} as Resultado['resumo'], avisos: [] }),
}

function resultadoFalso(incisos: Resultado['incisos']): Resultado {
  return { incisos, resumo: {} as Resultado['resumo'], avisos: [] }
}

describe('enquadramentosDe', () => {
  it('junta metadado e veredito na ordem do decreto', () => {
    const resultado = resultadoFalso([
      { id: 'i1', geral: 'preenche', especial: 'sem_previsao' },
      { id: 'i2', geral: 'nao_preenche', especial: 'sem_previsao' },
    ])
    expect(enquadramentosDe(motorFalso, resultado, 'indulto')).toEqual([
      { id: 'i1', rotulo: 'Inciso 1', descricao: 'Descrição 1', temRegraEspecial: false, geral: 'preenche', especial: 'sem_previsao' },
      { id: 'i2', rotulo: 'Inciso 2', descricao: 'Descrição 2', temRegraEspecial: false, geral: 'nao_preenche', especial: 'sem_previsao' },
    ])
  })

  it('omite dispositivo sem veredito calculado', () => {
    const resultado = resultadoFalso([{ id: 'i1', geral: 'preenche', especial: 'sem_previsao' }])
    expect(enquadramentosDe(motorFalso, resultado, 'indulto')).toEqual([
      { id: 'i1', rotulo: 'Inciso 1', descricao: 'Descrição 1', temRegraEspecial: false, geral: 'preenche', especial: 'sem_previsao' },
    ])
  })
})

describe('temAplicavel', () => {
  it('verdadeiro quando algum dispositivo do grupo preenche', () => {
    const resultado = resultadoFalso([
      { id: 'i1', geral: 'nao_preenche', especial: 'sem_previsao' },
      { id: 'i2', geral: 'preenche', especial: 'sem_previsao' },
    ])
    expect(temAplicavel(motorFalso, resultado, 'indulto')).toBe(true)
  })

  it('falso quando nenhum dispositivo do grupo preenche', () => {
    const resultado = resultadoFalso([
      { id: 'i1', geral: 'nao_preenche', especial: 'sem_previsao' },
      { id: 'i2', geral: 'a_analisar', especial: 'sem_previsao' },
    ])
    expect(temAplicavel(motorFalso, resultado, 'indulto')).toBe(false)
  })

  it('falso quando o grupo não tem nenhum veredito calculado', () => {
    expect(temAplicavel(motorFalso, resultadoFalso([]), 'comutacao')).toBe(false)
  })
})

describe('primeiroAplicavel', () => {
  it('devolve o primeiro dispositivo, na ordem do decreto, que preenche', () => {
    const resultado = resultadoFalso([
      { id: 'i1', geral: 'nao_preenche', especial: 'sem_previsao' },
      { id: 'i2', geral: 'preenche', especial: 'sem_previsao' },
    ])
    expect(primeiroAplicavel(motorFalso, resultado, 'indulto')?.id).toBe('i2')
  })

  it('null quando nenhum preenche', () => {
    const resultado = resultadoFalso([{ id: 'i1', geral: 'nao_preenche', especial: 'sem_previsao' }])
    expect(primeiroAplicavel(motorFalso, resultado, 'indulto')).toBeNull()
  })
})
