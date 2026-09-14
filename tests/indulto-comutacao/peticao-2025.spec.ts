// tests/indulto-comutacao/peticao-2025.spec.ts
import { describe, it, expect } from 'vitest'
import { gerarPeticaoIndulto2025, gerarPeticaoComutacao2025 } from '@/lib/indulto-comutacao/motores/2025/peticoes'
import type { MotorDecreto, Resultado } from '@/lib/indulto-comutacao/tipos'

const motorFalso: MotorDecreto = {
  id: 'falso-2025',
  ano: 2025,
  rotulo: 'Decreto 12.970/2025 — indulto natalino',
  versao: '1.0.0',
  dataBase: '2025-12-25',
  questionario: [
    {
      id: 'identificacao',
      titulo: 'Identificação',
      campos: [
        { tipo: 'texto', chave: 'sentenciado', rotulo: 'Sentenciado' },
        { tipo: 'texto', chave: 'execucao', rotulo: 'Execução nº' },
      ],
    },
  ],
  incisos: {
    indulto: [
      {
        id: 'art9_I',
        rotulo: 'Art. 9º, I',
        descricao: 'Pena ≤ 8 anos, sem violência: 1/5 (não reinc.) ou 1/3 (reinc.).',
        temRegraEspecial: true,
      },
    ],
    comutacao: [
      {
        id: 'art13',
        rotulo: 'Art. 13',
        descricao: 'Comutação de 1/5 da remanescente (1/5 cumprido / 1/4 se reinc.).',
        temRegraEspecial: false,
      },
    ],
  },
  avisos: { fixos: [], validarJuridicamente: [] },
  calcular: () => ({ incisos: [], resumo: {} as Resultado['resumo'], avisos: [] }),
}

function resultado(overrides: Partial<Resultado['resumo']> = {}, incisos: Resultado['incisos'] = []): Resultado {
  return {
    incisos,
    resumo: {
      totalImposto: 2880,
      totalCumprido: 1440,
      penaCumpridaImpeditivos: 0,
      remanescente: 1440,
      fracoes: { doisTercosImpeditivos: 0, umQuinto: 288, umQuarto: 360, umTerco: 480, metade: 720 },
      ...overrides,
    },
    avisos: [],
  }
}

describe('gerarPeticaoIndulto2025', () => {
  it('devolve string vazia quando nenhum dispositivo de indulto preenche', () => {
    const r = resultado({}, [{ id: 'art9_I', geral: 'nao_preenche', especial: 'sem_previsao' }])
    expect(gerarPeticaoIndulto2025(motorFalso, { entrada: {}, resultado: r, titulo: 'X' })).toBe('')
  })

  it('preenche nome, execução, decreto, artigo e datas quando há dispositivo aplicável', () => {
    const r = resultado({}, [{ id: 'art9_I', geral: 'preenche', especial: 'sem_previsao' }])
    const texto = gerarPeticaoIndulto2025(motorFalso, {
      entrada: { sentenciado: 'Fulano de Tal', execucao: '0001234-56' },
      resultado: r,
      titulo: 'Caso Fulano',
    })
    expect(texto).toContain('Fulano de Tal, já qualificado')
    expect(texto).toContain('Execução Penal nº 0001234-56')
    expect(texto).toContain('Decreto nº 12.970/2025')
    expect(texto).toContain('Art. 9º, I')
    expect(texto).toContain('RECONHECIMENTO DO DIREITO AO INDULTO')
    expect(texto).toContain('25/12/2025')
    expect(texto).toContain('4 anos 0 meses 0 dias')
    expect(texto).toContain('ANEXO — CÁLCULO DE INDULTO E COMUTAÇÃO')
  })

  it('usa placeholder quando sentenciado/execução não foram informados', () => {
    const r = resultado({}, [{ id: 'art9_I', geral: 'preenche', especial: 'sem_previsao' }])
    const texto = gerarPeticaoIndulto2025(motorFalso, { entrada: {}, resultado: r, titulo: '' })
    expect(texto).toContain('[NOME DO SENTENCIADO], já qualificado')
    expect(texto).toContain('Execução Penal nº [NÚMERO DA EXECUÇÃO]')
  })

  it('descreve ausência de crime impeditivo quando a pena impeditiva é zero', () => {
    const r = resultado({}, [{ id: 'art9_I', geral: 'preenche', especial: 'sem_previsao' }])
    const texto = gerarPeticaoIndulto2025(motorFalso, { entrada: {}, resultado: r, titulo: 'X' })
    expect(texto).toContain('3. DA AUSÊNCIA DE CRIME IMPEDITIVO')
  })

  it('detalha o crime impeditivo e a fração de 2/3 quando há pena impeditiva', () => {
    const r = resultado(
      { fracoes: { doisTercosImpeditivos: 240, umQuinto: 288, umQuarto: 360, umTerco: 480, metade: 720 }, penaCumpridaImpeditivos: 240 },
      [{ id: 'art9_I', geral: 'preenche', especial: 'sem_previsao' }],
    )
    const texto = gerarPeticaoIndulto2025(motorFalso, {
      entrada: { penaImpeditiva: { anos: 1, meses: 0, dias: 0 } },
      resultado: r,
      titulo: 'X',
    })
    expect(texto).toContain('3. DA EXISTÊNCIA DE CRIME IMPEDITIVO')
    expect(texto).toContain('2/3 da pena: 0 anos 8 meses 0 dias')
  })

  it('calcula o percentual cumprido da pena impeditiva com uma casa decimal', () => {
    const r = resultado(
      { fracoes: { doisTercosImpeditivos: 240, umQuinto: 288, umQuarto: 360, umTerco: 480, metade: 720 }, penaCumpridaImpeditivos: 180 },
      [{ id: 'art9_I', geral: 'preenche', especial: 'sem_previsao' }],
    )
    const texto = gerarPeticaoIndulto2025(motorFalso, {
      entrada: { penaImpeditiva: { anos: 1, meses: 0, dias: 0 } },
      resultado: r,
      titulo: 'X',
    })
    expect(texto).toContain('50%')
  })
})

describe('gerarPeticaoComutacao2025', () => {
  it('devolve string vazia quando nenhum dispositivo de comutação preenche', () => {
    const r = resultado({}, [{ id: 'art13', geral: 'nao_preenche', especial: 'sem_previsao' }])
    expect(gerarPeticaoComutacao2025(motorFalso, { entrada: {}, resultado: r, titulo: 'X' })).toBe('')
  })

  it('descreve a fração de 1/5 (primário) ou 1/4 (reincidente) conforme `entrada.reincidente`', () => {
    const r = resultado({}, [{ id: 'art13', geral: 'preenche', especial: 'sem_previsao' }])

    const primario = gerarPeticaoComutacao2025(motorFalso, { entrada: { reincidente: 'NÃO' }, resultado: r, titulo: 'X' })
    expect(primario).toContain('o sentenciado é primário')
    expect(primario).toContain('fração temporal aplicável corresponde a 1/5')

    const reincidente = gerarPeticaoComutacao2025(motorFalso, { entrada: { reincidente: 'SIM' }, resultado: r, titulo: 'X' })
    expect(reincidente).toContain('o sentenciado é reincidente')
    expect(reincidente).toContain('fração temporal aplicável corresponde a 1/4')
  })

  it('usa a fração de 2/3 quando há crime impeditivo', () => {
    const r = resultado({}, [{ id: 'art13', geral: 'preenche', especial: 'sem_previsao' }])
    const texto = gerarPeticaoComutacao2025(motorFalso, {
      entrada: { penaImpeditiva: { anos: 1, meses: 0, dias: 0 } },
      resultado: r,
      titulo: 'X',
    })
    expect(texto).toContain('crime impeditivo')
    expect(texto).toContain('fração temporal aplicável corresponde a 2/3')
    expect(texto).toContain('RECONHECIMENTO DO DIREITO À COMUTAÇÃO')
  })
})
