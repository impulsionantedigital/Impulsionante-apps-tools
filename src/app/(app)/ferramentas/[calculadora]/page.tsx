import { Scale } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import EstadoVazio from '@/components/ui/EstadoVazio'
import Botao from '@/components/ui/Botao'
import { tituloDaPagina } from '@/server/marca'
import { listarCalculos } from './calculos'
import { estadoDoProduto } from '@/server/vendas/acesso'
import { produtoPorSlug, caminhoDoProduto } from '@/lib/produtos/catalogo'
import AvisoAcesso from '@/components/vendas/AvisoAcesso'
import ListaCalculos from './ListaCalculos'
import estilos from './calculadora.module.css'

export async function generateMetadata({ params }: { params: Promise<{ calculadora: string }> }) {
  const { calculadora } = await params
  const produto = produtoPorSlug(calculadora)
  return { title: await tituloDaPagina(produto?.menuTitulo ?? 'Calculadora') }
}

// 🔴 `listarCalculos` LANÇA em erro de banco, de propósito (ver `calculos.ts`):
// não envolva a chamada em `try` para "proteger" a tela. Uma lista vazia por
// falha de banco faria o advogado achar que perdeu os cálculos — o erro deve
// cair no limite de erro do Next, não virar `[]` aqui.
export default async function ListaPage({ params }: { params: Promise<{ calculadora: string }> }) {
  const { calculadora } = await params
  const produto = produtoPorSlug(calculadora)
  if (!produto) notFound()

  // O gate é do produto DESTA rota, não de qualquer produto: quem tem 2025 e não
  // tem 2024 não pode ver a tela de 2024 só porque tem alguma calculadora.
  const estado = await estadoDoProduto(produto.id)
  if (estado === 'nunca') redirect('/ferramentas')
  const ativo = estado === 'ativo'

  const base = caminhoDoProduto(produto.slug)
  const calculos = await listarCalculos(produto.id)
  const novo = ativo ? (
    <Botao href={`${base}/novo`} variante="primario">
      Novo cálculo
    </Botao>
  ) : null

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina
        titulo={produto.menuTitulo}
        subtitulo={`Gerencie seus cálculos para o ${produto.menuDescricao}`}
        acoes={novo}
      />

      {/*
        🔴 O aviso decide sozinho o que dizer e quando se calar: acesso comprado e folgado não gera
        bloco nenhum, para a tela continuar limpa para quem está trabalhando. As regras de qual
        recado sai em cada situação vivem em `@/lib/vendas/aviso-acesso`, testadas sem render.
      */}
      <AvisoAcesso produto={produto} />

      {calculos.length === 0 ? (
        <EstadoVazio
          icone={<Scale size={20} strokeWidth={2} />}
          titulo="Nenhum cálculo salvo"
          texto="Crie o primeiro e ele fica guardado na sua conta."
          acao={novo}
        />
      ) : (
        <ListaCalculos calculos={calculos} slug={produto.slug} />
      )}
    </div>
  )
}
