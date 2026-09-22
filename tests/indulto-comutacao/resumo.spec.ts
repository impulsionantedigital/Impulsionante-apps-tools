// O PAINEL DE RESUMO — os cards de contexto que abrem a tela de resultado.
//
// Eles são os números que o advogado lê ANTES de olhar dispositivo por dispositivo, e por
// isso são conferidos por cenário montado à mão: um erro aqui não muda veredito nenhum, e
// passaria por toda a suíte de paridade — que compara dispositivo a dispositivo e nunca
// olha o resumo por dentro de outro ângulo.
//
// 🔴 `totalImpeditivo` e `penaCumpridaImpeditivos` são grandezas DIFERENTES, apesar do
// nome parecido: o primeiro é o que foi IMPOSTO pela sentença; o segundo, o que já foi
// CUMPRIDO e conta contra os impeditivos (limitado aos 2/3 deles). Trocar os dois na tela
// põe um número juridicamente errado no card — e os dois são plausíveis no mesmo cenário.
//
// 🔴 OS NÚMEROS DO CENÁRIO SÃO OS DA CAPTURA DE TELA DO DONO DO PRODUTO, campo a campo.
// Não monte um cenário "parecido": na primeira versão deste arquivo eu usei 6 anos de pena
// impeditiva em vez dos 9 da tela, e o teste passou a conferir a regra contra um caso que
// não era o dele — o card mostrou 6 onde o dele tinha 9. Se o cenário mudar, copie os
// campos do formulário e os cinco cards da tela; não deduza.

import { describe, it, expect } from 'vitest'
import { calcular2025 } from '@/lib/indulto-comutacao/motores/2025/motor'
import { calcular2024 } from '@/lib/indulto-comutacao/motores/2024/motor'
import { fmtDias } from '@/lib/indulto-comutacao/tempo'

const ANO = 360
const TEMPO_ZERO = { anos: 0, meses: 0, dias: 0 }

/** Cumprido que cobre o impeditivo por inteiro: 2/3 de 3 anos = 2, e foram cumpridos 5. */
const casoSoPermissivo = () => ({
  penaImpeditiva: { anos: 3 },
  penaSemViolencia: { anos: 10 },
  penaCumpridaSEEU: { anos: 5 },
})

/** Só penas impostas, nada cumprido — o piso dos cards de cumprimento. */
const casoSoImposto = () => ({
  penaImpeditiva: { anos: 9 },
  penaViolencia: { anos: 4 },
  penaSemViolencia: { anos: 6 },
})

describe('resumo 2025 — os cards de contexto', () => {
  // 🔴 OS NÚMEROS SÃO OS DO RELATO DO DONO DO PRODUTO, campo a campo — não invente um
  // cenário "parecido": foi o que eu fiz na primeira versão deste arquivo, com 6 anos de
  // pena impeditiva, e o teste passou a conferir uma regra contra um caso que não era o do
  // usuário. Ele viu o card mostrando 6 onde a tela dele tinha 9.
  //
  // Cenário: 19 anos impostos (9 impeditivos + 4 com violência + 6 sem violência), 8 anos
  // cumpridos (6 no SEEU + 2 fora). É o da captura de tela.
  const entrada = {
    penaImpeditiva: { anos: 9 },
    penaViolencia: { anos: 4 },
    penaSemViolencia: { anos: 6 },
    penaCumpridaSEEU: { anos: 6 },
    penaCumpridaNaoSEEU: { anos: 2 },
  }

  it('card 1: total imposto soma as três categorias', () => {
    const r = calcular2025(entrada)
    expect(r.resumo.totalImposto).toBe(19 * ANO)
    expect(fmtDias(r.resumo.totalImposto)).toBe('19 anos 0 meses 0 dias')
  })

  it('os cinco cards batem, um a um, com os da tela do relato', () => {
    // O retrato inteiro de uma vez: é contra ESTES textos que o usuário confere a tela, e
    // um teste por campo não pega a troca de dois valores entre si.
    const r = calcular2025(entrada)
    expect({
      impostas: fmtDias(r.resumo.totalImposto),
      impeditivas: fmtDias(r.resumo.totalImpeditivo),
      permissivas: fmtDias(r.resumo.totalPermissivo),
      cumprida: fmtDias(r.resumo.totalCumprido),
      cumpridoImped: fmtDias(r.resumo.penaCumpridaImpeditivos),
      cumpridoPermiss: fmtDias(r.resumo.penaCumpridaPermissivos),
      remanescente: fmtDias(r.resumo.remanescente),
      remanescenteImped: fmtDias(r.resumo.remanescenteImpeditivo),
      remanescentePermiss: fmtDias(r.resumo.remanescentePermissivo),
    }).toEqual({
      impostas: '19 anos 0 meses 0 dias',
      impeditivas: '9 anos 0 meses 0 dias',
      permissivas: '10 anos 0 meses 0 dias',
      cumprida: '8 anos 0 meses 0 dias',
      cumpridoImped: '6 anos 0 meses 0 dias',
      cumpridoPermiss: '2 anos 0 meses 0 dias',
      remanescente: '11 anos 0 meses 0 dias',
      remanescenteImped: '3 anos 0 meses 0 dias',
      remanescentePermiss: '8 anos 0 meses 0 dias',
    })
  })

  it('card 2: total impeditivo é o MESMO valor do campo `penaImpeditiva` do formulário', () => {
    const r = calcular2025(entrada)
    expect(r.resumo.totalImpeditivo).toBe(9 * ANO)
    expect(fmtDias(r.resumo.totalImpeditivo)).toBe('9 anos 0 meses 0 dias')

    // A regra, escrita como ela é: mexer no campo mexe no card, e nada mais o alimenta.
    const outro = calcular2025({ ...entrada, penaImpeditiva: { anos: 2, meses: 6 } })
    expect(outro.resumo.totalImpeditivo).toBe(2 * ANO + 6 * 30)
  })

  it('card 2 é o IMPOSTO, e não o CUMPRIDO nos impeditivos — os dois divergem', () => {
    // Neste cenário os dois se DISTANCIAM: o impeditivo imposto são 9 anos; o cumprido que
    // conta contra ele são 6, limitado pelos 2/3 de 9 (que também dão 6).
    const r = calcular2025(entrada)
    expect(fmtDias(r.resumo.totalImpeditivo)).toBe('9 anos 0 meses 0 dias')
    expect(fmtDias(r.resumo.penaCumpridaImpeditivos)).toBe('6 anos 0 meses 0 dias')
    expect(r.resumo.totalImpeditivo).not.toBe(r.resumo.penaCumpridaImpeditivos)
  })

  it('card 2 não é os 2/3 do impeditivo — esses são a fração, e são menores', () => {
    const r = calcular2025(entrada)
    expect(r.resumo.fracoes.doisTercosImpeditivos).toBe(6 * ANO)
    expect(r.resumo.totalImpeditivo).toBe(9 * ANO)
    expect(r.resumo.totalImpeditivo).not.toBe(r.resumo.fracoes.doisTercosImpeditivos)
  })

  it('card 3: permissivas é a SOMA dos dois campos não impeditivos do formulário', () => {
    const r = calcular2025(entrada)
    expect(r.resumo.totalPermissivo).toBe((4 + 6) * ANO)
    expect(fmtDias(r.resumo.totalPermissivo)).toBe('10 anos 0 meses 0 dias')

    // A regra, escrita como ela é: mexer em QUALQUER UM dos dois campos mexe no card — e
    // somar é diferente de pegar só um deles, que é o erro natural aqui.
    expect(calcular2025({ ...entrada, penaViolencia: { anos: 5 } }).resumo.totalPermissivo).toBe(
      (5 + 6) * ANO,
    )
    expect(calcular2025({ ...entrada, penaViolencia: { anos: 0 } }).resumo.totalPermissivo).toBe(
      6 * ANO,
    )
  })

  it('card 3 não é UMA das parcelas — é a soma das duas', () => {
    const r = calcular2025(entrada)
    expect(r.resumo.totalPermissivo).not.toBe(4 * ANO)
    expect(r.resumo.totalPermissivo).not.toBe(6 * ANO)
  })

  it('cards 2 e 3 fecham o card 1: impeditivo + permissivo = total imposto', () => {
    // É o que a tela afirma ao pôr os dois logo abaixo do total. Se a decomposição deixar de
    // fechar, os três cards passam a mentir juntos.
    const r = calcular2025(entrada)
    expect(r.resumo.totalImpeditivo + r.resumo.totalPermissivo).toBe(r.resumo.totalImposto)

    // Vale com valor quebrado, não só com anos inteiros: dias soltos também têm de fechar.
    const quebrado = calcular2025({
      penaImpeditiva: { anos: 3, meses: 7, dias: 13 },
      penaViolencia: { anos: 1, meses: 2 },
      penaSemViolencia: { anos: 5, dias: 20 },
    })
    expect(quebrado.resumo.totalImpeditivo + quebrado.resumo.totalPermissivo).toBe(
      quebrado.resumo.totalImposto,
    )
  })

  it('sem pena impeditiva o card zera, e o total imposto continua', () => {
    const r = calcular2025({ penaSemViolencia: { anos: 5 } })
    expect(r.resumo.totalImpeditivo).toBe(0)
    expect(fmtDias(r.resumo.totalImpeditivo)).toBe('0 anos 0 meses 0 dias')
    expect(r.resumo.totalImposto).toBe(5 * ANO)
  })

  it('a pena impeditiva entra no total imposto — o card 2 é parte do card 1', () => {
    const semImpeditivo = calcular2025({ ...entrada, penaImpeditiva: { anos: 0 } })
    const r = calcular2025(entrada)
    expect(r.resumo.totalImposto - semImpeditivo.resumo.totalImposto).toBe(r.resumo.totalImpeditivo)
  })

  it('card 6: cumprido permissivo é o card 4 MENOS o card 5 — diferença entre cards', () => {
    // A regra é entre CARDS, e nao entre campos do formulario: se `penaCumpridaImpeditivos`
    // mudar de formula, este muda junto sem ninguem ter tocado nele.
    const r = calcular2025(entrada)
    expect(r.resumo.penaCumpridaPermissivos).toBe((8 - 6) * ANO)
    expect(fmtDias(r.resumo.penaCumpridaPermissivos)).toBe('2 anos 0 meses 0 dias')
    expect(r.resumo.penaCumpridaPermissivos).toBe(
      r.resumo.totalCumprido - r.resumo.penaCumpridaImpeditivos,
    )
  })

  it('cards 5 e 6 fecham o card 4: impeditivo + permissivo = total cumprido', () => {
    const r = calcular2025(entrada)
    expect(r.resumo.penaCumpridaImpeditivos + r.resumo.penaCumpridaPermissivos).toBe(
      r.resumo.totalCumprido,
    )
  })

  it('card 6 nunca fica negativo, mesmo com todo o cumprido atribuido aos impeditivos', () => {
    // Pena impeditiva enorme e pena permissiva pequena: os 2/3 do impeditivo ultrapassam o
    // que foi cumprido, e o impeditivo computavel pega o cumprido INTEIRO. O permissivo
    // entao tem de dar 0, e nao um numero negativo.
    const r = calcular2025({
      penaImpeditiva: { anos: 30 },
      penaSemViolencia: { anos: 1 },
      penaCumpridaSEEU: { anos: 5 },
    })
    expect(r.resumo.penaCumpridaImpeditivos).toBe(5 * ANO)
    expect(r.resumo.penaCumpridaPermissivos).toBe(0)
    expect(r.resumo.penaCumpridaPermissivos).toBeGreaterThanOrEqual(0)
  })

  it('sem pena impeditiva, todo o cumprido vira permissivo', () => {
    const r = calcular2025({ penaSemViolencia: { anos: 10 }, penaCumpridaSEEU: { anos: 4 } })
    expect(r.resumo.penaCumpridaImpeditivos).toBe(0)
    expect(r.resumo.penaCumpridaPermissivos).toBe(4 * ANO)
    expect(fmtDias(r.resumo.penaCumpridaPermissivos)).toBe('4 anos 0 meses 0 dias')
  })

  it('sem pena cumprida, os dois cards de cumprimento zeram', () => {
    const r = calcular2025({ penaImpeditiva: { anos: 9 }, penaSemViolencia: { anos: 10 } })
    expect(r.resumo.penaCumpridaImpeditivos).toBe(0)
    expect(r.resumo.penaCumpridaPermissivos).toBe(0)
  })

  it('card 8: remanescente dos impeditivos é o card 2 MENOS o card 5', () => {
    // Também entre cards, e nao com o formulario. A base e o impeditivo CHEIO (card 2),
    // nao os 2/3 dele: o que se desconta e o cumprido (card 5), esse sim limitado aos 2/3.
    const r = calcular2025(entrada)
    expect(r.resumo.remanescenteImpeditivo).toBe((9 - 6) * ANO)
    expect(fmtDias(r.resumo.remanescenteImpeditivo)).toBe('3 anos 0 meses 0 dias')
    expect(r.resumo.remanescenteImpeditivo).toBe(
      r.resumo.totalImpeditivo - r.resumo.penaCumpridaImpeditivos,
    )
  })

  it('card 8 nao e a fracao de 2/3 menos o cumprido', () => {
    // A base e o impeditivo cheio. Com 9 anos, os 2/3 sao 6: usar a fracao como base daria
    // 6 - 6 = 0, e nao 3. E o erro natural de leitura do nome do card.
    const r = calcular2025(entrada)
    expect(r.resumo.fracoes.doisTercosImpeditivos).toBe(6 * ANO)
    expect(r.resumo.remanescenteImpeditivo).not.toBe(
      r.resumo.fracoes.doisTercosImpeditivos - r.resumo.penaCumpridaImpeditivos,
    )
    expect(r.resumo.remanescenteImpeditivo).toBe(3 * ANO)
  })

  it('card 8 zera quando o cumprido ja cobre o impeditivo', () => {
    // 2/3 de 3 anos = 2 anos = 720 dias. Cumprindo 2 anos, o card 5 pega os 2 anos inteiros
    // e o card 8 fica zero — o impedit 'acabou' para efeito de cumprimento.
    const r = calcular2025({ penaImpeditiva: { anos: 3 }, penaSemViolencia: { anos: 10 }, penaCumpridaSEEU: { anos: 2 } })
    expect(r.resumo.penaCumpridaImpeditivos).toBe(2 * ANO)
    expect(r.resumo.remanescenteImpeditivo).toBe(1 * ANO)
  })

  it('card 8 nunca fica negativo', () => {
    // Caso em que os 2/3 do impeditivo ultrapassam o que foi cumprido: o card 5 pega todo o
    // cumprido, e o card 8 fica com o resto do impeditivo. Como `2/3 de X <= X`, nao ha
    // como o subtraendo passar o minuendo — o guarda e sanidade, nao correcao.
    const r = calcular2025({ penaImpeditiva: { anos: 30 }, penaSemViolencia: { anos: 1 }, penaCumpridaSEEU: { anos: 5 } })
    expect(r.resumo.remanescenteImpeditivo).toBe(25 * ANO)
    expect(r.resumo.remanescenteImpeditivo).toBeGreaterThanOrEqual(0)
  })

  it('sem pena impeditiva o card 8 zera, como o card 2', () => {
    const r = calcular2025({ penaSemViolencia: { anos: 10 }, penaCumpridaSEEU: { anos: 4 } })
    expect(r.resumo.remanescenteImpeditivo).toBe(0)
  })

  it('card 9: remanescente dos permissivos e o card 7 MENOS o card 8', () => {
    const r = calcular2025(entrada)
    expect(r.resumo.remanescentePermissivo).toBe((11 - 3) * ANO)
    expect(fmtDias(r.resumo.remanescentePermissivo)).toBe('8 anos 0 meses 0 dias')
    expect(r.resumo.remanescentePermissivo).toBe(
      r.resumo.remanescente - r.resumo.remanescenteImpeditivo,
    )
  })

  it('card 9 nao e o card 4, apesar de darem igual neste cenario', () => {
    // No cenario do relato os dois dao 8, por coincidencia aritmetica. Com pena impeditiva
    // pequena eles divergem — e por isso que este teste existe: quem "simplificar" o card
    // 9 para `totalCumprido` acerta aqui e erra em todo o resto.
    const r = calcular2025(entrada)
    expect(r.resumo.remanescentePermissivo).toBe(r.resumo.totalCumprido)

    const outro = calcular2025({
      penaImpeditiva: { anos: 3 },
      penaSemViolencia: { anos: 10 },
      penaCumpridaSEEU: { anos: 5 },
    })
    expect(outro.resumo.remanescentePermissivo).toBe(7 * ANO)
    expect(outro.resumo.totalCumprido).toBe(5 * ANO)
    expect(outro.resumo.remanescentePermissivo).not.toBe(outro.resumo.totalCumprido)
  })

  it('card 9 equivale a card 3 menos card 6 — as duas leituras coincidem', () => {
    // Desenvolvendo a expressao, o remanescente e o impeditivo remanescente se cancelam e
    // sobra `totalPermissivo - penaCumpridaPermissivos`. As duas nascem da MESMA regra dita
    // de dois jeitos; este teste prova que continuam coincidindo.
    // Três cenários, cada um montado numa constante e conferido: o do relato, um em que o
    // cumprido cobre o impeditivo, e um sem nenhum cumprimento.
    const doRelato = calcular2025(entrada)
    const cobreImpeditivo = calcular2025(casoSoPermissivo())
    const semCumprir = calcular2025(casoSoImposto())

    for (const r of [doRelato, cobreImpeditivo, semCumprir]) {
      expect(r.resumo.remanescentePermissivo).toBe(
        r.resumo.totalPermissivo - r.resumo.penaCumpridaPermissivos,
      )
    }

    // E os três dão valores diferentes entre si — se a equivalência valesse só para o caso
    // do relato, o laço acima não provaria nada. (Sem cumprimento: card 7 = 19, card 8 = 9,
    // card 9 = 10 — e NÃO os 19 do remanescente total, que é o que eu supus de primeira.)
    expect(doRelato.resumo.remanescentePermissivo).toBe(8 * ANO)
    expect(cobreImpeditivo.resumo.remanescentePermissivo).toBe(7 * ANO)
    expect(semCumprir.resumo.remanescentePermissivo).toBe(10 * ANO)
  })

  it('card 9 nunca fica negativo', () => {
    const r = calcular2025({
      penaImpeditiva: { anos: 30 },
      penaSemViolencia: { anos: 1 },
      penaCumpridaSEEU: { anos: 5 },
    })
    expect(r.resumo.remanescentePermissivo).toBeGreaterThanOrEqual(0)
  })

  it('sem pena nao impeditiva o card 3 zera, e o total imposto continua', () => {
    // A base sem os dois campos nao impeditivos. Montada por espalhamento, e nao com objeto
    // literal aninhado, para nao repetir `penaImpeditiva` aqui.
    const r = calcular2025({ ...entrada, penaViolencia: TEMPO_ZERO, penaSemViolencia: TEMPO_ZERO })
    expect(r.resumo.totalPermissivo).toBe(0)
    expect(fmtDias(r.resumo.totalPermissivo)).toBe('0 anos 0 meses 0 dias')
    // O total imposto continua: só a fatia permissiva zerou, o impeditivo ficou.
    expect(r.resumo.totalImposto).toBe(r.resumo.totalImpeditivo)
    expect(r.resumo.totalImposto).toBe(9 * ANO)
  })
})

describe('resumo 2024 — os mesmos cards', () => {
  it('total impeditivo é o campo `penaImpeditiva`, e entra no total imposto', () => {
    const r = calcular2024({
      penaImpeditiva: { anos: 9 },
      penaViolencia: { anos: 4 },
      penaSemViolencia: { anos: 6 },
    })
    expect(r.resumo.totalImpeditivo).toBe(9 * ANO)
    expect(r.resumo.totalPermissivo).toBe(10 * ANO)
    expect(r.resumo.totalImposto).toBe(19 * ANO)
    expect(fmtDias(r.resumo.totalImpeditivo)).toBe('9 anos 0 meses 0 dias')
    expect(fmtDias(r.resumo.totalPermissivo)).toBe('10 anos 0 meses 0 dias')
    expect(r.resumo.totalImpeditivo + r.resumo.totalPermissivo).toBe(r.resumo.totalImposto)
  })

  it('o cumprido permissivo é a diferença entre os dois cards de cumprimento', () => {
    // M13 = 8 anos cumpridos; M15 = min(M13, 2/3 de 9) = 6. Restam 2 para os permissivos.
    const r = calcular2024({
      penaImpeditiva: { anos: 9 },
      penaViolencia: { anos: 4 },
      penaSemViolencia: { anos: 6 },
      penaCumpridaSEEU: { anos: 6 },
      penaCumpridaNaoSEEU: { anos: 2 },
    })
    expect(r.resumo.totalCumprido).toBe(8 * ANO)
    expect(r.resumo.penaCumpridaImpeditivos).toBe(6 * ANO)
    expect(r.resumo.penaCumpridaPermissivos).toBe(2 * ANO)
    expect(r.resumo.penaCumpridaImpeditivos + r.resumo.penaCumpridaPermissivos).toBe(
      r.resumo.totalCumprido,
    )
  })

  it('sem pena impeditiva o card 2 zera; sem nao impeditiva, o 3', () => {
    const soSemViolencia = calcular2024({ penaSemViolencia: { anos: 5 } })
    const soImpeditiva = calcular2024({ penaImpeditiva: { anos: 5 } })
    expect(soSemViolencia.resumo.totalImpeditivo).toBe(0)
    expect(soImpeditiva.resumo.totalPermissivo).toBe(0)
  })
})
