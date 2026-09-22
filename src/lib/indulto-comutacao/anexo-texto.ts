//
// A mesma informação do anexo impresso (CabecalhoAnexo.tsx + Resultado.tsx), em texto puro —
// para colar ao final de uma petição gerada (ver `motores/*/peticoes.ts`). Não desenha nada, só
// formata string. Serve a TODOS os decretos.

import type { Entrada, MotorDecreto, Resultado } from './tipos'
import { VEREDITOS } from './tipos'
import { todasAsRespostas } from './respostas-anexo'
import { enquadramentosDe } from './enquadramentos'
import { fmtDias } from './tempo'

export function formatarAnexoTexto(
  motor: MotorDecreto,
  entrada: Entrada,
  resultado: Resultado,
  titulo: string,
): string {
  const linhas: string[] = []

  linhas.push('ANEXO — CÁLCULO DE INDULTO E COMUTAÇÃO')
  linhas.push(titulo.trim() || 'Cálculo sem identificação')
  linhas.push(`Calculado com ${motor.rotulo} — motor versão ${motor.versao}.`)
  linhas.push('')

  linhas.push('RESPOSTAS INFORMADAS')
  for (const r of todasAsRespostas(motor, entrada)) {
    linhas.push(`- ${r.rotulo}: ${r.valor}`)
  }
  linhas.push('')

  linhas.push('INDULTO')
  for (const e of enquadramentosDe(motor, resultado, 'indulto')) {
    linhas.push(
      `- ${e.rotulo} (${e.descricao}) — Regra geral: ${VEREDITOS[e.geral]}; Regra especial: ${VEREDITOS[e.especial]}`,
    )
  }
  linhas.push('')

  linhas.push('COMUTAÇÃO')
  for (const e of enquadramentosDe(motor, resultado, 'comutacao')) {
    // 🔴 `penaApos` é opcional por decreto — 2024 não o calcula (sempre `null`, ver
    // `motores/2024/motor.ts`), e o anexo não deve inventar um número que o motor não tem.
    const quantum =
      e.geral === 'preenche'
        ? ` (quantum: ${fmtDias(e.quantum ?? null)}${
            e.penaApos != null ? `; pena após: ${fmtDias(e.penaApos)}` : ''
          })`
        : ''
    linhas.push(`- ${e.rotulo} (${e.descricao}) — Situação: ${VEREDITOS[e.geral]}${quantum}`)
  }

  return linhas.join('\n')
}
