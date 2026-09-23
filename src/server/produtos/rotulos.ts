import 'server-only'
import { admin } from '@/server/supabase'
import { ehProdutoInterno } from '@/lib/produtos/catalogo'
import { rotuloDeId } from '@/lib/produtos/rotulos'

/**
 * Traduz uma lista de ids de produto em nomes, numa consulta só.
 *
 * Só vai ao banco pelos ids que NÃO são internos — os do catálogo já têm o rótulo em código. Uma
 * lista 100% interna não faz consulta nenhuma.
 */
export async function rotulosDosProdutos(ws: string, ids: readonly string[]): Promise<Map<string, string>> {
  const externos = [...new Set(ids)].filter((id) => !ehProdutoInterno(id))
  if (externos.length === 0) return new Map()
  const { data, error } = await admin()
    .from('produtos_externos')
    .select('id, nome')
    .eq('workspace_id', ws)
    .in('id', externos)
  if (error) throw error
  return new Map(((data ?? []) as Array<{ id: string; nome: string }>).map((p) => [p.id, p.nome]))
}

/** A lista já traduzida, na ordem de entrada — é o que as telas exibem. */
export async function nomesDosProdutos(ws: string, ids: readonly string[]): Promise<string[]> {
  const mapa = await rotulosDosProdutos(ws, ids)
  return ids.map((id) => rotuloDeId(id, mapa))
}