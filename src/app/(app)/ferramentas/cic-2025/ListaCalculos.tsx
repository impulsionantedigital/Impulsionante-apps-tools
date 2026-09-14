'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Campo, Entrada as EntradaControle } from '@/components/ui/Campo'
import { formatarDataHora } from '@/lib/data-hora'
import { PRODUTOS } from '@/lib/produtos/catalogo'
import { filtrarCalculos } from './filtro-calculos'
import type { CalculoResumo } from './calculos'
import estilos from './calculadora.module.css'

/** "indulto-comutacao-2025" → "Decreto 12.970/2025": o card não mostra o id interno do motor,
 * mostra o que o catálogo já usa pro mesmo produto no menu lateral (Rail.tsx). */
function rotuloDecreto(decretoId: string): string {
  return PRODUTOS.find((p) => p.id === decretoId)?.menuDescricao ?? decretoId
}

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
              <Link href={`/ferramentas/cic-2025/${c.id}`} className={estilos.item}>
                <b className={estilos.itemTitulo}>{c.titulo}</b>
                {(c.sentenciado || c.execucao) && (
                  <div className={estilos.itemSub}>
                    {[c.sentenciado, c.execucao ? `Execução nº ${c.execucao}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                )}
                <div className={estilos.itemMeta}>
                  {rotuloDecreto(c.decreto_id)} · motor {c.motor_versao} ·{' '}
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
