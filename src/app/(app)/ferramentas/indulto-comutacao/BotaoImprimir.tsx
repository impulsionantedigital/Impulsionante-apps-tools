'use client'

import { Printer } from 'lucide-react'
import Botao from '@/components/ui/Botao'
import estilos from './calculadora.module.css'

/**
 * Manda o resultado para o papel — o destino dele é anexo de petição.
 *
 * 🔴 Fica FORA da `BarraSalvar` de propósito: com o acesso encerrado a barra não é renderizada
 * (o membro consulta, não edita), e imprimir um cálculo que ele já pagou continua valendo. É
 * também por isso que não olha `somenteLeitura`.
 *
 * A folha de impressão vive no CSS (`@media print` em `calculadora.module.css` e
 * `resultado.module.css`): esconde o menu do CRM, a barra e este próprio botão, e imprime o
 * resultado em preto sobre branco. Aqui só se dispara o diálogo do navegador.
 */
export default function BotaoImprimir() {
  return (
    <div className={estilos.barraImprimir}>
      <Botao type="button" variante="secundario" onClick={() => window.print()}>
        <Printer size={16} strokeWidth={2} aria-hidden="true" />
        Imprimir
      </Botao>
    </div>
  )
}
