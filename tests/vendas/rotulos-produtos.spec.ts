import { describe, it, expect } from 'vitest'
import { rotuloDeId } from '@/lib/produtos/rotulos'

describe('rotuloDeId', () => {
  const externos = new Map([['8c4d2f1e-4b2a-4f6e-9d3c-1a2b3c4d5e6f', 'Curso de Execução Penal']])

  it('id do catálogo: o nome curto do produto, o mesmo do menu e da vitrine', () => {
    // 🔴 Decisão de 2026-09-30: e-mails e a tela de ofertas usam `menuTitulo`. Com dois produtos
    // numa oferta, o rótulo por extenso virava um parágrafo no corpo do e-mail.
    expect(rotuloDeId('indulto-comutacao-2025', externos)).toBe('GPS CIC - Calculadora 2025')
  })

  it('UUID de produto externo: o nome da tabela', () => {
    expect(rotuloDeId('8c4d2f1e-4b2a-4f6e-9d3c-1a2b3c4d5e6f', externos)).toBe('Curso de Execução Penal')
  })

  it('id órfão (externo excluído): o próprio id, sem quebrar a lista', () => {
    expect(rotuloDeId('9f8e7d6c-0000-0000-0000-000000000000', externos)).toBe('9f8e7d6c-0000-0000-0000-000000000000')
  })

  it('id desconhecido que não é interno nem externo: o próprio id', () => {
    expect(rotuloDeId('produto-fantasma', new Map())).toBe('produto-fantasma')
  })

  it('nome de produto externo tem precedência sobre o id, mesmo quando o mapa tem outros ids', () => {
    const mapa = new Map([
      ['8c4d2f1e-4b2a-4f6e-9d3c-1a2b3c4d5e6f', 'Curso A'],
      ['11111111-2222-3333-4444-555555555555', 'Curso B'],
    ])
    expect(rotuloDeId('11111111-2222-3333-4444-555555555555', mapa)).toBe('Curso B')
  })
})
