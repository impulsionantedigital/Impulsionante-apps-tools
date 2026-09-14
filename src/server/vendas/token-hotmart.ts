import 'server-only'
import { getSecret } from '@/server/secrets'
import { CHAVE_HOTTOK_HOTMART } from '@/lib/vendas/hotmart'

const VALIDADE_MS = 60_000

let emCache: { valor: string | null; ate: number } | null = null

/**
 * O token da Hotmart, lido do cofre no máximo uma vez por minuto. Sem isto, uma inundação de
 * chamadas sem token viraria uma consulta ao banco por chamada.
 */
export async function tokenHotmart(agoraMs = Date.now()): Promise<string | null> {
  if (emCache && emCache.ate > agoraMs) return emCache.valor
  const valor = await getSecret(CHAVE_HOTTOK_HOTMART)
  emCache = { valor, ate: agoraMs + VALIDADE_MS }
  return valor
}

/** Chamado ao salvar um token novo, para ele valer já. */
export function esquecerTokenHotmart(): void {
  emCache = null
}
