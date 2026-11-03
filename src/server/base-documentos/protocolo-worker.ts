// O que o worker de extração e o lado principal (`extrair-no-worker.ts`) combinam entre si.
// Sem `server-only` de propósito: este arquivo também vai para dentro do worker empacotado.
import type { Trecho } from '@/lib/base-documentos/tipos'

export const LOTE_DE_TRECHOS = 500

export const MOTIVO_ILEGIVEL = 'Não consegui ler este arquivo. Confira se ele abre normalmente no computador.'

export type MensagemDoWorker =
  | { tipo: 'hash'; hash: string }
  | { tipo: 'lote'; trechos: Trecho[] }
  | { tipo: 'fim'; total: number }
  | { tipo: 'erro'; motivo: string }

export type MensagemParaOWorker = { tipo: 'seguir' }
