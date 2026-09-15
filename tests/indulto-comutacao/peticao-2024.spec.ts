import { describe, it, expect } from 'vitest'
import {
  gerarPeticaoIndulto2024,
  gerarPeticaoComutacao2024,
} from '@/lib/indulto-comutacao/motores/2024/peticoes'
import { motor2024 } from '@/lib/indulto-comutacao/motores/2024'
import type { DadosPeticao } from '@/lib/indulto-comutacao/tipos'

function dados(entrada: Record<string, unknown>, titulo = 'Execução 123'): DadosPeticao {
  const e = entrada as DadosPeticao['entrada']
  return { entrada: e, resultado: motor2024.calcular(e), titulo }
}

describe('petição de indulto — 2024', () => {
  it('devolve vazio quando nenhum dispositivo de indulto se aplica', () => {
    expect(gerarPeticaoIndulto2024(motor2024, dados({}))).toBe('')
  })

  it('cita o Decreto 12.338/2024 e a data-base de 2024', () => {
    const texto = gerarPeticaoIndulto2024(
      motor2024,
      dados({
        penaSemViolencia: { anos: 6, meses: 0, dias: 0 },
        penaCumpridaSEEU: { anos: 2, meses: 0, dias: 0 },
        reincidente: 'NÃO',
        cumpriu23ImpeditivoDataFato: 'SIM',
        cumpriuFracaoViolenciaDataFato: 'SIM',
      }),
    )
    expect(texto).toContain('12.338/2024')
    expect(texto).toContain('25/12/2024')
    expect(texto).not.toContain('12.970/2025')
  })

  it('usa o nome e a execução do cálculo, com marcador quando faltam', () => {
    const texto = gerarPeticaoIndulto2024(
      motor2024,
      dados({
        penaSemViolencia: { anos: 6, meses: 0, dias: 0 },
        penaCumpridaSEEU: { anos: 2, meses: 0, dias: 0 },
        reincidente: 'NÃO',
        cumpriu23ImpeditivoDataFato: 'SIM',
        cumpriuFracaoViolenciaDataFato: 'SIM',
      }),
    )
    expect(texto).toContain('[NOME DO SENTENCIADO]')
    expect(texto).toContain('[NÚMERO DA EXECUÇÃO]')
  })

  it('anexa as premissas do cálculo', () => {
    const texto = gerarPeticaoIndulto2024(
      motor2024,
      dados({
        sentenciado: 'Fulano de Tal',
        penaSemViolencia: { anos: 6, meses: 0, dias: 0 },
        penaCumpridaSEEU: { anos: 2, meses: 0, dias: 0 },
        reincidente: 'NÃO',
        cumpriu23ImpeditivoDataFato: 'SIM',
        cumpriuFracaoViolenciaDataFato: 'SIM',
      }),
    )
    expect(texto).toContain('Fulano de Tal')
    expect(texto).toContain('---')
  })
})

describe('petição de comutação — 2024', () => {
  it('devolve vazio quando nenhuma comutação se aplica', () => {
    expect(gerarPeticaoComutacao2024(motor2024, dados({}))).toBe('')
  })

  it('não menciona pena após a comutação — 2024 não calcula esse valor', () => {
    const texto = gerarPeticaoComutacao2024(
      motor2024,
      dados({
        penaSemViolencia: { anos: 10, meses: 0, dias: 0 },
        penaCumpridaSEEU: { anos: 2, meses: 6, dias: 0 },
        reincidente: 'NÃO',
        cumpriu23ImpeditivoDataFato: 'SIM',
        cumpriuFracaoViolenciaDataFato: 'SIM',
      }),
    )
    expect(texto.toLowerCase()).not.toContain('pena após')
  })
})
