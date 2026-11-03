import 'server-only'
import { admin } from '@/server/supabase'
import { PRODUTOS } from '@/lib/produtos/catalogo'

export type ProdutoVendavel = { id: string; rotulo: string }

/**
 * Todo produto que pode aparecer no array `produtos` de uma oferta: as ferramentas fixas
 * (PRODUTOS, motores de calculadora) mais os cursos cadastrados neste workspace. Ao contrário de
 * PRODUTOS, curso é dado — por isso esta função consulta o banco a cada chamada, não é constante.
 */
export async function produtosVendaveis(ws: string): Promise<ProdutoVendavel[]> {
  const { data, error } = await admin().from('cursos').select('produto_id, titulo').eq('workspace_id', ws)
  if (error) throw error
  const cursos = ((data ?? []) as { produto_id: string; titulo: string }[]).map((c) => ({ id: c.produto_id, rotulo: c.titulo }))
  return [...PRODUTOS.map((p) => ({ id: p.id, rotulo: p.rotulo })), ...cursos]
}

export async function idsDeProdutoValidos(ws: string): Promise<Set<string>> {
  return new Set((await produtosVendaveis(ws)).map((p) => p.id))
}

export function rotuloDeProdutoVendavel(vendaveis: readonly ProdutoVendavel[], id: string): string {
  return vendaveis.find((p) => p.id === id)?.rotulo ?? id
}
