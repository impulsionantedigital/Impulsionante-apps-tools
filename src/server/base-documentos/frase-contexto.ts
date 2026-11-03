import 'server-only'
import { MODELO_CONTEXTO, mensagensDoContexto } from '@/lib/base-documentos/contexto'
import { CHAVE_OPENAI } from '@/server/agente/chaves'
import { registrarCusto } from '@/server/agente/custo'
import { getSecret } from '@/server/secrets'

const URL_CHAT = 'https://api.openai.com/v1/chat/completions'
const TIMEOUT_MS = 15_000
const MAX_FRASE = 400

export async function gerarFraseDeContexto(p: {
  ws: string
  documento: string
  caminho: string[]
  texto: string
}): Promise<string | 'falhou' | 'sem_chave'> {
  const chave = (await getSecret(CHAVE_OPENAI))?.trim()
  if (!chave) return 'sem_chave'

  let enviou = false
  try {
    enviou = true
    const resposta = await fetch(URL_CHAT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELO_CONTEXTO,
        messages: mensagensDoContexto(p),
        reasoning_effort: 'minimal',
        max_completion_tokens: 200,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!resposta.ok) return 'falhou'

    const corpo = (await resposta.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    await registrarCusto({
      workspaceId: p.ws,
      conversaId: null,
      modelo: MODELO_CONTEXTO,
      tokensEntrada: corpo.usage?.prompt_tokens ?? null,
      tokensSaida: corpo.usage?.completion_tokens ?? null,
    })
    const frase = corpo.choices?.[0]?.message?.content?.trim()
    if (!frase) return 'falhou'
    return frase.slice(0, MAX_FRASE)
  } catch (err) {
    const nome = (err as { name?: unknown } | null)?.name
    if (enviou && (nome === 'AbortError' || nome === 'TimeoutError')) {
      await registrarCusto({
        workspaceId: p.ws,
        conversaId: null,
        modelo: MODELO_CONTEXTO,
        tokensEntrada: null,
        tokensSaida: null,
      })
    }
    return 'falhou'
  }
}
