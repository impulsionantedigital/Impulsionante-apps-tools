import { describe, it, expect } from 'vitest'
import {
  entradaFormularioParaCalculo,
  segmentoFormularioEmBranco,
  segmentoParaRegra,
} from '@/lib/detracao/recolhimento-noturno/formulario'

describe('conversão do formulário para a entrada do motor', () => {
  it('usa data_inicio 00:00 e o dia SEGUINTE a data_fim 00:00 quando não há data/hora exata', () => {
    const sf = { ...segmentoFormularioEmBranco(), dataInicio: '2026-01-31', dataFim: '2026-01-31' }
    const regra = segmentoParaRegra(sf)
    expect(regra.inicio).toBe('2026-01-31T00:00:00')
    expect(regra.fim).toBe('2026-02-01T00:00:00')
  })

  it('usa a data/hora exata quando informada, mesmo sem segundos', () => {
    const sf = {
      ...segmentoFormularioEmBranco(),
      dataInicio: '2026-01-31',
      dataFim: '2026-01-31',
      dataHoraInicioExata: '2026-01-31T13:45',
      dataHoraFimExata: '2026-02-02T09:15',
    }
    const regra = segmentoParaRegra(sf)
    expect(regra.inicio).toBe('2026-01-31T13:45:00')
    expect(regra.fim).toBe('2026-02-02T09:15:00')
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
})
