import { describe, it, expect } from 'vitest'
import { montarEnvelope, htmlParaTexto } from '@/lib/email/envelope'
import type { ConfigSmtp } from '@/lib/email/smtp'

const CONFIG: ConfigSmtp = {
  host: 'smtp.exemplo.com',
  porta: 587,
  seguro: false,
  usuario: 'u',
  senha: 's',
  remetente: 'GPS <nao-responda@exemplo.com>',
}

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

describe('montarEnvelope', () => {
  const modelo = { assunto: 'Bem-vindo, [MEMBER_NAME]', html: '<p>Olá [MEMBER_NAME]</p>' }

  it('usa o remetente da configuração e o destinatário dado', () => {
    const e = montarEnvelope(CONFIG, 'ana@exemplo.com', modelo, { MEMBER_NAME: 'Ana' })
    expect(e.de).toBe('GPS <nao-responda@exemplo.com>')
    expect(e.para).toBe('ana@exemplo.com')
  })

  it('renderiza o assunto SEM escapar e o corpo COM escape', () => {
    const e = montarEnvelope(CONFIG, 'a@b.c', modelo, { MEMBER_NAME: 'Bar & Cia' })
    expect(e.assunto).toBe('Bem-vindo, Bar & Cia')
    expect(e.html).toBe('<p>Olá Bar &amp; Cia</p>')
  })

  it('deriva a alternativa em texto do corpo já renderizado', () => {
    const e = montarEnvelope(CONFIG, 'a@b.c', modelo, { MEMBER_NAME: 'Bar & Cia' })
    expect(e.texto).toBe('Olá Bar & Cia')
  })
})
