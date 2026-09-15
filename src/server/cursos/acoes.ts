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
 *
 * 🔴 Devolve só `ws`, nunca o `cliente` da sessão: a RLS de `cursos`/`modulos`/`aulas` (migration
 * 0066) só libera `authenticated` para conteúdo PUBLICADO com compra ativa — o dono gerenciando
 * rascunhos não se enxerga por essa policy. Toda leitura/escrita de conteúdo aqui é por
 * `admin()`, no mesmo padrão de `lerComercial()` em `acoes-comercial.ts` para `ofertas`/`vendas`
 * (mesma forma de RLS: só `service_role`). Não reintroduza `cliente` para consultar estas
 * tabelas — é exatamente o bug que a Task 3 corrigiu na revisão.
 */
async function sessaoAdminCursos(): Promise<{ ws: string | null }> {
  const cliente = await criarClienteServidor()
  const ws = await resolverWorkspaceAtivo({ cliente })
  if (!ws || !(await ehOwnerDoWorkspace(ws))) return { ws: null }
  return { ws }
}

export async function listarCursos(): Promise<CursoResumo[]> {
  const { ws } = await sessaoAdminCursos()
  if (!ws) return []
  // 🔴 admin(), não `cliente`: a RLS de `cursos` só libera `authenticated` para conteúdo
  // publicado com compra ativa (política `cursos_membro_select`, migration 0066) — não existe
  // policy de leitura ampla para o dono gerenciar rascunhos. Mesmo padrão de `lerComercial()`
  // em `src/app/(app)/config/acoes-comercial.ts` para `ofertas`/`vendas`, que têm a mesma forma
  // de RLS (só service_role).
  const { data, error } = await admin()
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
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    // admin(), pelo mesmo motivo de listarCursos(): `cliente` não enxerga rascunhos.
    const { data: existentes, error: erroOrdem } = await admin().from('cursos').select('ordem').eq('workspace_id', ws)
    if (erroOrdem) throw erroOrdem
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
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    // admin(), pelo mesmo motivo de listarCursos(): `cliente` sob RLS não vê módulos de
    // cursos não publicados, e esta contagem decide se a exclusão é bloqueada.
    const { count, error: erroContagem } = await admin()
      .from('modulos')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', ws)
      .eq('curso_id', id)
    if (erroContagem) throw erroContagem
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

export type ModuloResumo = { id: string; titulo: string; ordem: number; total_aulas: number }

export async function carregarCursoComModulos(cursoId: string): Promise<(CursoDetalhe & { modulos: ModuloResumo[] }) | null> {
  const { ws } = await sessaoAdminCursos()
  if (!ws) return null
  // admin() em toda leitura de conteúdo: ver o comentário de sessaoAdminCursos().
  const { data: c, error } = await admin()
    .from('cursos')
    .select('id, produto_id, categoria, titulo, publicado, ordem, descricao, capa_url')
    .eq('workspace_id', ws)
    .eq('id', cursoId)
    .maybeSingle()
  if (error) throw error
  if (!c) return null

  const { data: mods } = await admin()
    .from('modulos')
    .select('id, titulo, ordem')
    .eq('workspace_id', ws)
    .eq('curso_id', cursoId)
    .order('ordem')
  const modulos = (mods as { id: string; titulo: string; ordem: number }[] | null) ?? []

  const idsModulo = modulos.map((m) => m.id)
  const cont = new Map<string, number>()
  if (idsModulo.length > 0) {
    const { data: aulas } = await admin().from('aulas').select('modulo_id').eq('workspace_id', ws).in('modulo_id', idsModulo)
    for (const a of (aulas as { modulo_id: string }[] | null) ?? []) cont.set(a.modulo_id, (cont.get(a.modulo_id) ?? 0) + 1)
  }

  return { ...(c as CursoDetalhe), modulos: modulos.map((m) => ({ ...m, total_aulas: cont.get(m.id) ?? 0 })) }
}

export async function criarModulo({ cursoId, titulo }: { cursoId: string; titulo: string }): Promise<ResId> {
  await exigirEngineLiberado()
  const limpo = titulo.trim()
  if (!limpo) return { erro: 'titulo_vazio' }
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    const { data: curso } = await admin().from('cursos').select('id').eq('workspace_id', ws).eq('id', cursoId).maybeSingle()
    if (!curso) return { erro: 'curso_nao_encontrado' }
    const { data: existentes, error: erroOrdem } = await admin().from('modulos').select('ordem').eq('workspace_id', ws).eq('curso_id', cursoId)
    if (erroOrdem) throw erroOrdem
    const ordem = ((existentes as { ordem: number }[] | null) ?? []).reduce((m, l) => Math.max(m, l.ordem), -1) + 1
    const { data, error } = await admin()
      .from('modulos')
      .insert({ workspace_id: ws, curso_id: cursoId, titulo: limpo, ordem })
      .select('id')
      .single()
    if (error) throw error
    return { ok: true, id: (data as { id: string }).id }
  } catch (err) {
    console.error('[cursos] criarModulo', detalheSeguro(err))
    return { erro: 'falha_criar' }
  }
}

export async function renomearModulo({ id, titulo }: { id: string; titulo: string }): Promise<Res> {
  await exigirEngineLiberado()
  const limpo = titulo.trim()
  if (!limpo) return { erro: 'titulo_vazio' }
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    const { error } = await admin().from('modulos').update({ titulo: limpo }).eq('workspace_id', ws).eq('id', id)
    if (error) throw error
    return { ok: true }
  } catch (err) {
    console.error('[cursos] renomearModulo', detalheSeguro(err))
    return { erro: 'falha_renomear' }
  }
}

export async function excluirModulo({ id }: { id: string }): Promise<Res> {
  await exigirEngineLiberado()
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    const { count, error: erroContagem } = await admin().from('aulas').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).eq('modulo_id', id)
    if (erroContagem) throw erroContagem
    if ((count ?? 0) > 0) return { erro: 'em_uso' }
    const { error } = await admin().from('modulos').delete().eq('workspace_id', ws).eq('id', id)
    if (error) throw error
    return { ok: true }
  } catch (err) {
    console.error('[cursos] excluirModulo', detalheSeguro(err))
    return { erro: 'falha_excluir' }
  }
}

export async function reordenarModulos({ cursoId, ordemIds }: { cursoId: string; ordemIds: string[] }): Promise<Res> {
  await exigirEngineLiberado()
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    for (let i = 0; i < ordemIds.length; i++) {
      const { error } = await admin().from('modulos').update({ ordem: i })
        .eq('workspace_id', ws).eq('curso_id', cursoId).eq('id', ordemIds[i])
      if (error) throw error
    }
    return { ok: true }
  } catch (err) {
    console.error('[cursos] reordenarModulos', detalheSeguro(err))
    return { erro: 'falha_reordenar' }
  }
}

export type AulaItem = {
  id: string; titulo: string; descricao: string | null; video_youtube_id: string | null; publicado: boolean; ordem: number
}
export type ModuloComAulas = { id: string; curso_id: string; curso_titulo: string; titulo: string; aulas: AulaItem[] }

export async function carregarModuloComAulas(moduloId: string): Promise<ModuloComAulas | null> {
  const { ws } = await sessaoAdminCursos()
  if (!ws) return null
  // admin() em toda leitura de conteúdo: ver o comentário de sessaoAdminCursos().
  const { data: mo, error } = await admin()
    .from('modulos')
    .select('id, curso_id, titulo, cursos(titulo)')
    .eq('workspace_id', ws)
    .eq('id', moduloId)
    .maybeSingle()
  if (error) throw error
  if (!mo) return null

  const linha = mo as { id: string; curso_id: string; titulo: string; cursos: { titulo: string } | { titulo: string }[] | null }
  const cursoTitulo = Array.isArray(linha.cursos) ? (linha.cursos[0]?.titulo ?? '') : (linha.cursos?.titulo ?? '')

  const { data: aulas } = await admin()
    .from('aulas')
    .select('id, titulo, descricao, video_youtube_id, publicado, ordem')
    .eq('workspace_id', ws)
    .eq('modulo_id', moduloId)
    .order('ordem')

  return {
    id: linha.id, curso_id: linha.curso_id, curso_titulo: cursoTitulo, titulo: linha.titulo,
    aulas: (aulas as AulaItem[] | null) ?? [],
  }
}

export async function criarAula({ moduloId, titulo }: { moduloId: string; titulo: string }): Promise<ResId> {
  await exigirEngineLiberado()
  const limpo = titulo.trim()
  if (!limpo) return { erro: 'titulo_vazio' }
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    const { data: modulo } = await admin().from('modulos').select('id').eq('workspace_id', ws).eq('id', moduloId).maybeSingle()
    if (!modulo) return { erro: 'modulo_nao_encontrado' }
    const { data: existentes, error: erroOrdem } = await admin().from('aulas').select('ordem').eq('workspace_id', ws).eq('modulo_id', moduloId)
    if (erroOrdem) throw erroOrdem
    const ordem = ((existentes as { ordem: number }[] | null) ?? []).reduce((m, l) => Math.max(m, l.ordem), -1) + 1
    const { data, error } = await admin()
      .from('aulas')
      .insert({ workspace_id: ws, modulo_id: moduloId, titulo: limpo, ordem })
      .select('id')
      .single()
    if (error) throw error
    return { ok: true, id: (data as { id: string }).id }
  } catch (err) {
    console.error('[cursos] criarAula', detalheSeguro(err))
    return { erro: 'falha_criar' }
  }
}

export async function salvarAula({ id, titulo, descricao, videoYoutubeId, publicado }: {
  id: string; titulo: string; descricao: string | null; videoYoutubeId: string | null; publicado: boolean
}): Promise<Res> {
  await exigirEngineLiberado()
  const limpo = titulo.trim()
  if (!limpo) return { erro: 'titulo_vazio' }
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    const { error } = await admin()
      .from('aulas')
      .update({ titulo: limpo, descricao, video_youtube_id: videoYoutubeId, publicado })
      .eq('workspace_id', ws)
      .eq('id', id)
    if (error) throw error
    return { ok: true }
  } catch (err) {
    console.error('[cursos] salvarAula', detalheSeguro(err))
    return { erro: 'falha_salvar' }
  }
}

export async function excluirAula({ id }: { id: string }): Promise<Res> {
  await exigirEngineLiberado()
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    const { error } = await admin().from('aulas').delete().eq('workspace_id', ws).eq('id', id)
    if (error) throw error
    return { ok: true }
  } catch (err) {
    console.error('[cursos] excluirAula', detalheSeguro(err))
    return { erro: 'falha_excluir' }
  }
}

export async function reordenarAulas({ moduloId, ordemIds }: { moduloId: string; ordemIds: string[] }): Promise<Res> {
  await exigirEngineLiberado()
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    for (let i = 0; i < ordemIds.length; i++) {
      const { error } = await admin().from('aulas').update({ ordem: i })
        .eq('workspace_id', ws).eq('modulo_id', moduloId).eq('id', ordemIds[i])
      if (error) throw error
    }
    return { ok: true }
  } catch (err) {
    console.error('[cursos] reordenarAulas', detalheSeguro(err))
    return { erro: 'falha_reordenar' }
  }
}
