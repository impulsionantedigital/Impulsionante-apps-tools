import { describe, it, expect } from 'vitest'
import { lerComTeto } from '@/lib/base-documentos/ler-com-teto'

function fluxo(pedacos: number[], aoCancelar?: () => void): ReadableStream<Uint8Array> {
  let i = 0
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (i >= pedacos.length) return c.close()
      c.enqueue(new Uint8Array(pedacos[i++]).fill(7))
    },
    cancel() {
      aoCancelar?.()
    },
  })
}

describe('lerComTeto', () => {
  it('junta os pedaços quando cabe no teto', async () => {
    const r = await lerComTeto(fluxo([3, 4, 3]), 10)
    expect(r).toBeInstanceOf(Uint8Array)
    expect((r as Uint8Array).length).toBe(10)
  })

  it('passou do teto: para de ler, cancela o fluxo e avisa', async () => {
    let cancelou = false
    let lidos = 0
    const pedacos = [4, 4, 4, 4, 4]
    const corpo = fluxo(pedacos, () => {
      cancelou = true
    })
    const leitor = corpo.getReader()
    // Envolve para contar quantos pedaços chegaram a ser lidos.
    const contado = new ReadableStream<Uint8Array>({
      async pull(c) {
        const { done, value } = await leitor.read()
        if (done) return c.close()
        lidos++
        c.enqueue(value)
      },
      cancel(m) {
        return leitor.cancel(m)
      },
    })
    expect(await lerComTeto(contado, 10)).toBe('grande_demais')
    expect(cancelou).toBe(true)
    expect(lidos).toBe(3)
  })

  it('corpo vazio devolve zero bytes', async () => {
    expect((await lerComTeto(fluxo([]), 10)) as Uint8Array).toHaveLength(0)
  })
})
