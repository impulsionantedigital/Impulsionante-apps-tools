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
import { createHash } from 'node:crypto'
import { calcular2025 } from '@/lib/indulto-comutacao/motores/2025/motor'
import { VEREDITOS } from '@/lib/indulto-comutacao/tipos'
import { dias, fmtDias } from '@/lib/indulto-comutacao/tempo'
import type { Entrada, ResultadoInciso, Tempo } from '@/lib/indulto-comutacao/tipos'
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
  /** sha256 do planilha.xlsx que o oráculo avaliou. */
  planilhaSha256: string
  celulas: Record<string, string>
  cenarios: CenarioCongelado[]
}

/**
 * Os sufixos que este teste sabe comparar. Chave da planilha com sufixo fora desta
 * lista seria ignorada EM SILÊNCIO pelo laço de comparação — por isso há um teste
 * que reprova se aparecer uma.
 */
const SUFIXOS_COMPARADOS = new Set(['geral', 'especial', 'comutacaoTxt', 'penaAposTxt'])
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

  it('o congelado é da planilha que está na árvore (senão: rode validacao/oraculo.py 2025)', () => {
    // Planilha trocada sem rodar o oráculo deixaria este teste comparando o motor
    // com a saída de OUTRA planilha.
    const sha = createHash('sha256').update(readFileSync(RAIZ + 'validacao/2025/planilha.xlsx')).digest('hex')
    expect(
      esperado.planilhaSha256,
      'validacao/2025/planilha.xlsx não é a planilha que gerou o esperado.json. Rode ' +
        '`python validacao/oraculo.py 2025` e revise o diff do esperado.json antes de commitar.',
    ).toBe(sha)
  })

  it('toda chave que o oráculo exporta é comparada por este teste', () => {
    const chaves = new Set<string>(Object.keys(esperado.celulas))
    for (const c of esperado.cenarios) for (const k of Object.keys(c.planilha)) chaves.add(k)
    for (const chave of chaves) {
      const ponto = chave.indexOf('.')
      const sufixo = ponto > 0 ? chave.slice(ponto + 1) : '<sem sufixo>'
      expect(
        SUFIXOS_COMPARADOS.has(sufixo),
        `a chave "${chave}" do esperado.json tem sufixo "${sufixo}", que motor-2025.spec.ts não compara — ` +
          'ela seria ignorada em silêncio. Se o OUT_MAP do oraculo.py ganhou uma saída nova, ensine a ' +
          'comparação a este teste e só então acrescente o sufixo a SUFIXOS_COMPARADOS.',
      ).toBe(true)
    }
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
              expect(durDias(txtA), `${cA}: esperava a planilha exibindo a pena após indevida do L149`).not.toBeNull()
              expect(inciso.quantum).toBeNull()
              expect(inciso.penaApos).toBeNull()
              return
            }

            // ⚠️ BUG G149, lado 2 — o espelho do anterior, que nenhum dos 15 cenários
            // originais exercitava. É CONSEQUÊNCIA de outro ponto da planilha: o `<`
            // estrito do Art. 13 (Cálculo!H138), contra o `<=` do §4º (H141). F148 e
            // F149 só divergem neste sentido quando a pena cumprida é EXATAMENTE a
            // fração — o Art. 13 nega, o §4º concede. Esse `<` é fiel à planilha e
            // provável erro dela (o texto do Art. 13 fala em "tenham cumprido um quinto
            // da pena"); o motor o preserva e o exibe ao advogado em "Pontos a validar
            // juridicamente". Sobre esse resultado, o G149 ainda ESCONDE o quantum do
            // §4º e mostra "Sem Comutação". O motor mostra o valor; a conferência é
            // contra a própria fórmula do G149 com F148→F149, aplicada às bases que a
            // planilha avaliou.
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
  // Com os dois-pontos: sem eles, "3" casaria também com "3b".
  const buscar = (id: string) => {
    const prefixo = `Posicionado contra a planilha ${id}:`
    const c = esperado.cenarios.find((x) => x._nome.startsWith(prefixo))
    if (!c) throw new Error(`cenário ausente: ${prefixo}`)
    return c
  }

  /**
   * Os tempos da COLUNA N, que é a que as fórmulas de requisito usam (I96, L135,
   * H138…), reconstruídos da entrada pela fórmula de N (N6 = M6+(L6*30)+(K6*360);
   * N9 = SUM(N6:N8); N13 = SUM(N10:N12); N16 = N9-N13).
   *
   * O esperado.json guarda a coluna P (é dela que G14x e L14x partem). Nesta
   * planilha N e P têm fórmulas idênticas linha a linha — a remição (I25) não entra
   * em nenhuma das duas; só no inciso IV —, mas nada garante que continue assim.
   * Por isso a igualdade N = P é AFIRMADA aqui, contra os valores que a planilha
   * avaliou, e não suposta.
   */
  const colunaN = (c: CenarioCongelado) => {
    const e = c.entrada
    const t = (k: string) => dias(e[k] as Tempo | undefined)
    const N6 = t('penaImpeditiva')
    const N9 = N6 + t('penaViolencia') + t('penaSemViolencia')
    const N13 = t('penaCumpridaSEEU') + t('penaCumpridaNaoSEEU')
    const N16 = N9 - N13
    expect({ N6, N9, N13, N16 }, `${c._nome}: N ≠ P`).toEqual({
      N6: c.apoio.P6,
      N9: c.apoio.P9,
      N13: c.apoio.P13,
      N16: c.apoio.P16,
    })
    return { N6, N9, N13, N16 }
  }

  it('1: justiça restaurativa (E51) é o único critério do §2º e muda o resultado', () => {
    const sim = buscar('1a')
    const nao = buscar('1b')
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
    const c = buscar('2')
    const { N16 } = colunaN(c)
    // Cálculo!I96: N16 <= 6*360 (geral); Cálculo!R96: N16 <= 6*360*2 (especial).
    expect(N16 > 6 * 360 && N16 <= 12 * 360).toBe(true)
    expect(c.planilha['art9_VIII.geral']).toBe(NAO_PREENCHE)
    // A planilha DOBRA o teto: o *2 do Rhalf vem dela, não do engine.js.
    expect(c.planilha['art9_VIII.especial']).toBe(PREENCHE)
  })

  it('3: Art. 11, III — cumprido entre 1/5 e 1/2 da pena não impeditiva', () => {
    const c = buscar('3')
    const { N6, N9, N13 } = colunaN(c)
    const naoImpeditiva = N9 - N6
    expect(N13 > naoImpeditiva / 5 && N13 < naoImpeditiva / 2).toBe(true)
    // Cálculo!L135: (D6+G8+G7) <= N13 — a planilha exige 1/5, como o engine.js.
    expect(c.planilha['art11_III.geral']).toBe(PREENCHE)
  })

  it('3b: Art. 11, III — cumprido entre 1/5 e 1/4, o que separa 1/5 de 1/4 e de 1/2', () => {
    // O cenário 3 (600 dias de 2160) fica acima de 1/4 (540): uma regressão do
    // Art. 11, III para 1/4 passaria nele. Este fica abaixo.
    const c = buscar('3b')
    const { N6, N9, N13 } = colunaN(c)
    const naoImpeditiva = N9 - N6
    expect(N13 > naoImpeditiva / 5 && N13 < naoImpeditiva / 4).toBe(true)
    expect(c.entrada.reincidente).toBe('SIM')
    expect(c.planilha['art11_III.geral']).toBe(PREENCHE)
    // Controle na mesma planilha: o Art. 13 do reincidente exige 1/4 e não preenche.
    expect(c.planilha['art13.geral']).toBe(NAO_PREENCHE)
  })

  it('4: Art. 13 na fronteira exata D6+G7+G8 == N13', () => {
    const c = buscar('4')
    const { N6, N9, N13 } = colunaN(c)
    expect(N6).toBe(0)
    expect(N9 / 5).toBe(N13)
    // Cálculo!H138 usa `<` (Art. 13 não preenche); Cálculo!H141 usa `<=` (§4º preenche).
    // O `<` é fiel à planilha e PROVÁVEL ERRO dela — o texto do Art. 13 inclui quem
    // cumpriu exatamente a fração. Preservado no motor e exibido ao advogado; este
    // guarda só confirma que o cenário continua na fronteira, não que o `<` é certo.
    expect(c.planilha['art13.geral']).toBe(NAO_PREENCHE)
    expect(c.planilha['art13_4.geral']).toBe(PREENCHE)
  })
})
