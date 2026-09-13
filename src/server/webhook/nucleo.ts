import 'server-only'
import { createHmac } from 'node:crypto'


export { backoff } from '@/lib/retentativa'

export type LinhaOutbox = {
  id: string; tipo: string; workspace_id: string; criado_em: string; payload: unknown
}


export function montarPayload(linha: LinhaOutbox) {
  return {
    id: linha.id, evento: linha.tipo, versao: 'v1' as const,
    workspace_id: linha.workspace_id, ocorrido_em: linha.criado_em, dados: linha.payload,
  }
}


export function assinar(raw: string, segredo: string): string {
  return createHmac('sha256', segredo).update(raw).digest('hex')
}
