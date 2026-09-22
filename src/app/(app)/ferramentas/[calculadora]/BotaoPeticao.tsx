'use client'

import { useState } from 'react'
import { FileText } from 'lucide-react'
import Botao from '@/components/ui/Botao'
import PeticaoOverlay from './PeticaoOverlay'
import type { Entrada, MotorDecreto, Resultado } from '@/lib/indulto-comutacao/tipos'

/**
 * Só aparece quando o motor tem modelo de petição (`motor.peticoes`) E pelo menos um dos dois
 * geradores produz texto de fato — não usa `temAplicavel` (enquadramentos.ts) porque a
 * comutação (`motores/2025/peticoes.ts`) restringe a própria petição a um subconjunto dos
 * dispositivos aplicáveis (ver o comentário lá): perguntar direto ao gerador se ele devolveu
 * string vazia é o único jeito de o botão nunca prometer uma petição que o overlay mostraria em
 * branco.
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

  const dadosPeticao = { entrada, resultado, titulo }
  const textoIndulto = motor.peticoes.indulto(dadosPeticao)
  const textoComutacao = motor.peticoes.comutacao(dadosPeticao)
  const temIndulto = textoIndulto !== ''
  const temComutacao = textoComutacao !== ''
  if (!temIndulto && !temComutacao) return null

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
        gerarTexto={(tipo) => (tipo === 'indulto' ? textoIndulto : textoComutacao)}
      />
    </>
  )
}
