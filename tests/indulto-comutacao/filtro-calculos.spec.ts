import { describe, it, expect } from 'vitest'
import { filtrarCalculos } from '../../src/app/(app)/ferramentas/cic-2025/filtro-calculos'
import type { CalculoResumo } from '../../src/app/(app)/ferramentas/cic-2025/calculos'

function calculo(parcial: Partial<CalculoResumo>): CalculoResumo {
  return {
    id: '1',
    decreto_id: 'indulto-comutacao-2025',
    motor_versao: '1.0.0',
    titulo: 'Sem título',
    criado_em: '2026-01-01T00:00:00Z',
    atualizado_em: '2026-01-01T00:00:00Z',
    sentenciado: null,
    execucao: null,
    ...parcial,
  }
}

describe('filtrarCalculos', () => {
  it('devolve tudo quando o termo está vazio ou só espaço', () => {
    const lista = [calculo({ id: '1' }), calculo({ id: '2' })]
    expect(filtrarCalculos(lista, '')).toEqual(lista)
    expect(filtrarCalculos(lista, '   ')).toEqual(lista)
  })

  it('filtra pelo título do cálculo', () => {
    const lista = [calculo({ id: '1', titulo: 'Caso João' }), calculo({ id: '2', titulo: 'Outro título' })]
    expect(filtrarCalculos(lista, 'joão')).toEqual([lista[0]])
  })

  it('filtra pelo nome do sentenciado', () => {
    const lista = [
      calculo({ id: '1', sentenciado: 'Maria da Silva' }),
      calculo({ id: '2', sentenciado: 'José Souza' }),
    ]
    expect(filtrarCalculos(lista, 'silva')).toEqual([lista[0]])
  })

  it('filtra pelo número de execução', () => {
    const lista = [calculo({ id: '1', execucao: '0001234-56.2020' }), calculo({ id: '2', execucao: '9999999' })]
    expect(filtrarCalculos(lista, '1234')).toEqual([lista[0]])
  })

  it('ignora acento e caixa', () => {
    const lista = [calculo({ id: '1', sentenciado: 'José Antônio' })]
    expect(filtrarCalculos(lista, 'JOSE ANTONIO')).toEqual(lista)
  })

  it('trata sentenciado/execução ausentes sem quebrar', () => {
    const lista = [calculo({ id: '1', sentenciado: null, execucao: null, titulo: 'X' })]
    expect(filtrarCalculos(lista, 'y')).toEqual([])
  })
})
