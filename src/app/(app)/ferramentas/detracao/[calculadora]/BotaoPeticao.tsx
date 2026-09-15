'use client'

import { useState } from 'react'
import { FileText } from 'lucide-react'
import Botao from '@/components/ui/Botao'
import PeticaoOverlay from './PeticaoOverlay'
import { gerarTextoPeticao } from '@/lib/detracao/recolhimento-noturno/peticao'
import type { ResultadoCalculo } from '@/lib/detracao/recolhimento-noturno/tipos'

/** Some quando não há intervalo consolidado — nunca promete uma petição que o overlay mostraria
 *  em branco (mesmo critério do BotaoPeticao do CIC). */
export default function BotaoPeticao({ resultado }: { resultado: ResultadoCalculo }) {
  const [aberto, setAberto] = useState(false)

  const texto = gerarTextoPeticao(resultado)
  if (texto === '') return null

  return (
    <>
      <Botao type="button" variante="secundario" onClick={() => setAberto(true)}>
        <FileText size={16} strokeWidth={2} aria-hidden="true" />
        Petição
      </Botao>
      <PeticaoOverlay aberto={aberto} aoFechar={() => setAberto(false)} texto={texto} />
    </>
  )
}
