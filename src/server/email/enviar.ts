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
      // Os defaults do nodemailer (2 min / 30 s / 10 min) estouram o orçamento do braço
      // (8 s), o limite do tick (45 s) e a reserva da RPC (2 min): um SMTP que emudece depois
      // de aceitar segura o envio até a reserva expirar, e a mesma mensagem sai de novo.
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 8000,
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
