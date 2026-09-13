import { notFound } from 'next/navigation'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import { tituloDaPagina } from '@/server/marca'
import { motorPorId } from '@/lib/indulto-comutacao/registro'
import Calculadora from '../Calculadora'
import ExcluirCalculo from '../ExcluirCalculo'
import { lerCalculo } from '../calculos'
import estilos from '../calculadora.module.css'

export async function generateMetadata() {
  return { title: await tituloDaPagina('Cálculo salvo') }
}

export default async function CalculoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // `lerCalculo` usa o cliente de sessão: a RLS devolve `null` para id
  // inexistente, malformado ou de outro membro/workspace — os três viram 404
  // do mesmo jeito, sem diferenciar qual foi, para não vazar qual caso é.
  const calculo = await lerCalculo(id)
  if (!calculo) notFound()

  const motor = motorPorId(calculo.decreto_id)
  if (!motor) notFound()

  // O cálculo é refeito a partir da entrada com o motor ATUAL. Se a fórmula
  // mudou desde que foi salvo, o membro precisa saber — o número antigo pode
  // já ter virado petição. O aviso só aparece quando a versão mudou E o
  // resultado refeito diverge do gravado: versão igual com resultado
  // diferente seria bug, e não é para esconder.
  const agora = motor.calcular(calculo.entrada)
  const mudou =
    calculo.motor_versao !== motor.versao &&
    JSON.stringify(agora) !== JSON.stringify(calculo.resultado)

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina titulo={calculo.titulo} subtitulo={motor.rotulo} />

      {mudou && (
        <div className={estilos.avisoVersao} role="alert">
          <b>Este cálculo mudou.</b> Ele foi salvo com o motor versão {calculo.motor_versao}; a
          versão atual é a {motor.versao} e produz um resultado diferente. O que aparece abaixo é
          o cálculo <b>refeito agora</b>. Salve de novo para gravar o resultado atualizado.
        </div>
      )}

      <Calculadora
        motor={motor}
        inicial={calculo.entrada}
        calculoId={calculo.id}
        tituloInicial={calculo.titulo}
      />

      <ExcluirCalculo id={calculo.id} />
    </div>
  )
}
