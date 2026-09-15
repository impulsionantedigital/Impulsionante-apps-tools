import Link from 'next/link'
import { Scale } from 'lucide-react'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import EstadoVazio from '@/components/ui/EstadoVazio'
import Botao from '@/components/ui/Botao'
import { formatarDataHora } from '@/lib/data-hora'
import { listarCalculos, type CalculoResumo } from '../../[calculadora]/calculos'
import BotaoExcluirCalculo from './BotaoExcluirCalculo'
import estilos from './lista-calculos.module.css'

export async function generateMetadata() {
  return { title: 'Cálculos de Recolhimento Noturno' }
}

export default async function ListaCalculos({
  params,
}: {
  params: { calculadora: string }
}): Promise<React.ReactNode> {
  const calculos = await listarCalculos('recolhimento-noturno')

  const novo = (
    <Botao href="/ferramentas/detracao/recolhimento-noturno/novo" variante="primario">
      Novo Cálculo
    </Botao>
  )

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina
        titulo="Cálculos de Recolhimento Noturno"
        subtitulo="Gerencie seus cálculos de recolhimento noturno"
        acoes={novo}
      />

      {calculos.length === 0 ? (
        <EstadoVazio
          icone={<Scale size={20} strokeWidth={2} />}
          titulo="Nenhum cálculo ainda"
          texto="Crie o primeiro cálculo e ele fica guardado na sua conta."
          acao={novo}
        />
      ) : (
        <div className={estilos.tabelaWrap}>
          <table className={estilos.tabela}>
            <thead>
              <tr>
                <th>Título</th>
                <th>Última atualização</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {calculos.map((calculo: CalculoResumo) => (
                <tr key={calculo.id}>
                  <td>
                    <Link
                      href={`/ferramentas/detracao/recolhimento-noturno/${calculo.id}`}
                      className={estilos.link}
                    >
                      {calculo.titulo}
                    </Link>
                  </td>
                  <td>{formatarDataHora(calculo.atualizado_em)}</td>
                  <td>
                    <div className={estilos.acoes}>
                      <Botao
                        href={`/ferramentas/detracao/recolhimento-noturno/${calculo.id}`}
                        variante="fantasma"
                        tamanho="pequeno"
                      >
                        Editar
                      </Botao>
                      <BotaoExcluirCalculo id={calculo.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
