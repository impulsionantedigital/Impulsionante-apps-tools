// tests/indulto-comutacao/anexo-texto.spec.ts
import { describe, it, expect } from 'vitest'
import { formatarAnexoTexto } from '@/lib/indulto-comutacao/anexo-texto'
import type { MotorDecreto, Resultado } from '@/lib/indulto-comutacao/tipos'

const motorFalso: MotorDecreto = {
  id: 'falso',
  ano: 2025,
  rotulo: 'Decreto de teste',
  versao: '9.9.9',
  dataBase: '2025-01-01',
  questionario: [
    { id: 's', titulo: 'Seção', campos: [{ tipo: 'texto', chave: 'x', rotulo: 'Campo X' }] },
  ],
  incisos: {
    indulto: [{ id: 'i1', rotulo: 'Inciso 1', descricao: 'Descrição 1', temRegraEspecial: false }],
    comutacao: [{ id: 'c1', rotulo: 'Comutação 1', descricao: 'Descrição C1', temRegraEspecial: false }],
  },
  avisos: { fixos: [], validarJuridicamente: [] },
  calcular: () => ({ incisos: [], resumo: {} as Resultado['resumo'], avisos: [] }),
}

describe('formatarAnexoTexto', () => {
  it('lista respostas e enquadramentos em texto puro', () => {
    const resultado: Resultado = {
      incisos: [
        { id: 'i1', geral: 'preenche', especial: 'sem_previsao' },
        { id: 'c1', geral: 'preenche', especial: 'sem_previsao', quantum: 100, penaApos: 200 },
      ],
      resumo: {} as Resultado['resumo'],
      avisos: [],
    }
    const texto = formatarAnexoTexto(motorFalso, { x: 'valor' }, resultado, 'Meu caso')

    expect(texto).toContain('ANEXO — CÁLCULO DE INDULTO E COMUTAÇÃO')
    expect(texto).toContain('Meu caso')
    expect(texto).toContain('- Campo X: valor')
    expect(texto).toContain(
      '- Inciso 1 (Descrição 1) — Regra geral: Preenche os requisitos; Regra especial: Sem previsão no Decreto',
    )
    expect(texto).toContain('quantum: 0 anos 3 meses 10 dias')
  })

  it('usa o título padrão quando não há identificação', () => {
    const resultado: Resultado = { incisos: [], resumo: {} as Resultado['resumo'], avisos: [] }
    const texto = formatarAnexoTexto(motorFalso, {}, resultado, '   ')
    expect(texto).toContain('Cálculo sem identificação')
  })
})
