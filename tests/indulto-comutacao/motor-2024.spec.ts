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
