// O braço do tick que movimenta a fila de documentos. Ele NUNCA espera o processamento: o tick
// também entrega as respostas do WhatsApp, e um PDF grande levaria minutos. Faz a faxina,
// reivindica uma versão e dispara `processarVersao` em segundo plano, um por vez neste processo.
import 'server-only'
import type { Orcamento } from '@/lib/orcamento-tick'
import { detalheSeguro } from '@/lib/sanitizar-erro'
import { embedarLote } from '@/server/agente/embed'
import { extrairNoWorker } from './extrair-no-worker'
import { gerarFraseDeContexto } from './frase-contexto'
import { processarVersao, RESERVA_MS, type Deps } from './processar'
import { comTempo, criarRepoSupabase } from './repo'

/** Objetos por chamada de remoção na faxina. */
const OBJETOS_POR_REMOCAO = 100
/** Teto do tempo da faxina no Storage: o braço inteiro tem 2.000 ms. */
const TETO_FAXINA_MS = 1_500

/** Processamento em andamento NESTE processo (no máximo um). */
let emAndamento: Promise<void> | null = null
/** Ligado da checagem até o disparo: duas chamadas simultâneas não reivindicam duas versões. */
let reivindicando = false

function depsPadrao(): Deps {
  return { repo: criarRepoSupabase(), extrair: extrairNoWorker, frase: gerarFraseDeContexto, vetores: embedarLote }
}

export async function drenarDocumentos(
  orcamento: Orcamento,
  d?: Deps,
): Promise<{ iniciou: boolean; emAndamento: boolean; limpos: number }> {
  if (!orcamento.cabe('documentos')) return { iniciou: false, emAndamento: emAndamento !== null, limpos: 0 }
  const deps = d ?? depsPadrao()

  let limpos = 0
  try {
    const caminhos = await deps.repo.faxina()
    // Em grupos, numa chamada por grupo, dentro de uma fatia curta: o braço nunca segura o tick.
    // O que não couber fica órfão no bucket (a linha já saiu) — só o log registra.
    const prazo = Date.now() + Math.min(TETO_FAXINA_MS, orcamento.fatiaPara('documentos'))
    for (let i = 0; i < caminhos.length; i += OBJETOS_POR_REMOCAO) {
      const resta = prazo - Date.now()
      if (resta <= 0) {
        console.warn('[base-documentos] faxina: sem tempo para apagar todos os objetos')
        break
      }
      const grupo = caminhos.slice(i, i + OBJETOS_POR_REMOCAO)
      try {
        await comTempo(deps.repo.removerObjetos(grupo), resta, 'faxina')
        limpos += grupo.length
      } catch (err) {
        console.warn('[base-documentos] faxina: não consegui apagar objetos:', detalheSeguro(err))
      }
    }
  } catch (err) {
    console.warn('[base-documentos] faxina falhou:', detalheSeguro(err))
  }

  if (emAndamento || reivindicando) return { iniciou: false, emAndamento: true, limpos }
  reivindicando = true
  try {
    const v = await deps.repo.reivindicar(RESERVA_MS)
    if (!v) return { iniciou: false, emAndamento: false, limpos }
    emAndamento = processarVersao(v, deps)
      .then(
        () => undefined,
        (err) => console.warn('[base-documentos] processamento falhou:', detalheSeguro(err)),
      )
      .finally(() => {
        emAndamento = null
      })
    return { iniciou: true, emAndamento: true, limpos }
  } finally {
    reivindicando = false
  }
}

/** Só para teste: espera o processamento em andamento terminar (se houver). */
export async function _processamentoAtual(): Promise<void> {
  await emAndamento
}

/** Só para teste: zera o estado do módulo. */
export function _reiniciarParaTeste(): void {
  emAndamento = null
  reivindicando = false
}
