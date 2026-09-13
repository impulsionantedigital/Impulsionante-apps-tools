import { describe, it, expect, vi, beforeEach } from 'vitest'

const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn()
  const createTransport = vi.fn(() => ({ sendMail }))
  return { sendMail, createTransport }
})

vi.mock('nodemailer', () => ({ default: { createTransport } }))

import { enviarEnvelope } from '@/server/email/enviar'
import type { ConfigSmtp } from '@/lib/email/smtp'

const CONFIG: ConfigSmtp = {
  host: 'smtp.exemplo.com',
  porta: 587,
  seguro: false,
  usuario: 'u',
  senha: 's',
  remetente: 'GPS <nao-responda@exemplo.com>',
}

const ENVELOPE = {
  de: 'GPS <nao-responda@exemplo.com>',
  para: 'ana@exemplo.com',
  assunto: 'Oi',
  html: '<p>Oi</p>',
  texto: 'Oi',
}

beforeEach(() => {
  sendMail.mockReset()
  createTransport.mockClear()
})

describe('enviarEnvelope', () => {
  it('monta o transporte com host, porta, segurança e credenciais', async () => {
    sendMail.mockResolvedValue({ messageId: '1' })
    await enviarEnvelope(ENVELOPE, CONFIG)
    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.exemplo.com',
      port: 587,
      secure: false,
      auth: { user: 'u', pass: 's' },
    })
  })

  it('traduz o envelope para os campos do nodemailer', async () => {
    sendMail.mockResolvedValue({ messageId: '1' })
    await enviarEnvelope(ENVELOPE, CONFIG)
    expect(sendMail).toHaveBeenCalledWith({
      from: 'GPS <nao-responda@exemplo.com>',
      to: 'ana@exemplo.com',
      subject: 'Oi',
      html: '<p>Oi</p>',
      text: 'Oi',
    })
  })

  it('devolve ok quando o envio conclui', async () => {
    sendMail.mockResolvedValue({ messageId: '1' })
    expect(await enviarEnvelope(ENVELOPE, CONFIG)).toEqual({ ok: true })
  })

  it('devolve erro em vez de lançar quando o SMTP falha', async () => {
    sendMail.mockRejectedValue(new Error('ECONNREFUSED 10.0.0.1:587'))
    const r = await enviarEnvelope(ENVELOPE, CONFIG)
    expect(r).toHaveProperty('erro')
  })

  it('não deixa a senha SMTP vazar na mensagem de erro', async () => {
    sendMail.mockRejectedValue(new Error('auth falhou para u com senha super-secreta'))
    const r = await enviarEnvelope(ENVELOPE, { ...CONFIG, senha: 'super-secreta' })
    if ('ok' in r) throw new Error('inesperado')
    expect(r.erro).not.toContain('super-secreta')
  })
})
