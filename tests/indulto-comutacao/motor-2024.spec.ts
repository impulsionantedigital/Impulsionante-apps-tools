// A REGRESSÃO CONTRA A PLANILHA: o motor de 2024 tem de devolver, cenário a
// cenário, o que `validacao/2024/planilha.xlsx` (a versão COMERCIAL) calcula.
//
// Diferente de 2025, aqui esta é a ÚNICA camada de prova: não existe engine.js
// do Decreto 12.338/2024, então não há teste de paridade. Em compensação é a
// camada forte — a que pega erro de transcrição.
//
// A planilha não é lida aqui. `validacao/oraculo.py 2024` a avalia com a lib
// Python `formulas` e congela a saída em `validacao/2024/esperado.json`. Este
// teste só lê o congelado: roda sem Python e sem planilha.
//
// 🔴 Se este teste reprovar, NÃO edite o esperado.json. Ou o motor está errado, ou
// um cenário mudou sem o oráculo rodar de novo (há um teste abaixo só para isso),
// ou achou-se bug novo da planilha — e aí quem decide é o dono do produto.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { calcular2024 } from '@/lib/indulto-comutacao/motores/2024/motor'
import { VEREDITOS } from '@/lib/indulto-comutacao/tipos'
import { dias } from '@/lib/indulto-comutacao/tempo'
import type { Entrada, Tempo } from '@/lib/indulto-comutacao/tipos'
import { RAIZ } from './_oraculo'

type Celula = string | number | boolean

type CenarioCongelado = {
  _nome: string
  entrada: Entrada & { _nome: string }
  planilha: Record<string, Celula>
}

const CAMINHO_CONGELADO = RAIZ + 'validacao/2024/esperado.json'
const CAMINHO_PLANILHA = RAIZ + 'validacao/2024/planilha.xlsx'
const CAMINHO_CENARIOS = RAIZ + 'validacao/2024/cenarios.json'

const esperado = JSON.parse(readFileSync(CAMINHO_CONGELADO, 'utf8')) as {
  planilhaSha256: string
  celulas: Record<string, string>
  cenarios: CenarioCongelado[]
}

const cenariosFonte = JSON.parse(readFileSync(CAMINHO_CENARIOS, 'utf8')) as Array<
  Entrada & { _nome: string }
>

describe('o congelado é confiável', () => {
  it('é da planilha que está na árvore', () => {
    const sha = createHash('sha256').update(readFileSync(CAMINHO_PLANILHA)).digest('hex')
    expect(
      sha,
      'A planilha mudou desde o último `python validacao/oraculo.py 2024`. Rode o oráculo de novo.',
    ).toBe(esperado.planilhaSha256)
  })

  it('está em dia com cenarios.json', () => {
    expect(
      esperado.cenarios.map((c) => c._nome),
      'cenarios.json mudou sem o oráculo rodar de novo.',
    ).toEqual(cenariosFonte.map((c) => c._nome))
  })

  it('não tem célula de apoio — 2024 não tem o bug G149 de 2025', () => {
    expect(Object.keys(esperado).includes('celulasApoio')).toBe(false)
  })
})

describe('resumo × planilha', () => {
  // A planilha devolve o resumo em DIAS nas colunas M/D-H da aba Cálculo, mas a
  // aba Resultado só mostra texto. Por isso o resumo é conferido pelas próprias
  // entradas do cenário: base 30/360, as mesmas contas de Cálculo!M6..M17.
  const emDias = (t: unknown) => dias(t as Tempo | null | undefined)

  it.each(esperado.cenarios.map((c) => [c._nome, c] as const))('%s', (_nome, cenario) => {
    const r = calcular2024(cenario.entrada)
    const imp = emDias(cenario.entrada.penaImpeditiva)
    const vio = emDias(cenario.entrada.penaViolencia)
    const sem = emDias(cenario.entrada.penaSemViolencia)
    const cumprido =
      emDias(cenario.entrada.penaCumpridaSEEU) + emDias(cenario.entrada.penaCumpridaNaoSEEU)
    const doisTercos = (imp * 2) / 3

    expect(r.resumo.totalImposto, 'M9').toBe(imp + vio + sem)
    expect(r.resumo.totalCumprido, 'M13').toBe(cumprido)
    expect(r.resumo.penaCumpridaImpeditivos, 'M15').toBe(
      cumprido < doisTercos ? cumprido : doisTercos,
    )
    expect(r.resumo.remanescente, 'M16').toBe(imp + vio + sem - cumprido)
    expect(r.resumo.fracoes.doisTercosImpeditivos, 'D6').toBeCloseTo(doisTercos, 6)
    expect(r.resumo.fracoes.umQuinto, 'G7+G8').toBeCloseTo((vio + sem) / 5, 6)
    expect(r.resumo.fracoes.umQuarto, 'E7+E8').toBeCloseTo((vio + sem) / 4, 6)
    expect(r.resumo.fracoes.umTerco, 'F7+F8').toBeCloseTo((vio + sem) / 3, 6)
    expect(r.resumo.fracoes.metade, 'H7+H8').toBeCloseTo((vio + sem) / 2, 6)
  })
})

const PREENCHE = VEREDITOS.preenche
const NAO_PREENCHE = VEREDITOS.nao_preenche
const SEM_PREVISAO = VEREDITOS.sem_previsao
const A_ANALISAR = VEREDITOS.a_analisar

/** Os sufixos que este teste sabe comparar. Um sufixo fora desta lista seria
 *  ignorado EM SILÊNCIO pelo laço — por isso há um teste que reprova se aparecer. */
const SUFIXOS_COMPARADOS = new Set(['geral', 'especial', 'comutacaoTxt'])

describe('o congelado não traz sufixo que este teste ignoraria', () => {
  it('só usa geral, especial e comutacaoTxt', () => {
    const sufixos = new Set(
      Object.keys(esperado.cenarios[0].planilha).map((k) => k.split('.')[1]),
    )
    expect([...sufixos].filter((s) => !SUFIXOS_COMPARADOS.has(s))).toEqual([])
  })
})

describe('vereditos de indulto × planilha', () => {
  const INDULTO = [
    'art9_I', 'art9_II', 'art9_III', 'art9_IV', 'art9_V', 'art9_VI',
    'art9_VII', 'art9_VIII', 'art9_IX', 'art9_X', 'art9_XI', 'art9_XII',
    'art9_XIII', 'art9_XIV', 'art9_XV', 'art9_XVI', 'art10', 'art12',
  ] as const

  it.each(esperado.cenarios.map((c) => [c._nome, c] as const))('%s', (_nome, cenario) => {
    const r = calcular2024(cenario.entrada)
    const porId = new Map(r.incisos.map((i) => [i.id, i]))

    for (const id of INDULTO) {
      const obtido = porId.get(id)
      expect(obtido, `o motor não devolveu ${id}`).toBeDefined()

      const geralPlanilha = String(cenario.planilha[`${id}.geral`])
      expect(VEREDITOS[obtido!.geral], `${id}.geral`).toBe(geralPlanilha)

      const especialPlanilha = cenario.planilha[`${id}.especial`]
      if (especialPlanilha === undefined) {
        // A aba Resultado escreve "Sem previsão no Decreto" direto na célula para
        // os dispositivos sem §2º; o OUT_MAP nem mapeia a coluna nesses casos.
        expect(VEREDITOS[obtido!.especial], `${id}.especial`).toBe(SEM_PREVISAO)
      } else {
        expect(VEREDITOS[obtido!.especial], `${id}.especial`).toBe(String(especialPlanilha))
      }
    }
  })
})

/**
 * ⚖️ TOLERÂNCIA DE 1 DIA nas durações — deliberada, a mesma de motor-2025.spec.ts.
 *
 * A planilha não devolve número no quantum: devolve TEXTO ("X anos Y meses Z
 * dias"), montado com ROUNDDOWN nos anos e meses e ROUND nos dias
 * (Cálculo!H139:H143). Esse arredondamento desloca até 1 dia. O motor devolve o
 * número cru, então a comparação é EM DIAS e aceita |Δ| ≤ 1.
 *
 * Não aumente este valor para um teste passar: 2 dias já não é arredondamento,
 * é regra diferente.
 */
const TOLERANCIA_DIAS = 1

/** O texto que a aba Resultado mostra (via IFERROR da coluna H) quando não há comutação. */
const SEM_COMUTACAO = 'Sem Comutação'

/** "X anos Y meses Z dias" → dias (base 30/360). `null` se o texto não for duração. */
function durDias(txt: Celula): number | null {
  const m = String(txt).trim().match(/^-?\s*(\d+)\s+anos?\s+(\d+)\s+meses?\s+(\d+)\s+dias?$/)
  if (!m) return null
  return Number(m[1]) * 360 + Number(m[2]) * 30 + Number(m[3])
}

describe('comutação × planilha', () => {
  const COMUTACOES = ['art11_I', 'art11_II', 'art11_III', 'art13', 'art13_4'] as const

  it.each(esperado.cenarios.map((c) => [c._nome, c] as const))('%s', (_nome, cenario) => {
    const r = calcular2024(cenario.entrada)
    const porId = new Map(r.incisos.map((i) => [i.id, i]))

    for (const id of COMUTACOES) {
      const obtido = porId.get(id)
      expect(obtido, `o motor não devolveu ${id}`).toBeDefined()
      expect(VEREDITOS[obtido!.geral], `${id}.geral`).toBe(String(cenario.planilha[`${id}.geral`]))
      expect(VEREDITOS[obtido!.especial], `${id}.especial`).toBe(SEM_PREVISAO)

      // 🔴 2024 não tem "pena após a comutação": a planilha não a calcula.
      expect(obtido!.penaApos, `${id}.penaApos`).toBeNull()

      const txt = cenario.planilha[`${id}.comutacaoTxt`]
      if (String(txt).trim() === SEM_COMUTACAO) {
        expect(obtido!.quantum, `${id}.quantum sem comutação`).toBeNull()
        continue
      }
      const esperadoDias = durDias(txt)
      expect(esperadoDias, `${id}.comutacaoTxt não é duração: ${txt}`).not.toBeNull()
      expect(obtido!.quantum, `${id}.quantum`).not.toBeNull()
      expect(Math.abs(obtido!.quantum! - esperadoDias!), `${id}.quantum em dias`).toBeLessThanOrEqual(
        TOLERANCIA_DIAS,
      )
    }
  })

  it('devolve os 23 dispositivos, indulto antes de comutação', () => {
    const ids = calcular2024({}).incisos.map((i) => i.id)
    expect(ids).toHaveLength(23)
    expect(ids.slice(18)).toEqual([...COMUTACOES])
  })
})
