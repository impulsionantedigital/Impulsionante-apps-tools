import Link from 'next/link'
import { ChevronRight, Info, Lock, Scale, Wrench } from 'lucide-react'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import Botao from '@/components/ui/Botao'
import EstadoVazio from '@/components/ui/EstadoVazio'
import { tituloDaPagina } from '@/server/marca'
import { produtosDoProjeto, caminhoDoProduto, checkoutDoProduto } from '@/lib/produtos/catalogo'
import { projetoAtual } from '@/lib/produtos/projeto'
import { cartaoDaVitrine } from '@/lib/vendas/aviso-acesso'
import { estadoEDetalheDoProduto } from '@/server/vendas/acesso'
import estilos from './ferramentas.module.css'

export async function generateMetadata() {
  return { title: await tituloDaPagina('Ferramentas') }
}

/**
 * A vitrine.
 *
 * 🔴 O catálogo INTEIRO, sempre — e é uma inversão consciente da regra antiga "não existe vitrine
 * do que o membro não tem" (§9.2), revista na spec de 2026-09-22. O acesso decide o que a pessoa
 * PODE FAZER, não o que ela VÊ: quem comprou uma calculadora precisa descobrir que as outras
 * existem, e quem comprou só um produto externo entraria numa tela vazia. Não volte a filtrar por
 * `estado !== 'nunca'` aqui sem ler a spec.
 *
 * O gate de verdade não é este: `/novo` e `/[id]` redirecionam, e `exigirEscrita` recusa na server
 * action. Mostrar o card não libera nada.
 */
export default async function FerramentasPage() {
  // 🔴 O aviso do clube e o subtítulo falam do GPS da Pena: num deploy de outro projeto, eles
  // seriam texto de outra marca na tela do comprador.
  const ehGps = projetoAtual() === 'gpsdapena'
  const cartoes = await Promise.all(
    produtosDoProjeto().map(async (produto) => {
      const { estado, detalhe } = await estadoEDetalheDoProduto(produto.id)
      return {
        produto,
        cartao: cartaoDaVitrine({ estado, detalhe, checkout: checkoutDoProduto(produto.slug) }),
      }
    }),
  )

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina titulo="Ferramentas" subtitulo={ehGps ? 'Cálculos de execução penal.' : undefined} />

      {/* Quem compra o curso chega aqui achando que é a área de aulas. Este aviso devolve a pessoa
          para o lugar certo antes que ela conclua que o acesso dela não funciona. */}
      {ehGps ? (
      <aside className={estilos.aviso} role="note">
        <Info size={16} strokeWidth={1.75} className={estilos.avisoIcone} aria-hidden="true" />
        <p className={estilos.avisoTexto}>
          O acesso aos cursos GPS da Pena deve ser feito com seu usuário e senha da Hotmart através
          do link{' '}
          <a href="https://clube.gpsdapena.com.br/" target="_blank" rel="noopener noreferrer">
            clube.gpsdapena.com.br
          </a>
          . Esta área é exclusiva para acesso às ferramentas criadas pelo GPS da Pena.
        </p>
      </aside>
      ) : null}

      {cartoes.length === 0 ? (
        <EstadoVazio
          icone={<Wrench size={20} strokeWidth={1.75} />}
          titulo="Nenhuma ferramenta por aqui ainda"
          texto="Quando uma ferramenta for liberada para você, ela aparece nesta tela."
        />
      ) : null}

      <div className={estilos.destinos}>
        {cartoes.map(({ produto, cartao }) => (
          <div key={produto.id} className={estilos.destino}>
            {/* 🔴 O `<Link>` cobre só o texto, e o botão é irmão dele: âncora dentro de âncora é
                HTML inválido, e o clique no botão ficaria imprevisível. */}
            <Link href={caminhoDoProduto(produto.slug)} className={estilos.destinoLink}>
              <span className={estilos.destinoIcone}>
                {cartao.bloqueado ? (
                  <Lock size={16} strokeWidth={1.75} aria-label="Sem acesso" />
                ) : (
                  <Scale size={16} strokeWidth={1.75} />
                )}
              </span>
              <span className={estilos.destinoTexto}>
                <span className={estilos.destinoNome}>{produto.menuTitulo}</span>
                <span className={estilos.destinoSub}>{produto.menuDescricao}</span>
                {cartao.meta ? <span className={estilos.destinoMeta}>{cartao.meta}</span> : null}
              </span>
              <ChevronRight size={16} strokeWidth={1.75} className={estilos.destinoSeta} />
            </Link>
            {cartao.botao ? (
              <div className={estilos.destinoAcao}>
                <Botao
                  href={cartao.botao.href}
                  variante="primario"
                  tamanho="pequeno"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {cartao.botao.rotulo}
                </Botao>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
