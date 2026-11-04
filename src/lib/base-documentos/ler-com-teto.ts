// Lê um corpo em pedaços e desiste assim que passar do teto. Conferir o tamanho antes do download
// não basta: entre a medição e a leitura o objeto pode ser sobrescrito por um maior, e o download
// vai para a memória de um servidor que atende todos os espaços de trabalho.
export async function lerComTeto(
  corpo: ReadableStream<Uint8Array>,
  teto: number,
): Promise<Uint8Array | 'grande_demais'> {
  const leitor = corpo.getReader()
  const pedacos: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await leitor.read()
    if (done) break
    total += value.length
    if (total > teto) {
      await leitor.cancel('passou do teto').catch(() => {})
      return 'grande_demais'
    }
    pedacos.push(value)
  }
  const tudo = new Uint8Array(total)
  let pos = 0
  for (const p of pedacos) {
    tudo.set(p, pos)
    pos += p.length
  }
  return tudo
}
