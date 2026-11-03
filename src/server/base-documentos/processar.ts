// A máquina de etapas que leva uma versão de documento da fila até ativa:
// extraindo → contextualizando → vetorizando → promover. Cada etapa grava o progresso no banco
// (a etapa na versão; o contexto e o vetor em cada trecho), então um servidor que cai no meio
// retoma de onde parou quando a reserva vence e a versão é reivindicada de novo.
//
// Sem Supabase direto: tudo passa por `RepoDocumentos` (a implementação real é `repo.ts`), para
// o teste rodar com um repositório em memória.
import 'server-only'
import { estimarCustoUsd, textoParaBusca } from '@/lib/base-documentos/contexto'
import { fraseDoLimite } from '@/lib/base-documentos/regras-de-envio'
import type { Etapa, Extensao, Trecho } from '@/lib/base-documentos/tipos'
import { detalheSeguro } from '@/lib/sanitizar-erro'
import type { embedarLote } from '@/server/agente/embed'
import type { extrairNoWorker } from './extrair-no-worker'
import type { gerarFraseDeContexto } from './frase-contexto'
import { limiteBytesArquivo } from './config'

export const RESERVA_MS = 120_000
export const TETO_TRECHOS_POR_VERSAO = 20_000
export const CONCORRENCIA_CONTEXTO = 4
/** Renovação periódica da reserva enquanto a versão roda: bem abaixo de `RESERVA_MS`, para que um
 *  passo lento (download, parse antes do primeiro lote, um lote de frases) nunca a deixe vencer. */
export const RENOVACAO_MS = 30_000

const LOTE_CONTEXTO = 50
const LOTE_VETOR = 64
const FALHAS_SEGUIDAS_VETOR = 3

const MOTIVO_SEM_CHAVE = 'Falta a chave da OpenAI. Cadastre-a em Configurações para processar documentos.'
const MOTIVO_TETO = 'O arquivo geraria mais de 20.000 trechos. Divida-o em partes menores.'
const MOTIVO_SEM_TEXTO = 'Não encontrei texto neste arquivo.'
const MOTIVO_SEM_OBJETO = 'O arquivo não está mais guardado. Envie o arquivo de novo.'
const MOTIVO_VETOR = 'Não consegui gerar a busca por significado agora. Tente reprocessar mais tarde.'
const motivoDuplicata = (nome: string) => `Este arquivo é igual a «${nome}», que já está na base.`

export type VersaoReivindicada = {
  id: string
  workspaceId: string
  documentoId: string
  nomeExibicao: string
  caminho: string
  extensao: Extensao
  origem: 'envio' | 'reprocesso'
  etapa: Etapa | null
}

export interface RepoDocumentos {
  reivindicar(reservaMs: number): Promise<VersaoReivindicada | null>
  /** `false` = a versão sumiu (ou deixou de estar em processamento). */
  renovar(v: VersaoReivindicada, reservaMs: number): Promise<boolean>
  /** Tamanho real do objeto no Storage, em bytes; `null` = objeto não encontrado. */
  tamanhoDoObjeto(caminho: string): Promise<number | null>
  baixar(caminho: string): Promise<Uint8Array>
  /** `nome_exibicao` de outra versão do espaço com o mesmo hash e status diferente de `erro`. */
  acharDuplicata(v: VersaoReivindicada, hash: string): Promise<string | null>
  gravarHash(v: VersaoReivindicada, hash: string): Promise<void>
  apagarTrechos(v: VersaoReivindicada): Promise<void>
  /** `false` = chave estrangeira violada (o documento sumiu). */
  inserirTrechos(v: VersaoReivindicada, trechos: Trecho[]): Promise<boolean>
  marcarEtapa(v: VersaoReivindicada, etapa: Etapa, totais?: { trechosTotal: number; custoEstimadoUsd: number }): Promise<void>
  semContexto(v: VersaoReivindicada, limite: number): Promise<Array<{ id: string; caminho: string[]; texto: string }>>
  /** `''` = tentou e falhou (não tenta de novo). */
  gravarContexto(v: VersaoReivindicada, id: string, contexto: string): Promise<void>
  semVetor(
    v: VersaoReivindicada,
    limite: number,
  ): Promise<Array<{ id: string; caminho: string[]; contexto: string | null; texto: string }>>
  gravarVetores(v: VersaoReivindicada, itens: Array<{ id: string; vetor: number[]; versao: string }>): Promise<void>
  /** Caminho do objeto antigo; `''` quando não havia ativa; `null` = a versão sumiu. */
  promover(v: VersaoReivindicada): Promise<string | null>
  /** Status `erro` com o motivo; reserva limpa. */
  falhar(v: VersaoReivindicada, motivo: string): Promise<void>
  removerObjeto(caminho: string): Promise<void>
  /** Vários objetos numa chamada só (a faxina). */
  removerObjetos(caminhos: string[]): Promise<void>
  /** Caminhos de objetos a apagar do bucket. */
  faxina(): Promise<string[]>
}

export type Deps = {
  repo: RepoDocumentos
  extrair: typeof extrairNoWorker
  frase: typeof gerarFraseDeContexto
  vetores: typeof embedarLote
}

type Fim = 'pronto' | 'erro' | 'sumiu'

/** Estado da reserva desta execução. `perdida` = um `renovar` devolveu `false`: a versão sumiu ou
 *  deixou de ser nossa; a execução para com `'sumiu'` no próximo ponto de checagem. */
type Reserva = { perdida: boolean }

/** Renova agora; `false` (ou reserva já perdida) = parar. */
async function viva(v: VersaoReivindicada, d: Deps, r: Reserva): Promise<boolean> {
  if (r.perdida) return false
  if (!(await d.repo.renovar(v, RESERVA_MS))) r.perdida = true
  return !r.perdida
}

function avisar(o_que: string, err: unknown): void {
  console.warn(`[base-documentos] ${o_que}:`, detalheSeguro(err))
}

/** Erro com motivo. Os trechos da tentativa saem junto: versão em erro nunca é vista pelo agente. */
async function falhar(v: VersaoReivindicada, d: Deps, motivo: string): Promise<'erro'> {
  await d.repo.apagarTrechos(v)
  await d.repo.falhar(v, motivo)
  return 'erro'
}

async function extrair(v: VersaoReivindicada, d: Deps, reserva: Reserva): Promise<Fim | null> {
  await d.repo.marcarEtapa(v, 'extraindo')
  // Retomada no meio da extração: os trechos da tentativa anterior estão incompletos.
  await d.repo.apagarTrechos(v)
  // O teto vale para o objeto que está no bucket AGORA, não para o que foi medido no envio: o
  // token de retomada (upsert) ainda permite sobrescrever o objeto depois da confirmação, e o
  // download vai inteiro para a memória de um servidor que atende todos os espaços.
  const tamanho = await d.repo.tamanhoDoObjeto(v.caminho)
  if (tamanho === null) return falhar(v, d, MOTIVO_SEM_OBJETO)
  const limite = limiteBytesArquivo()
  if (tamanho > limite) {
    const fim = await falhar(v, d, fraseDoLimite(limite))
    await d.repo.removerObjeto(v.caminho).catch((err) => avisar('não consegui apagar o arquivo grande demais', err))
    return fim
  }
  const dados = await d.repo.baixar(v.caminho)
  if (reserva.perdida) return 'sumiu'

  type Parada = { fim: 'sumiu' } | { fim: 'erro'; motivo: string } | { fim: 'duplicata' }
  let parada: Parada | null = null
  let inseridos = 0
  let custo = 0

  const r = await d.extrair(dados, v.extensao, {
    aoHash: async (hash) => {
      if (reserva.perdida) {
        parada = { fim: 'sumiu' }
        return false
      }
      if (v.origem === 'envio') {
        const nome = await d.repo.acharDuplicata(v, hash)
        if (nome !== null) {
          await d.repo.falhar(v, motivoDuplicata(nome))
          parada = { fim: 'duplicata' }
          return false
        }
      }
      await d.repo.gravarHash(v, hash)
      return true
    },
    aoLote: async (trechos) => {
      if (inseridos + trechos.length > TETO_TRECHOS_POR_VERSAO) {
        parada = { fim: 'erro', motivo: MOTIVO_TETO }
        return false
      }
      if (!(await d.repo.inserirTrechos(v, trechos))) {
        parada = { fim: 'sumiu' }
        return false
      }
      inseridos += trechos.length
      custo += estimarCustoUsd(trechos)
      // A extração de um arquivo grande pode passar da reserva: renova a cada lote.
      if (!(await viva(v, d, reserva))) {
        parada = { fim: 'sumiu' }
        return false
      }
      return true
    },
  })

  if (!r.ok) {
    if ('motivo' in r) return falhar(v, d, r.motivo)
    // Atribuída dentro dos ganchos: o TypeScript não enxerga e a estreita para `null`.
    const p = parada as Parada | null
    if (p === null) throw new Error('extração parou sem motivo')
    if (p.fim === 'sumiu') return 'sumiu'
    if (p.fim === 'erro') return falhar(v, d, p.motivo)
    // Duplicata: a versão já foi marcada com erro no gancho; o objeto repetido sai do bucket.
    await d.repo.removerObjeto(v.caminho).catch((err) => avisar('não consegui apagar o arquivo repetido', err))
    return 'erro'
  }
  if (r.total === 0) return falhar(v, d, MOTIVO_SEM_TEXTO)

  await d.repo.marcarEtapa(v, 'contextualizando', { trechosTotal: r.total, custoEstimadoUsd: custo })
  return null
}

async function contextualizar(v: VersaoReivindicada, d: Deps, reserva: Reserva): Promise<Fim | null> {
  for (;;) {
    if (!(await viva(v, d, reserva))) return 'sumiu'
    const lote = await d.repo.semContexto(v, LOTE_CONTEXTO)
    if (lote.length === 0) break

    // Fila simples: CONCORRENCIA_CONTEXTO trabalhadores puxam o próximo trecho até acabar.
    let proximo = 0
    let semChave = false
    const trabalhador = async () => {
      while (!semChave && !reserva.perdida && proximo < lote.length) {
        const t = lote[proximo++]
        const frase = await d.frase({ ws: v.workspaceId, documento: v.nomeExibicao, caminho: t.caminho, texto: t.texto })
        if (frase === 'sem_chave') {
          semChave = true
          return
        }
        await d.repo.gravarContexto(v, t.id, frase === 'falhou' ? '' : frase)
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCORRENCIA_CONTEXTO, lote.length) }, trabalhador))
    if (semChave) return falhar(v, d, MOTIVO_SEM_CHAVE)
    if (reserva.perdida) return 'sumiu'
  }
  await d.repo.marcarEtapa(v, 'vetorizando')
  return null
}

async function vetorizar(v: VersaoReivindicada, d: Deps, reserva: Reserva): Promise<Fim | null> {
  let falhasSeguidas = 0
  for (;;) {
    if (!(await viva(v, d, reserva))) return 'sumiu'
    const lote = await d.repo.semVetor(v, LOTE_VETOR)
    if (lote.length === 0) return null

    const r = await d.vetores(lote.map(textoParaBusca), { ws: v.workspaceId })
    if (reserva.perdida) return 'sumiu'
    if (r === 'sem_chave') return falhar(v, d, MOTIVO_SEM_CHAVE)
    if (r === null) {
      if (++falhasSeguidas >= FALHAS_SEGUIDAS_VETOR) return falhar(v, d, MOTIVO_VETOR)
      continue
    }
    falhasSeguidas = 0
    await d.repo.gravarVetores(
      v,
      lote.map((t, i) => ({ id: t.id, vetor: r.vetores[i], versao: r.versao })),
    )
  }
}

/**
 * Leva a versão reivindicada até ativa, retomando da etapa gravada. Erros de banco/Storage
 * LANÇAM: a reserva vence e a versão é reivindicada de novo (até cinco tentativas, ver a faxina).
 */
export async function processarVersao(v: VersaoReivindicada, d: Deps): Promise<Fim> {
  const reserva: Reserva = { perdida: false }
  // Além das renovações a cada volta: um relógio que renova a cada RENOVACAO_MS enquanto um passo
  // lento está no meio. Uma renovação por vez; erro dela só no log (a próxima tenta de novo).
  let renovando = false
  const relogio = setInterval(() => {
    if (renovando || reserva.perdida) return
    renovando = true
    d.repo
      .renovar(v, RESERVA_MS)
      .then((ok) => {
        if (!ok) reserva.perdida = true
      })
      .catch((err) => avisar('não consegui renovar a reserva', err))
      .finally(() => {
        renovando = false
      })
  }, RENOVACAO_MS)
  relogio.unref?.()
  try {
    return await executar(v, d, reserva)
  } finally {
    clearInterval(relogio)
  }
}

async function executar(v: VersaoReivindicada, d: Deps, reserva: Reserva): Promise<Fim> {
  const etapa = v.etapa
  if (etapa === null || etapa === 'extraindo') {
    const fim = await extrair(v, d, reserva)
    if (fim) return fim
  }
  if (etapa !== 'vetorizando') {
    const fim = await contextualizar(v, d, reserva)
    if (fim) return fim
  }
  const fim = await vetorizar(v, d, reserva)
  if (fim) return fim
  if (reserva.perdida) return 'sumiu'

  const antigo = await d.repo.promover(v)
  if (antigo === null) return 'sumiu'
  if (antigo !== '') {
    await d.repo.removerObjeto(antigo).catch((err) => avisar('não consegui apagar o arquivo da versão antiga', err))
  }
  return 'pronto'
}
