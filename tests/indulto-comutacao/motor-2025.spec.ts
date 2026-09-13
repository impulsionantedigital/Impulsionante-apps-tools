// A REGRESSÃO CONTRA A PLANILHA: o motor de 2025 tem de devolver, cenário a
// cenário, o que `validacao/2025/planilha.xlsx` calcula.
//
// Por que existe, se `paridade-engine.spec.ts` já prova motor ≡ engine.js: a
// paridade não pega erro do PRÓPRIO engine.js — se ele transcreveu a planilha
// errado, o motor herdou o erro fielmente. Só a planilha pega isso.
//
// A planilha não é lida aqui. `validacao/oraculo.py` a avalia com a lib Python
// `formulas` (um segundo implementador, que não conhece o motor) e congela a saída
// em `validacao/2025/esperado.json`. Este teste só lê o congelado: roda sem Python
// e sem planilha.
//
// 🔴 Se este teste reprovar, NÃO edite o esperado.json. Ou o motor está errado, ou
// um cenário mudou sem o oráculo rodar de novo (há um teste abaixo só para isso),
// ou achou-se bug novo da planilha — e aí quem decide é o dono do produto.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { calcular2025 } from '@/lib/indulto-comutacao/motores/2025/motor'
import { VEREDITOS } from '@/lib/indulto-comutacao/tipos'
import { fmtDias } from '@/lib/indulto-comutacao/tempo'
import type { Entrada, ResultadoInciso } from '@/lib/indulto-comutacao/tipos'
import { RAIZ } from './_oraculo'

type Celula = string | number | boolean

type CenarioCongelado = {
  _nome: string
  entrada: Entrada & { _nome: string }
  /** Chave no vocabulário do harness (`art9_I.geral`, `art13.comutacaoTxt`…) → valor da aba RESULTADO. */
  planilha: Record<string, Celula>
  /** Células da aba CÁLCULO usadas só no caso do bug G149 — ver `comutacaoDoParagrafo4`. */
  apoio: Record<'P6' | 'P9' | 'P13' | 'P14' | 'P16' | 'P17' | 'F148' | 'F149', Celula>
}

const esperado = JSON.parse(readFileSync(RAIZ + 'validacao/2025/esperado.json', 'utf8')) as {
  celulas: Record<string, string>
  cenarios: CenarioCongelado[]
}
const cenariosFonte = JSON.parse(readFileSync(RAIZ + 'validacao/2025/cenarios.json', 'utf8')) as Array<
  Entrada & { _nome: string }
>

const PREENCHE = VEREDITOS.preenche
const NAO_PREENCHE = VEREDITOS.nao_preenche
/** O texto que a aba RESULTADO mostra (via IFERROR das colunas H e M) quando não há comutação. */
const SEM_COMUTACAO = 'Sem Comutação'
const COMUTACOES = ['art11_I', 'art11_II', 'art11_III', 'art13', 'art13_4'] as const

/**
 * ⚖️ TOLERÂNCIA DE 1 DIA nas durações — deliberada, e a mesma do `equivalentes()`
 * do harness original (validate-original.py).
 *
 * A planilha não devolve número nas células de quantum e pena após: devolve TEXTO
 * ("X anos Y meses Z dias"), montado com ROUNDDOWN nos anos e meses e ROUND nos
 * dias (Cálculo!H145:H149 e M145:M149). Esse arredondamento desloca até 1 dia, e
 * às vezes produz "30 dias" sem virar mês ("2 anos 7 meses 30 dias"). O motor
 * devolve o número cru. Por isso a comparação é EM DIAS, e aceita |Δ| ≤ 1.
 *
 * Não aumente este valor para um teste passar: diferença de 2 dias já não é
 * arredondamento, é regra diferente.
 */
const TOLERANCIA_DIAS = 1

/** "X anos Y meses Z dias" → dias (base 30/360). `null` se o texto não for duração. Porte do `dur_dias` do harness. */
function durDias(txt: Celula): number | null {
  const m = String(txt).trim().match(/^-?\s*(\d+)\s+anos?\s+(\d+)\s+meses?\s+(\d+)\s+dias?$/)
  if (!m) return null
  return Number(m[1]) * 360 + Number(m[2]) * 30 + Number(m[3])
}

function esperaDuracao(rotulo: string, planilha: Celula, motor: number | null | undefined) {
  const dp = durDias(planilha)
  expect(dp, `${rotulo}: a planilha deveria mostrar uma duração, mostrou ${JSON.stringify(planilha)}`).not.toBeNull()
  expect(typeof motor, `${rotulo}: o motor deveria devolver número, devolveu ${motor}`).toBe('number')
  const diff = Math.abs((dp as number) - (motor as number))
  expect(
    diff,
    `${rotulo}: planilha=${JSON.stringify(planilha)} (${dp} dias) motor=${fmtDias(motor)} (${motor} dias)`,
  ).toBeLessThanOrEqual(TOLERANCIA_DIAS)
}

/**
 * O quantum do §4º reconstruído a partir das bases que a PLANILHA avaliou
 * (Cálculo!P6, P13, P14, P16, P17), com a fórmula do G149 CORRIGIDA.
 *
 * G149 é, literalmente:
 *   =IF(F148="Preenche…", IF(P6=0, max(P13,P16)*(2/3), max(P14,P17)*(2/3)), "SEM COMUTAÇÃO")
 * (os IF(I20=2,…) internos têm os dois ramos idênticos). O bug é o F148: a condição
 * olha o Art. 13, não o §4º (F149). Só o F148→F149 muda; o resto é a fórmula dela.
 */
function comutacaoDoParagrafo4(apoio: CenarioCongelado['apoio']): number {
  const n = (c: Celula) => c as number
  const base = n(apoio.P6) === 0 ? Math.max(n(apoio.P13), n(apoio.P16)) : Math.max(n(apoio.P14), n(apoio.P17))
  return base * (2 / 3)
}

describe('motor de 2025 contra a planilha original (validacao/2025/esperado.json)', () => {
  it('o congelado está em dia com cenarios.json (senão: rode validacao/oraculo.py 2025)', () => {
    // Cenário acrescentado ou mexido sem rodar o oráculo seria comparado com a
    // planilha de OUTRA entrada — ou nem seria comparado.
    expect(esperado.cenarios.map((c) => c.entrada)).toEqual(cenariosFonte)
  })

  it('cobre todo dispositivo que o motor produz', () => {
    const ids = calcular2025(cenariosFonte[0]).incisos.map((i) => i.id)
    for (const id of ids) expect(esperado.celulas[`${id}.geral`], id).toBeDefined()
  })

  esperado.cenarios.forEach((cenario) => {
    describe(cenario._nome, () => {
      const obtido = calcular2025(cenario.entrada)
      const p = cenario.planilha
      const porId = new Map<string, ResultadoInciso>(obtido.incisos.map((i) => [i.id, i]))

      for (const inciso of obtido.incisos) {
        const ehComutacao = (COMUTACOES as readonly string[]).includes(inciso.id)

        it(`${inciso.id}: mesmo veredito da planilha`, () => {
          const cel = esperado.celulas[`${inciso.id}.geral`]
          expect(VEREDITOS[inciso.geral], `geral (${cel})`).toBe(p[`${inciso.id}.geral`])

          const chaveEsp = `${inciso.id}.especial`
          if (chaveEsp in p) {
            expect(VEREDITOS[inciso.especial], `especial (${esperado.celulas[chaveEsp]})`).toBe(p[chaveEsp])
          } else {
            // Art. 9º XII–XVI, Art. 10 e Art. 12: RESULTADO!E31:E43 é texto fixo
            // "Sem previsão no Decreto", sem fórmula. Comutação: a planilha não
            // tem coluna de regra especial — o §4º é um dispositivo à parte.
            expect(inciso.especial).toBe('sem_previsao')
          }
        })

        if (!ehComutacao) continue

        it(`${inciso.id}: mesma comutação e mesma pena após`, () => {
          const txtQ = p[`${inciso.id}.comutacaoTxt`]
          const txtA = p[`${inciso.id}.penaAposTxt`]
          const cQ = esperado.celulas[`${inciso.id}.comutacaoTxt`]
          const cA = esperado.celulas[`${inciso.id}.penaAposTxt`]

          if (inciso.id === 'art13_4') {
            const f148 = cenario.apoio.F148
            const f149 = cenario.apoio.F149
            // Confere que F149 é mesmo o veredito do §4º — a premissa do desvio abaixo.
            expect(f149).toBe(p['art13_4.geral'])

            // ⚠️ BUG G149, DESVIO DOCUMENTADO (lado 1, o que o harness original já
            // tratava). G149 condiciona o quantum ao F148 (Art. 13) em vez do F149
            // (§4º). Com o Art. 13 preenchendo e o §4º não, a planilha MOSTRA um
            // quantum de 2/3 para quem não tem direito a ele. O motor corrige: sem
            // requisito, sem comutação.
            if (f148 === PREENCHE && f149 === NAO_PREENCHE) {
              expect(durDias(txtQ), `${cQ}: esperava a planilha exibindo o valor indevido do G149`).not.toBeNull()
              expect(inciso.quantum).toBeNull()
              expect(inciso.penaApos).toBeNull()
              return
            }

            // ⚠️ BUG G149, lado 2 — o espelho do anterior, que nenhum dos 15 cenários
            // originais exercitava. Com o §4º preenchendo e o Art. 13 não (a fronteira
            // exata: o Art. 13 usa `<`, o §4º usa `<=`), a planilha ESCONDE o quantum
            // de quem tem direito e mostra "Sem Comutação". O motor mostra o valor; a
            // conferência é contra a própria fórmula do G149 com F148→F149, aplicada
            // às bases que a planilha avaliou.
            if (f148 === NAO_PREENCHE && f149 === PREENCHE) {
              expect(txtQ, cQ).toBe(SEM_COMUTACAO)
              expect(txtA, cA).toBe(SEM_COMUTACAO)
              const quantum = comutacaoDoParagrafo4(cenario.apoio)
              expect(inciso.quantum).toBeCloseTo(quantum, 9)
              // L149 = P9 - G149
              expect(inciso.penaApos).toBeCloseTo((cenario.apoio.P9 as number) - quantum, 9)
              return
            }
          }

          if (inciso.geral === 'preenche') {
            esperaDuracao(`quantum (${cQ})`, txtQ, inciso.quantum)
            esperaDuracao(`pena após (${cA})`, txtA, inciso.penaApos)
          } else {
            // ⚠️ BUG L145:L149. Sem requisito, G14x vira o texto "SEM COMUTAÇÃO" e
            // L14x = P9 - G14x dá #VALUE!. Na aba RESULTADO o IFERROR das colunas H e
            // M cobre o erro e escreve "Sem Comutação"; o motor devolve `null`
            // (ausência de valor). Os dois significam a mesma coisa.
            expect(txtQ, cQ).toBe(SEM_COMUTACAO)
            expect(txtA, cA).toBe(SEM_COMUTACAO)
            expect(inciso.quantum).toBeNull()
            expect(inciso.penaApos).toBeNull()
          }
        })
      }

      it('produz exatamente os dispositivos que a planilha avalia', () => {
        const daPlanilha = Object.keys(p)
          .filter((k) => k.endsWith('.geral'))
          .map((k) => k.slice(0, -'.geral'.length))
        expect([...porId.keys()].sort()).toEqual(daPlanilha.sort())
      })
    })
  })
})

// Os cenários POSICIONADOS: cada um existe para cair numa região que só a planilha
// pode julgar. Estes testes conferem que o cenário AINDA cai lá — que o esperado é
// o que motivou o cenário. Se um deles reprovar depois de alguém mexer na entrada,
// o cenário deixou de testar o que diz testar.
describe('cenários posicionados: continuam na região que justificou cada um', () => {
  const buscar = (prefixo: string) => {
    const c = esperado.cenarios.find((x) => x._nome.startsWith(prefixo))
    if (!c) throw new Error(`cenário ausente: ${prefixo}`)
    return c
  }

  it('1: justiça restaurativa (E51) é o único critério do §2º e muda o resultado', () => {
    const sim = buscar('Posicionado contra a planilha 1a')
    const nao = buscar('Posicionado contra a planilha 1b')
    const { justicaRestaurativa: _a, _nome: _b, ...restoSim } = sim.entrada
    const { justicaRestaurativa: _c, _nome: _d, ...restoNao } = nao.entrada
    expect(restoSim).toEqual(restoNao)
    expect([sim.entrada.justicaRestaurativa, nao.entrada.justicaRestaurativa]).toEqual(['SIM', 'NÃO'])

    // RESULTADO!E9 (= Cálculo!T75): preenche só com E51 = SIM.
    expect(sim.planilha['art9_I.especial']).toBe(PREENCHE)
    expect(nao.planilha['art9_I.especial']).toBe(NAO_PREENCHE)
    expect(sim.planilha['art9_I.geral']).toBe(NAO_PREENCHE)
  })

  it('2: Inciso VIII §2º — remanescente de 8 anos, entre o teto geral (6) e o dobrado (12)', () => {
    const c = buscar('Posicionado contra a planilha 2')
    // Cálculo!I96: N16 <= 6*360 (geral); Cálculo!R96: N16 <= 6*360*2 (especial).
    expect((c.apoio.P16 as number) > 6 * 360 && (c.apoio.P16 as number) <= 12 * 360).toBe(true)
    expect(c.planilha['art9_VIII.geral']).toBe(NAO_PREENCHE)
    // A planilha DOBRA o teto: o *2 do Rhalf vem dela, não do engine.js.
    expect(c.planilha['art9_VIII.especial']).toBe(PREENCHE)
  })

  it('3: Art. 11, III — cumprido entre 1/5 e 1/2 da pena não impeditiva', () => {
    const c = buscar('Posicionado contra a planilha 3')
    const cumprida = c.apoio.P13 as number
    const naoImpeditiva = (c.apoio.P9 as number) - (c.apoio.P6 as number)
    expect(cumprida > naoImpeditiva / 5 && cumprida < naoImpeditiva / 2).toBe(true)
    // Cálculo!L135: (D6+G8+G7) <= N13 — a planilha exige 1/5, como o engine.js.
    expect(c.planilha['art11_III.geral']).toBe(PREENCHE)
  })

  it('4: Art. 13 na fronteira exata D6+G7+G8 == N13', () => {
    const c = buscar('Posicionado contra a planilha 4')
    expect((c.apoio.P9 as number) / 5).toBe(c.apoio.P13)
    // Cálculo!H138 usa `<` (Art. 13 não preenche); Cálculo!H141 usa `<=` (§4º preenche).
    expect(c.planilha['art13.geral']).toBe(NAO_PREENCHE)
    expect(c.planilha['art13_4.geral']).toBe(PREENCHE)
  })
})
