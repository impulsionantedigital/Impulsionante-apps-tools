const DATA_BR = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/** Data de vencimento para o e-mail, no fuso de Brasília. Vitalício não tem data. */
export function formatarVencimento(expiraEm: Date | null): string {
  return expiraEm ? DATA_BR.format(expiraEm) : 'sem data de término'
}

export function formatarValor(valor: number | null, moeda: string | null): string {
  if (valor === null || !Number.isFinite(valor)) return '—'
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda || 'BRL' }).format(valor)
  } catch {
    return `${valor.toFixed(2)} ${moeda ?? ''}`.trim()
  }
}

/** Quando vários produtos saem juntos, anuncia-se o vencimento mais tardio; vitalício vence todos. */
export function vencimentoMaisTardio(datas: readonly (Date | null)[]): Date | null {
  if (datas.length === 0 || datas.some((d) => d === null)) return null
  return new Date(Math.max(...(datas as Date[]).map((d) => d.getTime())))
}
