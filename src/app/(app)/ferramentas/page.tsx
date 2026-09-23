import Link from 'next/link'
import { ChevronRight, Lock, Scale } from 'lucide-react'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import Botao from '@/components/ui/Botao'
import { tituloDaPagina } from '@/server/marca'
import { PRODUTOS, caminhoDoProduto, checkoutDoProduto } from '@/lib/produtos/catalogo'
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
  const cartoes = await Promise.all(
    PRODUTOS.map(async (produto) => {
      const { estado, detalhe } = await estadoEDetalheDoProduto(produto.id)
      return {
        produto,
        cartao: cartaoDaVitrine({ estado, detalhe, checkout: checkoutDoProduto(produto.slug) }),
      }
    }),
  )

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina titulo="Ferramentas" subtitulo="Cálculos de execução penal." />

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
