// Decisões puras do envio de documentos da base de conhecimento: o que a tela pode mandar, com
// que nome o documento nasce, qual versão pendente sai quando chega outra e quando um envio
// interrompido pode continuar de onde parou. As ações em `acoes-documentos.ts` só aplicam isto.
import { extensaoDe, type Extensao, type StatusVersao } from './tipos'

const MB = 1024 * 1024
const TETO_NOME = 120
const NOME_PADRAO = 'Documento sem nome'

export const TIPO_RECUSADO = 'Esse tipo de arquivo não é aceito. Envie pdf, docx, md, txt, json ou csv.'
export const ARQUIVO_VAZIO = 'O arquivo está vazio.'

/**
 * Os status que o cancelamento pode apagar. Vai também no FILTRO do `delete`: entre ler a versão e
 * apagá-la, a promoção pode torná-la ativa — e uma ativa nunca sai pelo cancelamento.
 */
export const STATUS_CANCELAVEIS: readonly StatusVersao[] = ['enviando', 'na_fila', 'processando']
const STATUS_PENDENTES: ReadonlySet<StatusVersao> = new Set(STATUS_CANCELAVEIS)

/** A frase do limite, em MB inteiros — a mesma no pedido e na conferência depois do envio. */
export function fraseDoLimite(limiteBytes: number): string {
  return `O arquivo passa do limite de ${Math.round(limiteBytes / MB)} MB.`
}

export function validarPedidoDeEnvio(
  p: { nomeArquivo: string; tamanho: number },
  limiteBytes: number,
): { ok: true; ext: Extensao } | { ok: false; erro: string } {
  const ext = extensaoDe(String(p.nomeArquivo ?? '').trim())
  if (!ext) return { ok: false, erro: TIPO_RECUSADO }
  if (!Number.isFinite(p.tamanho) || p.tamanho <= 0) return { ok: false, erro: ARQUIVO_VAZIO }
  if (p.tamanho > limiteBytes) return { ok: false, erro: fraseDoLimite(limiteBytes) }
  return { ok: true, ext }
}

/** Sem a extensão, `_`/`-` viram espaço, espaços repetidos somem, cortado em 120. Nunca vazio. */
export function nomeDeExibicaoInicial(nomeArquivo: string): string {
  const bruto = String(nomeArquivo ?? '').trim()
  const ponto = bruto.lastIndexOf('.')
  const semExt = ponto > 0 ? bruto.slice(0, ponto) : ponto === 0 ? '' : bruto
  const nome = semExt.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TETO_NOME).trim()
  return nome || NOME_PADRAO
}

/** A versão pendente (enviando/na_fila/processando) que não é a ativa; `null` se não há. */
export function versaoParaCancelar(
  versoes: Array<{ id: string; status: StatusVersao }>,
  ativaId: string | null,
): string | null {
  const pendente = versoes.find((v) => v.id !== ativaId && STATUS_PENDENTES.has(v.status))
  return pendente?.id ?? null
}

/** O envio interrompido só continua se a versão ainda espera o arquivo e é o MESMO arquivo. */
export function podeRetomar(
  versao: { status: StatusVersao; nomeArquivo: string; tamanho: number } | null,
  pedido: { nomeArquivo: string; tamanho: number },
): boolean {
  if (!versao) return false
  return (
    versao.status === 'enviando' &&
    versao.nomeArquivo === pedido.nomeArquivo &&
    Number(versao.tamanho) === pedido.tamanho
  )
}

/**
 * A versão que a tela mostra ao lado da ativa: a mais nova que ainda não terminou bem
 * (pendente ou em erro) e é posterior à ativa. `versoes` vem da mais nova para a mais antiga.
 * Um erro anterior à ativa já foi superado e não aparece.
 */
export function escolherPendente<T extends { id: string; status: StatusVersao }>(
  versoes: T[],
  ativaId: string | null,
): T | null {
  for (const v of versoes) {
    if (v.id === ativaId) return null
    if (v.status !== 'pronto') return v
  }
  return null
}

/** Os objetos a tirar do bucket: só os das linhas que o `delete` devolveu como apagadas. */
export function objetosDoQueFoiApagado(
  lidas: Array<{ id: string; caminho: string }>,
  apagadas: Array<{ id: string }>,
): string[] {
  const ids = new Set(apagadas.map((a) => a.id))
  return lidas.filter((l) => ids.has(l.id)).map((l) => l.caminho)
}
