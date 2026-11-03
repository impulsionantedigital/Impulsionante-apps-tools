'use server'

// Ações da tela para os DOCUMENTOS da base de conhecimento (os cards ficam em `acoes.ts`).
//
// O arquivo não passa por aqui: o navegador envia direto ao Storage pelo protocolo retomável
// (TUS), com um token assinado que `iniciarEnvio` cunha para UM caminho. Depois `confirmarEnvio`
// mede o objeto e põe a versão na fila do processador em segundo plano.
//
// 🔴 `admin()` não avalia policy: toda consulta filtra `workspace_id`. Caminho de objeto é sempre
// lido do banco (filtrado pelo espaço) — nunca aceito do navegador.

import { randomUUID } from 'node:crypto'
import { exigirEngineLiberado } from '@/server/license/exigir'
import { ehOwnerDoWorkspace } from '@/server/auth/owner-workspace'
import { criarClienteServidor } from '@/server/supabase-session'
import { resolverWorkspaceAtivo } from '@/server/auth/workspace-ativo'
import { admin } from '@/server/supabase'
import { urlSupabase, chaveParaONavegador } from '@/server/config-supabase'
import { limiteBytesArquivo } from '@/server/base-documentos/config'
import {
  BUCKET_ARQUIVOS,
  TIPOS_ACEITOS,
  caminhoDoObjeto,
  extensaoDe,
  type Etapa,
  type Extensao,
  type StatusVersao,
} from '@/lib/base-documentos/tipos'
import {
  escolherPendente,
  fraseDoLimite,
  objetosDoQueFoiApagado,
  STATUS_CANCELAVEIS,
  nomeDeExibicaoInicial,
  podeRetomar,
  validarPedidoDeEnvio,
  versaoParaCancelar,
} from '@/lib/base-documentos/regras-de-envio'
import { mensagemSegura, detalheSeguro } from '@/lib/sanitizar-erro'
import { fraseDeBanco } from '@/lib/erro-de-banco'

export type ResultadoSimples = { ok: true } | { erro: string }

export type DadosDoEnvio = {
  versaoId: string
  documentoId: string
  endpoint: string
  token: string
  chaveAnonima: string
  bucket: string
  caminho: string
  contentType: string
}

export type ResumoVersao = {
  id: string
  status: StatusVersao
  etapa: Etapa | null
  motivo: string | null
  trechosTotal: number
  feitos: number
  custoEstimadoUsd: number | null
  criadoEm: string
}

export type DocumentoNaTela = {
  id: string
  nome: string
  nomeArquivo: string
  extensao: Extensao
  tamanho: number
  ligado: boolean
  trechos: number
  atualizadoEm: string
  assistentes: string[]
  ativa: ResumoVersao | null
  pendente: ResumoVersao | null
}

// As mesmas frases de `acoes.ts` (um arquivo 'use server' só exporta função assíncrona, então
// elas não podem ser importadas de lá).
const SO_O_OWNER = 'Só quem administra este espaço de trabalho pode alterar o que o assistente sabe.'
const SEM_WS = 'Você não está em nenhum espaço de trabalho.'
const ENTRADA_DESCONHECIDA = 'Essa entrada não existe neste espaço de trabalho. Recarregue a página e tente de novo.'
const ASSISTENTE_DESCONHECIDO_NO_RECORTE =
  'Um dos assistentes escolhidos não existe mais neste espaço de trabalho. Recarregue a página e tente de novo.'
const NAO_CONFIRMOU_RECORTE =
  'Não consegui confirmar a alteração. Recarregue a página para ver quem realmente está no recorte e tente de novo.'

const DOCUMENTO_DESCONHECIDO =
  'Esse documento não existe neste espaço de trabalho. Recarregue a página e tente de novo.'
const ENVIO_DESCONHECIDO = 'Esse envio não existe mais. Escolha o arquivo e envie de novo.'
const ARQUIVO_NAO_CHEGOU = 'O arquivo não chegou inteiro ao servidor. Escolha o arquivo e envie de novo.'
const ENVIO_JA_TERMINOU = 'Esse envio já terminou e não pode mais ser cancelado.'
const ENVIO_JA_PROCESSADO = 'Esse envio já terminou de processar e não pode mais ser cancelado.'
const NOME_INVALIDO = 'O nome precisa ter entre 1 e 120 caracteres.'
const SEM_ARQUIVO_PARA_REPROCESSAR = 'Esse documento ainda não tem um arquivo para processar de novo.'
const ARQUIVO_ORIGINAL_SUMIU = 'O arquivo original não está mais guardado. Envie o arquivo de novo.'

const RECORTE_TROCADO = 1
const RECORTE_DOCUMENTO_DE_FORA = 0
const RECORTE_ASSISTENTE_DE_FORA = 2

const TETO_NOME = 120
const TRECHOS_POR_PAGINA = 50
const TETO_TEXTO_DO_TRECHO = 300
const STATUS_PENDENTES: ReadonlySet<StatusVersao> = new Set(STATUS_CANCELAVEIS)

const ROTA = '/base-conhecimento'
const ROTA_RESUMO_DO_ASSISTENTE = '/agentes'

type LinhaVersao = {
  id: string
  documento_id: string
  nome_arquivo: string
  extensao: Extensao
  tamanho: number
  caminho: string
  status: StatusVersao
  etapa: Etapa | null
  motivo_erro: string | null
  trechos_total: number
  custo_estimado_usd: number | string | null
  criado_em: string
}

const COLUNAS_VERSAO =
  'id, documento_id, nome_arquivo, extensao, tamanho, caminho, status, etapa, motivo_erro, trechos_total, custo_estimado_usd, criado_em'

async function wsDaSessao(): Promise<string | null> {
  const cliente = await criarClienteServidor()
  return resolverWorkspaceAtivo({ cliente })
}

async function usuarioDaSessao(): Promise<string | null> {
  const cliente = await criarClienteServidor()
  const {
    data: { user },
  } = await cliente.auth.getUser()
  return user?.id ?? null
}

function falha(err: unknown): { erro: string } {
  console.error('[base-documentos] falha:', detalheSeguro(err))
  return { erro: fraseDeBanco(err) }
}

async function revalidarTela(): Promise<void> {
  try {
    const { revalidatePath } = await import('next/cache')
    revalidatePath(ROTA)
    revalidatePath(ROTA_RESUMO_DO_ASSISTENTE)
  } catch (err) {
    console.warn('[base-documentos] revalidatePath falhou (não-fatal):', mensagemSegura(err))
  }
}

/** Abre a sessão da ação: engine liberada, espaço da sessão e dono dele. */
async function abrir(): Promise<{ ws: string } | { erro: string }> {
  await exigirEngineLiberado()
  const ws = await wsDaSessao()
  if (!ws) return { erro: SEM_WS }
  if (!(await ehOwnerDoWorkspace(ws))) return { erro: SO_O_OWNER }
  return { ws }
}

/** Remover objeto é faxina: a falha só vai para o log (a linha já saiu do banco). */
async function removerObjetos(caminhos: string[]): Promise<void> {
  if (caminhos.length === 0) return
  try {
    const { error } = await admin().storage.from(BUCKET_ARQUIVOS).remove(caminhos)
    if (error) console.warn('[base-documentos] remoção de objeto falhou (não-fatal):', mensagemSegura(error))
  } catch (err) {
    console.warn('[base-documentos] remoção de objeto falhou (não-fatal):', mensagemSegura(err))
  }
}

async function documentoDoWs(
  ws: string,
  id: string,
): Promise<{ id: string; versao_ativa_id: string | null } | null> {
  const { data, error } = await admin()
    .from('base_documentos')
    .select('id, versao_ativa_id')
    .eq('workspace_id', ws)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as { id: string; versao_ativa_id: string | null } | null) ?? null
}

/** Versões do documento, da mais nova para a mais antiga. */
async function versoesDoDocumento(ws: string, documentoId: string): Promise<LinhaVersao[]> {
  const { data, error } = await admin()
    .from('base_documento_versoes')
    .select(COLUNAS_VERSAO)
    .eq('workspace_id', ws)
    .eq('documento_id', documentoId)
    .order('criado_em', { ascending: false })
  if (error) throw error
  return (data ?? []) as LinhaVersao[]
}

/**
 * Review Focus 2: cancela a versão pendente que não é a ativa (linha e objeto). A ativa segue
 * respondendo; o processador, se estava nela, para com "sumiu".
 */
async function cancelarPendentes(ws: string, documentoId: string, ativaId: string | null): Promise<void> {
  let restantes = await versoesDoDocumento(ws, documentoId)
  for (;;) {
    const alvo = versaoParaCancelar(restantes, ativaId)
    if (!alvo) return
    const linha = restantes.find((v) => v.id === alvo)!
    // O filtro de status fecha a corrida com `base_versao_promover`: se a pendente virou ativa
    // depois da leitura, nada é apagado — nem a linha, nem o objeto.
    const { data, error } = await admin()
      .from('base_documento_versoes')
      .delete()
      .eq('workspace_id', ws)
      .eq('id', alvo)
      .in('status', [...STATUS_CANCELAVEIS])
      .select('id')
    if (error) throw error
    await removerObjetos(objetosDoQueFoiApagado([linha], (data ?? []) as Array<{ id: string }>))
    restantes = restantes.filter((v) => v.id !== alvo)
  }
}

async function tokenDeEnvio(caminho: string, upsert: boolean): Promise<string> {
  const { data, error } = await admin()
    .storage.from(BUCKET_ARQUIVOS)
    .createSignedUploadUrl(caminho, upsert ? { upsert: true } : undefined)
  if (error || !data) throw error ?? new Error('createSignedUploadUrl sem token')
  return data.token
}

function dadosDoEnvio(p: {
  versaoId: string
  documentoId: string
  token: string
  caminho: string
  ext: Extensao
}): DadosDoEnvio {
  return {
    versaoId: p.versaoId,
    documentoId: p.documentoId,
    endpoint: `${urlSupabase()}/storage/v1/upload/resumable/sign`,
    token: p.token,
    chaveAnonima: chaveParaONavegador(process.env.SUPABASE_ANON_KEY ?? ''),
    bucket: BUCKET_ARQUIVOS,
    caminho: p.caminho,
    contentType: TIPOS_ACEITOS[p.ext],
  }
}

export async function iniciarEnvio(p: {
  nomeArquivo: string
  tamanho: number
  documentoId?: string
  retomarVersaoId?: string
}): Promise<({ ok: true } & DadosDoEnvio) | { erro: string }> {
  const s = await abrir()
  if ('erro' in s) return s
  const { ws } = s

  const nomeArquivo = String(p.nomeArquivo ?? '').trim()
  const tamanho = Number(p.tamanho)
  const v = validarPedidoDeEnvio({ nomeArquivo, tamanho }, limiteBytesArquivo())
  if (!v.ok) return { erro: v.erro }
  const ext = v.ext

  let documentoCriado: string | null = null
  try {
    // Review Focus 1: página recarregada no meio do envio. Mesma versão, mesmo caminho, token
    // novo — o TUS do navegador continua de onde parou.
    if (p.retomarVersaoId) {
      const { data, error } = await admin()
        .from('base_documento_versoes')
        .select('id, documento_id, nome_arquivo, tamanho, status, caminho, extensao')
        .eq('workspace_id', ws)
        .eq('id', p.retomarVersaoId)
        .maybeSingle()
      if (error) return falha(error)
      const anterior = data as
        | (Pick<LinhaVersao, 'id' | 'documento_id' | 'nome_arquivo' | 'tamanho' | 'status' | 'caminho' | 'extensao'>)
        | null
      const retomavel = podeRetomar(
        anterior
          ? { status: anterior.status, nomeArquivo: anterior.nome_arquivo, tamanho: Number(anterior.tamanho) }
          : null,
        { nomeArquivo, tamanho },
      )
      if (anterior && retomavel) {
        const token = await tokenDeEnvio(anterior.caminho, true)
        return {
          ok: true,
          ...dadosDoEnvio({
            versaoId: anterior.id,
            documentoId: anterior.documento_id,
            token,
            caminho: anterior.caminho,
            ext: anterior.extensao,
          }),
        }
      }
    }

    // Documento-alvo: o informado, ou o do espaço com o mesmo nome de arquivo, ou um novo.
    let documento: { id: string; versao_ativa_id: string | null } | null = null
    if (p.documentoId) {
      documento = await documentoDoWs(ws, p.documentoId)
      if (!documento) return { erro: DOCUMENTO_DESCONHECIDO }
    } else {
      const { data, error } = await admin()
        .from('base_documentos')
        .select('id, versao_ativa_id')
        .eq('workspace_id', ws)
        .eq('nome_arquivo', nomeArquivo)
        .order('criado_em', { ascending: false })
        .limit(1)
      if (error) return falha(error)
      documento = ((data ?? []) as Array<{ id: string; versao_ativa_id: string | null }>)[0] ?? null
    }

    const usuario = await usuarioDaSessao()

    if (documento) {
      await cancelarPendentes(ws, documento.id, documento.versao_ativa_id)
    } else {
      const { data, error } = await admin()
        .from('base_documentos')
        .insert({
          workspace_id: ws,
          nome_exibicao: nomeDeExibicaoInicial(nomeArquivo),
          nome_arquivo: nomeArquivo,
          criado_por: usuario,
        })
        .select('id, versao_ativa_id')
      if (error) return falha(error)
      documento = ((data ?? []) as Array<{ id: string; versao_ativa_id: string | null }>)[0] ?? null
      if (!documento) return { erro: fraseDeBanco(new Error('documento não criado')) }
      documentoCriado = documento.id
    }

    const versaoId = randomUUID()
    const caminho = caminhoDoObjeto(ws, documento.id, versaoId, ext)
    const { error: eVersao } = await admin().from('base_documento_versoes').insert({
      id: versaoId,
      workspace_id: ws,
      documento_id: documento.id,
      nome_arquivo: nomeArquivo,
      extensao: ext,
      tamanho,
      caminho,
      origem: 'envio',
      status: 'enviando',
      enviado_por: usuario,
    })
    if (eVersao) {
      await desfazerDocumentoCriado(ws, documentoCriado)
      return falha(eVersao)
    }

    let token: string
    try {
      token = await tokenDeEnvio(caminho, false)
    } catch (err) {
      await admin().from('base_documento_versoes').delete().eq('workspace_id', ws).eq('id', versaoId)
      await desfazerDocumentoCriado(ws, documentoCriado)
      return falha(err)
    }

    await revalidarTela()
    return { ok: true, ...dadosDoEnvio({ versaoId, documentoId: documento.id, token, caminho, ext }) }
  } catch (err) {
    await desfazerDocumentoCriado(ws, documentoCriado)
    return falha(err)
  }
}

/** Um documento que acabou de nascer e não chegou a ter versão não fica órfão na tela. */
async function desfazerDocumentoCriado(ws: string, documentoId: string | null): Promise<void> {
  if (!documentoId) return
  try {
    await admin().from('base_documentos').delete().eq('workspace_id', ws).eq('id', documentoId)
  } catch (err) {
    console.warn('[base-documentos] desfazer documento falhou (não-fatal):', mensagemSegura(err))
  }
}

export async function confirmarEnvio(versaoId: string): Promise<ResultadoSimples> {
  const s = await abrir()
  if ('erro' in s) return s
  const { ws } = s

  try {
    const { data, error } = await admin()
      .from('base_documento_versoes')
      .select('id, documento_id, nome_arquivo, caminho, status')
      .eq('workspace_id', ws)
      .eq('id', versaoId)
      .maybeSingle()
    if (error) return falha(error)
    const versao = data as Pick<LinhaVersao, 'id' | 'documento_id' | 'nome_arquivo' | 'caminho' | 'status'> | null
    if (!versao) return { erro: ENVIO_DESCONHECIDO }
    // Confirmar duas vezes não estraga nada: a versão já saiu de "enviando".
    if (versao.status !== 'enviando') return { ok: true }

    const barra = versao.caminho.lastIndexOf('/')
    const pasta = versao.caminho.slice(0, barra)
    const nome = versao.caminho.slice(barra + 1)
    const { data: itens, error: eLista } = await admin()
      .storage.from(BUCKET_ARQUIVOS)
      .list(pasta, { search: nome, limit: 10 })
    if (eLista) return falha(eLista)
    const objeto = (itens ?? []).find((i) => i.name === nome)
    const medido = Number((objeto?.metadata as { size?: number } | null | undefined)?.size)
    if (!objeto || !Number.isFinite(medido) || medido <= 0) return { erro: ARQUIVO_NAO_CHEGOU }

    const limite = limiteBytesArquivo()
    if (medido > limite) {
      const { error: eApagar } = await admin()
        .from('base_documento_versoes')
        .delete()
        .eq('workspace_id', ws)
        .eq('id', versao.id)
      if (eApagar) return falha(eApagar)
      await removerObjetos([versao.caminho])
      await apagarDocumentoSemVersao(ws, versao.documento_id)
      await revalidarTela()
      return { erro: fraseDoLimite(limite) }
    }

    const { error: eFila } = await admin()
      .from('base_documento_versoes')
      .update({ status: 'na_fila', tamanho: medido })
      .eq('workspace_id', ws)
      .eq('id', versao.id)
      .eq('status', 'enviando')
    if (eFila) return falha(eFila)

    // O documento passa a responder pelo nome do arquivo mais recente (o reenvio do mesmo nome
    // cai nele).
    const { error: eDoc } = await admin()
      .from('base_documentos')
      .update({ nome_arquivo: versao.nome_arquivo })
      .eq('workspace_id', ws)
      .eq('id', versao.documento_id)
    if (eDoc) return falha(eDoc)

    await revalidarTela()
    return { ok: true }
  } catch (err) {
    return falha(err)
  }
}

/** Primeiro envio cancelado: o documento sem nenhuma versão sai junto. */
async function apagarDocumentoSemVersao(ws: string, documentoId: string): Promise<void> {
  const { count, error } = await admin()
    .from('base_documento_versoes')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', ws)
    .eq('documento_id', documentoId)
  if (error) throw error
  if ((count ?? 0) > 0) return
  const { error: eDoc } = await admin()
    .from('base_documentos')
    .delete()
    .eq('workspace_id', ws)
    .eq('id', documentoId)
    .is('versao_ativa_id', null)
  if (eDoc) throw eDoc
}

export async function cancelarEnvio(versaoId: string): Promise<ResultadoSimples> {
  const s = await abrir()
  if ('erro' in s) return s
  const { ws } = s

  try {
    const { data, error } = await admin()
      .from('base_documento_versoes')
      .select('id, documento_id, caminho, status')
      .eq('workspace_id', ws)
      .eq('id', versaoId)
      .maybeSingle()
    if (error) return falha(error)
    const versao = data as Pick<LinhaVersao, 'id' | 'documento_id' | 'caminho' | 'status'> | null
    // Já não existe: o que a pessoa queria (que o envio não seguisse) já é verdade.
    if (!versao) {
      await revalidarTela()
      return { ok: true }
    }

    const documento = await documentoDoWs(ws, versao.documento_id)
    if (versao.status === 'pronto' || documento?.versao_ativa_id === versao.id) return { erro: ENVIO_JA_TERMINOU }

    const { data: apagadas, error: eApagar } = await admin()
      .from('base_documento_versoes')
      .delete()
      .eq('workspace_id', ws)
      .eq('id', versao.id)
      .in('status', [...STATUS_CANCELAVEIS])
      .select('id')
    if (eApagar) return falha(eApagar)
    const caminhos = objetosDoQueFoiApagado([versao], (apagadas ?? []) as Array<{ id: string }>)
    // Nada apagado: a versão saiu de pendente entre a leitura e o delete (foi promovida ou
    // terminou em erro). O objeto fica.
    if (caminhos.length === 0) return { erro: ENVIO_JA_PROCESSADO }
    await removerObjetos(caminhos)
    await apagarDocumentoSemVersao(ws, versao.documento_id)

    await revalidarTela()
    return { ok: true }
  } catch (err) {
    return falha(err)
  }
}

export async function renomearDocumento(id: string, nome: string): Promise<ResultadoSimples> {
  const s = await abrir()
  if ('erro' in s) return s
  const { ws } = s

  const limpo = String(nome ?? '').trim()
  if (limpo.length < 1 || limpo.length > TETO_NOME) return { erro: NOME_INVALIDO }

  try {
    const { data, error } = await admin()
      .from('base_documentos')
      .update({ nome_exibicao: limpo })
      .eq('workspace_id', ws)
      .eq('id', id)
      .select('id')
    if (error) return falha(error)
    if (!((data ?? []) as unknown[]).length) return { erro: DOCUMENTO_DESCONHECIDO }
    await revalidarTela()
    return { ok: true }
  } catch (err) {
    return falha(err)
  }
}

export async function alternarDocumento(id: string, ligado: boolean): Promise<ResultadoSimples> {
  const s = await abrir()
  if ('erro' in s) return s
  const { ws } = s

  try {
    const { data, error } = await admin()
      .from('base_documentos')
      .update({ ligado: Boolean(ligado) })
      .eq('workspace_id', ws)
      .eq('id', id)
      .select('id')
    if (error) return falha(error)
    if (!((data ?? []) as unknown[]).length) return { erro: DOCUMENTO_DESCONHECIDO }
    await revalidarTela()
    return { ok: true }
  } catch (err) {
    return falha(err)
  }
}

export async function reprocessarDocumento(id: string): Promise<ResultadoSimples> {
  const s = await abrir()
  if ('erro' in s) return s
  const { ws } = s

  try {
    const documento = await documentoDoWs(ws, id)
    if (!documento) return { erro: DOCUMENTO_DESCONHECIDO }

    const versoes = await versoesDoDocumento(ws, id)
    const fonte =
      versoes.find((v) => v.id === documento.versao_ativa_id) ?? versoes.find((v) => v.status === 'erro') ?? null
    if (!fonte) return { erro: SEM_ARQUIVO_PARA_REPROCESSAR }

    // Cópia primeiro: se o original sumiu, a pendente que existir continua intacta.
    const versaoId = randomUUID()
    const caminho = caminhoDoObjeto(ws, id, versaoId, fonte.extensao)
    const { error: eCopia } = await admin().storage.from(BUCKET_ARQUIVOS).copy(fonte.caminho, caminho)
    if (eCopia) {
      console.warn('[base-documentos] cópia para reprocessar falhou:', mensagemSegura(eCopia))
      return { erro: ARQUIVO_ORIGINAL_SUMIU }
    }

    try {
      await cancelarPendentes(ws, id, documento.versao_ativa_id)
      const { error } = await admin()
        .from('base_documento_versoes')
        .insert({
          id: versaoId,
          workspace_id: ws,
          documento_id: id,
          nome_arquivo: fonte.nome_arquivo,
          extensao: fonte.extensao,
          tamanho: fonte.tamanho,
          caminho,
          origem: 'reprocesso',
          status: 'na_fila',
          enviado_por: await usuarioDaSessao(),
        })
      if (error) throw error
    } catch (err) {
      await removerObjetos([caminho])
      return falha(err)
    }

    await revalidarTela()
    return { ok: true }
  } catch (err) {
    return falha(err)
  }
}

export async function excluirDocumento(id: string): Promise<ResultadoSimples> {
  const s = await abrir()
  if ('erro' in s) return s
  const { ws } = s

  try {
    const { data: versoes, error: eVersoes } = await admin()
      .from('base_documento_versoes')
      .select('caminho')
      .eq('workspace_id', ws)
      .eq('documento_id', id)
    if (eVersoes) return falha(eVersoes)
    const caminhos = ((versoes ?? []) as Array<{ caminho: string }>).map((v) => v.caminho)

    // Versões e trechos saem pelo cascade.
    const { data, error } = await admin()
      .from('base_documentos')
      .delete()
      .eq('workspace_id', ws)
      .eq('id', id)
      .select('id')
    if (error) return falha(error)
    if (!((data ?? []) as unknown[]).length) return { erro: DOCUMENTO_DESCONHECIDO }

    await removerObjetos(caminhos)
    await revalidarTela()
    return { ok: true }
  } catch (err) {
    return falha(err)
  }
}

export async function trocarAssistentesDoDocumento(id: string, assistentes: string[]): Promise<ResultadoSimples> {
  const s = await abrir()
  if ('erro' in s) return s
  const { ws } = s

  try {
    const { data, error } = await admin().rpc('trocar_recorte_do_documento', {
      p_ws: ws,
      p_documento: id,
      p_assistentes: [...new Set(assistentes ?? [])],
    })
    if (error) return falha(error)
    if (data === RECORTE_DOCUMENTO_DE_FORA) return { erro: ENTRADA_DESCONHECIDA }
    if (data === RECORTE_ASSISTENTE_DE_FORA) return { erro: ASSISTENTE_DESCONHECIDO_NO_RECORTE }
    if (data !== RECORTE_TROCADO) return { erro: NAO_CONFIRMOU_RECORTE }

    await revalidarTela()
    return { ok: true }
  } catch (err) {
    return falha(err)
  }
}

function resumo(v: LinhaVersao, feitos: number): ResumoVersao {
  const custo = v.custo_estimado_usd == null ? null : Number(v.custo_estimado_usd)
  return {
    id: v.id,
    status: v.status,
    etapa: v.etapa,
    motivo: v.motivo_erro,
    trechosTotal: v.trechos_total ?? 0,
    feitos,
    custoEstimadoUsd: custo != null && Number.isFinite(custo) ? custo : null,
    criadoEm: v.criado_em,
  }
}

/** Quantos trechos a etapa atual já fez: contexto gravado ou vetor gravado. */
async function feitosDaVersao(ws: string, v: LinhaVersao): Promise<number> {
  if (v.status === 'pronto') return v.trechos_total ?? 0
  if (!STATUS_PENDENTES.has(v.status)) return 0
  const coluna = v.etapa === 'contextualizando' ? 'contexto' : v.etapa === 'vetorizando' ? 'embed_versao' : null
  if (!coluna) return 0
  const { count, error } = await admin()
    .from('base_conhecimento')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', ws)
    .eq('versao_id', v.id)
    .not(coluna, 'is', null)
  if (error) throw error
  return count ?? 0
}

/**
 * Sem N+1: documentos, versões e recortes em três consultas. O total de trechos da ativa é o
 * `trechos_total` gravado pelo processador (a versão só vira ativa com todos inseridos); a única
 * contagem extra é a do progresso, uma por versão no meio do processamento.
 */
export async function listarDocumentos(): Promise<DocumentoNaTela[] | { erro: string }> {
  const s = await abrir()
  if ('erro' in s) return s
  const { ws } = s

  try {
    const [docs, versoes, recortes] = await Promise.all([
      admin()
        .from('base_documentos')
        .select('id, nome_exibicao, nome_arquivo, ligado, versao_ativa_id, atualizado_em')
        .eq('workspace_id', ws)
        .order('criado_em', { ascending: false }),
      admin()
        .from('base_documento_versoes')
        .select(COLUNAS_VERSAO)
        .eq('workspace_id', ws)
        .order('criado_em', { ascending: false }),
      admin().from('assistente_documentos').select('documento_id, assistente_id').eq('workspace_id', ws),
    ])
    if (docs.error) return falha(docs.error)
    if (versoes.error) return falha(versoes.error)
    if (recortes.error) return falha(recortes.error)

    const porDocumento = new Map<string, LinhaVersao[]>()
    for (const v of (versoes.data ?? []) as LinhaVersao[]) {
      const lista = porDocumento.get(v.documento_id) ?? []
      lista.push(v)
      porDocumento.set(v.documento_id, lista)
    }
    const assistentesPor = new Map<string, string[]>()
    for (const r of (recortes.data ?? []) as Array<{ documento_id: string; assistente_id: string }>) {
      const lista = assistentesPor.get(r.documento_id) ?? []
      lista.push(r.assistente_id)
      assistentesPor.set(r.documento_id, lista)
    }

    type Linha = {
      id: string
      nome_exibicao: string
      nome_arquivo: string
      ligado: boolean
      versao_ativa_id: string | null
      atualizado_em: string
    }
    const montados = ((docs.data ?? []) as Linha[]).map((d) => {
      const lista = porDocumento.get(d.id) ?? []
      const ativa = lista.find((v) => v.id === d.versao_ativa_id) ?? null
      const pendente = escolherPendente(lista, d.versao_ativa_id)
      return { d, ativa, pendente }
    })

    const progresso = new Map<string, number>()
    await Promise.all(
      montados
        .map((m) => m.pendente)
        .filter((v): v is LinhaVersao => v !== null)
        .map(async (v) => progresso.set(v.id, await feitosDaVersao(ws, v))),
    )

    return montados.map(({ d, ativa, pendente }): DocumentoNaTela => {
      const referencia = ativa ?? pendente ?? (porDocumento.get(d.id) ?? [])[0] ?? null
      return {
        id: d.id,
        nome: d.nome_exibicao,
        nomeArquivo: referencia?.nome_arquivo ?? d.nome_arquivo,
        extensao: referencia?.extensao ?? extensaoDe(d.nome_arquivo) ?? 'txt',
        tamanho: Number(referencia?.tamanho ?? 0),
        ligado: d.ligado,
        trechos: ativa?.trechos_total ?? 0,
        atualizadoEm: d.atualizado_em,
        assistentes: assistentesPor.get(d.id) ?? [],
        ativa: ativa ? resumo(ativa, ativa.trechos_total ?? 0) : null,
        pendente: pendente ? resumo(pendente, progresso.get(pendente.id) ?? 0) : null,
      }
    })
  } catch (err) {
    return falha(err)
  }
}

export async function trechosDoDocumento(
  id: string,
  pagina: number,
): Promise<
  | { total: number; itens: Array<{ caminho: string; pagina: number | null; contexto: string | null; texto: string }> }
  | { erro: string }
> {
  const s = await abrir()
  if ('erro' in s) return s
  const { ws } = s

  const p = Number.isInteger(pagina) && pagina > 0 ? pagina : 1

  try {
    const documento = await documentoDoWs(ws, id)
    if (!documento) return { erro: DOCUMENTO_DESCONHECIDO }

    let versaoId = documento.versao_ativa_id
    if (!versaoId) {
      const { data, error } = await admin()
        .from('base_documento_versoes')
        .select('id')
        .eq('workspace_id', ws)
        .eq('documento_id', id)
        .order('criado_em', { ascending: false })
        .limit(1)
      if (error) return falha(error)
      versaoId = ((data ?? []) as Array<{ id: string }>)[0]?.id ?? null
    }
    if (!versaoId) return { total: 0, itens: [] }

    const inicio = (p - 1) * TRECHOS_POR_PAGINA
    const { data, error, count } = await admin()
      .from('base_conhecimento')
      .select('caminho_titulos, pagina, contexto, conteudo', { count: 'exact' })
      .eq('workspace_id', ws)
      .eq('documento_id', id)
      .eq('versao_id', versaoId)
      .order('posicao', { ascending: true })
      .range(inicio, inicio + TRECHOS_POR_PAGINA - 1)
    // Página além do fim (a versão encolheu entre um clique e outro): lista vazia, não erro.
    if (error?.code === 'PGRST103') return { total: count ?? 0, itens: [] }
    if (error) return falha(error)

    const itens = (
      (data ?? []) as Array<{ caminho_titulos: string | null; pagina: number | null; contexto: string | null; conteudo: string }>
    ).map((l) => ({
      caminho: l.caminho_titulos ?? '',
      pagina: l.pagina ?? null,
      contexto: l.contexto,
      texto: (l.conteudo ?? '').slice(0, TETO_TEXTO_DO_TRECHO),
    }))
    return { total: count ?? 0, itens }
  } catch (err) {
    return falha(err)
  }
}
