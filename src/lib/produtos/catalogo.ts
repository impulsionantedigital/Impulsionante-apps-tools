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
    // Título/descrição do item no menu lateral (Rail.tsx) — mais curtos que `rotulo`, que é o
    // nome cheio usado na vitrine de `/ferramentas`. Quando entrar 2024, uma entrada nova aqui,
    // logo abaixo desta, já aparece encaixada sob "Indulto e Comutação" no menu.
    menuTitulo: 'GPS CIC - Calculadora 2025',
    menuDescricao: 'Decreto 12.970/2025',
    href: '/ferramentas/cic-2025',
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
