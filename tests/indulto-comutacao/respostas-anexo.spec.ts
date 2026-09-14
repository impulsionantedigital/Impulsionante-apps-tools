import { describe, it, expect } from 'vitest'
import { respostasPreenchidas } from '@/lib/indulto-comutacao/respostas-anexo'
import { motor2025 } from '@/lib/indulto-comutacao/motores/2025'
import { entradaInicial } from '../../src/app/(app)/ferramentas/indulto-comutacao/Calculadora'
import type { Entrada, MotorDecreto, Secao } from '@/lib/indulto-comutacao/tipos'

/**
 * O anexo de petição leva as premissas, não o questionário inteiro: ~60 linhas de "NÃO" afogariam
 * o que de facto mudou o resultado. "Preenchida" = diferente do valor com que o campo nasce.
 */
const motorFalso = (secoes: Secao[]): MotorDecreto => ({
  ...motor2025,
  questionario: secoes,
})

describe('respostasPreenchidas', () => {
  it('não devolve nada quando tudo está como nasceu', () => {
    expect(respostasPreenchidas(motor2025, entradaInicial(motor2025))).toEqual([])
  })

  it('devolve tempo com qualquer parte diferente de zero', () => {
    const m = motorFalso([
      { id: 's', titulo: 'Seção', campos: [{ tipo: 'tempo', chave: 't', rotulo: 'Pena' }] },
    ])
    expect(respostasPreenchidas(m, { t: { anos: 0, meses: 0, dias: 0 } })).toEqual([])
    expect(respostasPreenchidas(m, { t: { anos: 0, meses: 0, dias: 5 } })).toEqual([
      { secao: 'Seção', rotulo: 'Pena', valor: '0 anos 0 meses 5 dias' },
    ])
    // Sempre no plural, como `fmtDias` e o resumo de tempos: duas gramáticas na mesma folha
    // seriam pior que "1 dias". O formato vem da planilha que o advogado já lê.
    expect(respostasPreenchidas(m, { t: { anos: 7, meses: 5, dias: 1 } })[0].valor)
      .toBe('7 anos 5 meses 1 dias')
  })

  it('devolve seleção só quando difere do padrão do campo', () => {
    const m = motorFalso([
      {
        id: 's',
        titulo: 'Perfil',
        campos: [{ tipo: 'selecao', chave: 'r', rotulo: 'Reincidente', opcoes: ['SIM', 'NÃO'] }],
      },
    ])
    expect(respostasPreenchidas(m, { r: 'NÃO' })).toEqual([])
    expect(respostasPreenchidas(m, { r: 'SIM' })).toEqual([
      { secao: 'Perfil', rotulo: 'Reincidente', valor: 'SIM' },
    ])
  })

  it('respeita o padrão declarado, e não o "NÃO" presumido', () => {
    const m = motorFalso([
      {
        id: 's',
        titulo: 'Fato',
        campos: [
          { tipo: 'selecao', chave: 'f', rotulo: 'Cumpriu 2/3?', opcoes: ['SIM', 'NÃO'], padrao: 'SIM' },
        ],
      },
    ])
    // 🔴 Aqui está o caso que importa: neste campo o padrão é SIM, então responder NÃO é a
    // premissa que muda o cálculo — e é ela que precisa aparecer no anexo.
    expect(respostasPreenchidas(m, { f: 'SIM' })).toEqual([])
    expect(respostasPreenchidas(m, { f: 'NÃO' })).toEqual([
      { secao: 'Fato', rotulo: 'Cumpriu 2/3?', valor: 'NÃO' },
    ])
  })

  it('devolve texto, número e data quando preenchidos, e ignora vazio e zero', () => {
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
    expect(respostasPreenchidas(m, {})).toEqual([])
    expect(respostasPreenchidas(m, { exec: '', rem: 0, nasc: '' })).toEqual([])
    expect(respostasPreenchidas(m, { exec: '  ', nasc: '' })).toEqual([])
    expect(respostasPreenchidas(m, { exec: '0001234-56', rem: 120, nasc: '1980-03-02' })).toEqual([
      { secao: 'Identificação', rotulo: 'Execução nº', valor: '0001234-56' },
      { secao: 'Identificação', rotulo: 'Remição', valor: '120' },
      { secao: 'Identificação', rotulo: 'Nascimento', valor: '02/03/1980' },
    ])
  })

  it('mantém a ordem do questionário e diz a seção de cada resposta', () => {
    const entrada: Entrada = {
      ...entradaInicial(motor2025),
      penaSemViolencia: { anos: 7, meses: 5, dias: 1 },
      reincidente: 'SIM',
    }
    const linhas = respostasPreenchidas(motor2025, entrada)
    expect(linhas.length).toBe(2)
    expect(linhas[0].rotulo).toContain('SEM VIOLÊNCIA')
    expect(linhas[1].rotulo).toContain('Reincidente')
    for (const l of linhas) expect(l.secao).not.toBe('')
  })

  it('ignora chave que o questionário não declara', () => {
    // O `preparar` já filtra por chave ao gravar; o anexo não pode ressuscitar lixo.
    const entrada = { ...entradaInicial(motor2025), chaveInventada: 'X' } as Entrada
    expect(respostasPreenchidas(motor2025, entrada)).toEqual([])
  })
})
