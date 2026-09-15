/**
 * O que se vende. Cada produto É um motor de decreto: o id é o mesmo do REGISTRO da calculadora,
 * e um teste de contrato exige a correspondência nos dois sentidos.
 *
 * É código, não dado, de propósito: um id mal escrito é erro de compilação, e não uma oferta
 * que silenciosamente não libera nada.
 *
 * 🔴 `slug` é a ÚNICA fonte do caminho da rota. Não acrescente um campo `href`: duas verdades
 * divergem no primeiro decreto novo. Quem precisa do caminho chama `caminhoDoProduto`.
 */
export const PRODUTOS = [
  {
    id: 'indulto-comutacao-2025',
    slug: 'cic-2025',
    rotulo: 'Calculadora de Indulto e Comutação — Decreto 12.970/2025',
    // Título/descrição do item no menu lateral (Rail.tsx) — mais curtos que `rotulo`, que é o
    // nome cheio usado na vitrine de `/ferramentas`.
    menuTitulo: 'GPS CIC - Calculadora 2025',
    menuDescricao: 'Decreto 12.970/2025',
  },
  {
    id: 'indulto-comutacao-2024',
    slug: 'cic-2024',
    rotulo: 'Calculadora de Indulto e Comutação — Decreto 12.338/2024',
    menuTitulo: 'GPS CIC - Calculadora 2024',
    menuDescricao: 'Decreto 12.338/2024',
  },
] as const

export type Produto = (typeof PRODUTOS)[number]
export type ProdutoId = Produto['id']

export function ehProdutoConhecido(id: unknown): id is ProdutoId {
  return typeof id === 'string' && PRODUTOS.some((p) => p.id === id)
}

export function produtoDoMotor(motorId: string): ProdutoId | null {
  return ehProdutoConhecido(motorId) ? motorId : null
}

export function rotuloDoProduto(id: ProdutoId): string {
  return PRODUTOS.find((p) => p.id === id)?.rotulo ?? id
}

/** O caminho da rota daquele produto. Fonte única: o `slug`. */
export function caminhoDoProduto(slug: string): string {
  return `/ferramentas/${slug}`
}

export function produtoPorSlug(slug: string): Produto | null {
  return PRODUTOS.find((p) => p.slug === slug) ?? null
}

export function slugDoMotor(motorId: string): string | null {
  return PRODUTOS.find((p) => p.id === motorId)?.slug ?? null
}
