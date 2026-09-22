// Reconciliação entre o que a tela PERGUNTA e o que o motor LÊ.
//
// Uma chave que o questionário coleta e o motor ignora é pergunta inútil na tela;
// uma que o motor lê e o questionário não coleta é cálculo que silenciosamente usa
// `undefined`.

import { describe, it, expect } from 'vitest'
import { CHAVES_CONSUMIDAS } from '@/lib/indulto-comutacao/motores/2024/motor'
import { QUESTIONARIO_2024 } from '@/lib/indulto-comutacao/motores/2024/questionario'

// Campos que existem só para o advogado reconhecer o caso — nunca entram no cálculo.
const SO_DOCUMENTAL = new Set(['sentenciado', 'execucao', 'unidade', 'observacoes'])

const coletadas = new Set(QUESTIONARIO_2024.flatMap((s) => s.campos.map((c) => c.chave)))

describe('reconciliação entre questionário e motor — 2024', () => {
  it('não coleta pergunta que o motor ignora', () => {
    const orfas = [...coletadas].filter(
      (c) => !SO_DOCUMENTAL.has(c) && !CHAVES_CONSUMIDAS.includes(c as never),
    )
    expect(orfas, `perguntas sem uso no motor: ${orfas.join(', ')}`).toEqual([])
  })

  it('não lê chave que o questionário não coleta', () => {
    const faltando = CHAVES_CONSUMIDAS.filter((c) => !coletadas.has(c))
    expect(faltando, `chaves lidas e não coletadas: ${faltando.join(', ')}`).toEqual([])
  })
})
