import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import { tituloDaPagina } from '@/server/marca'
import { versaoPorRotulo, estaDesatualizada, versaoAtual } from '@/lib/detracao/recolhimento-noturno/versoes/registro'
import { estadoDoProduto } from '@/server/vendas/acesso'
import { caminhoDoProduto } from '@/lib/produtos/catalogo'
import ExcluirCalculo from '../ExcluirCalculo'
import { lerCalculo } from '../calculos'
import Calculadora from '../Calculadora'
import estilos from '../calculadora.module.css'

const PRODUTO_ID = 'detracao-recolhimento-noturno'
const SLUG = 'recolhimento-noturno'
const CALCULO_TIPO = 'recolhimento-noturno'

// 🔴 Cálculo em versão anterior fica SOMENTE LEITURA. Salvar por cima gravaria o número da versão
// nova sobre o registro da antiga, e o documento que foi protocolado deixaria de existir — a tela
// nem mostra o que se perderia. Criar um cálculo novo é o caminho, e é o que o aviso diz.

export async function generateMetadata() {
  return { title: await tituloDaPagina('Cálculo salvo') }
}

export default async function EditarCalculo({
  params,
}: {
  params: Promise<{ id: string; calculadora: string }>
}): Promise<React.ReactNode> {
  const { id } = await params
  // `lerCalculo` usa o cliente de sessão: a RLS devolve `null` para id inexistente, malformado
  // ou de outro membro/workspace — os três viram 404 do mesmo jeito, sem diferenciar qual foi.
  const calculo = await lerCalculo(id)
  if (!calculo) notFound()
  if (calculo.calculo_tipo !== CALCULO_TIPO) notFound()

  const estado = await estadoDoProduto(PRODUTO_ID)
  if (estado === 'nunca') notFound()

  // 🔴 O cálculo é aberto com a VERSÃO QUE O PRODUZIU — não com a atual. Cada versão tem o seu
  // formulário e o seu motor congelados (`versoes/`), então o membro revê exatamente o documento
  // que salvou: os mesmos campos, o mesmo número, o mesmo resumo. Recalcular com o motor novo
  // mostraria um número que aquele cálculo nunca teve, e é justamente o que não se pode fazer com
  // um documento que pode ter virado petição.
  const versao = versaoPorRotulo(calculo.algoritmo_versao)
  // 🔴 Versão desconhecida NÃO é 404. Aconteceu de verdade: dois cálculos de teste ficaram com o
  // rótulo `RN-2.0` mas a ENTRADA no formato antigo (gravados entre dois commits, quando a versão
  // foi renomeada antes de o formato mudar). O 404 os fazia sumir da tela como se o link estivesse
  // quebrado — o membro via o registro na lista e não tinha como saber por que não abria.
  //
  // A tela explica e oferece a saída: um cálculo cuja versão não existe mais neste build não pode
  // ser lido nem recalculado (fazer isso mostraria um número que ele nunca teve), então o caminho é
  // excluí-lo e criar de novo. O `ExcluirCalculo` renderiza nos dois casos.
  if (!versao) {
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
          className={estilos.cabecalhoDoCalculo}
        />
        <div className={estilos.avisoVersao} role="alert">
          <b>Este cálculo não pode ser aberto.</b> Ele foi gravado na versão{' '}
          {calculo.algoritmo_versao}, que não está mais disponível nesta instalação. Abri-lo com o
          motor atual mostraria um número que ele nunca teve, e o registro pode ter virado petição
          — por isso a tela não tenta. Verifique o anexo já produzido, se houver, e{' '}
          <b>crie um cálculo novo</b> para apurar o período na regra atual.
        </div>
        <ExcluirCalculo id={calculo.id} />
      </div>
    )
  }

  const desatualizada = estaDesatualizada(calculo.algoritmo_versao)

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
        // 🔴 Duas decisões DESTA tela, as duas vivendo no `calculadora.module.css` — e não no kit
        // `CabecalhoPagina`, que é de todas as telas do CRM: (a) o TÍTULO do cálculo não sai na
        // IMPRESSÃO (é o nome que o membro deu ao registro, não informação do caso) e (b) o
        // subtítulo do tema sobe para o MESMO corpo do título. Ver `.cabecalhoDoCalculo`.
        className={estilos.cabecalhoDoCalculo}
      />

      {/* 🔴 O aviso INFORMA, e não recalcula. O que aparece abaixo é o cálculo como ele foi
       *  salvo — número, formulário e resumo da versão {calculo.algoritmo_versao}. Recalcular
       *  aqui mostraria um número que este documento nunca teve, e ele pode ter virado petição.
       *  Quem quer o número da regra nova cria um cálculo novo, que é o único caminho que deixa
       *  claro qual fórmula produziu qual número. */}
      {desatualizada && (
        <div className={estilos.avisoVersao} role="alert">
          <b>Há uma versão nova do motor de cálculo.</b> Este cálculo foi feito na versão{' '}
          {calculo.algoritmo_versao} e está mostrado exatamente como foi salvo — número, formulário
          e resumo daquela versão, para o documento continuar conferindo com o que foi protocolado.
          <br />
          A versão atual é a <b>{versaoAtual().versao}</b>, que {versaoAtual().resumo.toLowerCase()}.
          Para aplicar a regra nova, <b>crie um cálculo novo</b> — este registro não é recalculado,
          e salvar por cima não converte a versão dele.
        </div>
      )}

      <Calculadora
        versao={versao.versao}
        inicial={calculo.entrada}
        calculoId={calculo.id}
        tituloInicial={calculo.titulo}
        resultadoSalvo={calculo.resultado}
        somenteLeitura={estado !== 'ativo' || desatualizada}
      />

      <ExcluirCalculo id={calculo.id} />
    </div>
  )
}
