import { describe, it, expect } from 'vitest'
import { dias, fmtDias, diasCorridos } from '@/lib/indulto-comutacao/tempo'

describe('dias() — convenção 30/360', () => {
  it('converte anos, meses e dias em dias', () => {
    expect(dias({ anos: 1, meses: 0, dias: 0 })).toBe(360)
    expect(dias({ anos: 0, meses: 1, dias: 0 })).toBe(30)
    expect(dias({ anos: 0, meses: 0, dias: 1 })).toBe(1)
    expect(dias({ anos: 2, meses: 6, dias: 15 })).toBe(915)
  })

  it('trata ausência, nulo e campo faltante como zero', () => {
    expect(dias(null)).toBe(0)
    expect(dias(undefined)).toBe(0)
    expect(dias({} as never)).toBe(0)
    expect(dias({ anos: 0, meses: 0, dias: 0 })).toBe(0)
  })

  it('aceita número em string, como vem de um input', () => {
    expect(dias({ anos: '1', meses: '2', dias: '3' } as never)).toBe(423)
  })
})

describe('fmtDias() — o formato da planilha', () => {
  it('sempre traz as três casas, inclusive as zeradas', () => {
    // A POC nunca omite casas: o advogado lê sempre no mesmo formato.
    expect(fmtDias(915)).toBe('2 anos 6 meses 15 dias')
    expect(fmtDias(360)).toBe('1 anos 0 meses 0 dias')
    expect(fmtDias(0)).toBe('0 anos 0 meses 0 dias')
  })

  it('normaliza 30 dias em um mês e 12 meses em um ano', () => {
    // Sem a normalização, um arredondamento produziria "0 anos 0 meses 30 dias".
    expect(fmtDias(359.6)).toBe('1 anos 0 meses 0 dias')
  })

  it('devolve travessão quando não há valor', () => {
    // A planilha devolvia #VALUE! aqui (bug L145:L149, corrigido no porte).
    expect(fmtDias(null)).toBe('-')
    expect(fmtDias(undefined)).toBe('-')
    expect(fmtDias(Number.NaN)).toBe('-')
  })

  it('prefixa o negativo', () => {
    expect(fmtDias(-30)).toBe('- 0 anos 1 meses 0 dias')
  })
})

describe('diasCorridos() — calendário real', () => {
  it('conta dias de calendário, não 30/360', () => {
    // 2025 tem 365 dias; na convenção 30/360 daria 360.
    expect(diasCorridos(new Date(2024, 11, 25), new Date(2025, 11, 25))).toBe(365)
  })

  it('inclui o dia extra de ano bissexto', () => {
    expect(diasCorridos(new Date(2024, 1, 28), new Date(2024, 2, 1))).toBe(2)
  })

  it('arredonda o resto de horário de verão em vez de truncar', () => {
    // O engine usa Math.round: uma diferença de 0,96 dia vira 1, não 0.
    const de = new Date(2025, 0, 1, 0, 0, 0)
    const ate = new Date(2025, 0, 1, 23, 0, 0)
    expect(diasCorridos(de, ate)).toBe(1)
  })

  it('devolve zero quando falta uma das datas', () => {
    expect(diasCorridos(null, new Date(2025, 11, 25))).toBe(0)
    expect(diasCorridos(new Date(2025, 11, 25), null)).toBe(0)
  })
})
