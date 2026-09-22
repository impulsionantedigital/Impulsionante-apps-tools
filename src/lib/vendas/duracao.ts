export const DURACOES = ['semanal', 'quinzenal', 'mensal', 'trimestral', 'semestral', 'anual', 'vitalicio'] as const

export type Duracao = (typeof DURACOES)[number]

export function ehDuracao(valor: unknown): valor is Duracao {
  return typeof valor === 'string' && (DURACOES as readonly string[]).includes(valor)
}

const DIAS: Partial<Record<Duracao, number>> = { semanal: 7, quinzenal: 15 }
const MESES: Partial<Record<Duracao, number>> = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 }

function diasNoMes(ano: number, mesZeroBase: number): number {
  return new Date(Date.UTC(ano, mesZeroBase + 1, 0)).getUTCDate()
}

const MS_POR_DIA = 86_400_000
/**
 * Soma DIAS CORRIDOS a uma data — o que vale para `semanal`, `quinzenal` e para a degustação, cuja
 * duração é um número de dias escolhido na oferta, e não um nome.
 */
export function somarDias(inicio: Date, dias: number): Date {
  return new Date(inicio.getTime() + dias * MS_POR_DIA)
}

/**
 * Soma a duração ao início, em calendário UTC. Meses são de calendário, com fecho no último dia
 * do mês: 31/01 + 1 mês = 28/02 (29 em ano bissexto) — a mesma regra do `interval` do Postgres.
 * `vitalicio` não vence: devolve null.
 */
export function somarDuracao(inicio: Date, duracao: Duracao): Date | null {
  if (duracao === 'vitalicio') return null
  const dias = DIAS[duracao]
  if (dias !== undefined) return somarDias(inicio, dias)

  const total = inicio.getUTCMonth() + (MESES[duracao] as number)
  const ano = inicio.getUTCFullYear() + Math.floor(total / 12)
  const mes = total % 12
  const dia = Math.min(inicio.getUTCDate(), diasNoMes(ano, mes))
  return new Date(
    Date.UTC(
      ano, mes, dia,
      inicio.getUTCHours(), inicio.getUTCMinutes(), inicio.getUTCSeconds(), inicio.getUTCMilliseconds(),
    ),
  )
}
