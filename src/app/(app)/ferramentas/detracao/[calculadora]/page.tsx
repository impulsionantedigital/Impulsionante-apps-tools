import Link from 'next/link'
import { Scale } from 'lucide-react'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import EstadoVazio from '@/components/ui/EstadoVazio'
import Botao from '@/components/ui/Botao'
import AvisoAcesso from '@/components/vendas/AvisoAcesso'
import { estadoDoProduto } from '@/server/vendas/acesso'
import { produtoPorSlug } from '@/lib/produtos/catalogo'
import { formatarDataHora } from '@/lib/data-hora'
import { listarCalculos, type CalculoResumo } from './calculos'
import BotaoExcluirCalculo from './BotaoExcluirCalculo'
import estilos from './lista-calculos.module.css'

const PRODUTO_ID = 'detracao-recolhimento-noturno'

export async function generateMetadata() {
  return { title: 'Cálculos de Recolhimento Noturno' }
}

export default async function ListaCalculos({
  params,
}: {
  params: Promise<{ calculadora: string }>
}): Promise<React.ReactNode> {
  await params
  const calculos = await listarCalculos('recolhimento-noturno')

  // 🔴 Esta página não tinha gate nenhum: mostrava "Novo Cálculo" para qualquer membro, e o clique
  // caía num redirecionamento em `/novo`. Passava despercebido porque o menu escondia o produto de
  // quem não tem acesso — o que deixou de ser verdade na spec de 2026-09-22.
  const ativo = (await estadoDoProduto(PRODUTO_ID)) === 'ativo'
  const produto = produtoPorSlug('recolhimento-noturno')

  const novo = ativo ? (
    <Botao href="/ferramentas/detracao/recolhimento-noturno/novo" variante="primario">
      Novo Cálculo
    </Botao>
  ) : null

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina
        titulo="Cálculos de Recolhimento Noturno"
        subtitulo="Gerencie seus cálculos de recolhimento noturno"
        acoes={novo}
      />

      {produto ? <AvisoAcesso produto={produto} /> : null}

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
