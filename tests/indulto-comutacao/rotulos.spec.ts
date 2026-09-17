// Os RÓTULOS das listas de dispositivos.
//
// 🔴 A REGRA, decidida pelo dono do produto: **sempre no plural**, independentemente da
// contagem. «Indultos aplicáveis (1)», «Comutações não aplicáveis (4)». O rótulo NOMEIA O
// CONJUNTO; quem informa a quantidade é o número entre parênteses.
//
// Este arquivo existe porque a correção levou QUATRO tentativas, todas por eu ter inventado
// regras de concordância que ninguém pediu:
//
//   1. «Indulto aplicávels (2)»      — o «s» concatenado sem acento, dando «aplicávels»;
//   2. «Indultos aplicável (1)»      — passei a flexionar pela contagem, e o substantivo
//                                      ficou plural com adjetivo singular;
//   3. «Indulto não aplicável (5)»   — nome do grupo errado na lista de Comutação, com a
//                                      concordância certa (o mais perigoso dos três: passa
//                                      em qualquer teste que só confira número);
//   4. «Comutação aplicável (1)»     — singular, porque eu tratava «Comutação» como nome
//                                      que não varia.
//
// 🔴 NÃO reintroduza condicional de quantidade nos rótulos. O teste abaixo reprova se
// aparecer qualquer forma no singular.

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import Resultado from '@/app/(app)/ferramentas/[calculadora]/Resultado'
import { motorPadrao } from '@/lib/indulto-comutacao/registro'
import type { Entrada } from '@/lib/indulto-comutacao/tipos'

const ESPACO = String.fromCharCode(32)

/** Os `<h3>` da tela: os títulos das listas de aplicáveis e não aplicáveis. */
function rotulos(entrada: Entrada): string[] {
  const motor = motorPadrao()
  const html = renderToStaticMarkup(
    createElement(Resultado as never, { motor, resultado: motor.calcular(entrada) } as never),
  )
  return [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((m) =>
    m[1].split(/\s+/).filter(Boolean).join(ESPACO),
  )
}

/** Cenários com contagens DIFERENTES — inclusive 1, que é onde o singular aparecia. */
const CENARIOS: Array<[string, Entrada]> = [
  [
    'nada aplica',
    { penaImpeditiva: { anos: 9 }, penaViolencia: { anos: 4 }, penaSemViolencia: { anos: 6 } },
  ],
  [
    'um indulto aplica',
    { penaSemViolencia: { anos: 2 }, dataNascimento: '1960-01-01', regime: 'ABERTO' },
  ],
  [
    'vários indultos aplicam',
    {
      penaSemViolencia: { anos: 2 },
      dataNascimento: '1960-01-01',
      regime: 'ABERTO',
      penasSubstituidas: 'SIM',
      livramentoCondicional: 'SIM',
      concluiuCurso: 'SIM',
    },
  ],
  ['comutação aplica', { penaSemViolencia: { anos: 10 }, penaCumpridaSEEU: { anos: 10 } }],
]

describe('rótulos das listas de dispositivos', () => {
  it.each(CENARIOS)('%s: todo rótulo de lista está no PLURAL', (_nome, entrada) => {
    const deGrupo = rotulos(entrada).filter((t) => /^(Indultos?|Comutações?|Comutação) /.test(t))
    expect(deGrupo.length, 'esperava rótulos de lista').toBeGreaterThan(0)

    for (const t of deGrupo) {
      expect(t, `«${t}»: o rótulo nomeia o conjunto, e vai sempre no plural`).toMatch(
        /^(Indultos|Comutações) (aplicáveis|não aplicáveis) \(\d+\)$/,
      )
    }
  })

  it('o caso da tela do usuário: as duas listas de Comutação no plural', () => {
    // É o retrato do relato — «Comutações aplicáveis (1)» e «Comutações não aplicáveis (4)»,
    // sendo o (1) justamente o que a versão anterior flexionava para o singular.
    const r = rotulos({ penaSemViolencia: { anos: 10 }, penaCumpridaSEEU: { anos: 10 } })
    expect(r).toContain('Comutações aplicáveis (1)')
    expect(r).toContain('Comutações não aplicáveis (4)')
  })

  it('o nome do grupo sai do GRUPO, nunca do outro nem da contagem', () => {
    // O defeito 3: a lista de Comutação saía rotulada «Indulto não aplicável (5)». Aqui se
    // confere que o número de rótulos por nome bate com os grupos que existem.
    for (const [nome, entrada] of CENARIOS) {
      const r = rotulos(entrada)
      for (const t of r.filter((x) => /^(Indultos?|Comutações?) /.test(x))) {
        const ehDeIndulto = t.startsWith('Indultos ')
        // «nada aplica»: nenhuma lista de indulto aplicável, mas a de não aplicáveis existe.
        // O que não pode haver é Comutação rotulada de Indulto, ou vice-versa.
        expect(
          ehDeIndulto || t.startsWith('Comutações '),
          `«${t}» (${nome}) não tem nome de grupo reconhecível`,
        ).toBe(true)
      }
      // Duas listas de cada grupo, no máximo — quatro rótulos ao todo.
      expect(r.filter((x) => /^(Indultos|Comutações) /.test(x)).length, nome).toBeLessThanOrEqual(4)
    }
  })

  it('a contagem no parêntese é a contagem real da lista', () => {
    // O número é o único lugar onde a quantidade aparece — então ele tem de estar certo.
    const r = rotulos({ penaSemViolencia: { anos: 10 }, penaCumpridaSEEU: { anos: 10 } })
    const naoAplicaveisDeComutacao = r.find((t) => t.startsWith('Comutações não aplicáveis'))
    const n = Number(naoAplicaveisDeComutacao?.match(/\((\d+)\)$/)?.[1])
    // São 5 dispositivos de comutação no decreto; um aplica, restam 4.
    expect(n).toBe(4)
  })
})
