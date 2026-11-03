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
  // O braço inteiro (faxina + reivindicação) cabe na fatia: o heartbeat pula batidas enquanto um
  // tick está no ar, e um braço preso atrasaria as respostas do WhatsApp. Toda espera daqui tem
  // prazo E aborta a consulta de verdade (o sinal vai até o Supabase); passou do prazo, pula a
  // batida — nunca lança.
  const fatia = orcamento.fatiaPara('documentos')
  const prazoDoBraco = Date.now() + fatia

  let limpos = 0
  try {
    // Em grupos, numa chamada por grupo, dentro de uma fatia curta: o braço nunca segura o tick.
    // O que não couber fica órfão no bucket (a linha já saiu) — só o log registra.
    const prazo = Date.now() + Math.min(TETO_FAXINA_MS, fatia)
    const caminhos = await comPrazo((sinal) => deps.repo.faxina(sinal), prazo - Date.now(), 'faxina')
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
    const resta = prazoDoBraco - Date.now()
    if (resta <= 0) {
      console.warn('[base-documentos] sem tempo para reivindicar nesta batida')
      return { iniciou: false, emAndamento: false, limpos }
    }
    let v: Awaited<ReturnType<typeof deps.repo.reivindicar>>
    try {
      v = await comPrazo((sinal) => deps.repo.reivindicar(RESERVA_MS, sinal), resta, 'reivindicar')
    } catch (err) {
      console.warn('[base-documentos] reivindicação pulada nesta batida:', detalheSeguro(err))
      return { iniciou: false, emAndamento: false, limpos }
    }
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

/** Roda `f` com um sinal que aborta em `ms`, e não espera além disso mesmo se `f` ignorar o sinal. */
async function comPrazo<T>(f: (sinal: AbortSignal) => Promise<T>, ms: number, onde: string): Promise<T> {
  const limite = Math.max(0, ms)
  const controle = new AbortController()
  const relogio = setTimeout(() => controle.abort(new Error(`${onde}: tempo esgotado`)), limite)
  try {
    return await comTempo(f(controle.signal), limite, onde)
  } finally {
    clearTimeout(relogio)
    // Venceu pelo `comTempo` antes do relógio disparar: a consulta ainda no ar é abortada.
    if (!controle.signal.aborted) controle.abort(new Error(`${onde}: encerrado`))
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
