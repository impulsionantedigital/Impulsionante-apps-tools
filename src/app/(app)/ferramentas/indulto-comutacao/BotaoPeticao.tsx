// src/app/(app)/ferramentas/indulto-comutacao/BotaoPeticao.tsx
'use client'

import { useState } from 'react'
import { FileText } from 'lucide-react'
import Botao from '@/components/ui/Botao'
import PeticaoOverlay from './PeticaoOverlay'
import { temAplicavel } from '@/lib/indulto-comutacao/enquadramentos'
import type { Entrada, MotorDecreto, Resultado } from '@/lib/indulto-comutacao/tipos'

/**
 * Só aparece quando o motor tem modelo de petição (`motor.peticoes`) E há pelo menos um
 * dispositivo aplicável — nem todo decreto vai ter petição pronta, e mesmo o que tem não deve
 * oferecer o botão para um caso que não preenche requisito nenhum.
 */
export default function BotaoPeticao({
  motor,
  entrada,
  resultado,
  titulo,
}: {
  motor: MotorDecreto
  entrada: Entrada
  resultado: Resultado
  titulo: string
}) {
  const [aberto, setAberto] = useState(false)

  if (!motor.peticoes) return null
  const temIndulto = temAplicavel(motor, resultado, 'indulto')
  const temComutacao = temAplicavel(motor, resultado, 'comutacao')
  if (!temIndulto && !temComutacao) return null

  const peticoes = motor.peticoes

  return (
    <>
      <Botao type="button" variante="secundario" onClick={() => setAberto(true)}>
        <FileText size={16} strokeWidth={2} aria-hidden="true" />
        Petição
      </Botao>
      <PeticaoOverlay
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        temIndulto={temIndulto}
        temComutacao={temComutacao}
        gerarTexto={(tipo) => peticoes[tipo]({ entrada, resultado, titulo })}
      />
    </>
  )
}
