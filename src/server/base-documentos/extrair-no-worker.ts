// Extrai e corta um arquivo da base num `Worker` à parte: o PDF de 100 MB não trava o event loop
// do servidor, tem teto de memória próprio e tempo máximo. O código do worker é
// `extrator.worker.ts`, empacotado pelo `pnpm build` em `src/server/workers/extrator.gen.mjs`
// (ver `scripts/empacotar-worker.mjs` e o `outputFileTracingIncludes` do `next.config.ts`).
import 'server-only'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import type { Extensao, Trecho } from '@/lib/base-documentos/tipos'
import { MOTIVO_ILEGIVEL, type MensagemDoWorker, type MensagemParaOWorker } from './protocolo-worker'

export { LOTE_DE_TRECHOS } from './protocolo-worker'

export const TEMPO_MAX_EXTRACAO_MS = 10 * 60_000
export const MEMORIA_WORKER_MB = 768

const MOTIVO_MEMORIA = 'O arquivo é grande demais para ser lido de uma vez neste servidor.'
const MOTIVO_TEMPO = 'A leitura do arquivo passou de 10 minutos e foi interrompida.'

export type ResultadoDaExtracao = { ok: true; total: number; hash: string } | { ok: false; motivo: string } | { ok: false; parou: true }

export type GanchosDaExtracao = {
  /** Recebe o SHA-256 (hex) antes de extrair. `false` = não extrair (ex.: conteúdo repetido). */
  aoHash(hash: string): Promise<boolean>
  /** Recebe cada lote de até `LOTE_DE_TRECHOS`, em ordem, um por vez. `false` = parar. */
  aoLote(trechos: Trecho[]): Promise<boolean>
}

export type OpcoesDaExtracao = {
  /** Caminho do worker empacotado. Padrão: `<cwd>/src/server/workers/extrator.gen.mjs`. */
  caminhoDoWorker?: string
  /** Padrão: `TEMPO_MAX_EXTRACAO_MS`. */
  tempoMaxMs?: number
  /** Chamado com o worker logo depois de criado (os testes usam para conferir que ele terminou). */
  aoCriar?: (worker: Worker) => void
}

/**
 * Roda a extração no worker. Os ganchos rodam no processo principal, um por vez, e o worker só
 * segue depois que cada um responde. Gancho que lança encerra o worker e rejeita com o erro dele.
 * A promessa só termina depois que o worker saiu, em qualquer caminho.
 *
 * ⚠️ O `ArrayBuffer` de `dados` é TRANSFERIDO ao worker quando possível: depois da chamada, `dados`
 * fica vazio. Quem precisar dos bytes depois passa uma cópia.
 */
export async function extrairNoWorker(
  dados: Uint8Array,
  ext: Extensao,
  ganchos: GanchosDaExtracao,
  opts: OpcoesDaExtracao = {},
): Promise<ResultadoDaExtracao> {
  const caminho = opts.caminhoDoWorker ?? path.join(/* turbopackIgnore: true */ process.cwd(), 'src', 'server', 'workers', 'extrator.gen.mjs')
  const tempoMaxMs = opts.tempoMaxMs ?? TEMPO_MAX_EXTRACAO_MS

  // Só dá para transferir um ArrayBuffer inteiro e que não seja do pool interno do Buffer.
  const inteiro = dados.byteOffset === 0 && dados.byteLength === dados.buffer.byteLength && dados.buffer instanceof ArrayBuffer
  const enviado = inteiro ? dados : new Uint8Array(dados)

  // 🔴 `Reflect.construct` em vez de `new Worker(caminho)`: o Turbopack reconhece `new Worker(…)`,
  // resolve o caminho e tenta empacotar o worker (já empacotado) dentro da rota do tick — o build
  // quebra. O arquivo entra no standalone pelo `outputFileTracingIncludes` do `next.config.ts`.
  const worker: Worker = Reflect.construct(Worker, [
    caminho,
    {
      workerData: { dados: enviado, ext },
      transferList: [enviado.buffer as ArrayBuffer],
      resourceLimits: { maxOldGenerationSizeMb: MEMORIA_WORKER_MB },
    },
  ])
  const saiu = new Promise<void>((resolve) => worker.once('exit', () => resolve()))
  opts.aoCriar?.(worker)

  type Fim = { resultado: ResultadoDaExtracao } | { erro: unknown }
  let hash = ''
  let fim: Fim | null = null
  let avisar!: () => void
  const terminou = new Promise<void>((resolve) => (avisar = resolve))
  const encerrar = (f: Fim) => {
    if (fim) return
    fim = f
    avisar()
  }

  const seguir = () => worker.postMessage({ tipo: 'seguir' } satisfies MensagemParaOWorker)
  // As mensagens chegam uma por vez porque o worker espera o `seguir`; a fila só garante a ordem.
  let fila = Promise.resolve()
  worker.on('message', (m: MensagemDoWorker) => {
    fila = fila.then(async () => {
      if (fim) return
      try {
        switch (m.tipo) {
          case 'hash':
            hash = m.hash
            if (await ganchos.aoHash(m.hash)) seguir()
            else encerrar({ resultado: { ok: false, parou: true } })
            break
          case 'lote':
            if (await ganchos.aoLote(m.trechos)) seguir()
            else encerrar({ resultado: { ok: false, parou: true } })
            break
          case 'fim':
            encerrar({ resultado: { ok: true, total: m.total, hash } })
            break
          case 'erro':
            encerrar({ resultado: { ok: false, motivo: m.motivo } })
            break
        }
      } catch (erro) {
        encerrar({ erro })
      }
    })
  })
  worker.on('error', (e: Error & { code?: string }) => {
    encerrar({ resultado: { ok: false, motivo: e.code === 'ERR_WORKER_OUT_OF_MEMORY' ? MOTIVO_MEMORIA : MOTIVO_ILEGIVEL } })
  })
  // Saída sem 'fim' nem 'erro' (não deveria acontecer): trata como arquivo ilegível. Entra na fila
  // para não passar na frente de uma mensagem que ainda está sendo tratada.
  worker.on('exit', () => {
    fila = fila.then(() => encerrar({ resultado: { ok: false, motivo: MOTIVO_ILEGIVEL } }))
  })

  const relogio = setTimeout(() => encerrar({ resultado: { ok: false, motivo: MOTIVO_TEMPO } }), tempoMaxMs)
  try {
    await terminou
  } finally {
    clearTimeout(relogio)
    await worker.terminate()
    await saiu
    // Nenhum gancho fica rodando depois que a função devolve (ex.: um aoLote no meio quando o tempo estourou).
    await fila
  }

  const final = fim as Fim | null
  if (!final) throw new Error('extrairNoWorker terminou sem resultado')
  if ('erro' in final) throw final.erro
  return final.resultado
}
