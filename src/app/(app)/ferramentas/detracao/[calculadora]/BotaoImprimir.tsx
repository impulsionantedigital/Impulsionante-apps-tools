'use client'

import { Printer } from 'lucide-react'
import Botao from '@/components/ui/Botao'

export default function BotaoImprimir() {
  return (
    <Botao type="button" variante="secundario" onClick={() => window.print()}>
      <Printer size={16} strokeWidth={2} aria-hidden="true" />
      Imprimir
    </Botao>
  )
}
