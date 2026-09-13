import { describe, it, expect } from 'vitest'
import {
  INCISOS_INDULTO_2025,
  INCISOS_COMUTACAO_2025,
  AVISOS_2025,
} from '@/lib/indulto-comutacao/motores/2025/incisos'

describe('incisos de indulto', () => {
  it('traz os 16 do Art. 9º mais o Art. 10 e o Art. 12, na ordem da POC', () => {
    expect(INCISOS_INDULTO_2025.map((i) => i.id)).toEqual([
      'art9_I', 'art9_II', 'art9_III', 'art9_IV', 'art9_V', 'art9_VI',
      'art9_VII', 'art9_VIII', 'art9_IX', 'art9_X', 'art9_XI', 'art9_XII',
      'art9_XIII', 'art9_XIV', 'art9_XV', 'art9_XVI', 'art10', 'art12',
    ])
  })

  it('marca sem regra especial exatamente onde o engine diz "Sem previsão"', () => {
    const semEspecial = new Set([
      'art9_XII', 'art9_XIII', 'art9_XIV', 'art9_XV', 'art9_XVI', 'art10', 'art12',
    ])
    for (const meta of INCISOS_INDULTO_2025) {
      expect(meta.temRegraEspecial, meta.id).toBe(!semEspecial.has(meta.id))
    }
  })

  it('descreve o XVI como condição de saúde, não como regime', () => {
    // Guarda contra a descrição errada: o XVI é condição pessoal grave.
    const xvi = INCISOS_INDULTO_2025.find((i) => i.id === 'art9_XVI')
    expect(xvi?.descricao).toMatch(/saúde|deficiência/i)
  })
})

describe('incisos de comutação', () => {
  it('traz os três do Art. 11, o Art. 13 e o Art. 13 §4º', () => {
    expect(INCISOS_COMUTACAO_2025.map((i) => i.id)).toEqual([
      'art11_I', 'art11_II', 'art11_III', 'art13', 'art13_4',
    ])
  })

  it('não tem regra especial em nenhum deles', () => {
    for (const meta of INCISOS_COMUTACAO_2025) {
      expect(meta.temRegraEspecial, meta.id).toBe(false)
    }
  })
})

describe('avisos', () => {
  it('traz as quatro ambiguidades jurídicas a validar', () => {
    // As duas primeiras vêm do `avisos` do engine.js; as duas últimas saíram da
    // auditoria do porte (Task 6) e não têm contraparte no engine.
    expect(AVISOS_2025.validarJuridicamente).toHaveLength(4)
    const texto = AVISOS_2025.validarJuridicamente.join(' ')
    expect(texto).toMatch(/pena total imposta/i)
    expect(texto).toMatch(/remanescente/i)
    expect(texto).toMatch(/DOBRA o teto/i)
    expect(texto).toMatch(/NÃO SE APLICA/i)
  })

  it('traz as quatro notas fixas da POC', () => {
    expect(AVISOS_2025.fixos).toHaveLength(4)
    expect(AVISOS_2025.fixos.join(' ')).toMatch(/impeditivos/i)
  })

  it('dá rótulo e descrição a todo inciso', () => {
    for (const meta of [...INCISOS_INDULTO_2025, ...INCISOS_COMUTACAO_2025]) {
      expect(meta.rotulo.trim().length, meta.id).toBeGreaterThan(0)
      expect(meta.descricao.trim().length, meta.id).toBeGreaterThan(0)
    }
  })
})
