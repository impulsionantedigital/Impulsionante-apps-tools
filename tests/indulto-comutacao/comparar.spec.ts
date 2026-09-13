import { describe, expect, it } from 'vitest'
import { mesmoResultado } from '@/lib/indulto-comutacao/comparar'
import { motor2025 } from '@/lib/indulto-comutacao/motores/2025'

// O defeito que esta suíte existe para prevenir: `calculo.resultado` vem de uma
// coluna `jsonb`, e o Postgres NÃO preserva a ordem das chaves — ele guarda as
// chaves na ordem dele (mais curtas primeiro), diferente da ordem em que o
// motor as escreve. Comparar por `JSON.stringify` bruto compara TEXTO, e as
// duas ordens diferentes produzem strings diferentes mesmo com os mesmos
// valores — um alarme falso de "este cálculo mudou".

/**
 * Reconstrói um valor com as chaves de cada objeto na ordem "mais curta
 * primeiro" (empate por ordem alfabética) — não é o algoritmo exato do
 * Postgres, mas basta para produzir uma ordem DIFERENTE da ordem de escrita do
 * motor, que é o que o `jsonb` real faz na prática. Arrays mantêm a ordem.
 */
function comoSeFosseJsonb(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(comoSeFosseJsonb)
  if (valor !== null && typeof valor === 'object') {
    const chaves = Object.keys(valor as Record<string, unknown>).sort(
      (a, b) => a.length - b.length || a.localeCompare(b),
    )
    const reordenado: Record<string, unknown> = {}
    for (const chave of chaves) {
      reordenado[chave] = comoSeFosseJsonb((valor as Record<string, unknown>)[chave])
    }
    return reordenado
  }
  return valor
}

describe('mesmoResultado', () => {
  it('ignora a ordem das chaves, inclusive aninhadas', () => {
    const a = { x: 1, y: { b: 2, a: 1 } }
    const b = { y: { a: 1, b: 2 }, x: 1 }
    expect(mesmoResultado(a, b)).toBe(true)
  })

  it('detecta um número diferente em qualquer profundidade', () => {
    const a = { x: 1, y: { a: 1, b: 2 } }
    const b = { x: 1, y: { a: 1, b: 3 } }
    expect(mesmoResultado(a, b)).toBe(false)
  })

  it('a ordem dos ARRAYS continua importando', () => {
    const a = { lista: [{ id: '1' }, { id: '2' }] }
    const b = { lista: [{ id: '2' }, { id: '1' }] }
    expect(mesmoResultado(a, b)).toBe(false)
  })

  it('undefined de um lado e ausente do outro são iguais (o que jsonb faz ao gravar)', () => {
    const a = { x: 1, y: undefined }
    const b = { x: 1 }
    expect(mesmoResultado(a, b)).toBe(true)
  })

  it('null de um lado e ausente do outro são DIFERENTES (null sobrevive ao jsonb, undefined não)', () => {
    const a = { x: 1, y: null }
    const b = { x: 1 }
    expect(mesmoResultado(a, b)).toBe(false)
  })

  it('o caso real: o resultado do motor 2025 contra ele mesmo com as chaves na ordem que o jsonb usaria', () => {
    const resultado = motor2025.calcular({})
    const comoViriaDoBanco = comoSeFosseJsonb(resultado)

    // Sanidade do próprio teste: se a reordenação não mudou nada, o teste não
    // provaria nada — o defeito só aparece quando as ordens realmente diferem.
    expect(JSON.stringify(comoViriaDoBanco)).not.toBe(JSON.stringify(resultado))

    expect(mesmoResultado(resultado, comoViriaDoBanco)).toBe(true)
  })
})
