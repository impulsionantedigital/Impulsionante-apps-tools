// tests/detracao/recolhimento-noturno/formulario.spec.ts
//
// A conversão do formulário para a entrada do motor. Depois da simplificação é uma troca de nomes:
// o formulário edita `dataInicio`/`dataFim` em dias de calendário, e o motor consome exatamente os
// mesmos campos. Não há mais janela `[inicio, fim)`, nem instante, nem extensão pelo turno do
// último dia — e é isso que este arquivo fixa: se alguém reintroduzir horário aqui, o teste acusa.

import { describe, it, expect } from 'vitest'
import {
  entradaFormularioParaCalculo,
  segmentoFormularioEmBranco,
  segmentoParaRegra,
} from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-0/formulario'

describe('conversão do formulário para a entrada do motor', () => {
  it('passa as datas de calendário como o membro digitou, sem acrescentar hora', () => {
    const sf = { ...segmentoFormularioEmBranco(), dataInicio: '2026-01-31', dataFim: '2026-02-15' }
    const regra = segmentoParaRegra(sf)
    expect(regra.dataInicio).toBe('2026-01-31')
    expect(regra.dataFim).toBe('2026-02-15')
  })

  it('não existe mais campo de instante na regra gerada', () => {
    // 🔴 Regressivo: a versão anterior gerava `inicio`/`fim` como `YYYY-MM-DDTHH:MM:SS`, com fim
    // EXCLUSIVO e estendido pelo turno do último dia. Era de lá que vinha o dia extra no fim.
    const regra = segmentoParaRegra({ ...segmentoFormularioEmBranco(), dataInicio: '2026-01-01', dataFim: '2026-01-01' })
    expect('inicio' in regra).toBe(false)
    expect('fim' in regra).toBe(false)
  })

  it('leva os dias marcados e o checkbox sem alterar', () => {
    const sf = {
      ...segmentoFormularioEmBranco(),
      dataInicio: '2026-01-01',
      dataFim: '2026-01-31',
      diasSemanaNoturno: ['MON', 'WED'] as const,
      diasFolgaIntegral: ['SAT'] as const,
      incluirFeriadosUteis: true,
    }
    const regra = segmentoParaRegra({ ...sf, diasSemanaNoturno: [...sf.diasSemanaNoturno], diasFolgaIntegral: [...sf.diasFolgaIntegral] })
    expect(regra.diasSemanaNoturno).toEqual(['MON', 'WED'])
    expect(regra.diasFolgaIntegral).toEqual(['SAT'])
    expect(regra.incluirFeriadosUteis).toBe(true)
  })

  it('entradaFormularioParaCalculo converte todos os segmentos e preserva metadados', () => {
    const ef = {
      timezone: 'America/Sao_Paulo',
      segmentos: [{ ...segmentoFormularioEmBranco(), dataInicio: '2026-01-01', dataFim: '2026-01-01' }],
      observacoes: 'nota',
      monitoramentoEletronico: 'nao' as const,
    }
    const ec = entradaFormularioParaCalculo(ef)
    expect(ec.segmentos).toHaveLength(1)
    expect(ec.observacoes).toBe('nota')
    expect(ec.monitoramentoEletronico).toBe('nao')
  })

  it('o segmento em branco vem sem datas e com o checkbox desmarcado', () => {
    const sf = segmentoFormularioEmBranco()
    expect(sf.dataInicio).toBe('')
    expect(sf.dataFim).toBe('')
    expect(sf.incluirFeriadosUteis).toBe(false)
  })
})
