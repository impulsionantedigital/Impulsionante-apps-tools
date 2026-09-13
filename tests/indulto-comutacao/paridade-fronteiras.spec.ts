// O portão de verdade do porte: fronteiras dia a dia + fuzz diferencial com semente fixa.
//
// 🔴 POR QUE ISTO EXISTE, e por que não basta o `paridade-engine.spec.ts`.
// Os 15 cenários de `cenarios.json` foram escritos para ilustrar o decreto, não
// para caçar erro de transcrição: eles não tocam os ramos de reincidência nem as
// fronteiras de igualdade. MEDIDO, mutando o `motor.ts` uma condição por vez: das
// 12 mutações testadas, SEIS passavam verdes só com os cenários — inclusive trocar
// `<=` por `<` num teto de pena e inverter 1/6 com 1/5 entre reincidente e não
// reincidente. Erros assim mudam um número que vai para petição.
//
// A varredura de fronteira é a peça que mais pega, e é o motivo de ela vir
// primeiro: igualdade exata (`D6 + G7 + G8 === N13`) quase nunca sai de gerador
// aleatório, mas é exatamente onde mora a diferença entre `<` e `<=`.
//
// 🔴 ORÇAMENTO DE TEMPO. Isto roda em todo commit; o alvo é a ordem de 0,7 s, e são
// ~76 mil execuções diferenciais. É por isso que `divergencia` (ver `_oraculo.ts`)
// compara campo a campo sem montar string, e que o `expect` só aparece no fim de
// cada laço, com a lista: um `expect` por campo custa ~30x o cálculo em si e
// inviabiliza a varredura dia a dia. Se precisar ampliar a cobertura, amplie os
// laços — não troque o modo de comparar.

import { describe, it, expect } from 'vitest'
import { calcular2025 } from '@/lib/indulto-comutacao/motores/2025/motor'
import type { Entrada } from '@/lib/indulto-comutacao/tipos'
import { divergencia } from './_oraculo'

const ANO = 360

/** Acumula as divergências de um laço; o teste falha uma vez, com a lista. */
function varre(casos: Iterable<{ rotulo: string; entrada: Entrada }>): string[] {
  const achados: string[] = []
  for (const { rotulo, entrada } of casos) {
    const d = divergencia(entrada, calcular2025)
    if (d) {
      achados.push(`${rotulo} → ${d}`)
      if (achados.length >= 10) break // 10 bastam para diagnosticar; o resto é ruído
    }
  }
  return achados
}

// ---------------------------------------------------------------------------
// Perfis: o que destrava cada inciso. Cruzados com as penas e com a reincidência.
// ---------------------------------------------------------------------------
const PERFIL_BASE: Entrada = {
  dataNascimento: '1990-01-01',
  dataUltimaPrisao: '2015-06-01',
  regime: 'FECHADO',
}
// Idoso ≥60 em 25/12/2025: liga `elegivelP` e com ele TODO ramo `esp`/§2º.
const IDOSO: Entrada = { dataNascimento: '1960-01-01' }

const PERFIS: Array<{ nome: string; campos: Entrada }> = [
  { nome: 'fechado simples', campos: {} },
  {
    // Destrava VII, VIII, IX, XII e XIII (substituição, livramento, egressos, estudo, curso).
    nome: 'aberto+substituídas+livramento+egressos+estudo+curso',
    campos: {
      regime: 'ABERTO',
      penasSubstituidas: 'SIM',
      livramentoCondicional: 'SIM',
      programaEgressos: 'HÁ MAIS DE 02 ANOS',
      estudo: 'MAIS DE 18 MESES NOS ÚLTIMOS 5 ANOS',
      concluiuCurso: 'SIM',
    },
  },
  {
    // Destrava VI, X e XI (semiaberto, monitoramento, saídas/trabalho externo).
    nome: 'semiaberto+monitoramento+saídas',
    campos: {
      regime: 'SEMIABERTO',
      monitoramentoSV56: 'HÁ MAIS DE 03 ANOS',
      saidasOuTrabalhoExterno: 'SIM',
      tempoSemiaberto: { anos: 12 },
      tempoSemiabertoAberto: { anos: 12 },
    },
  },
  {
    // §2º + aberto: é aqui que vive o `Rhalf` do Inciso VIII (o que DOBRA o teto)
    // e a fronteira `<=` do Art. 13 §4º.
    nome: '§2º idoso + aberto + substituídas',
    campos: { ...IDOSO, regime: 'ABERTO', penasSubstituidas: 'SIM', livramentoCondicional: 'SIM' },
  },
  {
    // 🔴 O único perfil que separa `gates5` de `gates4`: a colaboração premiada
    // impede o indulto (gates5) mas NÃO a comutação do Art. 13 (gates4). Sem ele,
    // trocar um pelo outro no `motor.ts` passa despercebido.
    nome: '§2º idoso + colaboração premiada',
    campos: { ...IDOSO, colaboracaoPremiada: 'SIM', regime: 'ABERTO', penasSubstituidas: 'SIM' },
  },
  {
    // Art. 10 e Art. 11 (II e III): mulher com filho menor de 16.
    nome: 'mulher com filho',
    campos: { sexo: 'FEMININO', filhoAte16: 'SIM' },
  },
]

// Penas escolhidas nos TETOS do decreto (4a, 8a, 12a) e em combinações que tornam
// as frações números inteiros de dias — é o que permite a igualdade exata cair
// dentro de uma varredura dia a dia.
const PENAS: Array<{ nome: string; campos: Entrada; total: number }> = [
  { nome: 'sem violência 8a (teto do I)', campos: { penaSemViolencia: { anos: 8 } }, total: 8 * ANO },
  { nome: 'sem violência 6a', campos: { penaSemViolencia: { anos: 6 } }, total: 6 * ANO },
  { nome: 'sem violência 12a (teto do II/XI/XII)', campos: { penaSemViolencia: { anos: 12 } }, total: 12 * ANO },
  { nome: 'com violência 4a (teto do III)', campos: { penaViolencia: { anos: 4 } }, total: 4 * ANO },
  {
    nome: 'impeditiva 3a + violência 2a + sem violência 5a',
    campos: { penaImpeditiva: { anos: 3 }, penaViolencia: { anos: 2 }, penaSemViolencia: { anos: 5 } },
    total: 10 * ANO,
  },
  {
    nome: 'quebrada: sem violência 7a5m13d + violência 1a2m',
    campos: { penaSemViolencia: { anos: 7, meses: 5, dias: 13 }, penaViolencia: { anos: 1, meses: 2 } },
    total: 7 * ANO + 5 * 30 + 13 + 1 * ANO + 2 * 30,
  },
]

describe('paridade nas fronteiras (dia a dia)', () => {
  // Um caso por dia de pena cumprida, para cada cruzamento que interessa. É a peça
  // que pega `<` vs `<=` e as trocas de fração entre reincidente e não reincidente.
  const CRUZAMENTOS: Array<[penas: number, perfil: number]> = [
    [0, 1], [0, 4], // sem violência 8a: teto do I + o par gates5/gates4
    [1, 1], [1, 3], // sem violência 6a: frações inteiras (1/6=360, 1/5=432, 1/4=540)
    [2, 2], [2, 1], // sem violência 12a: teto do II/XI/XII
    [3, 0],         // com violência 4a: teto do III
    [4, 1], [4, 3], // mistura com impeditiva: exercita D6 e o portão `hediondo`
    [5, 1],         // pena quebrada: frações não inteiras
    [1, 5], [0, 5], // mulher com filho: Art. 10 e Art. 11
  ]

  for (const [ip, iq] of CRUZAMENTOS) {
    const penas = PENAS[ip]
    const perfil = PERFIS[iq]
    for (const reincidente of ['NÃO', 'SIM']) {
      it(`${penas.nome} · ${perfil.nome} · reincidente=${reincidente}`, () => {
        const base: Entrada = { ...PERFIL_BASE, ...penas.campos, ...perfil.campos, reincidente }
        const achados = varre(
          (function* () {
            for (let d = 0; d <= penas.total + 60; d++) {
              yield { rotulo: `N13=${d}`, entrada: { ...base, penaCumpridaSEEU: { dias: d } } }
            }
          })(),
        )
        expect(achados, achados.join('\n')).toEqual([])
      })
    }
  }
})

describe('paridade nos demais limiares', () => {
  const BASE: Entrada = {
    ...PERFIL_BASE,
    ...IDOSO, // liga os ramos do §2º junto
    penaSemViolencia: { anos: 6 },
    penaCumpridaSEEU: { anos: 3 },
    reincidente: 'NÃO',
  }

  // Varre um campo numérico dia a dia numa janela, para os dois valores de reincidência.
  function limiar(nome: string, chave: string, extras: Entrada, de: number, ate: number) {
    it(`${nome} (${chave} de ${de} a ${ate})`, () => {
      const achados = varre(
        (function* () {
          for (const reincidente of ['NÃO', 'SIM']) {
            for (let v = de; v <= ate; v++) {
              yield {
                rotulo: `${chave}=${v} reinc=${reincidente}`,
                entrada: { ...BASE, ...extras, reincidente, [chave]: v },
              }
            }
          }
        })(),
      )
      expect(achados, achados.join('\n')).toEqual([])
    })
  }

  // Inciso IV: 5480 dias reais (não reinc) / 7306 (reinc), contados em CALENDÁRIO
  // somados à remição — a única regra do decreto no Sistema B.
  limiar('Inciso IV · remição + dias corridos (5480)', 'diasRemicao', { penaSemViolencia: { anos: 22 }, penaCumpridaSEEU: { anos: 17 } }, 5400, 5560)
  limiar('Inciso IV · remição + dias corridos (7306)', 'diasRemicao', { penaSemViolencia: { anos: 22 }, penaCumpridaSEEU: { anos: 22 } }, 7220, 7380)
  // Art. 12: a faixa dos R$ 20.000 e o zero, que vira 'a_analisar'.
  limiar('Art. 12 · teto de R$ 20.000', 'valorMulta', {}, 19980, 20020)
  limiar('Art. 12 · multa zerada vira a_analisar', 'valorMulta', {}, 0, 40)

  // Campos de TEMPO, varridos em dias: os limiares do VI (10a/15a) e do XI.
  function limiarTempo(nome: string, chave: string, extras: Entrada, de: number, ate: number) {
    it(`${nome} (${chave} de ${de} a ${ate} dias)`, () => {
      const achados = varre(
        (function* () {
          for (const reincidente of ['NÃO', 'SIM']) {
            for (let v = de; v <= ate; v++) {
              yield {
                rotulo: `${chave}=${v}d reinc=${reincidente}`,
                entrada: { ...BASE, ...extras, reincidente, [chave]: { dias: v } },
              }
            }
          }
        })(),
      )
      expect(achados, achados.join('\n')).toEqual([])
    })
  }

  limiarTempo('Inciso VI · 10 anos em semiaberto', 'tempoSemiaberto', { regime: 'SEMIABERTO', penaSemViolencia: { anos: 20 }, penaCumpridaSEEU: { anos: 16 } }, 3540, 3660)
  limiarTempo('Inciso VI · 15 anos em semiaberto', 'tempoSemiaberto', { regime: 'SEMIABERTO', penaSemViolencia: { anos: 20 }, penaCumpridaSEEU: { anos: 16 } }, 5340, 5460)
  limiarTempo('Inciso XI · tempo em semiaberto/aberto vs 1/3 e 1/2', 'tempoSemiabertoAberto', { regime: 'SEMIABERTO', saidasOuTrabalhoExterno: 'SIM', penaSemViolencia: { anos: 6 }, penaCumpridaSEEU: { anos: 3 } }, 660, 1140)
})

// ---------------------------------------------------------------------------
// Fuzz diferencial — SEMENTE FIXA.
// ---------------------------------------------------------------------------
// 🔴 O gerador tem semente constante, e não `Math.random()`: um teste que sorteia
// diferente a cada execução falha intermitente e, pior, falha com um caso que
// ninguém consegue reproduzir. Aqui a sequência é sempre a mesma; mudar a semente
// é mudar o teste, e deve ser deliberado.
//
// 🔴 E o gerador é mulberry32, de INTEIROS de 32 bits — não troque por um LCG
// escrito com `*` e `%` em `number`. Foi o que houve aqui antes: `s * 1103515245`
// passa de 2^53, os bits baixos se perdem em ponto flutuante, a sequência cai num
// ciclo curto de estados pares, e como cada caso consome ~55 sorteios os casos se
// repetem. MEDIDO: 1200 casos anunciados, 457 distintos (uniforme) e 421
// (enviesado). O teste passava verde anunciando uma cobertura que não tinha. Com o
// mulberry32, os 1200 são distintos nas duas rodadas.
//
// Cobre o que a varredura não cobre: combinações de flags entre si, e entrada
// SUJA (`undefined`, `''`, `'lixo'`, número em string) — que é o que chega de um
// `<input>` de verdade.
describe('fuzz diferencial (semente fixa)', () => {
  const SN = ['SIM', 'NÃO', 'NÃO SE APLICA', '', undefined, 'lixo']
  const CHAVES_SN = [
    'reincidente', 'colaboracaoPremiada', 'faccao', 'rdd', 'presidioFederal', 'condicoesGravesSaude',
    'gestante', 'filhoAte16', 'filhoDeficiencia', 'filhoDeficienciaCuidados', 'filhoDoencaCronica',
    'filhoDoencaCronicaCuidados', 'homemUnicoResponsavel', 'imprescindivelCrianca', 'avoNetos',
    'deficiencia', 'justicaRestaurativa', 'crimeContraCrianca', 'periodoLiberdade2Anos',
    'faltaGraveAno', 'faltaGraveExecucao', 'crimePatrimonio', 'reparouDano', 'valorBemSalarioMinimo',
    'hipossuficiente', 'saidasOuTrabalhoExterno', 'livramentoCondicional', 'penasSubstituidas',
    'condenacaoAberto', 'respondendoOutroCrimeViolento', 'concluiuCurso',
    'cumpriu23ImpeditivoDataFato', 'cumpriuFracaoViolenciaDataFato',
  ]

  function roda(nome: string, semente: number, casos: number, vies: boolean) {
    it(`${nome} · ${casos} casos`, () => {
      // mulberry32: estado de 32 bits, só aritmética INTEIRA (`Math.imul`, `>>> 0`).
      let s = semente >>> 0
      const rnd = () => {
        s = (s + 0x6d2b79f5) >>> 0
        let t = s
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
      const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]
      const tempo = () => ({ anos: Math.floor(rnd() * (vies ? 8 : 30)), meses: Math.floor(rnd() * 13), dias: Math.floor(rnd() * 31) })

      const achados = varre(
        (function* () {
          for (let n = 0; n < casos; n++) {
            const c: Record<string, unknown> = {}
            for (const k of CHAVES_SN) c[k] = pick(SN)
            if (vies) {
              // Sem viés, `preenche` quase não aparece em Art. 9º XI e Art. 11, I:
              // penas curtas, muito tempo cumprido e regime aberto os alcançam.
              c.saidasOuTrabalhoExterno = pick(['SIM', 'SIM', 'NÃO'])
              c.reincidente = pick(['SIM', 'SIM', 'NÃO', 'NÃO SE APLICA'])
              c.regime = pick(['FECHADO', 'SEMIABERTO', 'ABERTO', 'ABERTO', 'SEMIABERTO'])
              c.sexo = pick(['FEMININO', 'FEMININO', 'MASCULINO', undefined])
              c.penaImpeditiva = rnd() < 0.7 ? undefined : tempo()
              c.penaViolencia = rnd() < 0.6 ? undefined : tempo()
              c.penaSemViolencia = tempo()
            } else {
              c.regime = pick(['FECHADO', 'SEMIABERTO', 'ABERTO', 'aberto', undefined, 'x'])
              c.sexo = pick(['FEMININO', 'MASCULINO', 'feminino', undefined, ''])
              c.penaImpeditiva = rnd() < 0.25 ? undefined : tempo()
              c.penaViolencia = rnd() < 0.25 ? undefined : tempo()
              c.penaSemViolencia = rnd() < 0.25 ? undefined : tempo()
            }
            c.penaCumpridaSEEU = tempo()
            c.penaCumpridaNaoSEEU = rnd() < 0.5 ? undefined : tempo()
            c.tempoSemiaberto = tempo()
            c.tempoSemiabertoAberto = tempo()
            c.dataNascimento = pick(['1950-01-01', '1965-12-25', '1965-12-26', '1990-05-05', '2004-12-25', '2004-12-24', '2010-01-01', undefined, 'lixo'])
            c.dataUltimaPrisao = pick(['2000-01-01', '2010-06-30', '2024-12-25', undefined, 'lixo'])
            c.diasRemicao = pick([0, 100, 3000, 5480, 7306, undefined, 'x'])
            c.valorMulta = pick([0, 1, 20000, 20001, 99999, undefined, 'x'])
            c.programaEgressos = pick(['NÃO', 'HÁ MENOS DE 01 ANO', 'ENTRE 01 E 02 ANOS', 'HÁ MAIS DE 02 ANOS', undefined])
            c.monitoramentoSV56 = pick(['NÃO', 'HÁ MENOS DE 01 ANO E 06 MESES', 'ENTRE 01 ANO E 06 MESES E 03 ANOS', 'HÁ MAIS DE 03 ANOS', undefined])
            c.estudo = pick(['NÃO', 'MENOS DE 12 MESES', 'MAIS DE 12 MESES NOS ÚLTIMOS 3 ANOS', 'MAIS DE 18 MESES NOS ÚLTIMOS 5 ANOS', undefined])
            yield { rotulo: `#${n} ${JSON.stringify(c)}`, entrada: c as Entrada }
          }
        })(),
      )
      expect(achados, achados.join('\n')).toEqual([])
    })
  }

  roda('uniforme', 12345, 1200, false)
  roda('enviesado para os incisos raros', 987654321, 1200, true)
})
