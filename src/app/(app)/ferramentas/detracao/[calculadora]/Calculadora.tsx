'use client'

import { useMemo, useState } from 'react'
import type { EntradaCalculo, ResultadoCalculo } from '@/lib/detracao/recolhimento-noturno/tipos'
import estilos from './calculadora.module.css'

/** O `fim` salvo é sempre exclusivo (ex.: "dia seguinte às 00:00" para representar o último dia
 *  inteiro — ver `formulario.ts`). Mostrar essa data direto no campo "Fim da cautelar" adiantaria
 *  um dia na tela; a data exibida é a do ÚLTIMO INSTANTE ainda dentro da janela. */
function dataFimExibicao(fimISO: string): string {
  const d = new Date(fimISO)
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

export default function Calculadora({
  inicial,
  calculoId,
  tituloInicial,
  somenteLeitura,
}: {
  inicial?: EntradaCalculo
  calculoId?: string
  tituloInicial?: string
  somenteLeitura?: boolean
}) {
  return (
    <div className={estilos.layout}>
      <div className={estilos.coluna}>
        <p>Calculadora será implementada em Task 11.</p>
      </div>
      <div className={estilos.coluna}>
        <p>Resultado será implementado em Task 11.</p>
      </div>
    </div>
  )
}
