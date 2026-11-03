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
import { criarRepoSupabase } from './repo'

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
    for (const caminho of await deps.repo.faxina()) {
      try {
        await deps.repo.removerObjeto(caminho)
        limpos++
      } catch (err) {
        console.warn('[base-documentos] faxina: não consegui apagar um objeto:', detalheSeguro(err))
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
