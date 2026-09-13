import Link from 'next/link'
import { Scale } from 'lucide-react'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import EstadoVazio from '@/components/ui/EstadoVazio'
import Botao from '@/components/ui/Botao'
import { tituloDaPagina } from '@/server/marca'
import { listarCalculos } from './calculos'
import estilos from './calculadora.module.css'

export async function generateMetadata() {
  return { title: await tituloDaPagina('Indulto e comutação') }
}

// 🔴 `listarCalculos` LANÇA em erro de banco, de propósito (ver `calculos.ts`):
// não envolva a chamada em `try` para "proteger" a tela. Uma lista vazia por
// falha de banco faria o advogado achar que perdeu os cálculos — o erro deve
// cair no limite de erro do Next, não virar `[]` aqui.
export default async function ListaPage() {
  const calculos = await listarCalculos()
  const novo = (
    <Botao href="/ferramentas/indulto-comutacao/novo" variante="primario">
      Novo cálculo
    </Botao>
  )

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina
        titulo="Indulto e comutação"
        subtitulo="Os seus cálculos. Nenhum outro membro os vê."
        acoes={novo}
      />

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
                {new Date(c.atualizado_em).toLocaleDateString('pt-BR')}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
