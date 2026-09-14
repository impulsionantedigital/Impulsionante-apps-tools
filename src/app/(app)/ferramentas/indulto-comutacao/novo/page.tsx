import { redirect } from 'next/navigation'
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
  if (!produto || (await estadoDoProduto(produto)) !== 'ativo') redirect('/ferramentas/indulto-comutacao')

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina
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
      <Calculadora motor={motor} />
    </div>
  )
}
