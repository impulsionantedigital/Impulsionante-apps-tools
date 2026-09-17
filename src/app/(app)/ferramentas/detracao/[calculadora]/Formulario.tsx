'use client'

import { versaoPorRotulo, versaoAtual } from '@/lib/detracao/recolhimento-noturno/versoes/registro'
import CamposSegmento from './CamposSegmento'
import type { EntradaFormulario, SegmentoFormulario } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-1/formulario'
import estilos from './calculadora.module.css'

// 🔴 NÃO HÁ MODO AVANÇADO a partir da RN-2.1. O formulário edita UM período, com todos os campos à
// vista: datas, turno noturno, dias da regra, folga integral, feriado nacional (checkbox) e feriados
// municipais/estaduais (lista). O que era do avançado e não era cálculo — fuso, monitoramento
// eletrônico, observações — saiu; ver `versoes/rn-2-1/formulario.ts`.

export default function Formulario({
  versao,
  entrada,
  aoMudar,
}: {
  /** O rótulo da versão em uso — decide o `emBranco` de um segmento novo (ver `registro.ts`). */
  versao?: string
  entrada: EntradaFormulario
  aoMudar: (e: EntradaFormulario) => void
}) {
  function mudarSegmento(indice: number, s: SegmentoFormulario) {
    aoMudar({ ...entrada, segmentos: entrada.segmentos.map((seg, i) => (i === indice ? s : seg)) })
  }

  const pacote = versaoPorRotulo(versao ?? '') ?? versaoAtual()

  return (
    <div className={estilos.questionario}>
      {entrada.segmentos.map((segmento, indice) => (
        <CamposSegmento
          key={indice}
          segmento={segmento}
          aoMudar={(s) => mudarSegmento(indice, s)}
          //  Não há mais "Remover segmento": com o modo avançado fora, o cálculo tem UM período, e
          // o botão só existiria para apagar o único que há.
        />
      ))}
    </div>
  )
}
