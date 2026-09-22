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
 * 🔴 O endereço de venda NÃO mora aqui: ele vem do ambiente, por produto, na forma
 * `CHECKOUT_URL_<SLUG>` (ver `checkoutDoProduto`). É configuração de operação, muda sem deploy, e
 * por isso não pertence ao catálogo.
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
    menuTitulo: 'Recolhimento Noturno',
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

export const PREFIXO_CHECKOUT = 'CHECKOUT_URL_'

/**
 * O nome da variável de ambiente do endereço de venda de um produto: `CHECKOUT_URL_CIC_2025`.
 *
 * 🔴 O `slug` vira `CIC_2025` (hífen vira sublinhado, maiúsculas) porque nome de variável de
 * ambiente não aceita hífen — `CHECKOUT_URL_CIC-2025` não é lido por nenhum painel.
 *
 * 🔴 E NÃO use o prefixo `NEXT_PUBLIC_`. Ele é inlinado no bundle em tempo de BUILD, e o CRM roda
 * em Docker: a variável do painel só chegaria ao bundle se estivesse presente durante o `pnpm
 * build` dentro da imagem. O aviso de acesso é renderizado no SERVIDOR (é server component), então
 * a leitura sem prefixo basta — e trocar o link no painel passa a valer com um restart, sem
 * reconstruir a imagem.
 */
export function nomeDaVariavelDeCheckout(slug: string): string {
  return `${PREFIXO_CHECKOUT}${slug.replace(/-/g, '_').toUpperCase()}`
}

/**
 * O endereço de venda do produto, lido do ambiente. `null` quando não há variável, ou quando ela
 * está vazia ou com espaços — e aí o aviso sai SEM botão.
 *
 * 🔴 A ausência é um caminho legítimo, não um erro: é melhor não mostrar botão nenhum do que
 * mostrar um botão que leva a lugar nenhum. Por isso a variável é opcional e o CRM sobe sem ela.
 */
export function checkoutDoProduto(slug: string, env: Record<string, string | undefined> = process.env): string | null {
  const valor = env[nomeDaVariavelDeCheckout(slug)]
  const texto = typeof valor === 'string' ? valor.trim() : ''
  return texto || null
}

export function slugDoMotor(motorId: string): string | null {
  return PRODUTOS.find((p) => p.id === motorId)?.slug ?? null
}
