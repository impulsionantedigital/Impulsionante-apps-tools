import { describe, it, expect } from 'vitest'
import { htmlParaTexto } from '@/lib/email/envelope'

describe('htmlParaTexto', () => {
  it('remove marcação e devolve o texto legível', () => {
    expect(htmlParaTexto('<p>Olá <b>Ana</b></p>')).toBe('Olá Ana')
  })

  it('vira quebra de linha em <br> e </p>', () => {
    expect(htmlParaTexto('<p>um</p><p>dois</p>')).toBe('um\ndois')
    expect(htmlParaTexto('um<br>dois')).toBe('um\ndois')
  })

  it('desfaz as entidades que o escape produziu', () => {
    expect(htmlParaTexto('<p>Bar &amp; Cia &lt;x&gt;</p>')).toBe('Bar & Cia <x>')
  })

  it('colapsa espaços e apara as pontas', () => {
    expect(htmlParaTexto('  <p>  a   b  </p>  ')).toBe('a b')
  })
})
