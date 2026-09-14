import Link from 'next/link'
import { Scale } from 'lucide-react'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import { formatarDataHora } from '@/lib/data-hora'
import EstadoVazio from '@/components/ui/EstadoVazio'
import Botao from '@/components/ui/Botao'
import { tituloDaPagina } from '@/server/marca'
import { redirect } from 'next/navigation'
import { listarCalculos } from './calculos'
import { estadoDoProduto } from '@/server/vendas/acesso'
import { PRODUTOS } from '@/lib/produtos/catalogo'
import estilos from './calculadora.module.css'

export async function generateMetadata() {
  return { title: await tituloDaPagina('Indulto e comutação') }
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
    <Botao href="/ferramentas/indulto-comutacao/novo" variante="primario">
      Novo cálculo
    </Botao>
  ) : null

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina
        titulo="Indulto e comutação"
        subtitulo="Os seus cálculos. Nenhum outro membro os vê."
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
        <ul className={estilos.lista}>
          {calculos.map((c) => (
            <li key={c.id} className={estilos.item}>
              <Link href={`/ferramentas/indulto-comutacao/${c.id}`} className={estilos.itemLink}>
                <b className={estilos.itemTitulo}>{c.titulo}</b>
              </Link>
              <div className={estilos.itemMeta}>
                {c.decreto_id} · motor {c.motor_versao} ·{' '}
                {/* Fuso explícito: esta lista é renderizada no servidor, que roda em UTC. */}
                {formatarDataHora(c.atualizado_em)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
