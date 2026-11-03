// O repositório do processador de documentos sobre o Supabase (service-role, sem sessão).
//
// 🔴 `admin()` não avalia policy: TODA consulta filtra `workspace_id` — o processador roda para
// todos os espaços deste servidor.
// 🔴 Toda chamada tem tempo máximo próprio: várias rodam dentro dos ganchos da extração, e um
// gancho que nunca responde prende o `extrairNoWorker` (o relógio dele não atravessa o gancho).
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BUCKET_ARQUIVOS, type Etapa, type Extensao, type Trecho } from '@/lib/base-documentos/tipos'
import { admin } from '@/server/supabase'
import type { RepoDocumentos, VersaoReivindicada } from './processar'

const TEMPO_CONSULTA_MS = 20_000
const TEMPO_DOWNLOAD_MS = 5 * 60_000
const TEMPO_REMOCAO_MS = 20_000
const TETO_TITULO = 120
const TETO_CONTEUDO = 4000
const VETORES_EM_PARALELO = 8

const sinal = () => AbortSignal.timeout(TEMPO_CONSULTA_MS)

type LinhaVersao = {
  id: string
  workspace_id: string
  documento_id: string
  nome_arquivo: string
  caminho: string
  extensao: Extensao
  origem: 'envio' | 'reprocesso'
  etapa: Etapa | null
}

function falhou(onde: string, error: { message?: string; code?: string } | null): never {
  const e = new Error(`${onde}: ${error?.message ?? 'erro desconhecido'}`) as Error & { code?: string }
  e.code = error?.code
  throw e
}

export async function comTempo<T>(p: Promise<T>, ms: number, onde: string): Promise<T> {
  let relogio: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, rejeitar) => {
        relogio = setTimeout(() => rejeitar(new Error(`${onde}: tempo esgotado`)), ms)
      }),
    ])
  } finally {
    clearTimeout(relogio)
  }
}

export function criarRepoSupabase(db: () => SupabaseClient = admin): RepoDocumentos {
  const versoes = () => db().from('base_documento_versoes')
  const trechos = () => db().from('base_conhecimento')

  return {
    async reivindicar(reservaMs) {
      const { data, error } = await db()
        .rpc('base_versao_reivindicar', { p_reserva_s: Math.ceil(reservaMs / 1000) })
        .abortSignal(sinal())
      if (error) falhou('reivindicar', error)
      const linha = (Array.isArray(data) ? data[0] : data) as LinhaVersao | undefined | null
      if (!linha) return null

      const { data: doc, error: eDoc } = await db()
        .from('base_documentos')
        .select('nome_exibicao')
        .eq('workspace_id', linha.workspace_id)
        .eq('id', linha.documento_id)
        .abortSignal(sinal())
        .maybeSingle()
      if (eDoc) falhou('reivindicar: documento', eDoc)

      return {
        id: linha.id,
        workspaceId: linha.workspace_id,
        documentoId: linha.documento_id,
        nomeExibicao: (doc as { nome_exibicao?: string } | null)?.nome_exibicao ?? linha.nome_arquivo,
        caminho: linha.caminho,
        extensao: linha.extensao,
        origem: linha.origem,
        etapa: linha.etapa,
      }
    },

    async renovar(v, reservaMs) {
      const { data, error } = await versoes()
        .update({ trabalhando_ate: new Date(Date.now() + reservaMs).toISOString() })
        .eq('workspace_id', v.workspaceId)
        .eq('id', v.id)
        .eq('status', 'processando')
        .select('id')
        .abortSignal(sinal())
      if (error) falhou('renovar', error)
      return (data ?? []).length > 0
    },

    async tamanhoDoObjeto(caminho) {
      const barra = caminho.lastIndexOf('/')
      const pasta = caminho.slice(0, barra)
      const nome = caminho.slice(barra + 1)
      const { data, error } = await comTempo(
        db().storage.from(BUCKET_ARQUIVOS).list(pasta, { search: nome, limit: 10 }),
        TEMPO_CONSULTA_MS,
        'tamanhoDoObjeto',
      )
      if (error) falhou('tamanhoDoObjeto', error)
      const objeto = (data ?? []).find((i) => i.name === nome)
      if (!objeto) return null
      const tamanho = Number((objeto.metadata as { size?: number } | null | undefined)?.size)
      // Sem tamanho legível não há como garantir o teto: trata como ausente (vira erro, não download).
      return Number.isFinite(tamanho) && tamanho >= 0 ? tamanho : null
    },

    async baixar(caminho) {
      const { data, error } = await db()
        .storage.from(BUCKET_ARQUIVOS)
        .download(caminho, {}, { signal: AbortSignal.timeout(TEMPO_DOWNLOAD_MS) })
      if (error || !data) falhou('baixar', error)
      return new Uint8Array(await data.arrayBuffer())
    },

    async acharDuplicata(v, hash) {
      const { data, error } = await versoes()
        .select('documento_id')
        .eq('workspace_id', v.workspaceId)
        .eq('hash', hash)
        .neq('id', v.id)
        .neq('status', 'erro')
        .limit(1)
        .abortSignal(sinal())
      if (error) falhou('acharDuplicata', error)
      const outra = (data ?? [])[0] as { documento_id: string } | undefined
      if (!outra) return null

      const { data: doc, error: eDoc } = await db()
        .from('base_documentos')
        .select('nome_exibicao')
        .eq('workspace_id', v.workspaceId)
        .eq('id', outra.documento_id)
        .abortSignal(sinal())
        .maybeSingle()
      if (eDoc) falhou('acharDuplicata: documento', eDoc)
      return (doc as { nome_exibicao?: string } | null)?.nome_exibicao ?? null
    },

    async gravarHash(v, hash) {
      const { error } = await versoes()
        .update({ hash })
        .eq('workspace_id', v.workspaceId)
        .eq('id', v.id)
        .abortSignal(sinal())
      if (error) falhou('gravarHash', error)
    },

    async apagarTrechos(v) {
      const { error } = await trechos()
        .delete()
        .eq('workspace_id', v.workspaceId)
        .eq('versao_id', v.id)
        .abortSignal(sinal())
      if (error) falhou('apagarTrechos', error)
    },

    async inserirTrechos(v, lote: Trecho[]) {
      if (lote.length === 0) return true
      const linhas = lote.map((t) => ({
        workspace_id: v.workspaceId,
        documento_id: v.documentoId,
        versao_id: v.id,
        titulo: (t.caminho.at(-1) || v.nomeExibicao).slice(0, TETO_TITULO),
        conteudo: t.texto.slice(0, TETO_CONTEUDO),
        tipo: 'fato',
        origem: 'operador',
        caminho_titulos: t.caminho.join(' › '),
        pagina: t.pagina,
        secao: t.secao,
        posicao: t.posicao,
      }))
      const { error } = await trechos().insert(linhas).abortSignal(sinal())
      if (error?.code === '23503') return false
      if (error) falhou('inserirTrechos', error)
      return true
    },

    async marcarEtapa(v, etapa, totais) {
      const { error } = await versoes()
        .update({
          etapa,
          ...(totais ? { trechos_total: totais.trechosTotal, custo_estimado_usd: totais.custoEstimadoUsd } : {}),
        })
        .eq('workspace_id', v.workspaceId)
        .eq('id', v.id)
        .abortSignal(sinal())
      if (error) falhou('marcarEtapa', error)
    },

    async semContexto(v, limite) {
      const { data, error } = await trechos()
        .select('id, caminho_titulos, conteudo')
        .eq('workspace_id', v.workspaceId)
        .eq('versao_id', v.id)
        .is('contexto', null)
        .order('posicao', { ascending: true })
        .limit(limite)
        .abortSignal(sinal())
      if (error) falhou('semContexto', error)
      return ((data ?? []) as Array<{ id: string; caminho_titulos: string | null; conteudo: string }>).map((l) => ({
        id: l.id,
        caminho: caminhoDe(l.caminho_titulos),
        texto: l.conteudo,
      }))
    },

    async gravarContexto(v, id, contexto) {
      const { error } = await trechos()
        .update({ contexto })
        .eq('workspace_id', v.workspaceId)
        .eq('versao_id', v.id)
        .eq('id', id)
        .abortSignal(sinal())
      if (error) falhou('gravarContexto', error)
    },

    async semVetor(v, limite) {
      const { data, error } = await trechos()
        .select('id, caminho_titulos, contexto, conteudo')
        .eq('workspace_id', v.workspaceId)
        .eq('versao_id', v.id)
        .not('contexto', 'is', null)
        .is('embed_versao', null)
        .order('posicao', { ascending: true })
        .limit(limite)
        .abortSignal(sinal())
      if (error) falhou('semVetor', error)
      return (
        (data ?? []) as Array<{ id: string; caminho_titulos: string | null; contexto: string | null; conteudo: string }>
      ).map((l) => ({ id: l.id, caminho: caminhoDe(l.caminho_titulos), contexto: l.contexto, texto: l.conteudo }))
    },

    async gravarVetores(v, itens) {
      for (let i = 0; i < itens.length; i += VETORES_EM_PARALELO) {
        await Promise.all(
          itens.slice(i, i + VETORES_EM_PARALELO).map(async (it) => {
            const { error } = await trechos()
              .update({ embedding: it.vetor, embed_versao: it.versao })
              .eq('workspace_id', v.workspaceId)
              .eq('versao_id', v.id)
              .eq('id', it.id)
              .abortSignal(sinal())
            if (error) falhou('gravarVetores', error)
          }),
        )
      }
    },

    async promover(v) {
      const { data, error } = await db()
        .rpc('base_versao_promover', { p_ws: v.workspaceId, p_versao: v.id })
        .abortSignal(sinal())
      if (error) falhou('promover', error)
      return (data as string | null) ?? null
    },

    async falhar(v, motivo) {
      const { error } = await versoes()
        .update({ status: 'erro', motivo_erro: motivo, trabalhando_ate: null })
        .eq('workspace_id', v.workspaceId)
        .eq('id', v.id)
        .abortSignal(sinal())
      if (error) falhou('falhar', error)
    },

    async removerObjeto(caminho) {
      const { error } = await comTempo(
        db().storage.from(BUCKET_ARQUIVOS).remove([caminho]),
        TEMPO_REMOCAO_MS,
        'removerObjeto',
      )
      if (error) falhou('removerObjeto', error)
    },

    async removerObjetos(caminhos) {
      if (caminhos.length === 0) return
      const { error } = await comTempo(
        db().storage.from(BUCKET_ARQUIVOS).remove(caminhos),
        TEMPO_REMOCAO_MS,
        'removerObjetos',
      )
      if (error) falhou('removerObjetos', error)
    },

    async faxina() {
      const { data, error } = await db().rpc('base_versoes_faxina').abortSignal(sinal())
      if (error) falhou('faxina', error)
      return ((data ?? []) as Array<{ caminho: string | null }>)
        .map((l) => l.caminho)
        .filter((c): c is string => typeof c === 'string' && c !== '')
    },
  }
}

/** `caminho_titulos` gravado com ` › ` de volta para a lista de títulos. */
function caminhoDe(gravado: string | null): string[] {
  return gravado ? gravado.split(' › ') : []
}
