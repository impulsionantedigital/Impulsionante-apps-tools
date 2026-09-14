import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import { estadoDoProduto } from '@/server/vendas/acesso'
import { produtoDoMotor } from '@/lib/produtos/catalogo'
import { tituloDaPagina } from '@/server/marca'
import { motorPadrao, REGISTRO } from '@/lib/indulto-comutacao/registro'
import Calculadora from '../Calculadora'
import estilos from '../calculadora.module.css'

export async function generateMetadata() {
  return { title: await tituloDaPagina('Novo cálculo') }
}

export default async function NovoPage() {
  // Com um motor só no registro, a tela mostra qual está em uso em vez de
  // esconder a escolha. Quando 2024 (ou 2026) entrar, vira um seletor sem
  // mudar o fluxo — ninguém aqui importa de `motores/2025/` diretamente.
  const motor = motorPadrao()
  const produto = produtoDoMotor(motor.id)
  if (!produto || (await estadoDoProduto(produto)) !== 'ativo') redirect('/ferramentas/cic-2025')

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina
        acima={
          <Link href="/ferramentas/cic-2025" className={estilos.voltar}>
            <ArrowLeft size={14} aria-hidden />
            GPS CIC - Calculadora 2025
          </Link>
        }
        titulo="Novo cálculo"
        subtitulo={
          REGISTRO.length > 1
            ? `${REGISTRO.length} decretos disponíveis — usando ${motor.rotulo}`
            : motor.rotulo
        }
      />
      <p className={estilos.notaPrivacidade}>
        O cálculo fica guardado na sua conta e nenhum outro membro o vê. Você pode excluí-lo
        quando quiser. Para não guardar o nome do sentenciado, use o nº de execução na
        identificação.
      </p>
      {/* `decretoId`, não `motor`: função não cruza a fronteira RSC. Ver Calculadora.tsx. */}
      <Calculadora decretoId={motor.id} />
    </div>
  )
}
