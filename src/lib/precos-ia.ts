export const PRECOS: Record<
  string,
  { entradaPor1M: number; saidaPor1M: number; tipo: 'chat' | 'embedding' }
> = {
  'gpt-5.5': { entradaPor1M: 5.0, saidaPor1M: 30.0, tipo: 'chat' },
  'gpt-5.1': { entradaPor1M: 1.25, saidaPor1M: 10.0, tipo: 'chat' },
  'gpt-5-mini': { entradaPor1M: 0.25, saidaPor1M: 2.0, tipo: 'chat' },
  'gpt-4.1': { entradaPor1M: 2.0, saidaPor1M: 8.0, tipo: 'chat' },
  
  'text-embedding-3-small': { entradaPor1M: 0.02, saidaPor1M: 0, tipo: 'embedding' },
  'text-embedding-3-large': { entradaPor1M: 0.13, saidaPor1M: 0, tipo: 'embedding' },
}


const NOMES_POR_TAMANHO = Object.keys(PRECOS).sort((a, b) => b.length - a.length)


export function precoDe(modelo: string | null | undefined) {
  if (!modelo) return undefined
  const nome = NOMES_POR_TAMANHO.find((k) => modelo === k || modelo.startsWith(k))
  return nome ? PRECOS[nome] : undefined
}


export function temPrecoConhecido(modelo: string | null | undefined): boolean {
  return precoDe(modelo) !== undefined
}


export function custoUsd(
  modelo: string,
  entrada: number | null,
  saida: number | null,
): number | null {
  if (entrada === null || saida === null) return null
  if (!Number.isFinite(entrada) || !Number.isFinite(saida)) return null
  const preco = precoDe(modelo)
  if (!preco) return null
  return (entrada / 1e6) * preco.entradaPor1M + (saida / 1e6) * preco.saidaPor1M
}
