/*
 * Motor de cálculo — Indulto e Comutação · Decreto nº 12.970/2025
 *
 * PORTE LITERAL de validacao/2025/engine.js (função `calcular`, linhas 68-470),
 * que por sua vez é a reimplementação fiel da aba "Cálculo" da planilha original
 * (GPS da Pena). Cada bloco referencia as células/fórmulas de origem.
 *
 * 🔴 NÃO REFATORE. Os nomes de variável são os das CÉLULAS da planilha (`N6`,
 * `D6`, `I45`, `F49`…) e a ordem dos blocos é a ordem das linhas dela. Isto é
 * feio de propósito: a correspondência linha-a-linha é a única prova de corretude
 * que este cálculo tem — é o que permite conferir, condição por condição, contra o
 * oráculo (o engine.js e a planilha). Extrair `I45 === 1 || I44 === 1` para uma
 * função com nome bonito torna a auditoria impossível. O TypeScript entra na
 * assinatura e nos tipos de retorno, não no miolo.
 *
 * Convenção de tempo de PENA: 30 dias/mês, 360 dias/ano (Sistema A da planilha).
 * Exceção: inciso IV usa dias-calendário reais (Sistema B) — ver campo F49.
 *
 * Desvios em relação à planilha, todos marcados no corpo:
 *  - ⚠️ dois BUGS de fórmula, corrigidos (L145:L149 e G149);
 *  - ⚖️ três AMBIGUIDADES jurídicas, PRESERVADAS — nenhuma "consertada":
 *     1. Inciso VIII: o `Rhalf` do §2º DOBRA o teto da pena remanescente em vez
 *        de reduzi-lo à metade — único ponto do decreto em que "metade" se inverte;
 *     2. `baseComut` (Art. 13 e §4º): base é o max entre cumprida e remanescente;
 *     3. `montaComut`: a "pena após" desconta da pena TOTAL imposta (P9).
 *    As duas últimas saem também no `avisos` do resultado (literais do engine.js);
 *    as três estão em `AVISOS_2025.validarJuridicamente`, que é o que a tela mostra.
 */

import type { Entrada, Resultado, ResultadoInciso, Veredito } from '../../tipos'
import type { Tempo } from '../../tempo'
import { dias, diasCorridos } from '../../tempo'

/**
 * Toda chave de `Entrada` que este motor consome.
 *
 * Existe para o teste de reconciliação: uma chave que o questionário coleta e o
 * motor ignora é pergunta inútil na tela; uma que o motor lê e o questionário não
 * coleta é cálculo que silenciosamente usa `undefined`.
 *
 * Extraída mecanicamente do original:
 *   grep -o 'input\.[A-Za-z0-9_]*' validacao/2025/engine.js | sort -u
 */
export const CHAVES_CONSUMIDAS = [
  'avoNetos',
  'colaboracaoPremiada',
  'concluiuCurso',
  'condenacaoAberto',
  'condicoesGravesSaude',
  'crimeContraCrianca',
  'crimePatrimonio',
  'cumpriu23ImpeditivoDataFato',
  'cumpriuFracaoViolenciaDataFato',
  'dataNascimento',
  'dataUltimaPrisao',
  'deficiencia',
  'diasRemicao',
  'estudo',
  'faccao',
  'faltaGraveAno',
  'faltaGraveExecucao',
  'filhoAte16',
  'filhoDeficiencia',
  'filhoDeficienciaCuidados',
  'filhoDoencaCronica',
  'filhoDoencaCronicaCuidados',
  'gestante',
  'hipossuficiente',
  'homemUnicoResponsavel',
  'imprescindivelCrianca',
  // 🔴 E51. O motor sempre leu esta chave (engine.js:132, dentro de `elegivelP`),
  // mas a tela da POC nunca a coletava — o perfil do §2º ficava incompleto para
  // quem participou de justiça restaurativa. Bug da POC, corrigido na Task 4
  // contra a planilha; aqui ela consta porque o motor de fato a consome.
  'justicaRestaurativa',
  'livramentoCondicional',
  'monitoramentoSV56',
  'penaCumpridaNaoSEEU',
  'penaCumpridaSEEU',
  'penaImpeditiva',
  'penaSemViolencia',
  'penaViolencia',
  'penasSubstituidas',
  'periodoLiberdade2Anos',
  'presidioFederal',
  'programaEgressos',
  'rdd',
  'regime',
  'reincidente',
  'reparouDano',
  'respondendoOutroCrimeViolento',
  'saidasOuTrabalhoExterno',
  'sexo',
  'tempoSemiaberto',
  'tempoSemiabertoAberto',
  'valorBemSalarioMinimo',
  'valorMulta',
] as const

// "SIM"/"NÃO"/"NÃO SE APLICA" -> 1/2/3
function sn(v: unknown): number {
  const s = String(v || '').trim().toUpperCase()
  if (s === 'SIM') return 1
  if (s === 'NÃO' || s === 'NAO') return 2
  if (s === 'NÃO SE APLICA' || s === 'NAO SE APLICA') return 3
  return 2
}

function parseData(v: unknown): Date | null {
  if (!v) return null
  if (v instanceof Date) return v
  // aceita 'YYYY-MM-DD'
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(v as string)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Posição do valor numa lista de faixas (1-based); 1 quando não reconhece.
 *
 * 🔴 ÚNICA REORDENAÇÃO PERMITIDA EM TODO O PORTE. No engine.js esta função é
 * declarada DEPOIS dos usos (linhas 153-155 usam, linha 171 declara) e funciona
 * por hoisting de `function`. Em TypeScript/ESM, declarar dentro de `calcular2025`
 * depois do uso continuaria funcionando, mas o `const` das faixas não — e manter
 * a declaração aqui em cima, em escopo de módulo, é o que deixa o corpo de
 * `calcular2025` idêntico ao do original. Nada além disto mudou de lugar.
 */
function faixa(v: unknown, lista: readonly string[]): number {
  const s = String(v || '').trim().toUpperCase()
  for (let i = 0; i < lista.length; i++) {
    if (lista[i].toUpperCase() === s) return i + 1
  }
  return 1
}

// `input.x` é `string | number | Tempo | null | undefined` no contrato `Entrada`;
// `dias()` quer um `Tempo`. O engine.js não tinha tipos e passava direto.
const t = (v: unknown): Tempo | null | undefined => v as Tempo | null | undefined

export function calcular2025(entrada: Entrada): Resultado {
  const input: Entrada = entrada || {}

  // ---- Penas (dias, base 360) ----
  const N6 = dias(t(input.penaImpeditiva))       // crime IMPEDITIVO (hediondo)
  const N7 = dias(t(input.penaViolencia))        // COM violência/grave ameaça
  const N8 = dias(t(input.penaSemViolencia))     // SEM violência
  const N9 = N6 + N7 + N8                        // total imposto
  const P6 = N6, P7 = N7, P8 = N8, P9 = N9

  // Frações por categoria (linhas 6/7/8, colunas D..J da planilha)
  const D6 = (N6 * 2) / 3                        // 2/3 do impeditivo
  const E7 = N7 / 4, E8 = N8 / 4                 // 1/4
  const F7 = N7 / 3, F8 = N8 / 3                 // 1/3
  const G7 = N7 / 5, G8 = N8 / 5                 // 1/5
  const H7 = N7 / 2, H8 = N8 / 2                 // 1/2
  const I7 = N7 / 8, I8 = N8 / 8                 // 1/8
  const J7 = N7 / 6, J8 = N8 / 6                 // 1/6

  // ---- Pena cumprida ----
  const N11 = dias(t(input.penaCumpridaSEEU))
  const N12 = dias(t(input.penaCumpridaNaoSEEU))
  const N13 = N11 + N12                          // total cumprido
  const P13 = N13
  // pena cumprida descontando os 2/3 do hediondo (N14/P14)
  const P14 = P13 - D6 >= P7 + P8 ? P7 + P8 : P13 - D6
  // pena remanescente (N16/P16)
  const N16 = N9 - N13, P16 = P9 - P13
  // pena remanescente descontando hediondo (N17/P17)
  const P17 = P9 - P6 - (P13 - D6)

  // ---- Datas ----
  const DATA_BASE = new Date(2025, 11, 25)       // 25/12/2025
  const D53 = parseData(input.dataNascimento)    // nascimento
  const D49 = parseData(input.dataUltimaPrisao)
  const F49 = diasCorridos(D49, DATA_BASE)       // dias-calendário reais desde última prisão
  const I25 = Number(input.diasRemicao) || 0
  const I28 = dias(t(input.tempoSemiaberto))
  const I30 = dias(t(input.tempoSemiabertoAberto))

  // idade em 25/12/2025
  const LIM_60 = new Date(1965, 11, 25) // nascidos até aqui => >=60 anos
  const LIM_21 = new Date(2004, 11, 25) // nascidos a partir daqui => <=21 anos
  const idade60mais = D53 ? D53 <= LIM_60 : false
  const idade21menos = D53 ? D53 >= LIM_21 : false

  // ---- Flags do Questionário ----
  const I18 = sn(input.cumpriu23ImpeditivoDataFato == null ? 'SIM' : input.cumpriu23ImpeditivoDataFato) // E113 (default SIM, como na planilha)
  const I20 = sn(input.reincidente)                  // E35
  const I21 = sn(input.colaboracaoPremiada)          // E63
  const I22 = sn(input.faccao)                       // E65
  const I23 = sn(input.rdd)                          // E67
  const I24 = sn(input.presidioFederal)              // E69
  const I26 = sn(input.condicoesGravesSaude)         // E73
  const I31 = String(input.sexo || '').trim().toUpperCase() === 'FEMININO' ? 1 : 2 // E31
  const I32 = sn(input.gestante)                     // E75
  const I33 = sn(input.filhoAte16)                   // E77
  const I34 = sn(input.filhoDeficiencia)             // E79
  const I35 = sn(input.filhoDeficienciaCuidados)     // E81
  const I36 = sn(input.filhoDoencaCronica)           // E83
  const I37 = sn(input.filhoDoencaCronicaCuidados)   // E85
  const I41 = sn(input.homemUnicoResponsavel)        // E87
  const I42 = sn(input.imprescindivelCrianca)        // E89
  const I43 = sn(input.avoNetos)                     // E91
  const I44 = sn(input.deficiencia)                  // E71
  const I45 = sn(input.justicaRestaurativa)          // E51
  const I46 = sn(input.crimeContraCrianca)           // E99
  const I47 = sn(input.periodoLiberdade2Anos)        // E55
  const I51 = sn(input.faltaGraveAno)                // E57
  const I52 = sn(input.faltaGraveExecucao)           // E59
  const I55 = sn(input.crimePatrimonio)              // E107
  const I56 = sn(input.reparouDano)                  // E109
  const I57 = sn(input.valorBemSalarioMinimo)        // E111
  const I60 = sn(input.hipossuficiente)              // E119
  const I62 = sn(input.saidasOuTrabalhoExterno)      // E93
  const I63 = (function () {                         // E37 regime
    const r = String(input.regime || '').trim().toUpperCase()
    if (r === 'FECHADO') return 1
    if (r === 'SEMIABERTO') return 2
    if (r === 'ABERTO') return 3
    return 1
  })()
  const I64 = sn(input.livramentoCondicional)        // E45
  const I65 = sn(input.penasSubstituidas)            // E103
  const I66 = sn(input.condenacaoAberto)             // E105
  const I67 = sn(input.respondendoOutroCrimeViolento) // E101
  const I68 = faixa(input.programaEgressos, ['NÃO', 'HÁ MENOS DE 01 ANO', 'ENTRE 01 E 02 ANOS', 'HÁ MAIS DE 02 ANOS']) // E49
  const I69 = faixa(input.monitoramentoSV56, ['NÃO', 'HÁ MENOS DE 01 ANO E 06 MESES', 'ENTRE 01 ANO E 06 MESES E 03 ANOS', 'HÁ MAIS DE 03 ANOS']) // E47
  const I70 = faixa(input.estudo, ['NÃO', 'MENOS DE 12 MESES', 'MAIS DE 12 MESES NOS ÚLTIMOS 3 ANOS', 'MAIS DE 18 MESES NOS ÚLTIMOS 5 ANOS']) // E95
  const I71 = sn(input.concluiuCurso)                // E97
  const I72 = sn(input.cumpriuFracaoViolenciaDataFato == null ? 'SIM' : input.cumpriuFracaoViolenciaDataFato) // E115 (default SIM, como na planilha)
  const D59 = Number(input.valorMulta) || 0          // E117

  // ---- Portões reutilizados ----
  const gates5 = !(I22 === 1 || I23 === 1 || I24 === 1 || I51 === 1 || I21 === 1) // E (5 impedimentos)
  const gates4 = !(I22 === 1 || I23 === 1 || I24 === 1 || I51 === 1)              // E do Art.13/§4º (sem colaboração)
  const hediondo = N6 === 0 || N13 >= (N6 * 2) / 3   // H (cumpriu 2/3 do impeditivo)
  const i18ok = I18 === 1 || I18 === 3               // G (2/3 impeditivo p/ data do fato)
  const i72ok = I72 === 1 || I72 === 3               // K (fração violência p/ data do fato)
  const temPenaNaoImped = !(N8 === 0 && N7 === 0)    // "não é só impeditivo"
  const elegivelP = idade60mais || I32 === 1 || I33 === 1 || I34 === 1 || I36 === 1 ||
                    I41 === 1 || I42 === 1 || I44 === 1 || I45 === 1  // §2º (col P)
  const qOk = I46 === 2                              // crime não contra criança (col Q)

  // (`faixa` foi declarada no topo do módulo — ver o comentário lá.)

  // O engine.js devolvia a string pronta ('Preenche os requisitos'). Aqui devolve
  // o CÓDIGO do veredito e a tela resolve o rótulo por `VEREDITOS`. Tradução 1:1:
  // as condições de cada inciso, abaixo, ficam intocadas.
  const texto = (ok: boolean): Veredito => (ok ? 'preenche' : 'nao_preenche')
  const incisos: ResultadoInciso[] = []

  // ===================== ART. 9º =====================
  // Inciso I (linha 75) — pena ≤8a, sem violência, 1/5(não reinc)/1/3(reinc)
  ;(function () {
    const fracI = I20 === 2 ? D6 + G8 + G7 <= N13 : D6 + F8 + F7 <= N13
    const fracR = I20 === 2 ? D6 + G8 / 2 + G7 / 2 <= N13 : D6 + F8 / 2 + F7 / 2 <= N13
    const geral = gates5 && N9 <= 8 * 360 && i18ok && hediondo && fracI && N8 !== 0 && i72ok
    const esp = gates5 && N9 <= 8 * 360 && i18ok && hediondo && N8 !== 0 && i72ok && elegivelP && qOk && fracR
    incisos.push({ id: 'art9_I', geral: texto(geral), especial: texto(esp) })
  })()

  // Inciso II (78) — pena ≤12a, sem violência, 1/3/1/2
  ;(function () {
    const fracI = I20 === 2 ? D6 + F8 + F7 <= N13 : D6 + H8 + H7 <= N13
    const fracR = I20 === 2 ? D6 + F8 / 2 + F7 / 2 <= N13 : D6 + H8 / 2 + H7 / 2 <= N13
    const geral = gates5 && N9 <= 12 * 360 && i18ok && hediondo && fracI && N8 !== 0 && i72ok
    const esp = gates5 && N9 <= 12 * 360 && i18ok && hediondo && N8 !== 0 && i72ok && elegivelP && qOk && fracR
    incisos.push({ id: 'art9_II', geral: texto(geral), especial: texto(esp) })
  })()

  // Inciso III (81) — pena ≤4a, COM violência, 1/3/1/2
  ;(function () {
    const fracI = I20 === 2 ? D6 + F8 + F7 <= N13 : D6 + H8 + H7 <= N13
    const fracR = I20 === 2 ? D6 + F8 / 2 + F7 / 2 <= N13 : D6 + H8 / 2 + H7 / 2 <= N13
    const geral = gates5 && N9 <= 4 * 360 && i18ok && hediondo && fracI && N7 !== 0 && i72ok
    const esp = gates5 && N9 <= 4 * 360 && i18ok && hediondo && N7 !== 0 && i72ok && elegivelP && qOk && fracR
    incisos.push({ id: 'art9_III', geral: texto(geral), especial: texto(esp) })
  })()

  // Inciso IV (84) — 15a(não reinc)/20a(reinc) ININTERRUPTOS (dias reais + remição)
  ;(function () {
    const H = I20 === 2 ? F49 + I25 >= 5480 : F49 + I25 >= 7306
    const J = I20 === 2 ? N13 >= D6 + 15 * 360 : N13 >= D6 + 20 * 360
    const Rhalf = I20 === 2 ? F49 + I25 >= 5480 / 2 : F49 + I25 >= 7306 / 2
    const Shalf = I20 === 2 ? N13 >= D6 + (15 * 360) / 2 : N13 >= D6 + (20 * 360) / 2
    const geral = gates5 && i18ok && hediondo && H && temPenaNaoImped && J
    const esp = gates5 && i18ok && hediondo && temPenaNaoImped && elegivelP && qOk && Rhalf && Shalf
    incisos.push({ id: 'art9_IV', geral: texto(geral), especial: texto(esp) })
  })()

  // Inciso V (87) — 20a/25a NÃO ininterruptos, liberdade ≤2a
  ;(function () {
    const H = I20 === 2 ? N13 >= 20 * 360 : N13 >= 25 * 360
    const J = I20 === 2 ? N13 >= D6 + 20 * 360 : N13 >= D6 + 25 * 360
    const K = I47 !== 1
    const Rhalf = I20 === 2 ? N13 >= (20 * 360) / 2 : N13 >= (25 * 360) / 2
    const Shalf = I20 === 2 ? N13 >= D6 + (20 * 360) / 2 : N13 >= D6 + (25 * 360) / 2
    const geral = gates5 && i18ok && hediondo && H && temPenaNaoImped && J && K
    const esp = gates5 && i18ok && hediondo && temPenaNaoImped && K && elegivelP && qOk && Rhalf && Shalf
    incisos.push({ id: 'art9_V', geral: texto(geral), especial: texto(esp) })
  })()

  // Inciso VI (90) — 10a/15a ININTERRUPTOS em regime SEMIABERTO
  ;(function () {
    const H = I20 === 2 ? I28 >= 10 * 360 : I28 >= 15 * 360
    const J = I20 === 2 ? N13 >= D6 + 10 * 360 : N13 >= D6 + 15 * 360
    const K = I63 === 2
    const Rhalf = I20 === 2 ? I28 >= (10 * 360) / 2 : I28 >= (15 * 360) / 2
    const Shalf = I20 === 2 ? N13 >= D6 + (10 * 360) / 2 : N13 >= D6 + (15 * 360) / 2
    const geral = gates5 && i18ok && hediondo && H && temPenaNaoImped && J && K
    const esp = gates5 && i18ok && hediondo && temPenaNaoImped && K && elegivelP && qOk && Rhalf && Shalf
    incisos.push({ id: 'art9_VI', geral: texto(geral), especial: texto(esp) })
  })()

  // Inciso VII (93) — aberto/restritiva/sursis, 1/6(não reinc)/1/5(reinc)
  ;(function () {
    const F = I65 === 1 || I66 === 1
    const fracI = I20 === 2 ? D6 + J7 + J8 <= N13 : D6 + G7 + G8 <= N13
    const fracR = I20 === 2 ? D6 + J7 / 2 + J8 / 2 <= N13 : D6 + G7 / 2 + G8 / 2 <= N13
    const geral = gates5 && F && i18ok && hediondo && fracI && temPenaNaoImped
    const esp = gates5 && F && i18ok && hediondo && temPenaNaoImped && elegivelP && qOk && fracR
    incisos.push({ id: 'art9_VII', geral: texto(geral), especial: texto(esp) })
  })()

  // Inciso VIII (96) — livramento/aberto, remanescente ≤6a(não reinc)/4a(reinc)
  ;(function () {
    const F = I63 === 3 || I64 === 1
    const I = I20 === 2 ? N16 <= 6 * 360 : N16 <= 4 * 360
    // ⚖️ AMBIGUIDADE JURÍDICA PRESERVADA — não "conserte"
    // Único `Rhalf` do decreto que MULTIPLICA por 2 em vez de dividir. Em todos os
    // outros incisos o §2º corta pela metade uma fração EXIGIDA de cumprimento; aqui
    // o que a regra fixa é um TETO de pena remanescente (≤6a/≤4a), e aplicar
    // "metade" ao literal daria ≤3a/≤2a — ou seja, o §2º ficaria MAIS restritivo
    // justamente para o perfil vulnerável, leitura absurda numa norma de favor.
    // Dobrar o teto é o que alinha o VIII aos demais, onde o §2º sempre afrouxa.
    // Herdado da planilha (engine.js:259) e exibido ao advogado em "Pontos a validar
    // juridicamente". É INTERPRETAÇÃO, não transcrição — a única do decreto em que o
    // sentido de "metade" se inverte — e merece conferência contra o texto do
    // Decreto antes de assinar.
    const Rhalf = I20 === 2 ? N16 <= 6 * 360 * 2 : N16 <= 4 * 360 * 2
    const geral = gates5 && F && i18ok && hediondo && I && temPenaNaoImped
    const esp = gates5 && F && i18ok && hediondo && temPenaNaoImped && elegivelP && qOk && Rhalf
    incisos.push({ id: 'art9_VIII', geral: texto(geral), especial: texto(esp) })
  })()

  // Inciso IX (99) — aberto/restritiva/livramento/sursis + programa egressos ≥2a
  ;(function () {
    const F = I65 === 1 || I66 === 1 || I64 === 1
    const I = I68 === 4
    const Resp = I68 === 3 || I68 === 4
    const geral = gates5 && F && i18ok && hediondo && I && temPenaNaoImped
    const esp = gates5 && F && i18ok && hediondo && temPenaNaoImped && elegivelP && qOk && Resp
    incisos.push({ id: 'art9_IX', geral: texto(geral), especial: texto(esp) })
  })()

  // Inciso X (102) — semiaberto + monitoramento SV56 há >3a
  ;(function () {
    const H = I63 === 2
    const I = I69 === 4
    const Resp = I69 === 3 || I69 === 4
    const geral = gates5 && i18ok && hediondo && H && I && temPenaNaoImped
    const esp = gates5 && i18ok && hediondo && H && temPenaNaoImped && elegivelP && qOk && Resp
    incisos.push({ id: 'art9_X', geral: texto(geral), especial: texto(esp) })
  })()

  // Inciso XI (105) — pena ≤12a, semiaberto/aberto, 1/3/1/2 + 5 saídas/trabalho externo
  ;(function () {
    const F = N9 <= 12 * 360
    const G = I62 === 1
    const J = I20 === 2 ? D6 + F8 + F7 <= N13 : D6 + H8 + H7 <= N13
    const K = temPenaNaoImped
    const L = I63 !== 1
    const M = I20 === 2 ? I30 >= F7 + F8 : H7 + H8 <= I30
    const Rhalf = I20 === 2 ? D6 + F8 / 2 + F7 / 2 <= N13 : D6 + H8 / 2 + H7 / 2 <= N13
    const Shalf = I20 === 2 ? I30 >= (F7 + F8) / 2 : (H7 + H8) / 2 <= I30
    const geral = gates5 && F && G && i18ok && hediondo && J && K && L && M
    const esp = gates5 && F && G && i18ok && hediondo && K && L && elegivelP && qOk && Rhalf && Shalf
    incisos.push({ id: 'art9_XI', geral: texto(geral), especial: texto(esp) })
  })()

  // Inciso XII (108) — pena ≤12a, 1/5/1/4?, curso frequentando (sem regra especial)
  ;(function () {
    const F = N9 <= 12 * 360
    const G = I20 === 2 ? I70 === 3 : I70 === 4
    const J = I20 === 2 ? D6 + J8 + J7 <= N13 : D6 + G8 + G7 <= N13
    const K = temPenaNaoImped
    const geral = gates5 && F && G && i18ok && hediondo && J && K
    incisos.push({ id: 'art9_XII', geral: texto(geral), especial: 'sem_previsao' })
  })()

  // Inciso XIII (111) — pena ≤12a, 1/5(não reinc)/1/4(reinc), concluiu curso
  ;(function () {
    const F = N9 <= 12 * 360
    const G = I71 === 1
    const J = I20 === 2 ? D6 + G8 + G7 <= N13 : D6 + E8 + E7 <= N13
    const K = temPenaNaoImped
    const geral = gates5 && F && G && i18ok && hediondo && J && K
    incisos.push({ id: 'art9_XIII', geral: texto(geral), especial: 'sem_previsao' })
  })()

  // Inciso XIV (114) — crime patrimonial sem violência, bem ≤ salário mín, cumpriu 3 meses
  ;(function () {
    const F = I55 === 1
    const G = I57 === 1
    const H = N13 >= 90 + D6
    const I = N8 !== 0
    const geral = gates5 && F && G && H && I && hediondo
    incisos.push({ id: 'art9_XIV', geral: texto(geral), especial: 'sem_previsao' })
  })()

  // Inciso XV (117) — crime patrimonial sem violência, reparou dano ou hipossuficiente
  ;(function () {
    const F = I55 === 1
    const G = I56 === 1 || I60 === 1
    const J = N8 !== 0
    const geral = gates5 && F && G && i18ok && hediondo && J && i72ok
    incisos.push({ id: 'art9_XV', geral: texto(geral), especial: 'sem_previsao' })
  })()

  // Inciso XVI (120) — condições pessoais graves (saúde/deficiência)
  ;(function () {
    const F = I26 === 1
    const geral = gates5 && F && i18ok && hediondo && temPenaNaoImped
    incisos.push({ id: 'art9_XVI', geral: texto(geral), especial: 'sem_previsao' })
  })()

  // ===================== ART. 10 (123) — mulheres =====================
  ;(function () {
    const F = I52 !== 1 // não pode ter falta grave em toda a execução
    const I = N8 !== 0
    const J = N7 === 0
    const K = I67 !== 1
    const L = I31 !== 2 // feminino
    const fr = D6 + I7 + I8 <= N13 // fração 1/8
    const M = (I33 === 1 && fr) ||
              (I34 === 1 && I35 === 1 && fr) ||
              (I43 === 1 && fr) ||
              ((idade60mais || idade21menos) && fr) ||
              I44 === 1
    const geral = gates5 && F && i18ok && hediondo && I && J && K && L && M
    incisos.push({ id: 'art10', geral: texto(geral), especial: 'sem_previsao' })
  })()

  // ===================== ART. 12 (126) — pena de multa =====================
  ;(function () {
    const F = D59 > 20000 ? I60 === 1 : true
    const G = temPenaNaoImped
    let out: Veredito
    if (D59 === 0) out = 'a_analisar'
    else out = texto(gates5 && F && G)
    incisos.push({ id: 'art12', geral: out, especial: 'sem_previsao' })
  })()

  // ===================== COMUTAÇÃO =====================
  // Art. 11, I (129) — mulher, ≤8a, REINCIDENTE, 1/3
  const c11_I = (function () {
    const F = i18ok, G = hediondo, H = N8 !== 0, I = N9 <= 8 * 360
    const J = I20 !== 2 // reincidente obrigatório
    const K = I31 !== 2 // feminino
    const L = D6 + F8 + F7 <= N13
    return gates5 && F && G && H && I && J && K && L
  })()
  // Art. 11, II (132) — mulher, filho, NÃO reincidente, 1/5
  const c11_II = (function () {
    const F = i18ok, G = hediondo, H = N8 !== 0
    const I = I33 === 1 || (I34 === 1 && I35 === 1) || (I36 === 1 && I37 === 1)
    const J = I20 !== 1 // não reincidente obrigatório
    const K = I31 !== 2
    const L = D6 + G8 + G7 <= N13
    return gates5 && F && G && H && I && J && K && L
  })()
  // Art. 11, III (135) — mulher, filho, REINCIDENTE, 1/2
  const c11_III = (function () {
    const F = i18ok, G = hediondo, H = N8 !== 0
    const I = I33 === 1 || (I34 === 1 && I35 === 1) || (I36 === 1 && I37 === 1)
    const J = I20 !== 2 // reincidente obrigatório
    const K = I31 !== 2
    const L = D6 + G8 + G7 <= N13
    return gates5 && F && G && H && I && J && K && L
  })()
  // Art. 13 (138) — comutação geral 1/5(não reinc)/1/4(reinc) — gates4 (sem colaboração)
  const c13 = (function () {
    const F = i18ok, G = hediondo
    const H = I20 === 2 ? D6 + G7 + G8 < N13 : D6 + E7 + E8 < N13
    const I = temPenaNaoImped
    return gates4 && F && G && H && I
  })()
  // Art. 13 §4º (141) — 2/3 para perfil do §2º
  const c13_4 = (function () {
    const F = i18ok, G = hediondo
    const H = I20 === 2 ? D6 + G7 + G8 <= N13 : D6 + E7 + E8 <= N13
    const I = elegivelP
    const J = temPenaNaoImped
    return gates4 && F && G && H && I && J
  })()

  // Quantum de comutação (linhas 145-149)
  function baseComut(fracao: number): number {
    // ⚖️ AMBIGUIDADE JURÍDICA PRESERVADA — não "conserte"
    // A base da comutação do Art. 13 e do §4º é o MAIOR valor entre pena cumprida
    // e pena remanescente; a comutação legalmente incide sobre a remanescente.
    // Herdado da planilha de propósito e exibido ao advogado em "Pontos a validar
    // juridicamente". Mudar isto sem validação dos autores do método altera um
    // número que vai para petição.
    if (P6 === 0) return Math.max(P13, P16) * fracao
    return Math.max(P14, P17) * fracao
  }
  function montaComut(preenche: boolean, quantumDias: number): Omit<ResultadoInciso, 'id'> {
    // O engine.js chamava este campo de `situacao`; no contrato ele é `geral`, e a
    // comutação nunca tem regra especial do §2º — daí o `sem_previsao` fixo. As
    // strings formatadas (`comutacaoTxt`/`penaAposTxt`) não entram: a tela formata.
    //
    // ⚠️ BUG DA PLANILHA, CORRIGIDO AQUI — L145:L149
    // Quando não há comutação, a planilha devolvia #VALUE! na "pena após"; aqui o
    // valor ausente é `null`.
    if (!preenche) return { geral: texto(false), especial: 'sem_previsao', quantum: null, penaApos: null }
    // ⚖️ AMBIGUIDADE JURÍDICA PRESERVADA — não "conserte"
    // A base do desconto é a pena TOTAL imposta (P9), não a remanescente. Herdado
    // da planilha de propósito e exibido ao advogado em "Pontos a validar
    // juridicamente". Mudar isto sem validação dos autores do método altera um
    // número que vai para petição.
    const apos = P9 - quantumDias
    return { geral: texto(true), especial: 'sem_previsao', quantum: quantumDias, penaApos: apos }
  }

  incisos.push({ id: 'art11_I', ...montaComut(c11_I, (P8 * 1) / 4) })
  incisos.push({ id: 'art11_II', ...montaComut(c11_II, (P8 * 2) / 3) })
  incisos.push({ id: 'art11_III', ...montaComut(c11_III, (P8 * 1) / 2) })
  incisos.push({ id: 'art13', ...montaComut(c13, baseComut(1 / 5)) })
  // ⚠️ BUG DA PLANILHA, CORRIGIDO AQUI — G149
  // A fórmula da planilha referenciava F148 (a condição do Art. 13 comum) em vez
  // de F149, exibindo a comutação do §4º sem os requisitos do §4º preenchidos.
  // Aqui a condição é `c13_4` (F149), como já fazia o engine.js.
  incisos.push({ id: 'art13_4', ...montaComut(c13_4, baseComut(2 / 3)) })

  // ---- Avisos (ambiguidades jurídicas herdadas da planilha, a validar) ----
  const avisos = [
    'A "pena após a comutação" usa a pena total imposta como base (fórmula original), sem descontar o tempo já cumprido — revisar interpretação jurídica.',
    'A base da comutação do Art. 13 e §4º usa o maior valor entre pena cumprida e pena remanescente — a comutação legalmente incide sobre a remanescente.',
  ]

  // ---- Resumo de tempos (aba Questionario) ----
  // O engine.js formatava com `fmtDias`; aqui saem os DIAS e a tela formata.
  const resumo = {
    totalImposto: N9,
    totalCumprido: N13,
    penaCumpridaImpeditivos: N13 < D6 ? N13 : D6,
    remanescente: N16,
    fracoes: {
      doisTercosImpeditivos: D6,
      umQuinto: (N7 + N8) / 5,
      umQuarto: (N7 + N8) / 4,
      umTerco: (N7 + N8) / 3,
      metade: (N7 + N8) / 2,
    },
  }

  return {
    incisos: incisos,
    resumo: resumo,
    avisos: avisos,
  }
}
