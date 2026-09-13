// Reconciliação entre o que a tela PERGUNTA e o que o motor LÊ.
//
// Uma chave que o questionário coleta e o motor ignora é pergunta inútil na tela;
// uma que o motor lê e o questionário não coleta é cálculo que silenciosamente usa
// `undefined` — foi assim que a POC perdeu o `justicaRestaurativa` (E51), que o
// motor sempre leu e a tela nunca perguntou.

import { describe, it, expect } from 'vitest'
import { CHAVES_CONSUMIDAS } from '@/lib/indulto-comutacao/motores/2025/motor'
import { QUESTIONARIO_2025 } from '@/lib/indulto-comutacao/motores/2025/questionario'

// Campos que existem só para o advogado reconhecer o caso — nunca entram no cálculo.
const SO_DOCUMENTAL = new Set(['sentenciado', 'execucao', 'unidade', 'observacoes'])

const coletadas = new Set(QUESTIONARIO_2025.flatMap((s) => s.campos.map((c) => c.chave)))

describe('reconciliação entre questionário e motor', () => {
  it('não coleta pergunta que o motor ignora', () => {
    const orfas = [...coletadas].filter(
      (c) => !SO_DOCUMENTAL.has(c) && !CHAVES_CONSUMIDAS.includes(c as never),
    )
    expect(orfas, `perguntas sem uso no motor: ${orfas.join(', ')}`).toEqual([])
  })

  it('não lê chave que o questionário não coleta', () => {
    const faltantes = CHAVES_CONSUMIDAS.filter((c) => !coletadas.has(c))
    expect(faltantes, `o motor lê o que ninguém pergunta: ${faltantes.join(', ')}`).toEqual([])
  })

  it('lista o justicaRestaurativa (E51), o bug da POC', () => {
    expect(CHAVES_CONSUMIDAS).toContain('justicaRestaurativa')
    expect(coletadas.has('justicaRestaurativa')).toBe(true)
  })
})
