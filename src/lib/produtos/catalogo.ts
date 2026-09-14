/**
 * O que se vende. Cada produto É um motor de decreto: o id é o mesmo do REGISTRO da calculadora,
 * e um teste de contrato exige a correspondência nos dois sentidos.
 *
 * É código, não dado, de propósito: um id mal escrito é erro de compilação, e não uma oferta
 * que silenciosamente não libera nada.
 */
export const PRODUTOS = [
  {
    id: 'indulto-comutacao-2025',
    rotulo: 'Calculadora de Indulto e Comutação — Decreto 12.970/2025',
    href: '/ferramentas/indulto-comutacao',
  },
] as const

export type ProdutoId = (typeof PRODUTOS)[number]['id']

export function ehProdutoConhecido(id: unknown): id is ProdutoId {
  return typeof id === 'string' && PRODUTOS.some((p) => p.id === id)
}

export function produtoDoMotor(motorId: string): ProdutoId | null {
  return ehProdutoConhecido(motorId) ? motorId : null
}

export function rotuloDoProduto(id: ProdutoId): string {
  return PRODUTOS.find((p) => p.id === id)?.rotulo ?? id
}
