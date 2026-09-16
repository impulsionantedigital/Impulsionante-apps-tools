import { describe, it, expect } from 'vitest'
import { QUESTIONARIO_2024 } from '@/lib/indulto-comutacao/motores/2024/questionario'
import { padraoDoCampo } from '@/lib/indulto-comutacao/padrao'

const campos = QUESTIONARIO_2024.flatMap((s) => s.campos)
const porChave = new Map(campos.map((c) => [c.chave, c]))

describe('QUESTIONARIO_2024', () => {
  it('traz as 12 seções na ordem da planilha, com o perfil em segundo', () => {
    // A ordem é de TELA, não da planilha: o dono do produto pediu o perfil logo
    // abaixo da identificação (antes das penas). O motor lê por chave e não
    // depende disto; mudar a ordem aqui não muda nenhum veredito.
    expect(QUESTIONARIO_2024.map((s) => s.id)).toEqual([
      'identificacao',
      'perfil',
      'penas-impostas',
      'pena-cumprida',
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

  it('coleta exatamente 50 campos, sem chave repetida', () => {
    expect(campos).toHaveLength(50)
    expect(porChave.size).toBe(50)
  })

  it('nasce com SIM nos dois requisitos da data do fato', () => {
    // Sem isto, todo cálculo começaria vetado e o advogado não saberia por quê.
    expect(padraoDoCampo(porChave.get('cumpriu23ImpeditivoDataFato')!)).toBe('SIM')
    expect(padraoDoCampo(porChave.get('cumpriuFracaoViolenciaDataFato')!)).toBe('SIM')
  })

  it('usa a redação de 2024 no inciso XI, com o piso de doze meses', () => {
    expect(porChave.get('saidasOuTrabalhoExterno')!.rotulo).toContain('no mínimo, doze meses')
  })

  it('pergunta "Tem", e não "Todas as", nas penas substituídas e no regime aberto', () => {
    // A planilha de 2024 pergunta se EXISTE alguma; a de 2025 pergunta se são TODAS.
    // Não "melhorar" o texto de 2024 usando o de 2025 como modelo.
    expect(porChave.get('penasSubstituidas')!.rotulo).toMatch(/^Tem pena substituída/)
    expect(porChave.get('condenacaoAberto')!.rotulo).toMatch(/^Tem condenação em regime aberto/)
  })

  it('tem as seis perguntas de filhos e cuidados que o §2º e os Arts. 10 e 11 leem', () => {
    for (const chave of [
      'gestanteOuFilho14',
      'mulherFilho12',
      'mulherFilho16',
      'homemUnicoResponsavel',
      'imprescindivelCrianca',
      'avoNetos',
    ]) {
      expect(porChave.has(chave), chave).toBe(true)
    }
  })

  it('oferta NÃO SE APLICA só onde a planilha oferta', () => {
    const comNA = campos
      .filter((c) => c.tipo === 'selecao' && c.opcoes.includes('NÃO SE APLICA'))
      .map((c) => c.chave)
      .sort()
    expect(comNA).toEqual([
      'cumpriu23ImpeditivoDataFato',
      'cumpriuFracaoViolenciaDataFato',
      'reparouDano',
      'valorBemSalarioMinimo',
    ])
  })
})
