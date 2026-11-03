







import 'server-only'
import { DIMENSAO_DO_ESQUEMA, carimbo, conferirDimensao } from '@/lib/canais/base-conhecimento'
import { CHAVE_OPENAI } from '@/server/agente/chaves'
import { registrarCusto } from '@/server/agente/custo'
import { getSecret } from '@/server/secrets'


export const MODELO_EMBEDDING_PADRAO = 'text-embedding-3-small'
const URL_EMBEDDINGS = 'https://api.openai.com/v1/embeddings'

const TIMEOUT_MS = 10_000


export async function embedar(
  texto: string,
  opts: { ws: string; conversaId: string | null; sinal?: AbortSignal },
): Promise<{ vetor: number[]; versao: string } | null> {
  const chave = (await getSecret(CHAVE_OPENAI))?.trim()
  if (!chave) return null

  const modelo = MODELO_EMBEDDING_PADRAO
  
  
  if (!conferirDimensao(modelo).ok) return null

  
  
  
  
  
  
  
  
  
  
  
  
  let enviou = false
  try {
    enviou = opts.sinal?.aborted !== true
    const resposta = await fetch(URL_EMBEDDINGS, {
      method: 'POST',
      
      
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelo, input: texto }),
      
      
      
      
      signal: opts.sinal
        ? AbortSignal.any([opts.sinal, AbortSignal.timeout(TIMEOUT_MS)])
        : AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!resposta.ok) return null

    const corpo = (await resposta.json()) as {
      data?: Array<{ embedding?: number[] }>
      usage?: { prompt_tokens?: number }
    }
    const vetor = corpo.data?.[0]?.embedding
    if (!Array.isArray(vetor) || vetor.length !== DIMENSAO_DO_ESQUEMA) return null

    const lidos = corpo.usage?.prompt_tokens

    await registrarCusto({
      workspaceId: opts.ws,
      conversaId: opts.conversaId,
      modelo,
      
      
      
      
      tokensEntrada: lidos ?? null,
      
      
      
      tokensSaida: lidos === undefined ? null : 0,
    })

    return { vetor, versao: carimbo(modelo) }
  } catch (err) {
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    if (enviou && ehAborto(err)) {
      await registrarCusto({
        workspaceId: opts.ws,
        conversaId: opts.conversaId,
        modelo,
        tokensEntrada: null,
        tokensSaida: null,
      })
    }
    
    
    return null
  }
}


function ehAborto(err: unknown): boolean {
  const nome = (err as { name?: unknown } | null)?.name
  return nome === 'AbortError' || nome === 'TimeoutError'
}

const MAX_LOTE = 64

/** Vários textos numa chamada só. `'sem_chave'` sem chave; `null` em falha, dimensão ou contagem erradas. */
export async function embedarLote(
  textos: string[],
  opts: { ws: string },
): Promise<{ vetores: number[][]; versao: string } | 'sem_chave' | null> {
  if (textos.length === 0 || textos.length > MAX_LOTE) {
    throw new Error(`embedarLote aceita de 1 a ${MAX_LOTE} textos (recebeu ${textos.length})`)
  }
  const chave = (await getSecret(CHAVE_OPENAI))?.trim()
  if (!chave) return 'sem_chave'

  const modelo = MODELO_EMBEDDING_PADRAO
  if (!conferirDimensao(modelo).ok) return null

  let enviou = false
  try {
    enviou = true
    const resposta = await fetch(URL_EMBEDDINGS, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelo, input: textos }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!resposta.ok) return null

    const corpo = (await resposta.json()) as {
      data?: Array<{ index?: number; embedding?: number[] }>
      usage?: { prompt_tokens?: number }
    }
    const data = corpo.data
    if (!Array.isArray(data) || data.length !== textos.length) return null
    const ordenados = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    const vetores: number[][] = []
    for (const d of ordenados) {
      if (!Array.isArray(d.embedding) || d.embedding.length !== DIMENSAO_DO_ESQUEMA) return null
      vetores.push(d.embedding)
    }

    const lidos = corpo.usage?.prompt_tokens
    await registrarCusto({
      workspaceId: opts.ws,
      conversaId: null,
      modelo,
      tokensEntrada: lidos ?? null,
      tokensSaida: lidos === undefined ? null : 0,
    })
    return { vetores, versao: carimbo(modelo) }
  } catch (err) {
    if (enviou && ehAborto(err)) {
      await registrarCusto({
        workspaceId: opts.ws,
        conversaId: null,
        modelo,
        tokensEntrada: null,
        tokensSaida: null,
      })
    }
    return null
  }
}
