import { describe, it, expect } from 'vitest'
import {
  DEGUSTACAO,
  MAX_DIAS_DEGUSTACAO,
  OPCOES_TEMPO_DE_ACESSO,
  diasDeDegustacao,
  duracaoDaOferta,
  ehDiasDegustacao,
  rotuloDaDuracao,
} from '@/lib/vendas/degustacao'
import { DURACOES } from '@/lib/vendas/duracao'

describe('OPCOES_TEMPO_DE_ACESSO', () => {
  // O seletor "Tempo de acesso" do admin: as sete durações continuam lá, e é nelas que o
  // domínio do banco (`DURACOES`) se apoia. A degustação é uma opção A MAIS, não uma troca.
  it('são as sete durações mais a degustação, e nada mais', () => {
    expect([...OPCOES_TEMPO_DE_ACESSO]).toEqual([...DURACOES, 'degustacao'])
  })

  it('a degustação não entra no domínio do que vence por nome', () => {
    expect((DURACOES as readonly string[]).includes(DEGUSTACAO)).toBe(false)
  })
})

describe('diasDeDegustacao', () => {
  it('lê o que se digita com ou sem ruído', () => {
    expect(diasDeDegustacao('7')).toBe(7)
    expect(diasDeDegustacao('07')).toBe(7)
    expect(diasDeDegustacao(' 7 ')).toBe(7)
    expect(diasDeDegustacao('7 dias')).toBe(7)
  })

  it('campo sem número nenhum vale zero — quem recusa é a regra da oferta', () => {
    expect(diasDeDegustacao('')).toBe(0)
    expect(diasDeDegustacao('dias')).toBe(0)
  })

  it('trava no teto em vez de recusar: digitar além do limite não vira erro de digitação', () => {
    expect(diasDeDegustacao('99999')).toBe(MAX_DIAS_DEGUSTACAO)
    expect(diasDeDegustacao(String(MAX_DIAS_DEGUSTACAO))).toBe(MAX_DIAS_DEGUSTACAO)
  })
})

describe('ehDiasDegustacao', () => {
  it('aceita inteiro de 1 ao teto', () => {
    expect(ehDiasDegustacao(1)).toBe(true)
    expect(ehDiasDegustacao(15)).toBe(true)
    expect(ehDiasDegustacao(MAX_DIAS_DEGUSTACAO)).toBe(true)
  })

  it('recusa zero, negativo, fracionado, texto, nulo e além do teto', () => {
    for (const valor of [0, -1, 7.5, '7', null, undefined, MAX_DIAS_DEGUSTACAO + 1]) {
      expect(ehDiasDegustacao(valor)).toBe(false)
    }
  })
})

describe('duracaoDaOferta', () => {
  it('a duração normal passa como veio, sem olhar os dias', () => {
    expect(duracaoDaOferta({ duracao: 'anual', diasDegustacao: null })).toBe('anual')
    // Dias guardados numa oferta que não é de degustação são inertes, não viram prazo.
    expect(duracaoDaOferta({ duracao: 'anual', diasDegustacao: 7 })).toBe('anual')
    expect(duracaoDaOferta({ duracao: 'vitalicio', diasDegustacao: null })).toBe('vitalicio')
  })

  it('a degustação vale pelos DIAS, não pelo nome', () => {
    expect(duracaoDaOferta({ duracao: DEGUSTACAO, diasDegustacao: 7 })).toBe(7)
    expect(duracaoDaOferta({ duracao: DEGUSTACAO, diasDegustacao: 1 })).toBe(1)
  })

  it('degustação sem dias válidos é recusa, e não "sem prazo"', () => {
    // 🔴 `null` aqui vira `oferta_invalida` na aprovação. Devolver 'vitalicio' daria acesso
    // eterno a uma oferta mal cadastrada — o erro mais caro possível.
    expect(duracaoDaOferta({ duracao: DEGUSTACAO, diasDegustacao: null })).toBeNull()
    expect(duracaoDaOferta({ duracao: DEGUSTACAO, diasDegustacao: 0 })).toBeNull()
  })

  it('duração desconhecida é recusa, e não passa adiante', () => {
    expect(duracaoDaOferta({ duracao: 'bimestral', diasDegustacao: null })).toBeNull()
  })
})

describe('rotuloDaDuracao', () => {
  it('nomeia as durações conhecidas', () => {
    expect(rotuloDaDuracao('anual', null)).toBe('Anual')
    expect(rotuloDaDuracao('vitalicio', null)).toBe('Vitalício')
  })

  it('a degustação mostra os dias que ela concede', () => {
    expect(rotuloDaDuracao(DEGUSTACAO, 7)).toBe('7 dias de degustação')
  })

  it('degustação sem dias aparece como pendência, e não como "0 dias"', () => {
    expect(rotuloDaDuracao(DEGUSTACAO, null)).toBe('— dias de degustação')
  })

  it('duração desconhecida sai como veio, para não sumir da tela', () => {
    expect(rotuloDaDuracao('bimestral', null)).toBe('bimestral')
  })
})
