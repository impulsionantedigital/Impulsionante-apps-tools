import { readBodyCapped } from '@/server/http/readBodyCapped'
import { iguaisTimingSafe } from '@/server/http/timing-safe'
import { receberCompra } from '@/server/vendas/processar'
import { tokenHotmart } from '@/server/vendas/token-hotmart'
import { consumir, type Balde, type EstadoBalde } from '@/lib/canais/rateLimit'
import { detalheSeguro } from '@/lib/sanitizar-erro'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BALDE: Balde = { capacidade: 120, recargaPorMs: 4 / 1000, teto: 10 }
const BALDES = new Map<string, EstadoBalde>()

export async function POST(
  req: Request,
  ctx: { params: Promise<{ plataforma: string }> },
): Promise<Response> {
  const { plataforma } = await ctx.params
  if (plataforma !== 'hotmart') return new Response(null, { status: 404 })

  // O token vem ANTES de ler o corpo: sem ele, uma chamada não custa mais do que um cabeçalho.
  // Só vale no cabeçalho — nunca na URL, onde acabaria em log de proxy.
  const esperado = await tokenHotmart()
  if (!esperado) return new Response(null, { status: 503 })
  if (!iguaisTimingSafe(req.headers.get('x-hotmart-hottok') ?? '', esperado)) {
    return new Response(null, { status: 401 })
  }

  // O limitador só conta chamadas autenticadas: um estranho não o gasta para negar as legítimas.
  if (!consumir(BALDES, BALDE, plataforma, Date.now())) {
    return new Response(null, { status: 429, headers: { 'retry-after': '5' } })
  }

  const corpo = await readBodyCapped(req)
  if (!corpo.ok) return new Response(null, { status: 413 })

  let payload: unknown = null
  try {
    payload = JSON.parse(corpo.raw)
  } catch {
    payload = null
  }

  try {
    // 🔴 Erro inesperado devolve 500 DE PROPÓSITO: a Hotmart reenvia, e a chave única da
    // transação torna o reenvio seguro (§7.6). Compra de outro produto é 200.
    const resultado = await receberCompra('hotmart', payload, corpo.raw)
    return resultado === 'ok' ? Response.json({ ok: true }) : new Response(null, { status: 500 })
  } catch (err) {
    console.error('[webhook/hotmart] falha ao processar:', detalheSeguro(err))
    return new Response(null, { status: 500 })
  }
}
