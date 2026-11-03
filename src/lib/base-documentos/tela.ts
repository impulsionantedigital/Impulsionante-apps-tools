// Frases e números que a tela de documentos mostra. Puro, sem React e sem servidor: o componente
// de cliente importa daqui, e os testes também.
import type { Etapa, StatusVersao } from './tipos'

const MB = 1024 * 1024

type VersaoParaRotulo = {
  status: StatusVersao
  etapa: Etapa | null
  motivo: string | null
  trechosTotal: number
  feitos: number
}

/** O status da versão em português, como a pessoa lê na lista. */
export function rotuloDoStatus(v: VersaoParaRotulo): string {
  switch (v.status) {
    case 'enviando':
      return 'Enviando'
    case 'na_fila':
      return 'Na fila'
    case 'pronto':
      return 'Pronto'
    case 'erro':
      return `Erro: ${v.motivo?.trim() || 'motivo não informado'}`
    case 'processando':
      if (v.etapa === 'contextualizando') return `Gerando contexto (${v.feitos}/${v.trechosTotal})`
      if (v.etapa === 'vetorizando') return `Gerando busca (${v.feitos}/${v.trechosTotal})`
      return 'Lendo o arquivo'
  }
}

/**
 * A linha que aparece quando a frase de contexto falhou em alguns trechos da versão (ficaram com
 * `contexto = ''`). `null` = nenhum: a tela não mostra nada.
 */
export function avisoSemContexto(semContexto: number): string | null {
  if (!Number.isFinite(semContexto) || semContexto <= 0) return null
  if (semContexto === 1) {
    return '1 trecho ficou sem frase de contexto (a busca dele fica um pouco pior). Reprocessar pode resolver.'
  }
  return `${semContexto} trechos ficaram sem frase de contexto (a busca deles fica um pouco pior). Reprocessar pode resolver.`
}

/** `≈ US$ 0,54` — sempre com duas casas e nunca abaixo de um centavo. */
export function formatarCusto(usd: number): string {
  const centavos = Math.max(1, Math.round(usd * 100))
  return `≈ US$ ${(centavos / 100).toFixed(2).replace('.', ',')}`
}

/** `6,0 MB` — a barra de progresso fala em MB do começo ao fim, para os dois números baterem. */
export function formatarMB(bytes: number): string {
  return `${(Math.max(0, bytes) / MB).toFixed(1).replace('.', ',')} MB`
}

/**
 * A tela recarrega a lista enquanto o processador ainda tem trabalho (na fila ou processando).
 * `enviando` fica de fora: quem anda com ele é o navegador que está enviando — e um envio
 * abandonado ficaria `enviando` para sempre, prendendo a tela num recarregar sem fim.
 */
export function precisaAcompanhar(
  documentos: ReadonlyArray<{ ativa: { status: StatusVersao } | null; pendente: { status: StatusVersao } | null }>,
): boolean {
  return documentos.some((d) =>
    [d.ativa, d.pendente].some((v) => v?.status === 'na_fila' || v?.status === 'processando'),
  )
}

export type AcaoDoDocumento =
  | 'alternar'
  | 'renomear'
  | 'substituir'
  | 'reprocessar'
  | 'cancelar'
  | 'assistentes'
  | 'trechos'
  | 'excluir'

/**
 * Quais botões a linha do documento mostra, na ordem da tela. Ler é de todo membro do espaço
 * ("Ver trechos"); escrever é só de quem administra.
 */
export function acoesDoDocumento(d: {
  ehOwner: boolean
  ativa: { status: StatusVersao } | null
  pendente: { status: StatusVersao } | null
  /** Esta aba está mandando o arquivo da pendente — quem cancela é a barra de envio. */
  enviandoAqui: boolean
  variosAssistentes: boolean
}): AcaoDoDocumento[] {
  const trechos: AcaoDoDocumento[] = d.ativa ? ['trechos'] : []
  if (!d.ehOwner) return trechos
  const st = d.pendente?.status
  const cancelavel = !d.enviandoAqui && (st === 'enviando' || st === 'na_fila' || st === 'processando')
  const temArquivo = Boolean(d.ativa) || st === 'erro'
  return [
    'alternar',
    'renomear',
    'substituir',
    ...(temArquivo ? (['reprocessar'] as const) : []),
    ...(cancelavel ? (['cancelar'] as const) : []),
    ...(d.variosAssistentes ? (['assistentes'] as const) : []),
    ...trechos,
    'excluir',
  ]
}
