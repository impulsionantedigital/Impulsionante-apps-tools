// tests/detracao/recolhimento-noturno/resumo-lista-feriados.spec.ts
//
// O Resumo precisa LISTAR os feriados computados, não só dizer quantos são. "5 dias — 120 horas"
// sozinho não permite conferir nada: o membro não tem como saber QUAIS cinco entraram no número
// dele. Com data, dia da semana e nome, ele confere contra o calendário — que é o propósito da
// calculadora ser auditável.
//
// 🔴 Este teste fixa o que o `<ul>` precisa ter, e não o texto exato: verifica que cada feriado
// computado vira uma linha com as TRÊS informações. Trocar a lista por uma contagem, ou perder o
// dia da semana, deixa isto vermelho.

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import Resumo from '@/app/(app)/ferramentas/detracao/[calculadora]/Resumo'
import { calcular } from '@/lib/detracao/recolhimento-noturno/motor'
import { segmentoParaRegra, segmentoFormularioEmBranco } from '@/lib/detracao/recolhimento-noturno/formulario'
import type { EntradaFormulario } from '@/lib/detracao/recolhimento-noturno/formulario'
import type { EntradaCalculo } from '@/lib/detracao/recolhimento-noturno/tipos'

function cenarioAnoInteiro(incluirFeriadosUteis: boolean) {
  const segmento = segmentoParaRegra({
    ...segmentoFormularioEmBranco(),
    dataInicio: '2025-01-01',
    dataFim: '2025-12-31',
    horaInicioNoturno: '22:00',
    horaFimNoturno: '06:00',
    diasSemanaNoturno: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    diasFolgaIntegral: ['SAT', 'SUN'],
    incluirFeriadosUteis,
  })
  const entrada: EntradaCalculo = { timezone: 'America/Sao_Paulo', segmentos: [segmento] }
  const formulario: EntradaFormulario = {
    timezone: 'America/Sao_Paulo',
    segmentos: [
      {
        dataInicio: '2025-01-01',
        dataFim: '2025-12-31',
        horaInicioNoturno: '22:00',
        horaFimNoturno: '06:00',
        diasSemanaNoturno: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
        diasFolgaIntegral: ['SAT', 'SUN'],
        feriadosIntegral: [],
        incluirFeriadosUteis,
      },
    ],
  }
  return { html: renderToStaticMarkup(createElement(Resumo as never, { entrada: formulario, resultado: calcular(entrada) } as never)), resultado: calcular(entrada) }
}

describe('Resumo — lista dos feriados considerados', () => {
  it('com o checkbox ligado, cada feriado computado aparece na lista', () => {
    const { html, resultado } = cenarioAnoInteiro(true)
    expect(resultado.feriadosConsiderados.length).toBeGreaterThan(0)
    expect(html).toContain('Feriados considerados no cálculo')
    for (const f of resultado.feriadosConsiderados) {
      expect(html, `feriado ${f.data} não apareceu`).toContain(f.nome)
    }
  })

  it('mostra dia/mês, dia da semana e nome de cada feriado', () => {
    const { html, resultado } = cenarioAnoInteiro(true)
    const natal = resultado.feriadosConsiderados.find((f) => f.nome === 'Natal')
    expect(natal).toBeDefined()
    // `2025-12-25` vira `25/12` na linha (o ano não se repete em cada item).
    expect(html).toContain('25/12')
    expect(html).toContain('quinta-feira')
  })

  it('as três informações de um feriado saem na MESMA linha do item', () => {
    const { html } = cenarioAnoInteiro(true)
    // Cada `<li>` tem de conter as três partes — não basta estarem em algum lugar da página.
    const itens = [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1])
    const comFeriado = itens.filter((i) => /Natal/.test(i))
    expect(comFeriado).toHaveLength(1)
    expect(comFeriado[0]).toMatch(/25\/12/)
    expect(comFeriado[0]).toMatch(/quinta-feira/)
    expect(comFeriado[0]).toMatch(/Natal/)
  })

  it('sem o checkbox, a seção da lista não aparece', () => {
    const { html } = cenarioAnoInteiro(false)
    expect(html).not.toContain('Feriados considerados no cálculo')
  })

  it('o total de feriados dito na seção bate com o da composição', () => {
    const { html, resultado } = cenarioAnoInteiro(true)
    expect(html).toContain(`Feriados considerados no cálculo (${resultado.feriadosConsiderados.length})`)
  })
})
