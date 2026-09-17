// tests/detracao/recolhimento-noturno/registro-versoes.spec.ts
//
// O REGISTRO DE VERSÕES é o que torna um cálculo salvo reproduzível. Cada versão é um pacote fechado
// (motor + formulário + resumo) congelado em `versoes/<rotulo>/`, e a versão GRAVADA no cálculo é o
// que decide qual pacote a tela carrega ao reabri-lo.
//
// 🔴 Por que congelar em vez de converter a entrada: um cálculo salvo é DOCUMENTO e pode ter virado
// petição. Se a fórmula muda e a entrada é convertida para o formato novo, o número que passa a
// aparecer é o da fórmula nova — o documento que foi protocolado deixa de existir na tela, e o
// antigo só sobrevive como JSON no banco, sem como ser reconstruído.
//
// Estes testes travam as duas invariantes que sustentam isso:
//   1. um cálculo NOVO sai sempre com a versão atual do registro;
//   2. um cálculo SALVO é resolvido pelo rótulo que tem gravado, e nunca pelo motor de outra versão.

import { describe, it, expect } from 'vitest'
import {
  VERSOES,
  versaoAtual,
  versaoPorRotulo,
  versoesAnteriores,
  estaDesatualizada,
} from '@/lib/detracao/recolhimento-noturno/versoes/registro'

describe('registro de versões — forma', () => {
  it('tem pelo menos uma versão', () => {
    expect(VERSOES.length).toBeGreaterThan(0)
  })

  it('toda versão declara rótulo, data e resumo não vazios', () => {
    for (const v of VERSOES) {
      expect(v.versao, 'rótulo').toMatch(/^RN-\d+\.\d+$/)
      expect(v.desde, `desde de ${v.versao}`).toMatch(/^\d{4}-\d{2}(-\d{2})?$/)
      expect(v.resumo.trim().length, `resumo de ${v.versao}`).toBeGreaterThan(0)
    }
  })

  it('não há rótulo repetido', () => {
    const rotulos = VERSOES.map((v) => v.versao)
    expect(new Set(rotulos).size).toBe(rotulos.length)
  })

  it('cada versão traz o pacote completo: motor, formulário e resumo', () => {
    // 🔴 Um pacote incompleto é pior do que não ter versão: a tela carregaria o motor de uma versão
    // e o formulário de outra, e o membro veria campos que não correspondem ao número.
    for (const v of VERSOES) {
      expect(typeof v.calcular, `calcular de ${v.versao}`).toBe('function')
      expect(typeof v.mesmoResultado, `mesmoResultado de ${v.versao}`).toBe('function')
      expect(typeof v.gerarTextoPeticao, `gerarTextoPeticao de ${v.versao}`).toBe('function')
      expect(typeof v.formulario.emBranco, `formulario.emBranco de ${v.versao}`).toBe('function')
      expect(typeof v.formulario.paraCalculo, `formulario.paraCalculo de ${v.versao}`).toBe('function')
      expect(typeof v.formulario.segmentoParaRegra, `formulario.segmentoParaRegra de ${v.versao}`).toBe('function')
    }
  })

  it('o formulário da versão produz um segmento em branco utilizável', () => {
    const s = versaoAtual().formulario.emBranco()
    expect(s.dataInicio).toBe('')
    expect(s.dataFim).toBe('')
    expect(s.horaInicioNoturno).toMatch(/^\d{2}:\d{2}$/)
    expect(s.horaFimNoturno).toMatch(/^\d{2}:\d{2}$/)
  })
})

describe('versaoAtual — o que todo cálculo NOVO usa', () => {
  it('é a PRIMEIRA do registro (a mais recente)', () => {
    // 🔴 A ordem do array é o que define a vigente. Inverter a ordem sem perceber faria cálculo novo
    // sair com uma versão antiga, e ninguém veria isso até um número sair errado.
    expect(versaoAtual()).toBe(VERSOES[0])
  })

  it('resolve pelo rótulo dela mesma', () => {
    expect(versaoPorRotulo(versaoAtual().versao)).toBe(versaoAtual())
  })
})

describe('versaoPorRotulo — o que um cálculo SALVO carrega', () => {
  it('devolve o pacote da versão gravada', () => {
    const v = versaoPorRotulo(versaoAtual().versao)
    expect(v).not.toBeNull()
    expect(v!.versao).toBe(versaoAtual().versao)
  })

  it('devolve null para rótulo desconhecido — a tela decide o que fazer, e não chuta', () => {
    // 🔴 `null` e não a versão atual: se um cálculo foi gravado por uma versão que não existe mais
    // neste build, abri-lo com o motor vigente mostraria um número que ele nunca teve. Melhor não
    // abrir do que abrir errado.
    expect(versaoPorRotulo('RN-9.9')).toBeNull()
    expect(versaoPorRotulo('')).toBeNull()
    expect(versaoPorRotulo('qualquer-coisa')).toBeNull()
  })

  it('a versão resolvida é o MESMO objeto do registro — não uma cópia', () => {
    // Garante que a tela não recebe um pacote recriado a cada chamada, que poderia divergir.
    expect(versaoPorRotulo(versaoAtual().versao)).toBe(versaoAtual())
  })
})

describe('estaDesatualizada — quando a tela avisa e trava a edição', () => {
  it('é false para a versão vigente', () => {
    expect(estaDesatualizada(versaoAtual().versao)).toBe(false)
  })

  it('é true para qualquer outra versão', () => {
    expect(estaDesatualizada('RN-1.1')).toBe(true)
    expect(estaDesatualizada('RN-1.0')).toBe(true)
  })
})

describe('versoesAnteriores', () => {
  it('não inclui a atual', () => {
    expect(versoesAnteriores()).not.toContain(versaoAtual())
  })

  it('com uma só versão no registro, é vazia', () => {
    expect(versoesAnteriores()).toHaveLength(VERSOES.length - 1)
  })
})

describe('o pacote da versão atual calcula de verdade', () => {
  it('um cálculo completo produz o número esperado', () => {
    const s = versaoAtual().formulario.emBranco()
    const entrada = versaoAtual().formulario.paraCalculo({
      timezone: 'America/Sao_Paulo',
      segmentos: [
        {
          ...s,
          dataInicio: '2025-01-01',
          dataFim: '2025-12-31',
          diasSemanaNoturno: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
          diasFolgaIntegral: ['SAT', 'SUN'],
          incluirFeriadosUteis: true,
        },
      ],
    })
    const r = versaoAtual().calcular(entrada)
    // 255 noites × 8h + 110 dias integrais (104 fds + 6 feriados) × 24h = 4680h = 195 dias.
    expect(r.diasDetracao).toBe(195)
    expect(r.totalHoras).toBe('4680:00')
    expect(r.detracaoEmAnosMesesDias).toEqual({ anos: 0, meses: 6, dias: 15 })
  })

  it('o mesmo pacote gera o texto da petição', () => {
    const s = versaoAtual().formulario.emBranco()
    const entrada = versaoAtual().formulario.paraCalculo({
      timezone: 'America/Sao_Paulo',
      segmentos: [{ ...s, dataInicio: '2025-01-01', dataFim: '2025-12-31', diasSemanaNoturno: ['MON'] }],
    })
    const texto = versaoAtual().gerarTextoPeticao(entrada, versaoAtual().calcular(entrada))
    expect(texto).toContain('do dia 01/01/2025 a 31/12/2025')
  })
})
