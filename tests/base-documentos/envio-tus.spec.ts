import { describe, expect, it } from 'vitest'
import { chaveDeRetomada } from '../../src/app/(app)/base-conhecimento/envio-tus'
import {
  acoesDoDocumento,
  formatarCusto,
  formatarMB,
  precisaAcompanhar,
  rotuloDoStatus,
} from '../../src/lib/base-documentos/tela'

describe('chaveDeRetomada', () => {
  it('mesmo arquivo e mesmo documento, mesma chave', () => {
    const a = { name: 'Almanaque.md', size: 10, lastModified: 5 }
    expect(chaveDeRetomada(a, 'd1')).toBe('base:d1:Almanaque.md:10:5')
    expect(chaveDeRetomada(a, null)).toBe('base:novo:Almanaque.md:10:5')
  })

  it('arquivo editado (outra data) não retoma o envio antigo', () =>
    expect(chaveDeRetomada({ name: 'a', size: 1, lastModified: 1 }, null)).not.toBe(
      chaveDeRetomada({ name: 'a', size: 1, lastModified: 2 }, null),
    ))

  it('substituir um documento não retoma o envio de um documento novo', () => {
    const a = { name: 'a.pdf', size: 1, lastModified: 1 }
    expect(chaveDeRetomada(a, 'd1')).not.toBe(chaveDeRetomada(a, null))
  })
})

const v = (p: Partial<Parameters<typeof rotuloDoStatus>[0]>) => ({
  status: 'na_fila' as const,
  etapa: null,
  motivo: null,
  trechosTotal: 0,
  feitos: 0,
  ...p,
})

describe('rotuloDoStatus', () => {
  it('cada status vira a frase da tela', () => {
    expect(rotuloDoStatus(v({ status: 'enviando' }))).toBe('Enviando')
    expect(rotuloDoStatus(v({ status: 'na_fila' }))).toBe('Na fila')
    expect(rotuloDoStatus(v({ status: 'processando', etapa: 'extraindo' }))).toBe('Lendo o arquivo')
    expect(rotuloDoStatus(v({ status: 'processando', etapa: null }))).toBe('Lendo o arquivo')
    expect(rotuloDoStatus(v({ status: 'processando', etapa: 'contextualizando', feitos: 3, trechosTotal: 40 }))).toBe(
      'Gerando contexto (3/40)',
    )
    expect(rotuloDoStatus(v({ status: 'processando', etapa: 'vetorizando', feitos: 40, trechosTotal: 40 }))).toBe(
      'Gerando busca (40/40)',
    )
    expect(rotuloDoStatus(v({ status: 'pronto' }))).toBe('Pronto')
    expect(rotuloDoStatus(v({ status: 'erro', motivo: 'Arquivo repetido.' }))).toBe('Erro: Arquivo repetido.')
  })

  it('erro sem motivo gravado ainda diz alguma coisa', () =>
    expect(rotuloDoStatus(v({ status: 'erro', motivo: null }))).toBe('Erro: motivo não informado'))
})

describe('formatação', () => {
  it('custo em dólar com vírgula e o sinal de aproximado', () => {
    expect(formatarCusto(0.54)).toBe('≈ US$ 0,54')
    expect(formatarCusto(0.001)).toBe('≈ US$ 0,01')
    expect(formatarCusto(12.3)).toBe('≈ US$ 12,30')
  })

  it('MB com uma casa e vírgula', () => {
    expect(formatarMB(0)).toBe('0,0 MB')
    expect(formatarMB(6 * 1024 * 1024)).toBe('6,0 MB')
    expect(formatarMB(1.25 * 1024 * 1024)).toBe('1,3 MB')
  })
})

describe('precisaAcompanhar', () => {
  it('só enquanto alguma versão ainda não terminou', () => {
    const doc = (ativa: unknown, pendente: unknown) => ({ ativa, pendente }) as Parameters<typeof precisaAcompanhar>[0][number]
    expect(precisaAcompanhar([])).toBe(false)
    expect(precisaAcompanhar([doc(v({ status: 'pronto' }), null)])).toBe(false)
    expect(precisaAcompanhar([doc(v({ status: 'pronto' }), v({ status: 'erro' }))])).toBe(false)
    expect(precisaAcompanhar([doc(v({ status: 'pronto' }), v({ status: 'processando' }))])).toBe(true)
    expect(precisaAcompanhar([doc(null, v({ status: 'na_fila' }))])).toBe(true)
  })

  it('envio parado no navegador (enviando) não prende a tela recarregando para sempre', () => {
    const doc = (ativa: unknown, pendente: unknown) => ({ ativa, pendente }) as Parameters<typeof precisaAcompanhar>[0][number]
    expect(precisaAcompanhar([doc(null, v({ status: 'enviando' }))])).toBe(false)
  })
})

describe('acoesDoDocumento', () => {
  const pronto = { status: 'pronto' as const }
  const base = { ativa: pronto, pendente: null, enviandoAqui: false, variosAssistentes: true }

  it('quem não administra só vê os trechos', () => {
    expect(acoesDoDocumento({ ...base, ehOwner: false })).toEqual(['trechos'])
    expect(acoesDoDocumento({ ...base, ativa: null, pendente: { status: 'na_fila' }, ehOwner: false })).toEqual([])
  })

  it('o dono vê tudo o que cabe ao documento', () => {
    expect(acoesDoDocumento({ ...base, ehOwner: true })).toEqual([
      'alternar',
      'renomear',
      'substituir',
      'reprocessar',
      'assistentes',
      'trechos',
      'excluir',
    ])
  })

  it('cancelar só para pendente que não é o envio desta aba; sem arquivo não reprocessa', () => {
    const r = acoesDoDocumento({ ...base, ativa: null, pendente: { status: 'enviando' }, ehOwner: true, variosAssistentes: false })
    expect(r).toContain('cancelar')
    expect(r).not.toContain('reprocessar')
    expect(r).not.toContain('assistentes')
    expect(r).not.toContain('trechos')
    expect(
      acoesDoDocumento({ ...base, pendente: { status: 'processando' }, enviandoAqui: true, ehOwner: true }),
    ).not.toContain('cancelar')
  })
})
