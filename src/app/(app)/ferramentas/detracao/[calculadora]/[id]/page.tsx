import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import { tituloDaPagina } from '@/server/marca'
import { calcular } from '@/lib/detracao/recolhimento-noturno/motor'
import { mesmoResultado } from '@/lib/detracao/recolhimento-noturno/comparar'
import { estadoDoProduto } from '@/server/vendas/acesso'
import { caminhoDoProduto } from '@/lib/produtos/catalogo'
import ExcluirCalculo from '../ExcluirCalculo'
import { lerCalculo } from '../calculos'
import Calculadora from '../Calculadora'
import estilos from '../calculadora.module.css'

const PRODUTO_ID = 'detracao-recolhimento-noturno'
const SLUG = 'recolhimento-noturno'
const CALCULO_TIPO = 'recolhimento-noturno'

export async function generateMetadata() {
  return { title: await tituloDaPagina('Cálculo salvo') }
}

export default async function EditarCalculo({
  params: { id, calculadora },
}: {
  params: { id: string; calculadora: string }
}): Promise<React.ReactNode> {
  // `lerCalculo` usa o cliente de sessão: a RLS devolve `null` para id inexistente, malformado
  // ou de outro membro/workspace — os três viram 404 do mesmo jeito, sem diferenciar qual foi.
  const calculo = await lerCalculo(id)
  if (!calculo) notFound()
  if (calculo.calculo_tipo !== CALCULO_TIPO) notFound()

  const estado = await estadoDoProduto(PRODUTO_ID)
  if (estado === 'nunca') notFound()

  // O cálculo é refeito com o motor ATUAL. Se a fórmula mudou desde que foi salvo, o membro
  // precisa saber — o número antigo pode já ter virado petição. `mesmoResultado` compara por
  // estrutura, não por `JSON.stringify` (a coluna é jsonb — ordem de chave não é garantida).
  const agora = calcular(calculo.entrada)
  const mudou = calculo.algoritmo_versao !== agora.algoritmoVersao && !mesmoResultado(agora, calculo.resultado)

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina
        acima={
          <Link href={caminhoDoProduto(SLUG)} className={estilos.voltar}>
            <ArrowLeft size={14} aria-hidden />
            GPS Detração - Recolhimento Noturno
          </Link>
        }
        titulo={calculo.titulo}
        subtitulo="Tema Repetitivo 1.155/STJ"
      />

      {mudou && (
        <div className={estilos.avisoVersao} role="alert">
          <b>Este cálculo mudou.</b> Ele foi salvo com o algoritmo versão {calculo.algoritmo_versao};
          a versão atual é a {agora.algoritmoVersao} e produz um resultado diferente. O que
          aparece abaixo é o cálculo <b>refeito agora</b>. Salve de novo para gravar o resultado
          atualizado.
        </div>
      )}

      <Calculadora
        inicial={calculo.entrada}
        calculoId={calculo.id}
        tituloInicial={calculo.titulo}
        somenteLeitura={estado !== 'ativo'}
      />

      <ExcluirCalculo id={calculo.id} />
    </div>
  )
}
