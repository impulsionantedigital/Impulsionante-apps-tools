import { describe, it, expect } from 'vitest'
import {
  QUESTIONARIO_2025,
  padraoDoCampo,
} from '@/lib/indulto-comutacao/motores/2025/questionario'

const campos = QUESTIONARIO_2025.flatMap((s) => s.campos)
const porChave = new Map(campos.map((c) => [c.chave, c]))

describe('QUESTIONARIO_2025', () => {
  it('traz as 12 seções do decreto, na ordem da POC', () => {
    expect(QUESTIONARIO_2025.map((s) => s.id)).toEqual([
      'identificacao',
      'penas-impostas',
      'pena-cumprida',
      'perfil',
      'regime-situacao',
      'educacao-trabalho',
      'pessoais-familiares',
      'historico-vedacoes',
      'aberto-restritiva',
      'patrimonio-multa',
      'data-do-fato',
      'observacoes',
    ])
  })

  it('usa as chaves que o motor lê, não nomes reescritos', () => {
    // O motor lê por nome: `penaViolencia`, nunca `penaComViolencia`.
    for (const chave of [
      'penaImpeditiva', 'penaViolencia', 'penaSemViolencia',
      'penaCumpridaSEEU', 'penaCumpridaNaoSEEU',
      'dataNascimento', 'dataUltimaPrisao', 'diasRemicao',
      'faccao', 'estudo', 'monitoramentoSV56', 'programaEgressos',
      'cumpriu23ImpeditivoDataFato', 'cumpriuFracaoViolenciaDataFato',
    ]) {
      expect(porChave.has(chave), `faltou a chave ${chave}`).toBe(true)
    }
  })

  it('separa as penas nas três categorias, todas como tempo', () => {
    expect(porChave.get('penaImpeditiva')?.tipo).toBe('tempo')
    expect(porChave.get('penaViolencia')?.tipo).toBe('tempo')
    expect(porChave.get('penaSemViolencia')?.tipo).toBe('tempo')
  })

  it('faz os dois vetos da data do fato nascerem em SIM', () => {
    // Responder NÃO bloqueia indulto E comutação inteiros. Se o padrão fosse NÃO,
    // todo cálculo começaria zerado sem o advogado entender por quê.
    expect(padraoDoCampo(porChave.get('cumpriu23ImpeditivoDataFato')!)).toBe('SIM')
    expect(padraoDoCampo(porChave.get('cumpriuFracaoViolenciaDataFato')!)).toBe('SIM')
  })

  it('avisa na seção da data do fato', () => {
    const secao = QUESTIONARIO_2025.find((s) => s.id === 'data-do-fato')
    expect(secao?.aviso).toMatch(/bloqueia/i)
  })

  it('faz os demais SIM/NÃO nascerem em NÃO', () => {
    // A regra do ui.js: `def` > 'NÃO' se estiver nas opções > primeira opção.
    expect(padraoDoCampo(porChave.get('reincidente')!)).toBe('NÃO')
    expect(padraoDoCampo(porChave.get('faccao')!)).toBe('NÃO')
    expect(padraoDoCampo(porChave.get('estudo')!)).toBe('NÃO')
  })

  it('faz a seleção sem NÃO cair na primeira opção', () => {
    expect(padraoDoCampo(porChave.get('sexo')!)).toBe('MASCULINO')
    expect(padraoDoCampo(porChave.get('regime')!)).toBe('FECHADO')
  })

  it('deixa em branco o que não é seleção', () => {
    expect(padraoDoCampo(porChave.get('sentenciado')!)).toBe('')
    expect(padraoDoCampo(porChave.get('penaImpeditiva')!)).toBe('')
  })

  it('toda seleção declara opções, e o padrão declarado está entre elas', () => {
    for (const campo of campos) {
      if (campo.tipo !== 'selecao') continue
      expect(campo.opcoes.length).toBeGreaterThan(0)
      if (campo.padrao !== undefined) expect(campo.opcoes).toContain(campo.padrao)
    }
  })

  it('não repete chave entre seções e dá rótulo a todo campo', () => {
    const chaves = campos.map((c) => c.chave)
    expect(new Set(chaves).size).toBe(chaves.length)
    for (const campo of campos) expect(campo.rotulo.trim().length).toBeGreaterThan(0)
  })
})
