import { describe, it, expect } from 'vitest'
import { todasAsRespostas } from '@/lib/indulto-comutacao/respostas-anexo'
import { motor2025 } from '@/lib/indulto-comutacao/motores/2025'
import { entradaInicial } from '../../src/app/(app)/ferramentas/cic-2025/Calculadora'
import type { Entrada, MotorDecreto, Secao } from '@/lib/indulto-comutacao/tipos'

const motorFalso = (secoes: Secao[]): MotorDecreto => ({
  ...motor2025,
  questionario: secoes,
})

describe('todasAsRespostas', () => {
  it('devolve uma linha por campo do questionário, mesmo sem nenhuma resposta alterada', () => {
    const linhas = todasAsRespostas(motor2025, entradaInicial(motor2025))
    const totalCampos = motor2025.questionario.reduce((n, s) => n + s.campos.length, 0)
    expect(linhas.length).toBe(totalCampos)
  })

  it('tempo: mostra o valor informado, ou "0 anos 0 meses 0 dias" quando ausente', () => {
    const m = motorFalso([
      { id: 's', titulo: 'Seção', campos: [{ tipo: 'tempo', chave: 't', rotulo: 'Pena' }] },
    ])
    expect(todasAsRespostas(m, {})).toEqual([{ secao: 'Seção', rotulo: 'Pena', valor: '0 anos 0 meses 0 dias' }])
    expect(todasAsRespostas(m, { t: { anos: 7, meses: 5, dias: 1 } })).toEqual([
      { secao: 'Seção', rotulo: 'Pena', valor: '7 anos 5 meses 1 dias' },
    ])
  })

  it('seleção: mostra o valor escolhido, ou o padrão do campo quando ausente', () => {
    const m = motorFalso([
      {
        id: 's',
        titulo: 'Perfil',
        campos: [{ tipo: 'selecao', chave: 'r', rotulo: 'Reincidente', opcoes: ['SIM', 'NÃO'] }],
      },
    ])
    expect(todasAsRespostas(m, {})).toEqual([{ secao: 'Perfil', rotulo: 'Reincidente', valor: 'NÃO' }])
    expect(todasAsRespostas(m, { r: 'SIM' })).toEqual([{ secao: 'Perfil', rotulo: 'Reincidente', valor: 'SIM' }])
  })

  it('seleção: usa o padrão declarado do campo, não o "NÃO" presumido', () => {
    const m = motorFalso([
      {
        id: 's',
        titulo: 'Fato',
        campos: [{ tipo: 'selecao', chave: 'f', rotulo: 'Cumpriu 2/3?', opcoes: ['SIM', 'NÃO'], padrao: 'SIM' }],
      },
    ])
    expect(todasAsRespostas(m, {})).toEqual([{ secao: 'Fato', rotulo: 'Cumpriu 2/3?', valor: 'SIM' }])
    expect(todasAsRespostas(m, { f: 'NÃO' })).toEqual([{ secao: 'Fato', rotulo: 'Cumpriu 2/3?', valor: 'NÃO' }])
  })

  it('texto, número e data: mostra o valor, ou "Não informado"/"0" quando ausente', () => {
    const m = motorFalso([
      {
        id: 's',
        titulo: 'Identificação',
        campos: [
          { tipo: 'texto', chave: 'exec', rotulo: 'Execução nº' },
          { tipo: 'numero', chave: 'rem', rotulo: 'Remição' },
          { tipo: 'data', chave: 'nasc', rotulo: 'Nascimento' },
        ],
      },
    ])
    expect(todasAsRespostas(m, {})).toEqual([
      { secao: 'Identificação', rotulo: 'Execução nº', valor: 'Não informado' },
      { secao: 'Identificação', rotulo: 'Remição', valor: '0' },
      { secao: 'Identificação', rotulo: 'Nascimento', valor: 'Não informado' },
    ])
    expect(todasAsRespostas(m, { exec: '0001234-56', rem: 120, nasc: '1980-03-02' })).toEqual([
      { secao: 'Identificação', rotulo: 'Execução nº', valor: '0001234-56' },
      { secao: 'Identificação', rotulo: 'Remição', valor: '120' },
      { secao: 'Identificação', rotulo: 'Nascimento', valor: '02/03/1980' },
    ])
  })

  it('mantém a ordem do questionário e diz a seção de cada resposta', () => {
    const linhas = todasAsRespostas(motor2025, entradaInicial(motor2025))
    expect(linhas[0]).toEqual({ secao: 'Identificação', rotulo: 'Sentenciado', valor: 'Não informado' })
    for (const l of linhas) expect(l.secao).not.toBe('')
  })

  it('ignora chave que o questionário não declara', () => {
    const entrada = { ...entradaInicial(motor2025), chaveInventada: 'X' } as Entrada
    const totalCampos = motor2025.questionario.reduce((n, s) => n + s.campos.length, 0)
    expect(todasAsRespostas(motor2025, entrada).length).toBe(totalCampos)
  })
})
