import { Scale } from 'lucide-react'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import EstadoVazio from '@/components/ui/EstadoVazio'
import Botao from '@/components/ui/Botao'
import { tituloDaPagina } from '@/server/marca'
import { redirect } from 'next/navigation'
import { listarCalculos } from './calculos'
import { estadoDoProduto } from '@/server/vendas/acesso'
import { PRODUTOS } from '@/lib/produtos/catalogo'
import ListaCalculos from './ListaCalculos'
import estilos from './calculadora.module.css'

export async function generateMetadata() {
  return { title: await tituloDaPagina('GPS CIC - Calculadora 2025') }
}

// 🔴 `listarCalculos` LANÇA em erro de banco, de propósito (ver `calculos.ts`):
// não envolva a chamada em `try` para "proteger" a tela. Uma lista vazia por
// falha de banco faria o advogado achar que perdeu os cálculos — o erro deve
// cair no limite de erro do Next, não virar `[]` aqui.
export default async function ListaPage() {
  const estados = await Promise.all(PRODUTOS.map((p) => estadoDoProduto(p.id)))
  if (estados.every((e) => e === 'nunca')) redirect('/ferramentas')
  const algumAtivo = estados.some((e) => e === 'ativo')

  const calculos = await listarCalculos()
  const novo = algumAtivo ? (
    <Botao href="/ferramentas/cic-2025/novo" variante="primario">
      Novo cálculo
    </Botao>
  ) : null

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina
        titulo="GPS CIC - Calculadora 2025"
        subtitulo="Gerencie seus cálculos para o Decreto 12.970/2025"
        acoes={novo}
      />

      {!algumAtivo && (
        <div className={estilos.avisoVersao} role="status">
          <b>Acesso encerrado.</b> Os seus cálculos continuam aqui para consulta. Para criar ou
          editar, renove o acesso.
        </div>
      )}

      {calculos.length === 0 ? (
        <EstadoVazio
          icone={<Scale size={20} strokeWidth={2} />}
          titulo="Nenhum cálculo salvo"
          texto="Crie o primeiro e ele fica guardado na sua conta."
          acao={novo}
        />
      ) : (
        <ListaCalculos calculos={calculos} />
      )}
    </div>
  )
}
