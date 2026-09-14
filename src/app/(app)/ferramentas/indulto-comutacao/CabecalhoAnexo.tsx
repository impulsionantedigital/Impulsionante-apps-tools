'use client'

import { useEffect, useState } from 'react'
import { todasAsRespostas } from '@/lib/indulto-comutacao/respostas-anexo'
import { formatarDataHora } from '@/lib/data-hora'
import type { Entrada, MotorDecreto } from '@/lib/indulto-comutacao/tipos'
import estilos from './resultado.module.css'

export default function CabecalhoAnexo({
  motor,
  entrada,
  titulo,
}: {
  motor: MotorDecreto
  entrada: Entrada
  titulo: string
}) {
  const [impressoEm, setImpressoEm] = useState<string | null>(null)
  useEffect(() => setImpressoEm(formatarDataHora(new Date())), [])

  const respostas = todasAsRespostas(motor, entrada)

  return (
    <section className={estilos.anexo} aria-hidden="true">
      <h1 className={estilos.anexoTitulo}>Cálculo de indulto e comutação</h1>
      <p className={estilos.anexoMeta}>
        {titulo.trim() || 'Cálculo sem identificação'}
        {impressoEm ? ` · impresso em ${impressoEm}` : ''}
      </p>

      <h2 className={estilos.anexoSecao}>Respostas informadas</h2>
      <dl className={estilos.anexoLista}>
        {respostas.map((r) => (
          <div key={`${r.secao}-${r.rotulo}`} className={estilos.anexoLinha}>
            <dt className={estilos.anexoRotulo}>{r.rotulo}</dt>
            <dd className={estilos.anexoValor}>{r.valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
