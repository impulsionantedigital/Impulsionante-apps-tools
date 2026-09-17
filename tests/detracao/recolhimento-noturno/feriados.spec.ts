// tests/detracao/recolhimento-noturno/feriados.spec.ts
//
// O JSON de feriados (`src/lib/detracao/recolhimento-noturno/dados/feriados.json`) é a FONTE, e
// `feriados.ts` é a transcrição dele para TypeScript — porque o motor precisa de um `Set` de datas
// em runtime, sem ler arquivo do disco.
//
// 🔴 Duas verdades sobre o mesmo dado divergem no primeiro ajuste. O teste de paridade abaixo é o
// que impede isso: ele compara a lista transcrita com o JSON, entrada por entrada. Erro de
// transcrição (data digitada errada, linha faltando) deixa a suíte vermelha, e não um cálculo
// silenciosamente errado na tela de alguém.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FERIADOS, DATAS_FERIADOS, feriadosNacionais } from '@/lib/detracao/recolhimento-noturno/feriados'

const CAMINHO_FONTE = resolve(
  process.cwd(),
  'src/lib/detracao/recolhimento-noturno/dados/feriados.json',
)

describe('FERIADOS — forma da lista', () => {
  it('toda data está no formato ISO YYYY-MM-DD', () => {
    for (const f of FERIADOS) expect(f.data, f.nome).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('nenhuma entrada repetida', () => {
    // 🔴 Duas datas IGUAIS com nomes diferentes é LEGÍTIMO: em 21/04/2000 a Sexta-feira Santa caiu
    // no mesmo dia que Tiradentes. O que não pode existir é a MESMA entrada duas vezes, que faria
    // a lista mentir sobre o próprio tamanho.
    const chaves = FERIADOS.map((f) => `${f.data}|${f.nome}`)
    expect(new Set(chaves).size).toBe(chaves.length)
  })

  it('as coincidências de data são conhecidas e poucas', () => {
    // Trava o crescimento acidental: se isto subir, uma geração de Sexta-feira Santa saiu errada.
    const porData = new Map<string, number>()
    for (const f of FERIADOS) porData.set(f.data, (porData.get(f.data) ?? 0) + 1)
    const coincidentes = [...porData.entries()].filter(([, n]) => n > 1)
    expect(coincidentes).toEqual([['2000-04-21', 2]])
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

  it('Sexta-feira Santa existe em TODOS os anos cobertos (1990-2050)', () => {
    // 🔴 Feriado nacional pela Lei 662/1949, e a ÚNICA data móvel da lista. Antes faltava em todos
    // os anos, e o cálculo a ignorava; o checklist abaixo falha se um ano ficar sem a dela.
    const anos = new Set(FERIADOS.filter((f) => f.nome === 'Sexta-feira Santa').map((f) => f.data.slice(0, 4)))
    for (let ano = 1990; ano <= 2050; ano++) {
      expect(anos.has(String(ano)), `sem Sexta-feira Santa em ${ano}`).toBe(true)
    }
  })

  it('a Sexta-feira Santa de cada ano cai numa sexta-feira', () => {
    const sextas = FERIADOS.filter((f) => f.nome === 'Sexta-feira Santa')
    expect(sextas.length).toBe(61)
    for (const f of sextas) {
      expect(new Date(`${f.data}T00:00:00Z`).getUTCDay(), f.data).toBe(5)
    }
  })

  it('Carnaval e Corpus Christi NÃO estão na lista — ponto facultativo, não feriado nacional', () => {
    const nomes = FERIADOS.map((f) => f.nome.toLowerCase())
    expect(nomes.some((n) => n.includes('carnaval'))).toBe(false)
    expect(nomes.some((n) => n.includes('corpus'))).toBe(false)
  })

  it('Finados não é feriado em todos os anos — 2003 não tem, 2004 tem', () => {
    // 🔴 Lacuna do arquivo de origem, reproduzida de propósito. Não "conserte" derivando a data:
    // o que a calculadora computa tem de ser o que a fonte homologada diz.
    expect(feriadosNacionais(2003, 2003)).not.toContain('2003-11-02')
    expect(feriadosNacionais(2004, 2004)).toContain('2004-11-02')
  })
})

describe('paridade com o JSON de origem', () => {
  /** O JSON entregue junto do produto — não é cópia de trabalho: é o dado versionado. */
  function lerFonte(): Array<{ data: string; nome: string }> {
    return JSON.parse(readFileSync(CAMINHO_FONTE, 'utf8')) as Array<{ data: string; nome: string }>
  }

  it('a transcrição é idêntica ao JSON, entrada por entrada', () => {
    const fonte = lerFonte().map((f) => `${f.data}|${f.nome}`).sort()
    const transcrito = FERIADOS.map((f) => `${f.data}|${f.nome}`).sort()
    expect(transcrito).toEqual(fonte)
  })

  it('a contagem bate com o JSON', () => {
    expect(FERIADOS).toHaveLength(lerFonte().length)
  })

  it('o JSON está no formato que o motor espera', () => {
    // A transcrição pode estar certa e o ARQUIVO errado — este teste cobre o lado que o outro não vê.
    for (const f of lerFonte()) {
      expect(f.data, JSON.stringify(f)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(typeof f.nome).toBe('string')
    }
  })
})
