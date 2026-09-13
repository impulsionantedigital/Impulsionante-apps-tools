import 'server-only'
import nodemailer from 'nodemailer'
import { lerConfigSmtp, type ConfigSmtp, type LeituraSmtp } from '@/lib/email/smtp'
import type { Envelope } from '@/lib/email/envelope'

export type ResultadoEnvio = { ok: true } | { erro: string }

export function configAtual(): LeituraSmtp {
  return lerConfigSmtp(process.env)
}

export async function enviarEnvelope(
  envelope: Envelope,
  config: ConfigSmtp,
): Promise<ResultadoEnvio> {
  try {
    const transporte = nodemailer.createTransport({
      host: config.host,
      port: config.porta,
      secure: config.seguro,
      auth: { user: config.usuario, pass: config.senha },
    })
    await transporte.sendMail({
      from: envelope.de,
      to: envelope.para,
      subject: envelope.assunto,
      html: envelope.html,
      text: envelope.texto,
    })
    return { ok: true }
  } catch (err) {
    const cru = err instanceof Error ? err.message : String(err)
    const limpo = config.senha === '' ? cru : cru.split(config.senha).join('***')
    return { erro: limpo.slice(0, 300) }
  }
}
