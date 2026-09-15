import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import { estadoDoProduto } from '@/server/vendas/acesso'
import { caminhoDoProduto } from '@/lib/produtos/catalogo'
import { tituloDaPagina } from '@/server/marca'
import Calculadora from '../Calculadora'
import estilos from '../calculadora.module.css'

const PRODUTO_ID = 'detracao-recolhimento-noturno'
const SLUG = 'recolhimento-noturno'

export async function generateMetadata() {
  return { title: await tituloDaPagina('Novo cálculo') }
}

export default async function NovoCalculo({
  params,
}: {
  params: Promise<{ calculadora: string }>
}): Promise<React.ReactNode> {
  await params
  const base = caminhoDoProduto(SLUG)
  if ((await estadoDoProduto(PRODUTO_ID)) !== 'ativo') redirect(base)

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina
        acima={
          <Link href={base} className={estilos.voltar}>
            <ArrowLeft size={14} aria-hidden />
            GPS Detração - Recolhimento Noturno
          </Link>
        }
        titulo="Novo cálculo"
        subtitulo="Tema Repetitivo 1.155/STJ"
      />
      <p className={estilos.notaPrivacidade}>
        O cálculo fica guardado na sua conta e nenhum outro membro o vê. Você pode excluí-lo
        quando quiser. Para não guardar o nome do sentenciado, use o nº de execução na
        identificação.
      </p>
      <Calculadora />
    </div>
  )
}
