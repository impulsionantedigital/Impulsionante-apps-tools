/**
 * O que se vende. Cada produto de `familia: 'indulto-comutacao'` É um motor de decreto: o id é o
 * mesmo do REGISTRO da calculadora, e um teste de contrato exige a correspondência nos dois
 * sentidos. Produtos de outras famílias (ex.: `detracao`) não têm essa exigência — não existe
 * "registro de motores" fora do domínio de decreto.
 *
 * É código, não dado, de propósito: um id mal escrito é erro de compilação, e não uma oferta
 * que silenciosamente não libera nada.
 *
 * 🔴 `slug` é a ÚNICA fonte do caminho da rota. Não acrescente um campo `href`: duas verdades
 * divergem no primeiro decreto novo. Quem precisa do caminho chama `caminhoDoProduto`.
 *
 * 🔴 `familia` decide o PREFIXO da rota (ver `caminhoDoProduto`) e como o menu agrupa o produto
 * (Rail.tsx) — é o que permite existir uma seção "Detração" ao lado de "Indulto e Comutação"
 * sem duplicar rota nem menu para cada produto novo daquela família.
 */
export type Familia = 'indulto-comutacao' | 'detracao'

export const PRODUTOS = [
  {
    id: 'indulto-comutacao-2025',
    slug: 'cic-2025',
    familia: 'indulto-comutacao',
    rotulo: 'Calculadora de Indulto e Comutação — Decreto 12.970/2025',
    // Título/descrição do item no menu lateral (Rail.tsx) — mais curtos que `rotulo`, que é o
    // nome cheio usado na vitrine de `/ferramentas`.
    menuTitulo: 'GPS CIC - Calculadora 2025',
    menuDescricao: 'Decreto 12.970/2025',
  },
  {
    id: 'indulto-comutacao-2024',
    slug: 'cic-2024',
    familia: 'indulto-comutacao',
    rotulo: 'Calculadora de Indulto e Comutação — Decreto 12.338/2024',
    menuTitulo: 'GPS CIC - Calculadora 2024',
    menuDescricao: 'Decreto 12.338/2024',
  },
  {
    id: 'detracao-recolhimento-noturno',
    slug: 'recolhimento-noturno',
    familia: 'detracao',
    nome: 'Recolhimento Noturno',
    descricao: 'Calcula dias de detração por recolhimento domiciliar noturno',
    versao: '1.0',
    ativo: true,
    rotulo: 'Detração por Recolhimento Noturno — Tema Repetitivo 1.155/STJ',
    menuTitulo: 'GPS Detração - Recolhimento Noturno',
    menuDescricao: 'Tema 1.155/STJ',
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

/** O caminho da rota daquele produto. Fonte única: o `slug` + a `familia` de quem o possui —
 *  produtos de `indulto-comutacao` mantêm `/ferramentas/<slug>` (nenhum link existente muda);
 *  produtos de `detracao` (e futuras famílias) ganham prefixo próprio. */
export function caminhoDoProduto(slug: string): string {
  const produto = produtoPorSlug(slug)
  const prefixo = produto && produto.familia !== 'indulto-comutacao' ? `${produto.familia}/` : ''
  return `/ferramentas/${prefixo}${slug}`
}

export function produtoPorSlug(slug: string): Produto | null {
  return PRODUTOS.find((p) => p.slug === slug) ?? null
}

export function slugDoMotor(motorId: string): string | null {
  return PRODUTOS.find((p) => p.id === motorId)?.slug ?? null
}
