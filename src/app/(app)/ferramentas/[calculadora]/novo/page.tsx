import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import { estadoDoProduto } from '@/server/vendas/acesso'
import { produtoPorSlug, caminhoDoProduto } from '@/lib/produtos/catalogo'
import { tituloDaPagina } from '@/server/marca'
import { motorPorId } from '@/lib/indulto-comutacao/registro'
import Calculadora from '../Calculadora'
import estilos from '../calculadora.module.css'

export async function generateMetadata() {
  return { title: await tituloDaPagina('Novo cálculo') }
}

export default async function NovoPage({ params }: { params: Promise<{ calculadora: string }> }) {
  const { calculadora } = await params
  const produto = produtoPorSlug(calculadora)
  if (!produto) notFound()
  // O decreto vem do SLUG da rota, não de `motorPadrao()`: cada calculadora é a sua.
  const motor = motorPorId(produto.id)
  if (!motor) notFound()

  const base = caminhoDoProduto(produto.slug)
  if ((await estadoDoProduto(produto.id)) !== 'ativo') redirect(base)

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina
        acima={
          <Link href={base} className={estilos.voltar}>
            <ArrowLeft size={14} aria-hidden />
            {produto.menuTitulo}
          </Link>
        }
        titulo="Novo cálculo"
        subtitulo={motor.rotulo}
      />
      <p className={estilos.notaPrivacidade}>
        O cálculo fica guardado na sua conta e nenhum outro membro o vê. Você pode excluí-lo
        quando quiser. Para não guardar o nome do sentenciado, use o nº de execução na
        identificação.
      </p>
      {/* `decretoId`, não `motor`: função não cruza a fronteira RSC. Ver Calculadora.tsx. */}
      <Calculadora decretoId={motor.id} slug={produto.slug} />
    </div>
  )
}
