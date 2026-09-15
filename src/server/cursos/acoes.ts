'use server'

import { criarClienteServidor } from '@/server/supabase-session'
import { admin } from '@/server/supabase'
import { resolverWorkspaceAtivo } from '@/server/auth/workspace-ativo'
import { ehOwnerDoWorkspace } from '@/server/auth/owner-workspace'
import { exigirEngineLiberado } from '@/server/license/exigir'
import { ehCategoriaConhecida } from '@/lib/cursos/categorias'
import { detalheSeguro } from '@/lib/sanitizar-erro'

type Res = { ok: true } | { erro: string }
type ResId = { ok: true; id: string } | { erro: string }

export type CursoResumo = {
  id: string; produto_id: string; categoria: string; titulo: string; publicado: boolean; ordem: number
}
export type CursoDetalhe = CursoResumo & { descricao: string | null; capa_url: string | null }

/**
 * 🔴 A guarda de `/cursos/layout.tsx` não basta sozinha: uma chamada direta pelo id da server
 * action passa por cima de layouts (mesmo problema documentado em `src/server/crm/acoes.ts`).
 * Por isso toda ação aqui resolve o workspace ATIVO e confere que quem chama é dono DELE — não
 * "dono de algum workspace", que deixaria o owner de um workspace mexer no de outro.
 */
async function sessaoAdminCursos() {
  const cliente = await criarClienteServidor()
  const ws = await resolverWorkspaceAtivo({ cliente })
  if (!ws || !(await ehOwnerDoWorkspace(ws))) return { cliente, ws: null as string | null }
  return { cliente, ws }
}

export async function listarCursos(): Promise<CursoResumo[]> {
  const { cliente, ws } = await sessaoAdminCursos()
  if (!ws) return []
  const { data, error } = await cliente
    .from('cursos')
    .select('id, produto_id, categoria, titulo, publicado, ordem')
    .eq('workspace_id', ws)
    .order('ordem')
  if (error) throw error
  return (data as CursoResumo[] | null) ?? []
}

export async function criarCurso({ titulo, categoria, produtoId }: {
  titulo: string; categoria: string; produtoId: string
}): Promise<ResId> {
  await exigirEngineLiberado()
  const tituloLimpo = titulo.trim()
  const produtoLimpo = produtoId.trim()
  if (!tituloLimpo) return { erro: 'titulo_vazio' }
  if (!produtoLimpo) return { erro: 'produto_vazio' }
  if (!ehCategoriaConhecida(categoria)) return { erro: 'categoria_invalida' }
  const { cliente, ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    const { data: existentes } = await cliente.from('cursos').select('ordem').eq('workspace_id', ws)
    const ordem = ((existentes as { ordem: number }[] | null) ?? []).reduce((m, l) => Math.max(m, l.ordem), -1) + 1
    const { data, error } = await admin()
      .from('cursos')
      .insert({ workspace_id: ws, titulo: tituloLimpo, categoria, produto_id: produtoLimpo, ordem })
      .select('id')
      .single()
    if (error) throw error
    return { ok: true, id: (data as { id: string }).id }
  } catch (err) {
    console.error('[cursos] criar', detalheSeguro(err))
    const codigo = (err as { code?: string } | null)?.code
    return { erro: codigo === '23505' ? 'produto_duplicado' : 'falha_criar' }
  }
}

export async function salvarCurso({ id, titulo, categoria, produtoId, descricao, capaUrl, publicado }: {
  id: string; titulo: string; categoria: string; produtoId: string
  descricao: string | null; capaUrl: string | null; publicado: boolean
}): Promise<Res> {
  await exigirEngineLiberado()
  const tituloLimpo = titulo.trim()
  const produtoLimpo = produtoId.trim()
  if (!tituloLimpo) return { erro: 'titulo_vazio' }
  if (!produtoLimpo) return { erro: 'produto_vazio' }
  if (!ehCategoriaConhecida(categoria)) return { erro: 'categoria_invalida' }
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    const { error } = await admin()
      .from('cursos')
      .update({ titulo: tituloLimpo, categoria, produto_id: produtoLimpo, descricao, capa_url: capaUrl, publicado })
      .eq('workspace_id', ws)
      .eq('id', id)
    if (error) throw error
    return { ok: true }
  } catch (err) {
    console.error('[cursos] salvar', detalheSeguro(err))
    const codigo = (err as { code?: string } | null)?.code
    return { erro: codigo === '23505' ? 'produto_duplicado' : 'falha_salvar' }
  }
}

export async function alternarPublicadoCurso({ id, publicado }: { id: string; publicado: boolean }): Promise<Res> {
  await exigirEngineLiberado()
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    const { error } = await admin().from('cursos').update({ publicado }).eq('workspace_id', ws).eq('id', id)
    if (error) throw error
    return { ok: true }
  } catch (err) {
    console.error('[cursos] alternarPublicado', detalheSeguro(err))
    return { erro: 'falha_salvar' }
  }
}

export async function excluirCurso({ id }: { id: string }): Promise<Res> {
  await exigirEngineLiberado()
  const { cliente, ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    const { count } = await cliente
      .from('modulos')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', ws)
      .eq('curso_id', id)
    if ((count ?? 0) > 0) return { erro: 'em_uso' }
    const { error } = await admin().from('cursos').delete().eq('workspace_id', ws).eq('id', id)
    if (error) throw error
    return { ok: true }
  } catch (err) {
    console.error('[cursos] excluir', detalheSeguro(err))
    return { erro: 'falha_excluir' }
  }
}

export async function reordenarCursos({ ordemIds }: { ordemIds: string[] }): Promise<Res> {
  await exigirEngineLiberado()
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    for (let i = 0; i < ordemIds.length; i++) {
      const { error } = await admin().from('cursos').update({ ordem: i }).eq('workspace_id', ws).eq('id', ordemIds[i])
      if (error) throw error
    }
    return { ok: true }
  } catch (err) {
    console.error('[cursos] reordenar', detalheSeguro(err))
    return { erro: 'falha_reordenar' }
  }
}
