import { notFound } from 'next/navigation'
import { produtoPorSlug } from '@/lib/produtos/catalogo'

/**
 * A calculadora de indulto e comutação só existe no deploy cujo `PROJETO` a inclui.
 *
 * 🔴 O gate é AQUI, no layout, e não em cada página: ele cobre a lista, o `/novo` e o `/[id]` de
 * uma vez. Num deploy de outro projeto, `produtoPorSlug` não conhece o slug e a rota dá 404 de
 * verdade — esconder o item do menu não bastaria, a URL digitada continuaria abrindo.
 * As server actions (`acoes.ts`) não passam por layout e se protegem sozinhas: `ehProdutoInterno`
 * também deriva de `produtosDoProjeto()`.
 */
export default async function LayoutCalculadora({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ calculadora: string }>
}) {
  const { calculadora } = await params
  if (produtoPorSlug(calculadora)?.familia !== 'indulto-comutacao') notFound()
  return children
}
