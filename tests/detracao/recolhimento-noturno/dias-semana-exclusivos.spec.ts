// tests/detracao/recolhimento-noturno/dias-semana-exclusivos.spec.ts
//
// Dois pedidos da tela, os dois sobre o seletor de dias da semana:
//
//   (a) um dia não pode estar marcado nas DUAS linhas ao mesmo tempo;
//   (b) num cálculo novo, segunda a sexta já vêm marcadas como regra noturna, e sábado e domingo
//       como folga integral.
//
// 🔴 Por que (a) importa: as duas listas alimentam o MESMO motor com valores diferentes — `diasSemanaNoturno`
// vale H_NOTURNO, `diasFolgaIntegral` vale 24h. Com o mesmo dia nas duas, o motor resolvia por
// precedência (folga ganha), mas a TELA não dizia qual valeria, e o membro não tinha como conferir.
// Cada linha agora bloqueia os dias da outra.

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import CamposSegmento from '@/app/(app)/ferramentas/detracao/[calculadora]/CamposSegmento'
import { segmentoFormularioEmBranco } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-2/formulario'
import type { SegmentoFormulario } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-2/formulario'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CALCULADORA = resolve(
  process.cwd(),
  'src/app/(app)/ferramentas/detracao/[calculadora]/Calculadora.tsx',
)

function html(segmento: Partial<SegmentoFormulario>): string {
  const s = { ...segmentoFormularioEmBranco(), ...segmento } as SegmentoFormulario
  return renderToStaticMarkup(createElement(CamposSegmento as never, { segmento: s, aoMudar: () => {} } as never))
}

/** Os `<input type="checkbox">` de cada seletor, na ordem em que aparecem (MON…SUN, duas vezes). */
function checkboxes(markup: string): Array<{ rotulo: string; checked: boolean; disabled: boolean }> {
  const pedacos = [...markup.matchAll(/<label[^>]*>([\s\S]*?)<\/label>/g)].map((m) => m[1])
  const dias = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
  const out: Array<{ rotulo: string; checked: boolean; disabled: boolean }> = []
  for (const p of pedacos) {
    const nome = dias.find((d) => p.includes(`>${d}</label>`) || p.endsWith(d))
    if (!nome) continue
    out.push({
      rotulo: nome,
      checked: /checked/.test(p),
      disabled: /disabled/.test(p),
    })
  }
  return out
}

describe('(a) um dia não pode estar nas duas linhas', () => {
  it('com segunda na folga integral, segunda fica DESABILITADA na regra noturna', () => {
    const c = checkboxes(html({ diasSemanaNoturno: [], diasFolgaIntegral: ['MON'] }))
    const segundas = c.filter((x) => x.rotulo === 'Segunda')
    expect(segundas).toHaveLength(2)
    // A primeira (regra noturna) fica bloqueada; a segunda (folga) fica marcada e clicável.
    expect(segundas[0].disabled).toBe(true)
    expect(segundas[1].disabled).toBe(false)
    expect(segundas[1].checked).toBe(true)
  })

  it('o também vale: dia na regra noturna bloqueia a folga integral', () => {
    const c = checkboxes(html({ diasSemanaNoturno: ['SAT'], diasFolgaIntegral: [] }))
    const sabados = c.filter((x) => x.rotulo === 'Sábado')
    expect(sabados[0].disabled).toBe(false)
    expect(sabados[0].checked).toBe(true)
    expect(sabados[1].disabled).toBe(true)
  })

  it('com os padrões (seg-sex e sáb/dom), nenhum dia está nos dois lados', () => {
    // O arranjo padrão não tem sobreposição — é o que garante que o cálculo novo sai coerente.
    const c = checkboxes(html({ diasSemanaNoturno: ['MON', 'TUE', 'WED', 'THU', 'FRI'], diasFolgaIntegral: ['SAT', 'SUN'] }))
    expect(c.filter((x) => x.rotulo === 'Sábado')[1].disabled).toBe(false)
    expect(c.filter((x) => x.rotulo === 'Segunda')[0].disabled).toBe(false)
    // Nenhum dia marcado na linha de baixo está desabilitado na de baixo.
    for (const item of c) {
      if (item.checked) expect(item.disabled, `${item.rotulo} marcado e bloqueado`).toBe(false)
    }
  })

  it('um dia sem marcação em nenhum lado não fica bloqueado', () => {
    const c = checkboxes(html({ diasSemanaNoturno: [], diasFolgaIntegral: [] }))
    for (const item of c) expect(item.disabled).toBe(false)
  })
})

describe('(b) os padrões do cálculo novo', () => {
  // 🔴 Os padrões vivem na TELA (`Calculadora.tsx`), não no `emBranco()` da versão congelada: são
  // ponto de partida de preenchimento, não regra de cálculo. Estes testes leem a constante do fonte
  // para garantir que ela não mude sem alguém decidir.
  it('o `emBranco()` da versão continua vazio — o padrão é da tela', () => {
    const s = segmentoFormularioEmBranco()
    expect(s.diasSemanaNoturno).toEqual([])
    expect(s.diasFolgaIntegral).toEqual([])
  })

  it('a tela define segunda a sexta como regra noturna e sáb/dom como folga', () => {
    const fonte = readFileSync(CALCULADORA, 'utf8')
    expect(fonte).toMatch(/DIAS_PADRAO_NOTURNO[^=]*=\s*\[\s*'MON'[\s\S]*?'FRI'\s*\]/)
    expect(fonte).toMatch(/DIAS_PADRAO_FOLGA[^=]*=\s*\[\s*'SAT'[\s\S]*?'SUN'\s*\]/)
  })

  it('os padrões são aplicados SÓ no cálculo novo — nunca sobre um salvo', () => {
    // 🔴 Se o padrão fosse aplicado sobre a entrada de um cálculo salvo, ele sobrescreveria os dias
    // que o membro escolheu, e o número mudaria ao reabrir. O `entradaInicial` tem de aplicar os
    // padrões apenas no ramo sem `inicial`.
    const fonte = readFileSync(CALCULADORA, 'utf8')
    const ramoVazio = fonte.slice(fonte.indexOf('if (!inicial'), fonte.indexOf('const s = inicial.segmentos[0]'))
    expect(ramoVazio).toMatch(/DIAS_PADRAO_NOTURNO/)
    const ramoSalvo = fonte.slice(fonte.indexOf('const s = inicial.segmentos[0]'))
    expect(ramoSalvo).not.toMatch(/DIAS_PADRAO_NOTURNO/)
  })
})
