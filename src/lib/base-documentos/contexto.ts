import { custoUsd } from '@/lib/precos-ia'

export const MODELO_CONTEXTO = 'gpt-5-mini'
const MODELO_VETOR = 'text-embedding-3-small'
const LIMITE_TEXTO_BUSCA = 8000

const SISTEMA =
  'Voce recebe um trecho de um documento. Escreva UMA ou DUAS frases curtas, em portugues, que situem o trecho dentro do documento: de que assunto ele trata e onde ele se encaixa. Nao repita o trecho, nao invente nada que nao esteja nele ou nos titulos, nao use introducoes como "Este trecho".'

export function mensagensDoContexto(p: {
  documento: string
  caminho: string[]
  texto: string
}): Array<{ role: 'system' | 'user'; content: string }> {
  const titulos = p.caminho.length > 0 ? p.caminho.join(' › ') : '(sem titulo)'
  return [
    { role: 'system', content: SISTEMA },
    { role: 'user', content: `Documento: ${p.documento}\nTitulos: ${titulos}\n\nTrecho:\n${p.texto}` },
  ]
}

export function textoParaBusca(p: { caminho: string[]; contexto: string | null; texto: string }): string {
  return `${p.caminho.join(' › ')}\n${p.contexto ?? ''}\n${p.texto}`.slice(0, LIMITE_TEXTO_BUSCA)
}

export function estimarCustoUsd(trechos: Array<{ texto: string }>): number {
  let total = 0
  for (const t of trechos) {
    const n = t.texto.length
    total += custoUsd(MODELO_CONTEXTO, Math.ceil((n + 600) / 3), 80) ?? 0
    total += custoUsd(MODELO_VETOR, Math.ceil(n / 3), 0) ?? 0
  }
  return total
}
