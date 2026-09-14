import Link from 'next/link'
import { ChevronRight, Scale } from 'lucide-react'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import EstadoVazio from '@/components/ui/EstadoVazio'
import { tituloDaPagina } from '@/server/marca'
import { PRODUTOS } from '@/lib/produtos/catalogo'
import { estadoDoProduto } from '@/server/vendas/acesso'
import estilos from './ferramentas.module.css'

export async function generateMetadata() {
  return { title: await tituloDaPagina('Ferramentas') }
}

export default async function FerramentasPage() {
  const estados = await Promise.all(
    PRODUTOS.map(async (produto) => ({ produto, estado: await estadoDoProduto(produto.id) })),
  )
  // Não existe vitrine do que o membro não tem (§9.2).
  const visiveis = estados.filter((e) => e.estado !== 'nunca')
  const ativos = visiveis.filter((e) => e.estado === 'ativo')

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina titulo="Ferramentas" subtitulo="Cálculos de execução penal." />

      {visiveis.length === 0 ? (
        <EstadoVazio
          icone={<Scale size={20} strokeWidth={2} />}
          titulo="Nenhuma ferramenta liberada"
          texto="As ferramentas aparecem aqui assim que a compra é confirmada."
        />
      ) : (
        <div className={estilos.destinos}>
          <Link href="/ferramentas/cic-2025" className={estilos.destino}>
            <span className={estilos.destinoIcone}>
              <Scale size={16} strokeWidth={1.75} />
            </span>
            <span className={estilos.destinoTexto}>
              <span className={estilos.destinoNome}>Indulto e comutação</span>
              <span className={estilos.destinoSub}>
                Verifica, dispositivo por dispositivo, os requisitos de indulto e de comutação.
              </span>
              <span className={estilos.destinoMeta}>
                {ativos.length > 0
                  ? ativos.map((e) => e.produto.rotulo).join(' · ')
                  : 'Acesso encerrado — os seus cálculos continuam disponíveis para consulta'}
              </span>
            </span>
            <ChevronRight size={16} strokeWidth={1.75} className={estilos.destinoSeta} />
          </Link>
        </div>
      )}
    </div>
  )
}
