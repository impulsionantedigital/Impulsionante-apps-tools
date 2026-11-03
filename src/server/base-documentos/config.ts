// O limite por arquivo da base de conhecimento mora num lugar só: env `BASE_ARQUIVO_MAX_MB`
// (padrão 100). O bucket não tem teto próprio — quem confere é o servidor, antes e depois do envio.
import 'server-only'

const PADRAO_MB = 100

export function limiteBytesArquivo(): number {
  const mb = Number(process.env.BASE_ARQUIVO_MAX_MB)
  const valido = Number.isFinite(mb) && mb > 0 ? mb : PADRAO_MB
  return valido * 1024 * 1024
}
