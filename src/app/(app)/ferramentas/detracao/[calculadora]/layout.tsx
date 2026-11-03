import { notFound } from 'next/navigation'
import { produtoPorSlug } from '@/lib/produtos/catalogo'

/**
 * As calculadoras de detração só existem no deploy cujo `PROJETO` as inclui.
 *
 * 🔴 Antes deste layout, nenhuma página daqui conferia o catálogo: a lista, o `/novo` e o `/[id]`
 * fixam o produto no código e só perguntam ao banco se há acesso. Num deploy de outro projeto a
 * rota abriria, em leitura. O gate no layout cobre as três de uma vez e dá 404 de verdade.
 */
export default async function LayoutDetracao({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ calculadora: string }>
}) {
  const { calculadora } = await params
  if (produtoPorSlug(calculadora)?.familia !== 'detracao') notFound()
  return children
}
