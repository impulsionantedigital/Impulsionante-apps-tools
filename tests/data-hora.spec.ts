import { describe, it, expect } from 'vitest'
import { formatarDataHora } from '@/lib/data-hora'

/**
 * 🔴 Por que fuso explícito: a listagem dos cálculos é componente de SERVIDOR, e o contentor roda
 * em UTC. Sem `timeZone`, um cálculo salvo às 23h30 em Brasília apareceria como 02h30 do dia
 * SEGUINTE — data e hora erradas ao mesmo tempo, para um usuário que está no Brasil.
 */
describe('formatarDataHora', () => {
  it('mostra dia, mês, ano, hora e minuto', () => {
    expect(formatarDataHora('2026-09-14T12:05:00Z')).toBe('14/09/2026, 09:05')
  })

  it('usa o fuso de Brasília, não o do servidor', () => {
    // 02:30 UTC do dia 15 é 23:30 do dia 14 em Brasília: muda a hora E o dia.
    expect(formatarDataHora('2026-09-15T02:30:00Z')).toBe('14/09/2026, 23:30')
  })

  it('não mostra segundos', () => {
    expect(formatarDataHora('2026-09-14T12:05:47Z')).not.toContain('47')
  })

  it('usa 24 horas, sem AM/PM', () => {
    const tarde = formatarDataHora('2026-09-14T20:00:00Z')
    expect(tarde).toContain('17:00')
    expect(tarde.toUpperCase()).not.toContain('AM')
    expect(tarde.toUpperCase()).not.toContain('PM')
  })

  it('põe zero à esquerda em dia, mês e hora', () => {
    expect(formatarDataHora('2026-01-05T12:07:00Z')).toBe('05/01/2026, 09:07')
  })

  it('aceita Date além de string', () => {
    expect(formatarDataHora(new Date('2026-09-14T12:05:00Z'))).toBe('14/09/2026, 09:05')
  })

  it('devolve travessão para data inválida, em vez de "Invalid Date"', () => {
    // A listagem não pode virar uma linha com "Invalid Date" por causa de uma coluna torta.
    expect(formatarDataHora('não é data')).toBe('—')
    expect(formatarDataHora('')).toBe('—')
  })
})
