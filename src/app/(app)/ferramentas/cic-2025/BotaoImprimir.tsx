'use client'

import { Printer } from 'lucide-react'
import Botao from '@/components/ui/Botao'

/**
 * Manda o resultado para o papel — o destino dele é anexo de petição.
 *
 * 🔴 Continua fora da `BarraSalvar` como componente PRÓPRIO de propósito: com o acesso
 * encerrado a barra não é renderizada (o membro consulta, não edita), e imprimir um cálculo já
 * pago continua valendo — por isso não olha `somenteLeitura`. O que mudou é só o layout: quem
 * decide onde este botão entra na linha é o pai (`Calculadora.tsx`/`BarraSalvar.tsx`), não mais
 * uma div própria aqui dentro.
 */
export default function BotaoImprimir() {
  return (
    <Botao type="button" variante="secundario" onClick={() => window.print()}>
      <Printer size={16} strokeWidth={2} aria-hidden="true" />
      Imprimir
    </Botao>
  )
}
