// tests/detracao/recolhimento-noturno/feriados.spec.ts
//
// A lista de feriados da calculadora é uma CÓPIA de `temp/feriados.json` (ver o porquê no topo de
// `feriados.ts`: `temp/` é pasta de trabalho e não vai para produção). Cópia que pode divergir da
// origem em silêncio é pior do que não ter cópia — este arquivo é o que impede isso.
//
// 🔴 A paridade só é verificada quando `temp/feriados.json` existe: no checkout do comprador ele
// pode não estar. Nesse caso o teste de paridade é PULADO, nunca falha — um teste que depende de
// arquivo ausente não pode virar build vermelho no servidor de ninguém.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FERIADOS, DATAS_FERIADOS, feriadosNacionais } from '@/lib/detracao/recolhimento-noturno/feriados'

const CAMINHO_ORIGEM = resolve(process.cwd(), 'temp/feriados.json')

describe('FERIADOS — forma da lista', () => {
  it('toda data está no formato ISO YYYY-MM-DD', () => {
    for (const f of FERIADOS) expect(f.data, f.nome).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('nenhuma data repetida', () => {
    expect(new Set(DATAS_FERIADOS).size).toBe(DATAS_FERIADOS.length)
  })

  it('está ordenada por data', () => {
    expect([...DATAS_FERIADOS].sort()).toEqual([...DATAS_FERIADOS])
  })

  it('todo feriado tem nome', () => {
    for (const f of FERIADOS) expect(f.nome.trim().length, f.data).toBeGreaterThan(0)
  })

  it('a data é um dia de calendário que existe de verdade', () => {
    // Pega o erro de digitação que o formato `YYYY-MM-DD` sozinho não pega: "2036-02-31" ou
    // "2036-13-01" passam no regex e não são data nenhuma. Falha aqui = erro na transcrição.
    for (const f of FERIADOS) {
      const [ano, mes, dia] = f.data.split('-').map(Number)
      const d = new Date(Date.UTC(ano, mes - 1, dia))
      const volta = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
      expect(volta, `${f.data} (${f.nome})`).toBe(f.data)
    }
  })
})

describe('feriadosNacionais — recorte por ano', () => {
  it('devolve só os feriados dentro do intervalo, inclusive nas bordas', () => {
    const f = feriadosNacionais(2025, 2026)
    expect(f).toContain('2025-01-01')
    expect(f).toContain('2026-12-25')
    expect(f.filter((d) => d.startsWith('2024'))).toHaveLength(0)
    expect(f.filter((d) => d.startsWith('2027'))).toHaveLength(0)
  })

  it('devolve lista vazia quando o intervalo é invertido', () => {
    expect(feriadosNacionais(2026, 2024)).toEqual([])
  })

  it('devolve lista vazia fora da faixa coberta (anterior a 1990)', () => {
    expect(feriadosNacionais(1980, 1989)).toEqual([])
  })
})

describe('cobertura histórica que o arquivo de origem registra', () => {
  it('a Consciência Negra é nacional a partir de 2024', () => {
    expect(feriadosNacionais(2023, 2023)).not.toContain('2023-11-20')
    expect(feriadosNacionais(2024, 2024)).toContain('2024-11-20')
  })

  it('1990 e 1994 têm as Eleições gerais (Lei nº 1.266/1950)', () => {
    expect(feriadosNacionais(1990, 1990)).toContain('1990-10-03')
    expect(feriadosNacionais(1994, 1994)).toContain('1994-10-03')
  })

  it('Finados não é feriado em todos os anos — 2003 não tem, 2004 tem', () => {
    // 🔴 Lacuna do arquivo de origem, reproduzida de propósito. Não "conserte" derivando a data:
    // o que a calculadora computa tem de ser o que a fonte homologada diz.
    expect(feriadosNacionais(2003, 2003)).not.toContain('2003-11-02')
    expect(feriadosNacionais(2004, 2004)).toContain('2004-11-02')
  })
})

describe.skipIf(!existsSync(CAMINHO_ORIGEM))('paridade com temp/feriados.json', () => {
  it('esta lista é idêntica à origem, entrada por entrada', () => {
    const bruto = JSON.parse(readFileSync(CAMINHO_ORIGEM, 'utf8')) as Array<{ data: string; nome: string }>
    const origem = bruto.map((f) => `${f.data}|${f.nome}`).sort()
    const copia = FERIADOS.map((f) => `${f.data}|${f.nome}`).sort()
    expect(copia).toEqual(origem)
  })

  it('a contagem bate com a origem', () => {
    const bruto = JSON.parse(readFileSync(CAMINHO_ORIGEM, 'utf8')) as unknown[]
    expect(FERIADOS).toHaveLength(bruto.length)
  })
})
