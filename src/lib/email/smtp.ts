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

/**
 * Porta e modo de TLS combinam? Devolve o aviso, ou `null` quando está tudo certo.
 *
 * 🔴 Isto NÃO recusa a configuração — `lerConfigSmtp` continua devolvendo `ok`. É um aviso de
 * tela, e a distinção importa: um provedor pode legitimamente falar TLS implícito numa porta
 * fora de convenção, e recusar por palpite deixaria de pé uma instalação que funcionava.
 *
 * Existe por um caso real: em 13/09/2026 a produção rodou com `SMTP_SECURE=true` na porta 587.
 * A configuração passava por válida, a tela dizia "SMTP configurado", e TODO envio morria no
 * handshake com "wrong version number" — visível só no `ultimo_erro` de cada linha da fila.
 *
 * A convenção: 465 é TLS implícito (`secure: true`); 25 e 587 começam em texto claro e sobem
 * para TLS com STARTTLS (`secure: false`), que é o que o nodemailer faz sozinho.
 */
export function avisoDeTls(config: ConfigSmtp): string | null {
  if (config.porta === 465 && !config.seguro) {
    return 'A porta 465 espera TLS desde o primeiro byte, mas SMTP_SECURE está desligado. ' +
      'O envio tende a falhar no handshake. Use SMTP_SECURE=true, ou mude para a porta 587.'
  }
  if ((config.porta === 587 || config.porta === 25) && config.seguro) {
    return `A porta ${config.porta} começa em texto claro e sobe para TLS com STARTTLS, mas ` +
      'SMTP_SECURE está ligado. O envio tende a falhar no handshake com "wrong version number". ' +
      'Deixe SMTP_SECURE em branco ou false — o STARTTLS acontece sozinho.'
  }
  return null
}
