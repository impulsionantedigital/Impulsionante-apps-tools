import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { preparar } from '../../src/app/(app)/ferramentas/cic-2025/preparar'
import { entradaInicial } from '../../src/app/(app)/ferramentas/cic-2025/Calculadora'
import { REGISTRO } from '../../src/lib/indulto-comutacao/registro'
import { padraoDoCampo } from '../../src/lib/indulto-comutacao/padrao'
import type { Campo, Entrada, MotorDecreto } from '../../src/lib/indulto-comutacao/tipos'

// Suíte permanente de `preparar()` — a rodada 1 desta task só provou os
// comportamentos abaixo num teste temporário, apagado antes do commit. Nada na
// suíte protegia:
//   - o `try` em volta de `motor.calcular` (uma entrada forjada lançaria);
//   - a ORDEM filtrar-depois-calcular (calcular antes do filtro gravaria lixo);
//   - gravar a entrada FILTRADA, e não a bruta recebida do cliente.
//
// `describe.each(REGISTRO)` roda os três blocos contra TODO motor cadastrado —
// um motor de 2026 nasce coberto pelas mesmas três garantias, sem precisar de
// teste novo.

/** Todas as chaves de campo que o questionário de um motor declara. */
function chavesDoQuestionario(motor: MotorDecreto): string[] {
  const chaves: string[] = []
  for (const secao of motor.questionario) {
    for (const campo of secao.campos) chaves.push(campo.chave)
  }
  return chaves
}

/**
 * Um valor bem-formado para QUALQUER tipo de campo — diferente de
 * `padraoDoCampo` (que só cobre `selecao`), cobre também `tempo`, `numero`,
 * `data` e `texto`, para que uma entrada "cheia" nunca faça o motor lançar.
 */
function valorBemFormado(campo: Campo): Entrada[string] {
  if (campo.tipo === 'tempo') return { anos: 0, meses: 0, dias: 0 }
  if (campo.tipo === 'selecao') return padraoDoCampo(campo)
  if (campo.tipo === 'numero') return 0
  if (campo.tipo === 'data') return '2000-01-01'
  return ''
}

function entradaCheiaEBemFormada(motor: MotorDecreto): Record<string, unknown> {
  const entrada: Record<string, unknown> = {}
  for (const secao of motor.questionario) {
    for (const campo of secao.campos) entrada[campo.chave] = valorBemFormado(campo)
  }
  return entrada
}

const CHAVE_INVENTADA = 'chave_inventada_que_nao_existe_9x7'

describe.each(REGISTRO)('preparar — $rotulo ($id)', (motor) => {
  const chaves = chavesDoQuestionario(motor)

  describe('a) entrada forjada devolve { erro } e nunca lança', () => {
    // Toda chave real do questionário recebe um valor sem `toString` nem
    // `valueOf` (nenhum dos dois herdado, por não ter protótipo) — qualquer
    // coerção para string ou número que o motor tente lança `TypeError`, e é
    // isso que prova que o `try` em volta de `motor.calcular` está de pé.
    const entradaEnvenenada = (() => {
      const e: Record<string, unknown> = {}
      for (const chave of chaves) e[chave] = Object.create(null)
      return e
    })()

    const casos: Array<[string, unknown]> = [
      [
        'objeto sem toString no lugar do valor de cada campo do questionário',
        { titulo: 'x', decretoId: motor.id, entrada: entradaEnvenenada },
      ],
      ['Object.create(null) como a entrada inteira do preparar (sem título/decreto)', Object.create(null)],
      ['Symbol como a entrada inteira do preparar', Symbol('entrada forjada')],
      ['entrada: null', { titulo: 'x', decretoId: motor.id, entrada: null }],
      ['entrada como array', { titulo: 'x', decretoId: motor.id, entrada: [] }],
      ['título vazio', { titulo: '', decretoId: motor.id, entrada: {} }],
    ]

    it.each(casos)('%s', (_nome, bruto) => {
      let resultado: ReturnType<typeof preparar> | undefined
      expect(() => {
        resultado = preparar(bruto)
      }).not.toThrow()
      expect(resultado).toBeDefined()
      expect(resultado && 'erro' in resultado).toBe(true)
    })
  })

  describe('b) filtra pela chave do questionário: a inventada some, as reais ficam', () => {
    it('descarta a chave desconhecida e preserva TODAS as chaves do questionário', () => {
      const bruto = { ...entradaCheiaEBemFormada(motor), [CHAVE_INVENTADA]: 'segredo do sentenciado' }

      const r = preparar({ titulo: 'x', decretoId: motor.id, entrada: bruto })
      expect('erro' in r).toBe(false)
      if ('erro' in r) return

      expect(Object.prototype.hasOwnProperty.call(r.entrada, CHAVE_INVENTADA)).toBe(false)
      for (const chave of chaves) {
        expect(Object.prototype.hasOwnProperty.call(r.entrada, chave)).toBe(true)
      }
    })

    // 🔴 Isto NÃO é redundante com o teste acima. Como o motor só lê chaves que
    // conhece pelo nome, uma implementação que calculasse sobre `r.data.entrada`
    // (a entrada BRUTA, com a chave inventada) produziria o MESMO `resultado`
    // final — o motor simplesmente ignoraria a chave a mais. A única forma de
    // provar que o CÁLCULO em si roda sobre a entrada filtrada é espiar
    // `motor.calcular` e conferir o argumento com que ele foi chamado.
    it('motor.calcular é chamado com a entrada FILTRADA, nunca com a bruta', () => {
      const bruto = { ...entradaCheiaEBemFormada(motor), [CHAVE_INVENTADA]: 'segredo do sentenciado' }
      const espiao = vi.spyOn(motor, 'calcular')

      try {
        const r = preparar({ titulo: 'x', decretoId: motor.id, entrada: bruto })
        expect('erro' in r).toBe(false)

        expect(espiao).toHaveBeenCalledTimes(1)
        const entradaRecebida = espiao.mock.calls[0]?.[0] as Record<string, unknown>
        expect(Object.prototype.hasOwnProperty.call(entradaRecebida, CHAVE_INVENTADA)).toBe(false)
        for (const chave of chaves) {
          expect(Object.prototype.hasOwnProperty.call(entradaRecebida, chave)).toBe(true)
        }
      } finally {
        espiao.mockRestore()
      }
    })
  })

  describe('c) o resultado do preparar é igual ao motor.calcular sobre a entrada bruta', () => {
    const caminhoCenarios = path.join(process.cwd(), 'validacao', String(motor.ano), 'cenarios.json')
    const temCenarios = fs.existsSync(caminhoCenarios)

    const cenarios: Array<{ nome: string; entradaBruta: Record<string, unknown> }> = temCenarios
      ? (JSON.parse(fs.readFileSync(caminhoCenarios, 'utf8')) as Array<Record<string, unknown>>).map((c, i) => {
          const { _nome, ...entradaBruta } = c
          return { nome: typeof _nome === 'string' ? _nome : `cenário ${i}`, entradaBruta }
        })
      : [
          { nome: 'entradaInicial(motor)', entradaBruta: entradaInicial(motor) as Record<string, unknown> },
          { nome: 'entrada vazia', entradaBruta: {} },
        ]

    it.each(cenarios.map((c): [string, Record<string, unknown>] => [c.nome, c.entradaBruta]))(
      '%s: preparar(entrada + chave inventada).resultado === motor.calcular(entrada bruta)',
      (_nome, entradaBruta) => {
        const comChaveInventada = { ...entradaBruta, [CHAVE_INVENTADA]: 'segredo do sentenciado' }
        const r = preparar({ titulo: 'x', decretoId: motor.id, entrada: comChaveInventada })
        expect('erro' in r).toBe(false)
        if ('erro' in r) return

        expect(r.resultado).toEqual(motor.calcular(entradaBruta as Entrada))
      },
    )
  })
})
