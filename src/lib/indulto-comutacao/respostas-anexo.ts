import { padraoDoCampo } from './padrao'
import type { Campo, Entrada, MotorDecreto, Tempo } from './tipos'

export interface RespostaDoAnexo {
  secao: string
  rotulo: string
  valor: string
}

/** Como o resumo de tempos e a planilha: três casas, sempre no plural. */
function formatarTempo(t: Tempo): string {
  return `${t.anos} anos ${t.meses} meses ${t.dias} dias`
}

/** `YYYY-MM-DD` vira `DD/MM/YYYY` sem passar por `Date` — que deslocaria o dia pelo fuso. */
function formatarData(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso.trim()
}

function ehTempo(v: unknown): v is Tempo {
  if (typeof v !== 'object' || v === null) return false
  const t = v as Record<string, unknown>
  return typeof t.anos === 'number' && typeof t.meses === 'number' && typeof t.dias === 'number'
}

/** O que o membro respondeu neste campo, ou `null` quando está como nasceu. */
function respostaDe(campo: Campo, bruto: unknown): string | null {
  if (campo.tipo === 'tempo') {
    if (!ehTempo(bruto)) return null
    if (bruto.anos === 0 && bruto.meses === 0 && bruto.dias === 0) return null
    return formatarTempo(bruto)
  }
  if (campo.tipo === 'selecao') {
    const valor = typeof bruto === 'string' ? bruto : ''
    // 🔴 Compara com `padraoDoCampo`, NUNCA com 'NÃO': há campo cujo padrão declarado é 'SIM'
    // (os dois requisitos da data do fato). Neles é o 'NÃO' que muda o cálculo, e é ele que
    // precisa aparecer no anexo — o contrário esconderia justamente a premissa decisiva.
    return valor === '' || valor === padraoDoCampo(campo) ? null : valor
  }
  if (campo.tipo === 'numero') {
    const n = typeof bruto === 'number' ? bruto : Number(bruto)
    if (!Number.isFinite(n) || n === 0) return null
    return String(n)
  }
  const texto = typeof bruto === 'string' ? bruto.trim() : ''
  if (texto === '') return null
  return campo.tipo === 'data' ? formatarData(texto) : texto
}

/**
 * As respostas que saem do padrão, na ordem do questionário — as premissas do cálculo.
 *
 * 🔴 Só as preenchidas, por decisão do usuário em 14/09/2026: o questionário tem cerca de 60
 * perguntas, e imprimir as ~50 que ficaram em 'NÃO' afogaria as poucas que produziram o
 * resultado. O anexo existe para o juiz ver de onde saiu o número.
 *
 * Chave que o questionário não declara é ignorada — mesma regra de `preparar()`, que filtra por
 * chave ao gravar. O anexo não pode ressuscitar o que a gravação descartou.
 */
export function respostasPreenchidas(motor: MotorDecreto, entrada: Entrada): RespostaDoAnexo[] {
  const linhas: RespostaDoAnexo[] = []
  for (const secao of motor.questionario) {
    for (const campo of secao.campos) {
      const valor = respostaDe(campo, entrada[campo.chave])
      if (valor !== null) linhas.push({ secao: secao.titulo, rotulo: campo.rotulo, valor })
    }
  }
  return linhas
}
