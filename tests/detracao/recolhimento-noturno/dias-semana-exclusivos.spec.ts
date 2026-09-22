// tests/detracao/recolhimento-noturno/dias-semana-exclusivos.spec.ts
//
// Dois pedidos da tela, os dois sobre o seletor de dias da semana:
//
//   (a) um dia não pode estar marcado nas DUAS linhas ao mesmo tempo;
//   (b) num cálculo novo, segunda a sexta já vêm marcadas como regra noturna, e sábado e domingo
//       como folga integral.
//
// 🔴 Por que (a) importa: as duas listas alimentam o MESMO motor com valores diferentes —
// `diasSemanaNoturno` vale H_NOTURNO, `diasFolgaIntegral` vale 24h. Com o mesmo dia nas duas, o
// motor resolvia por precedência (folga ganha), mas a TELA não dizia qual valeria, e o membro não
// tinha como conferir o próprio cálculo.
//
// 🔴 E o COMO importa: tentamos antes DESABILITAR o dia na outra linha, e a experiência ficou ruim —
// para marcar sábado na regra noturna era preciso antes desmarcá-lo da folga. O comportamento certo
// é todos os dias clicáveis, e marcar num lado TIRA o dia do outro sozinho. Estes testes fixam esse
// par: nenhum checkbox desabilitado, e a exclusão acontecendo na marcação.

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import CamposSegmento from '@/app/(app)/ferramentas/detracao/[calculadora]/CamposSegmento'
import { segmentoFormularioEmBranco } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-2/formulario'
import type { SegmentoFormulario } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-2/formulario'

const CALCULADORA = resolve(
  process.cwd(),
  'src/app/(app)/ferramentas/detracao/[calculadora]/Calculadora.tsx',
)

function html(segmento: Partial<SegmentoFormulario>): string {
  const s = { ...segmentoFormularioEmBranco(), ...segmento } as SegmentoFormulario
  return renderToStaticMarkup(createElement(CamposSegmento as never, { segmento: s, aoMudar: () => {} } as never))
}

/** Os checkboxes de cada seletor, na ordem em que aparecem (MON…SUN, duas vezes). */
function checkboxes(markup: string): Array<{ rotulo: string; checked: boolean; disabled: boolean }> {
  const pedacos = [...markup.matchAll(/<label[^>]*>([\s\S]*?)<\/label>/g)].map((m) => m[1])
  const dias = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
  const out: Array<{ rotulo: string; checked: boolean; disabled: boolean }> = []
  for (const p of pedacos) {
    const nome = dias.find((d) => p.includes(`>${d}</label>`) || p.endsWith(d))
    if (!nome) continue
    out.push({ rotulo: nome, checked: /checked/.test(p), disabled: /disabled/.test(p) })
  }
  return out
}

describe('(a) todos os dias ficam habilitados, e a exclusão acontece ao marcar', () => {
  it('NENHUM dia fica desabilitado — nem o que está na outra linha', () => {
    // 🔴 É o ponto do pedido: com segunda na folga integral, a segunda da regra noturna continua
    // CLICÁVEL. Clicá-la move o dia de lista, em vez de exigir desmarcar antes.
    const c = checkboxes(html({ diasSemanaNoturno: [], diasFolgaIntegral: ['MON'] }))
    expect(c.length).toBeGreaterThan(0)
    for (const item of c) expect(item.disabled, `${item.rotulo} desabilitado`).toBe(false)
  })

  it('o dia marcado na folga aparece marcado lá, e desmarcado na regra noturna', () => {
    const c = checkboxes(html({ diasSemanaNoturno: [], diasFolgaIntegral: ['MON'] }))
    const segundas = c.filter((x) => x.rotulo === 'Segunda')
    expect(segundas[0].checked).toBe(false) // regra noturna
    expect(segundas[1].checked).toBe(true) // folga integral
  })

  it('o mesmo dia repartido nas duas listas NUNCA aparece marcado duas vezes', () => {
    // A entrada que a tela produz não tem o dia nas duas — a exclusão é feita na marcação.
    const c = checkboxes(html({ diasSemanaNoturno: ['SAT'], diasFolgaIntegral: [] }))
    const sabados = c.filter((x) => x.rotulo === 'Sábado')
    expect(sabados[0].checked).toBe(true)
    expect(sabados[1].checked).toBe(false)
  })

  it('com os padrões (seg-sex e sáb/dom), nenhum dia está nos dois lados', () => {
    const c = checkboxes(html({ diasSemanaNoturno: ['MON', 'TUE', 'WED', 'THU', 'FRI'], diasFolgaIntegral: ['SAT', 'SUN'] }))
    const porDia = new Map<string, number>()
    for (const item of c) if (item.checked) porDia.set(item.rotulo, (porDia.get(item.rotulo) ?? 0) + 1)
    for (const [dia, n] of porDia) expect(n, `${dia} marcado ${n} vezes`).toBe(1)
  })
})

describe('(a2) a EXCLUSÃO está no código, e não só na aparência', () => {
  const fonte = readFileSync(
    resolve(process.cwd(), 'src/app/(app)/ferramentas/detracao/[calculadora]/CamposSegmento.tsx'),
    'utf8',
  )

  it('ao marcar, o dia é removido da OUTRA lista', () => {
    expect(fonte).toMatch(/function alternarDia/)
    expect(fonte).toMatch(/marcando \? segmento\[outro\]\.filter/)
  })

  it('ao DESmarcar, a outra lista não é tocada', () => {
    // 🔴 Desmarcar não pode ter efeito colateral na outra linha — seria surpresa pura. O ternário
    // tem de ter dois ramos: um que FILTRA o outro lado (ao marcar) e um que devolve o outro lado
    // INTACTO (ao desmarcar).
    const inicio = fonte.indexOf('function alternarDia')
    expect(inicio, 'alternarDia não existe no arquivo').toBeGreaterThan(-1)
    // Do começo de `alternarDia` até o fim do seu corpo (o `}` que fecha a função, na coluna 2).
    const trecho = fonte.slice(inicio, fonte.indexOf('\n  }', inicio) + 4)
    // 🔴 Comparação LITERAL, sem regex: `?` e `[` são metacaracteres, e a tentativa anterior de
    // escapá-los deu um padrão que não casava com o código — que estava CORRETO. Teste que falha por
    // regex mal escrita é pior do que teste ausente: ele acusa defeito onde não há.
    expect(trecho).toContain('segmento[outro].filter((d) => d !== dia) : segmento[outro]')
  })

  it('não há mais `disabled` nos checkboxes de dia', () => {
    // O comportamento anterior (desabilitar) foi abandonado; se voltar, isto acusa.
    expect(fonte).not.toMatch(/disabled=\{bloqueado\}/)
  })
})

describe('(b) os padrões do cálculo novo', () => {
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
    // que o membro escolheu, e o número mudaria ao reabrir.
    const fonte = readFileSync(CALCULADORA, 'utf8')
    const ramoVazio = fonte.slice(fonte.indexOf('if (!inicial'), fonte.indexOf('const s = inicial.segmentos[0]'))
    expect(ramoVazio).toMatch(/DIAS_PADRAO_NOTURNO/)
    const ramoSalvo = fonte.slice(fonte.indexOf('const s = inicial.segmentos[0]'))
    expect(ramoSalvo).not.toMatch(/DIAS_PADRAO_NOTURNO/)
  })
})
