import { describe, it, expect } from 'vitest'
import {
  DEGUSTACAO,
  OPCOES_TEMPO_DE_ACESSO,
  PRAZOS_DE_DEGUSTACAO,
  duracaoDaOferta,
  ehDiasDegustacao,
  lerTempoDeAcesso,
  rotuloDaDuracao,
  rotuloDoTempoDeAcesso,
  valorDaDegustacao,
} from '@/lib/vendas/degustacao'
import { DURACOES } from '@/lib/vendas/duracao'

describe('PRAZOS_DE_DEGUSTACAO', () => {
  it('são 7 e 15 dias, e nada mais', () => {
    expect([...PRAZOS_DE_DEGUSTACAO]).toEqual([7, 15])
  })
})

describe('OPCOES_TEMPO_DE_ACESSO', () => {
  // O seletor "Tempo de acesso": as sete durações continuam lá, e a degustação entra com um item
  // POR PRAZO. A degustação não entra em `DURACOES` porque não é um domínio que vence por nome.
  it('são as sete durações mais uma opção por prazo de degustação', () => {
    expect([...OPCOES_TEMPO_DE_ACESSO]).toEqual([...DURACOES, 'degustacao:7', 'degustacao:15'])
  })

  it('🔴 NÃO existe opção "degustacao" sem prazo — era ela que criava a oferta inválida', () => {
    expect((OPCOES_TEMPO_DE_ACESSO as readonly string[]).includes('degustacao')).toBe(false)
  })

  it('a degustação não entra no domínio do que vence por nome', () => {
    expect((DURACOES as readonly string[]).includes(DEGUSTACAO)).toBe(false)
  })
})

describe('lerTempoDeAcesso', () => {
  it('lê as durações normais como vieram', () => {
    expect(lerTempoDeAcesso('mensal')).toEqual({ duracao: 'mensal' })
    expect(lerTempoDeAcesso('vitalicio')).toEqual({ duracao: 'vitalicio' })
  })

  it('lê o par da degustação e separa os DIAS do nome', () => {
    expect(lerTempoDeAcesso('degustacao:7')).toEqual({ duracao: DEGUSTACAO, diasDegustacao: 7 })
    expect(lerTempoDeAcesso('degustacao:15')).toEqual({ duracao: DEGUSTACAO, diasDegustacao: 15 })
  })

  it('🔴 prazo fora da lista é RECUSADO, e não truncado', () => {
    // Um `tempoDeAcesso` forjado (API direta ou select adulterado no navegador) não pode virar um
    // trial de 27 anos, nem uma oferta que aceita toda compra e não libera nada.
    expect(lerTempoDeAcesso('degustacao:9999')).toBeNull()
    expect(lerTempoDeAcesso('degustacao:30')).toBeNull()
    expect(lerTempoDeAcesso('degustacao:0')).toBeNull()
    expect(lerTempoDeAcesso('degustacao:-7')).toBeNull()
    expect(lerTempoDeAcesso('degustacao:7.5')).toBeNull()
  })

  it('degustação SEM prazo é recusada — é a oferta que viraria `oferta_invalida`', () => {
    expect(lerTempoDeAcesso('degustacao')).toBeNull()
  })

  it('duração desconhecida é recusada', () => {
    expect(lerTempoDeAcesso('bimestral')).toBeNull()
    expect(lerTempoDeAcesso('')).toBeNull()
  })

  it('toda opção do seletor é lida sem erro — a lista e o leitor não podem discordar', () => {
    for (const opcao of OPCOES_TEMPO_DE_ACESSO) {
      expect(lerTempoDeAcesso(opcao)).not.toBeNull()
    }
  })
})

describe('valorDaDegustacao', () => {
  it('é o formato que o seletor usa e o leitor entende', () => {
    expect(valorDaDegustacao(7)).toBe('degustacao:7')
    expect(lerTempoDeAcesso(valorDaDegustacao(15))).toEqual({ duracao: DEGUSTACAO, diasDegustacao: 15 })
  })

  it('ida e volta: todo prazo da lista sobrevive ao par', () => {
    for (const dias of PRAZOS_DE_DEGUSTACAO) {
      expect(lerTempoDeAcesso(valorDaDegustacao(dias))).toEqual({ duracao: DEGUSTACAO, diasDegustacao: dias })
    }
  })
})

describe('rotuloDoTempoDeAcesso', () => {
  it('o par da degustação vira o texto que o dono lê no seletor', () => {
    expect(rotuloDoTempoDeAcesso('degustacao:7')).toBe('Degustação — 7 dias')
    expect(rotuloDoTempoDeAcesso('degustacao:15')).toBe('Degustação — 15 dias')
  })

  it('as durações normais mantêm os nomes de sempre', () => {
    expect(rotuloDoTempoDeAcesso('mensal')).toBe('Mensal')
    expect(rotuloDoTempoDeAcesso('vitalicio')).toBe('Vitalício')
  })

  it('🔴 nenhuma opção sai com o placeholder "—" — era o defeito visível no seletor', () => {
    for (const opcao of OPCOES_TEMPO_DE_ACESSO) {
      const rotulo = rotuloDoTempoDeAcesso(opcao)
      expect(rotulo).not.toMatch(/^—/)
      expect(rotulo).not.toContain('— dias')
    }
  })
})

describe('ehDiasDegustacao', () => {
  it('aceita só os prazos que o CRM oferece', () => {
    expect(ehDiasDegustacao(7)).toBe(true)
    expect(ehDiasDegustacao(15)).toBe(true)
  })

  it('recusa qualquer outro número, e qualquer outro tipo', () => {
    for (const valor of [1, 3, 8, 14, 30, 0, -7, 7.5, '7', null, undefined]) {
      expect(ehDiasDegustacao(valor)).toBe(false)
    }
  })
})

describe('duracaoDaOferta', () => {
  it('a duração normal passa como veio, sem olhar os dias', () => {
    expect(duracaoDaOferta({ duracao: 'anual', diasDegustacao: null })).toBe('anual')
    expect(duracaoDaOferta({ duracao: 'vitalicio', diasDegustacao: null })).toBe('vitalicio')
  })

  it('🔴 os DIAS mandam: é por eles que a degustação é identificada', () => {
    // O CHECK do banco não aceita 'degustacao' na coluna `duracao`, então a oferta de dessustação
    // fica gravada com um dos sete nomes + os dias. Procurar a degustação no nome não acharia nada
    // — e uma oferta de trial seria tratada como mensal.
    expect(duracaoDaOferta({ duracao: 'mensal', diasDegustacao: 7 })).toBe(7)
    expect(duracaoDaOferta({ duracao: 'anual', diasDegustacao: 15 })).toBe(15)
  })

  it('a degustação vale pelos DIAS, não pelo nome', () => {
    expect(duracaoDaOferta({ duracao: DEGUSTACAO, diasDegustacao: 7 })).toBe(7)
    expect(duracaoDaOferta({ duracao: DEGUSTACAO, diasDegustacao: 15 })).toBe(15)
  })

  it('degustação sem dias válidos é recusa, e não "sem prazo"', () => {
    // 🔴 `null` aqui vira `oferta_invalida` na aprovação. Devolver 'vitalicio' daria acesso
    // eterno a uma oferta mal cadastrada — o erro mais caro possível.
    expect(duracaoDaOferta({ duracao: DEGUSTACAO, diasDegustacao: null })).toBeNull()
    expect(duracaoDaOferta({ duracao: DEGUSTACAO, diasDegustacao: 0 })).toBeNull()
    // E prazo fora da lista também: a lista é fechada nas duas pontas.
    expect(duracaoDaOferta({ duracao: DEGUSTACAO, diasDegustacao: 30 })).toBeNull()
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
    expect(rotuloDaDuracao(DEGUSTACAO, 7)).toBe('Degustação — 7 dias')
    expect(rotuloDaDuracao(DEGUSTACAO, 15)).toBe('Degustação — 15 dias')
  })

  it('identifica a degustação mesmo com duracao mensal, que é o valor gravado pelo banco', () => {
    // `ofertas.duracao` não pode ser "degustacao": o CHECK do banco aceita só os sete nomes.
    // Portanto, a lista precisa olhar `dias_degustacao` para rotular a oferta corretamente.
    expect(rotuloDaDuracao('mensal', 7)).toBe('Degustação — 7 dias')
    expect(rotuloDaDuracao('mensal', 15)).toBe('Degustação — 15 dias')
  })

  it('🔴 degustação sem dias NÃO vira "— dias": o placeholder saiu do seletor', () => {
    // Era o defeito visível: a opção aparecia como "— dias de degustação" no seletor.
    expect(rotuloDaDuracao(DEGUSTACAO, null)).toBe('Degustação')
  })

  it('🔴 degustação sem dias NÃO vira "— dias": o placeholder saiu do seletor', () => {
    // Era o defeito visível: a opção aparecia como "— dias de degustação" no seletor.
    expect(rotuloDaDuracao(DEGUSTACAO, null)).toBe('Degustação')
  })

  it('duração desconhecida sai como veio, para não sumir da tela', () => {
    expect(rotuloDaDuracao('bimestral', null)).toBe('bimestral')
  })
})
