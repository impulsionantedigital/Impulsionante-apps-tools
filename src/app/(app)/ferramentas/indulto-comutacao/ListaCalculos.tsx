'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Campo, Entrada as EntradaControle } from '@/components/ui/Campo'
import { formatarDataHora } from '@/lib/data-hora'
import { filtrarCalculos } from './filtro-calculos'
import type { CalculoResumo } from './calculos'
import estilos from './calculadora.module.css'

/**
 * A lista inteira do membro, sem paginação — nunca há tantos cálculos por membro que isso vire
 * problema (ver investigação: `listarCalculos()` já não pagina).
 */
export default function ListaCalculos({ calculos }: { calculos: CalculoResumo[] }) {
  const [termo, setTermo] = useState('')
  const filtrados = useMemo(() => filtrarCalculos(calculos, termo), [calculos, termo])

  return (
    <div className={estilos.listaWrap}>
      <Campo rotulo="Buscar" className={estilos.busca}>
        <EntradaControle
          type="search"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Nome do sentenciado, nº de execução ou título do cálculo"
        />
      </Campo>

      {filtrados.length === 0 ? (
        <p className={estilos.buscaVazia}>Nenhum cálculo encontrado para &quot;{termo}&quot;.</p>
      ) : (
        <ul className={estilos.lista}>
          {filtrados.map((c) => (
            <li key={c.id}>
              {/* O card INTEIRO é o link — antes só o título navegava, e a área de metadados
                  (decreto/motor/data), que ocupa a largura toda, parecia clicável e não era. */}
              <Link href={`/ferramentas/indulto-comutacao/${c.id}`} className={estilos.item}>
                <b className={estilos.itemTitulo}>{c.titulo}</b>
                <div className={estilos.itemMeta}>
                  {c.decreto_id} · motor {c.motor_versao} ·{' '}
                  {formatarDataHora(c.atualizado_em)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
