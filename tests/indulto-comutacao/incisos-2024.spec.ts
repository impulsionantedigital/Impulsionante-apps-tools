import { describe, it, expect } from 'vitest'
import {
  INCISOS_INDULTO_2024,
  INCISOS_COMUTACAO_2024,
  AVISOS_2024,
} from '@/lib/indulto-comutacao/motores/2024/incisos'

describe('incisos de indulto', () => {
  it('traz os 16 do Art. 9º mais o Art. 10 e o Art. 12, na ordem da planilha', () => {
    expect(INCISOS_INDULTO_2024.map((i) => i.id)).toEqual([
      'art9_I', 'art9_II', 'art9_III', 'art9_IV', 'art9_V', 'art9_VI',
      'art9_VII', 'art9_VIII', 'art9_IX', 'art9_X', 'art9_XI', 'art9_XII',
      'art9_XIII', 'art9_XIV', 'art9_XV', 'art9_XVI', 'art10', 'art12',
    ])
  })

  it('marca sem regra especial exatamente onde a planilha não tem coluna T', () => {
    const semEspecial = new Set([
      'art9_XII', 'art9_XIII', 'art9_XIV', 'art9_XV', 'art9_XVI', 'art10', 'art12',
    ])
    for (const meta of INCISOS_INDULTO_2024) {
      expect(meta.temRegraEspecial, meta.id).toBe(!semEspecial.has(meta.id))
    }
  })

  it('descreve o inciso XII com a fração de 2024, não a de 2025', () => {
    const xii = INCISOS_INDULTO_2024.find((i) => i.id === 'art9_XII')!
    expect(xii.descricao).toContain('1/5')
    expect(xii.descricao).toContain('1/4')
    expect(xii.descricao).not.toContain('1/6')
  })
})

describe('incisos de comutação', () => {
  it('traz os três do Art. 11, o Art. 13 e o §4º', () => {
    expect(INCISOS_COMUTACAO_2024.map((i) => i.id)).toEqual([
      'art11_I', 'art11_II', 'art11_III', 'art13', 'art13_4',
    ])
  })

  it('nenhum tem regra especial', () => {
    for (const meta of INCISOS_COMUTACAO_2024) {
      expect(meta.temRegraEspecial, meta.id).toBe(false)
    }
  })
})

describe('AVISOS_2024', () => {
  it('traz as quatro notas fixas da planilha', () => {
    expect(AVISOS_2024.fixos).toHaveLength(4)
  })

  it('avisa sobre a base não impeditiva do inciso VIII', () => {
    const texto = AVISOS_2024.validarJuridicamente.join(' ')
    expect(texto).toMatch(/VIII/)
    expect(texto).toMatch(/não impeditiv/i)
  })

  it('NÃO avisa mais sobre a comparação estrita do Art. 13 — a ambiguidade foi resolvida', () => {
    // O aviso existia porque o motor negava a comutação a quem cumpriu EXATAMENTE a
    // fração (`<` estrito). O dono do produto decidiu aceitar o exato (`<=`), como
    // manda o texto do Decreto. O aviso saiu: descrevia um comportamento que o motor
    // não tem mais. Se ele voltar, o texto tem de voltar a ser verdadeiro.
    const texto = AVISOS_2024.validarJuridicamente.join(' ')
    expect(texto).not.toMatch(/comparação estrita/i)
  })

  it('NÃO menciona pena após a comutação — 2024 não calcula esse valor', () => {
    const texto = AVISOS_2024.validarJuridicamente.join(' ').toLowerCase()
    expect(texto).not.toContain('pena após')
  })
})
