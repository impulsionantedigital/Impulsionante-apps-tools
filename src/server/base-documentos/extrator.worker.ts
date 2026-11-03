// Ponto de entrada do worker de extração. NÃO é importado por ninguém: o `scripts/empacotar-worker.mjs`
// o transforma em `src/server/workers/extrator.gen.mjs` (um arquivo só, com unpdf e mammoth dentro),
// e `extrairNoWorker` sobe esse arquivo num `Worker` com teto de memória.
//
// Protocolo (worker → principal / principal → worker):
//   { tipo: 'hash', hash }      → espera { tipo: 'seguir' } (ou é encerrado)
//   { tipo: 'lote', trechos }   → espera { tipo: 'seguir' } (ou é encerrado) — um a cada LOTE_DE_TRECHOS
//   { tipo: 'fim', total }
//   { tipo: 'erro', motivo }
import { createHash } from 'node:crypto'
import { parentPort, workerData } from 'node:worker_threads'
import { cortarEmTrechos } from '@/lib/base-documentos/cortar'
import { ErroDeExtracao, extrairSecoes } from '@/lib/base-documentos/extrair'
import type { Extensao, Trecho } from '@/lib/base-documentos/tipos'
import { LOTE_DE_TRECHOS, MOTIVO_ILEGIVEL, type MensagemDoWorker } from './protocolo-worker'

const porta = parentPort
if (!porta) throw new Error('extrator.worker precisa rodar dentro de um Worker')

const enviar = (m: MensagemDoWorker) => porta.postMessage(m)

/** Espera o principal mandar seguir. Se ele não quiser, encerra o worker e esta promessa nunca resolve. */
const esperarSeguir = () =>
  new Promise<void>((resolve) => {
    porta.once('message', (m: { tipo?: string }) => {
      if (m?.tipo === 'seguir') resolve()
    })
  })

async function principal() {
  const { dados, ext } = workerData as { dados: Uint8Array; ext: Extensao }

  enviar({ tipo: 'hash', hash: createHash('sha256').update(dados).digest('hex') })
  await esperarSeguir()

  let trechos: Trecho[]
  try {
    trechos = cortarEmTrechos(await extrairSecoes(ext, dados))
  } catch (e) {
    enviar({ tipo: 'erro', motivo: e instanceof ErroDeExtracao ? e.message : MOTIVO_ILEGIVEL })
    return
  }

  for (let i = 0; i < trechos.length; i += LOTE_DE_TRECHOS) {
    enviar({ tipo: 'lote', trechos: trechos.slice(i, i + LOTE_DE_TRECHOS) })
    await esperarSeguir()
  }
  enviar({ tipo: 'fim', total: trechos.length })
}

principal().catch(() => enviar({ tipo: 'erro', motivo: MOTIVO_ILEGIVEL }))
