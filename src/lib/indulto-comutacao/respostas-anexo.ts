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

/** O valor deste campo para o anexo — SEMPRE uma string, nunca `null`: campo sem resposta
 *  aparece com o valor que tinha ao nascer (tempo zerado, seleção no padrão, texto/data/número
 *  vazios viram "Não informado"/"0"). */
function respostaDe(campo: Campo, bruto: unknown): string {
  if (campo.tipo === 'tempo') {
    return formatarTempo(ehTempo(bruto) ? bruto : { anos: 0, meses: 0, dias: 0 })
  }
  if (campo.tipo === 'selecao') {
    // 🔴 Padrão de `padraoDoCampo`, NUNCA 'NÃO' fixo: há campo cujo padrão declarado é 'SIM'
    // (os dois requisitos da data do fato) — é ele que precisa aparecer quando não respondido.
    return typeof bruto === 'string' && bruto !== '' ? bruto : padraoDoCampo(campo)
  }
  if (campo.tipo === 'numero') {
    const n = typeof bruto === 'number' ? bruto : Number(bruto)
    return Number.isFinite(n) ? String(n) : '0'
  }
  const texto = typeof bruto === 'string' ? bruto.trim() : ''
  if (texto === '') return 'Não informado'
  return campo.tipo === 'data' ? formatarData(texto) : texto
}

/**
 * TODAS as respostas do questionário, na ordem dele — inclusive as que ficaram no valor com que
 * o campo nasce.
 *
 * 🔴 Decisão revista em 14/09/2026, no mesmo dia da decisão anterior: a versão anterior
 * (`respostasPreenchidas`) só listava o que havia sido alterado do padrão, para não afogar os
 * poucos preenchimentos relevantes em ~50 "NÃO". O usuário pediu o inverso — o anexo agora é o
 * retrato completo do questionário no momento do cálculo, respondido ou não. Não há mais duas
 * funções concorrentes: esta substitui `respostasPreenchidas` para todo consumidor.
 *
 * Chave que o questionário não declara é ignorada — mesma regra de `preparar()`, que filtra por
 * chave ao gravar. O anexo não pode ressuscitar o que a gravação descartou.
 */
export function todasAsRespostas(motor: MotorDecreto, entrada: Entrada): RespostaDoAnexo[] {
  const linhas: RespostaDoAnexo[] = []
  for (const secao of motor.questionario) {
    for (const campo of secao.campos) {
      linhas.push({ secao: secao.titulo, rotulo: campo.rotulo, valor: respostaDe(campo, entrada[campo.chave]) })
    }
  }
  return linhas
}
