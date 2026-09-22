'use client'

import { useEffect, useState } from 'react'
import { formatarDataHora } from '@/lib/data-hora'
import estilos from './calculadora.module.css'

/**
 * O que só existe no PAPEL: identifica o caso que o anexo acompanha.
 *
 * 🔴 Não aparece na tela (`display: none` fora de `@media print`). No papel o formulário não vai —
 * e sem isto a folha chega ao juízo sem dizer a que caso pertence. Diferente do CIC, aqui não há
 * premissas a repetir: as datas e o período noturno já saem no `Resumo`, que é visível nos dois
 * lugares — repeti-los seria duplicar a mesma linha na folha.
 *
 * 🔴 A data é fixada num efeito, não no corpo do componente. `new Date()` durante a renderização
 * daria um valor no servidor e outro no navegador, e o React acusaria divergência de hidratação.
 */
export default function CabecalhoAnexo({ titulo, calculoId }: { titulo: string; calculoId?: string }) {
  const [impressoEm, setImpressoEm] = useState<string | null>(null)
  useEffect(() => setImpressoEm(formatarDataHora(new Date())), [])

  return (
    <section className={estilos.anexo} aria-hidden="true">
      <h1 className={estilos.anexoTitulo}>Cálculo de detração — recolhimento noturno</h1>
      <p className={estilos.anexoMeta}>
        {titulo.trim() || 'Cálculo sem identificação'}
        {calculoId ? ` · protocolo ${calculoId}` : ' · ainda não salvo'}
        {impressoEm ? ` · impresso em ${impressoEm}` : ''}
      </p>
    </section>
  )
}
