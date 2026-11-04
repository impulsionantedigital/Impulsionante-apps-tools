























































































export type MotivoDaRecusa = 'canal_nao_pareado' | 'instancia_diferente' | 'token_diferente'

export type IdentidadeDoEnvelope = { ok: true } | { ok: false; motivo: MotivoDaRecusa }


// `provider` escolhe ONDE o envelope declara a instância. Só 'evolution' lê outro formato; qualquer
// outro valor (ou nenhum) é a leitura da uazapi, intocada — um envelope uazapi não ganha forma nova
// de passar na conferência.
export function nomeDaInstancia(envelope: unknown, provider?: string): string | null {
  if (!envelope || typeof envelope !== 'object') return null
  if (provider === 'evolution') {
    const nome = (envelope as { instance?: unknown }).instance
    return typeof nome === 'string' && nome !== '' ? nome : null
  }
  const env = envelope as { instance?: unknown; instanceName?: unknown }
  const aninhado =
    env.instance && typeof env.instance === 'object'
      ? (env.instance as { name?: unknown }).name
      : undefined
  if (typeof aninhado === 'string' && aninhado !== '') return aninhado
  if (typeof env.instanceName === 'string' && env.instanceName !== '') return env.instanceName
  return null
}


export function tokenDeclarado(envelope: unknown, provider?: string): string | null {
  if (!envelope || typeof envelope !== 'object') return null
  // Evolution: a `apikey` da instância vem em todo webhook, então é OBRIGATÓRIA — ausente vira ''
  // (que nunca casa), em vez de null (que a conferência trata como "não declarou").
  if (provider === 'evolution') {
    const chave = (envelope as { apikey?: unknown }).apikey
    return typeof chave === 'string' ? chave : ''
  }
  const env = envelope as { token?: unknown }
  if (env.token === undefined) return null
  return typeof env.token === 'string' ? env.token : ''
}


export function conferirIdentidade(
  e: {
    
    tokenDeclarado: string | null
    nomeDaInstancia: string | null
    
    tokenDoCanal: string
    externalId: string | null
  },
  comparar: (a: string, b: string) => boolean,
): IdentidadeDoEnvelope {
  if (!e.externalId) return { ok: false, motivo: 'canal_nao_pareado' }
  if (e.nomeDaInstancia === null || e.nomeDaInstancia !== e.externalId) {
    return { ok: false, motivo: 'instancia_diferente' }
  }
  
  if (e.tokenDeclarado !== null && !comparar(e.tokenDeclarado, e.tokenDoCanal)) {
    return { ok: false, motivo: 'token_diferente' }
  }
  return { ok: true }
}
