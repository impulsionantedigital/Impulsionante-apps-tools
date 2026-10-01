// Comportamento de ABERTURA das seções do questionário da calculadora.
//
// 🔴 O que este arquivo protege: as seções NÃO se comportam como acordeão. Uma não fecha a
// outra, e todas nascem fechadas menos a primeira. Já houve uma regra "só uma aberta", e ela
// obrigava quem preenche a reencontrar e reabrir a seção de cima ao conferir um valor.
//
// COMO ESTE TESTE FALA DO COMPONENTE, sem instalar jsdom/@testing-library (a suíte roda em
// `environment: 'node'`, e mudar o `package.json` do produto por causa de um teste é caro):
//
//  1. As DUAS decisões do acordeão vivem em funções puras EXPORTADAS pelo próprio componente
//     (`secoesIniciaisAbertas` e `alternarSecao`), e o componente as usa. O teste chama as
//     mesmas funções — não uma cópia da regra. Reimplementar a regra aqui foi tentado e
//     descartado na prática: a cópia PASSAVA com o acordeão de volta no componente.
//
//  2. O estado INICIAL é conferido na árvore realmente renderizada (`react-dom/server`), para
//     que "a primeira nasce aberta e o resto fechado" não seja só a opinião da função pura:
//     o `aria-expanded` do HTML tem de bater com ela.
//
// O clique em si não é simulável aqui — sem DOM, um handler chamado por fora do React não
// atualiza o estado da instância (a closure fica presa ao render em que foi criada). Por isso
// a regra de clique é exercitada na função exportada, que é exatamente a que o `onClick`
// chama: `setAbertas((atual) => alternarSecao(atual, id))`.
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { QUESTIONARIO_2024 } from '@/lib/indulto-comutacao/motores/2024/questionario'
import { QUESTIONARIO_2025 } from '@/lib/indulto-comutacao/motores/2025/questionario'
import { entradaInicial } from '@/app/(app)/ferramentas/[calculadora]/Calculadora'
import Questionario, {
  alternarSecao,
  secoesIniciaisAbertas,
} from '@/app/(app)/ferramentas/[calculadora]/Questionario'
import { motorPorId } from '@/lib/indulto-comutacao/registro'
import type { Secao } from '@/lib/indulto-comutacao/tipos'

/** Estados de abertura, em ordem, lidos do HTML renderizado. */
function estadosDe(html: string): boolean[] {
  return [...html.matchAll(/aria-expanded="(true|false)"/g)].map((m) => m[1] === 'true')
}

function corposDe(html: string): string[] {
  return [...html.matchAll(/id="secao-([^"]+)-conteudo"/g)].map((m) => m[1])
}

function renderizar(secoes: Secao[], decretoId: string): string {
  const motor = motorPorId(decretoId)!
  return renderToStaticMarkup(
    createElement(Questionario, {
      secoes,
      entrada: entradaInicial(motor),
      aoMudar: () => {},
    }),
  )
}

// O id do decreto no registro tem o formato `indulto-comutacao-<ano>` (ver
// `tests/indulto-comutacao/registro.spec.ts`, que afirma esse padrão).
describe.each([
  ['2024', QUESTIONARIO_2024, 'indulto-comutacao-2024'],
  ['2025', QUESTIONARIO_2025, 'indulto-comutacao-2025'],
])('questionário %s — abertura das seções', (_ano, secoes, decretoId) => {
  it('nasce com TODAS as seções fechadas, menos a primeira', () => {
    const abertas = secoesIniciaisAbertas(secoes)

    expect(secoes.length).toBeGreaterThan(1)
    expect(abertas.size).toBe(1)
    expect(abertas.has(secoes[0].id)).toBe(true)
  })

  it('o HTML renderizado confirma: só a primeira com aria-expanded="true"', () => {
    const estados = estadosDe(renderizar(secoes, decretoId))

    // Sanidade: uma entrada por seção. Se isto falhar, a extração quebrou, não o componente.
    expect(estados).toHaveLength(secoes.length)
    expect(estados[0]).toBe(true)
    expect(estados.slice(1).every((aberta) => aberta === false)).toBe(true)
    expect(estados.filter(Boolean)).toHaveLength(1)
  })

  it('monta o corpo SÓ da primeira seção na abertura', () => {
    expect(corposDe(renderizar(secoes, decretoId))).toEqual([secoes[0].id])
  })

  it('o botão de cada seção é um controle expansível de verdade', () => {
    const html = renderizar(secoes, decretoId)

    // `aria-controls` liga o cabeçalho ao painel; sem ele o título não aponta para nada.
    for (const secao of secoes) {
      expect(html).toContain(`aria-controls="secao-${secao.id}-conteudo"`)
      expect(html).toContain(`id="secao-${secao.id}-titulo"`)
    }
  })

  it('abrir a ÚLTIMA seção não fecha a primeira — não é acordeão', () => {
    // A regressão que este caso pega: se `alternarSecao` voltasse a devolver `new Set([id])`
    // ao abrir (o comportamento de acordeão), a primeira seção sairia do conjunto e o
    // `size` abaixo seria 1, não 2.
    const depois = alternarSecao(secoesIniciaisAbertas(secoes), secoes[secoes.length - 1].id)

    expect(depois.has(secoes[0].id)).toBe(true)
    expect(depois.has(secoes[secoes.length - 1].id)).toBe(true)
    expect(depois.size).toBe(2)
  })

  it('fechar uma seção não mexe nas outras', () => {
    const idUltima = secoes[secoes.length - 1].id
    const aberta = alternarSecao(secoesIniciaisAbertas(secoes), idUltima)
    const fechada = alternarSecao(aberta, idUltima)

    expect(fechada.has(idUltima)).toBe(false)
    expect(fechada.has(secoes[0].id)).toBe(true)
    expect(fechada.size).toBe(1)
  })

  it('abrir várias seções acumula, sem teto', () => {
    // O produto permite quantas abertas a pessoa quiser; não há "máximo de uma".
    // Parte do conjunto VAZIO, e não do inicial: a primeira seção já nasce aberta, e passar
    // `alternarSecao` nela de novo a FECHARIA (o toggle é simétrico) — daria 11, não 12.
    let abertas: Set<string> = new Set()
    for (const secao of secoes) abertas = alternarSecao(abertas, secao.id)

    expect(abertas.size).toBe(secoes.length)
  })
})
