export interface ConfigSmtp {
  host: string
  porta: number
  seguro: boolean
  usuario: string
  senha: string
  remetente: string
}

export type LeituraSmtp = { ok: true; config: ConfigSmtp } | { ok: false; faltando: string[] }

const OBRIGATORIAS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] as const

function aparar(env: Record<string, string | undefined>, chave: string): string {
  return (env[chave] ?? '').trim()
}

export function lerConfigSmtp(env: Record<string, string | undefined>): LeituraSmtp {
  const faltando = OBRIGATORIAS.filter((chave) => aparar(env, chave) === '')
  if (faltando.length > 0) return { ok: false, faltando: [...faltando] }

  const porta = Number(aparar(env, 'SMTP_PORT'))
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) {
    return { ok: false, faltando: ['SMTP_PORT'] }
  }

  const dito = aparar(env, 'SMTP_SECURE').toLowerCase()
  const VERDADEIROS = ['true', '1', 'yes', 'on']
  const FALSOS = ['false', '0', 'no', 'off']
  let seguro: boolean
  if (dito === '') {
    seguro = porta === 465
  } else if (VERDADEIROS.includes(dito)) {
    seguro = true
  } else if (FALSOS.includes(dito)) {
    seguro = false
  } else {
    // Um valor não reconhecido não pode virar `false` em silêncio: com SMTP_SECURE=1 e
    // SMTP_PORT=465 (porta de TLS implícito), assumir false ligaria em texto claro contra uma
    // porta que espera TLS desde o handshake — o mesmo pendurar do timeout sem limite.
    return { ok: false, faltando: ['SMTP_SECURE'] }
  }

  return {
    ok: true,
    config: {
      host: aparar(env, 'SMTP_HOST'),
      porta,
      seguro,
      usuario: aparar(env, 'SMTP_USER'),
      senha: aparar(env, 'SMTP_PASS'),
      remetente: aparar(env, 'SMTP_FROM'),
    },
  }
}
