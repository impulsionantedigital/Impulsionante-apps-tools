import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import { tituloDaPagina } from '@/server/marca'
import { motorPorId } from '@/lib/indulto-comutacao/registro'
import { mesmoResultado } from '@/lib/indulto-comutacao/comparar'
import Calculadora from '../Calculadora'
import { estadoDoProduto } from '@/server/vendas/acesso'
import { produtoPorSlug, caminhoDoProduto } from '@/lib/produtos/catalogo'
import ExcluirCalculo from '../ExcluirCalculo'
import { lerCalculo } from '../calculos'
import estilos from '../calculadora.module.css'

export async function generateMetadata() {
  return { title: await tituloDaPagina('Cálculo salvo') }
}

export default async function CalculoPage({
  params,
}: {
  params: Promise<{ calculadora: string; id: string }>
}) {
  const { calculadora, id } = await params
  const produto = produtoPorSlug(calculadora)
  if (!produto) notFound()

  // `lerCalculo` usa o cliente de sessão: a RLS devolve `null` para id
  // inexistente, malformado ou de outro membro/workspace — os três viram 404
  // do mesmo jeito, sem diferenciar qual foi, para não vazar qual caso é.
  const calculo = await lerCalculo(id)
  if (!calculo) notFound()

  // 🔴 O cálculo tem de ser DESTA rota. Sem esta guarda, /ferramentas/cic-2024/<id-de-2025>
  // abriria um cálculo de 2025 sob o cabeçalho de 2024, com o gate do produto errado.
  if (calculo.decreto_id !== produto.id) notFound()

  const motor = motorPorId(calculo.decreto_id)
  if (!motor) notFound()

  const estado = await estadoDoProduto(produto.id)
  if (estado === 'nunca') notFound()

  // O cálculo é refeito a partir da entrada com o motor ATUAL. Se a fórmula
  // mudou desde que foi salvo, o membro precisa saber — o número antigo pode
  // já ter virado petição. O aviso só aparece quando a versão mudou E o
  // resultado refeito diverge do gravado: versão igual com resultado
  // diferente seria bug, e não é para esconder.
  //
  // 🔴 A comparação NÃO pode ser `JSON.stringify` bruto: `calculo.resultado`
  // vem de uma coluna `jsonb`, e o Postgres não preserva a ordem das chaves.
  // `mesmoResultado` compara por estrutura (ver `comparar.ts`).
  const agora = motor.calcular(calculo.entrada)
  const mudou = calculo.motor_versao !== motor.versao && !mesmoResultado(agora, calculo.resultado)

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina
        acima={
          <Link href={caminhoDoProduto(produto.slug)} className={estilos.voltar}>
            <ArrowLeft size={14} aria-hidden />
            {produto.menuTitulo}
          </Link>
        }
        titulo={calculo.titulo}
        subtitulo={motor.rotulo}
      />

      {mudou && (
        <div className={estilos.avisoVersao} role="alert">
          <b>Este cálculo mudou.</b> Ele foi salvo com o motor versão {calculo.motor_versao}; a
          versão atual é a {motor.versao} e produz um resultado diferente. O que aparece abaixo é
          o cálculo <b>refeito agora</b>. Salve de novo para gravar o resultado atualizado.
        </div>
      )}

      {/* `decretoId`, não `motor`: função não cruza a fronteira RSC. Ver Calculadora.tsx. */}
      <Calculadora
        decretoId={motor.id}
        slug={produto.slug}
        inicial={calculo.entrada}
        calculoId={calculo.id}
        tituloInicial={calculo.titulo}
        somenteLeitura={estado !== 'ativo'}
      />

      <ExcluirCalculo id={calculo.id} slug={produto.slug} />
    </div>
  )
}
