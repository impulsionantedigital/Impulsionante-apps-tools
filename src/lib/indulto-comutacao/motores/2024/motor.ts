/*
 * Motor de cálculo — Indulto e Comutação · Decreto nº 12.338/2024
 *
 * TRANSCRIÇÃO DIRETA da aba "Cálculo" de validacao/2024/planilha.xlsx (a versão
 * COMERCIAL). Diferente de 2025, não houve POC em JS no meio: a planilha é a
 * única fonte, e `tests/indulto-comutacao/motor-2024.spec.ts` é a única prova.
 *
 * 🔴 NÃO REFATORE. Os nomes de variável são os das CÉLULAS da planilha (`M6`,
 * `D6`, `I45`, `F43`…) e a ordem dos blocos é a ordem das linhas dela. Isto é
 * feio de propósito: a correspondência linha-a-linha é a única prova de corretude
 * que este cálculo tem.
 *
 * 🔴 NÃO COPIE DE motores/2025/motor.ts. As duas planilhas usam os MESMOS
 * endereços para coisas DIFERENTES: aqui `I45` é falta grave no ano e `I51` é o
 * valor do bem; em 2025 `I45` é justiça restaurativa e `I51` é a falta grave. A
 * coluna `I` da linha 5 é 1/6 aqui e 1/8 lá. Copiar produz número errado sem
 * erro de compilação e sem teste vermelho.
 *
 * Convenção de tempo de PENA: 30 dias/mês, 360 dias/ano.
 * Exceção: o inciso IV usa dias-calendário reais (`F43 = E43 - D43`).
 *
 * ✅ uma ambiguidade RESOLVIDA pelo dono do produto: o Art. 13 (`c13`) exigia
 * cumprimento MAIOR que a fração (`<` estrito, Cálculo!H132) e agora aceita o exato
 * (`<=`), como o texto do Decreto e todos os demais dispositivos. Ver o comentário
 * no próprio `c13`.
 *
 * Ambiguidades da planilha, PRESERVADAS — nenhuma "consertada". Todas saem em
 * AVISOS_2024.validarJuridicamente, que é o que a tela mostra:
 *   1. Inciso VIII: o §2º DOBRA o teto da pena remanescente em vez de reduzi-lo
 *      à metade, e a base é a remanescente NÃO impeditiva (M17) — em 2025 é a
 *      total (N16);
 *   2. base da comutação do Art. 13 e §4º: o max entre cumprida e remanescente;
 *   3. Art. 11: "NÃO SE APLICA" na reincidência satisfaz tanto o requisito de
 *      reincidente obrigatório quanto o de não reincidente.
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
  'gestanteOuFilho14',
  'hipossuficiente',
  'homemUnicoResponsavel',
  'imprescindivelCrianca',
  'justicaRestaurativa',
  'livramentoCondicional',
  'monitoramentoSV56',
  'mulherFilho12',
  'mulherFilho16',
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

/** `1` para SIM, `2` para NÃO, `3` para NÃO SE APLICA — a codificação da coluna I da planilha. */
function sn(v: unknown): 1 | 2 | 3 {
  const s = String(v ?? '').trim().toUpperCase()
  if (s === 'SIM') return 1
  if (s === 'NÃO SE APLICA') return 3
  return 2
}

/** `1` fechado, `2` semiaberto, `3` aberto — a codificação da coluna I57 (Cálculo!E37). */
function regimeCod(v: unknown): 1 | 2 | 3 {
  const s = String(v ?? '').trim().toUpperCase()
  if (s === 'SEMIABERTO') return 2
  if (s === 'ABERTO') return 3
  return 1
}

/** As faixas das colunas P, R e X de Valid_dados: a posição na lista, começando em 1. */
function faixa(opcoes: readonly string[], v: unknown): 1 | 2 | 3 | 4 {
  const s = String(v ?? '').trim().toUpperCase()
  const i = opcoes.findIndex((o) => o === s)
  return (i < 0 ? 1 : i + 1) as 1 | 2 | 3 | 4
}

const EGRESSA = ['NÃO', 'HÁ MENOS DE 01 ANO', 'ENTRE 01 E 02 ANOS', 'HÁ MAIS DE 02 ANOS'] as const
const MONITORACAO = [
  'NÃO',
  'HÁ MENOS DE 01 ANO E 06 MESES',
  'ENTRE 01 ANO E 06 MESES E 03 ANOS',
  'HÁ MAIS DE 03 ANOS',
] as const
const ESTUDO_FAIXAS = [
  'NÃO',
  'MENOS DE 12 MESES',
  'MAIS DE 12 MESES NOS ÚLTIMOS 3 ANOS',
  'MAIS DE 18 MESES NOS ÚLTIMOS 5 ANOS',
] as const

const faixaEgressa = (v: unknown) => faixa(EGRESSA, v)
const faixaMonitoracao = (v: unknown) => faixa(MONITORACAO, v)
const faixaEstudo = (v: unknown) => faixa(ESTUDO_FAIXAS, v)

/** 'YYYY-MM-DD' → `Date` local, ou `null` se vazio/inválido — para `diasCorridos`. */
function parseData(v: unknown): Date | null {
  if (!v) return null
  if (v instanceof Date) return v
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(v as string)
  return isNaN(d.getTime()) ? null : d
}

export function calcular2024(entrada: Entrada): Resultado {
  const t = (chave: string) => dias(entrada[chave] as Tempo | null | undefined)

  // ---- Cálculo!M6:M9 — penas impostas, em dias (base 30/360)
  const M6 = t('penaImpeditiva')
  const M7 = t('penaViolencia')
  const M8 = t('penaSemViolencia')
  const M9 = M6 + M7 + M8

  // ---- Cálculo!M11:M13 — pena cumprida
  const M11 = t('penaCumpridaSEEU')
  const M12 = t('penaCumpridaNaoSEEU')
  const M13 = M11 + M12

  // ---- Cálculo!D5:I5 — as frações de cada base
  const D6 = (M6 * 2) / 3
  const E7 = M7 / 4, E8 = M8 / 4
  const F7 = M7 / 3, F8 = M8 / 3
  const G7 = M7 / 5, G8 = M8 / 5
  const H7 = M7 / 2, H8 = M8 / 2
  const I7 = M7 / 6, I8 = M8 / 6

  // ---- Cálculo!M15:M17
  const M15 = M13 < D6 ? M13 : D6
  const M16 = M9 - M13
  const M17 = M9 - M6 - (M13 - D6)

  const incisos: ResultadoInciso[] = []

  // ---- Cálculo!I18:I66 — os marcadores, codificados 1=SIM 2=NÃO 3=NÃO SE APLICA
  const I18 = sn(entrada.cumpriu23ImpeditivoDataFato ?? 'SIM') // E107 (default SIM, como na planilha)
  const I20 = sn(entrada.reincidente)                 // E35 — 1 reincidente, 2 não
  const I21 = sn(entrada.colaboracaoPremiada)         // E63
  const I22 = sn(entrada.faccao)                      // E65
  const I23 = sn(entrada.rdd)                         // E67
  const I24 = sn(entrada.presidioFederal)             // E69
  const I25 = Number(entrada.diasRemicao ?? 0)        // E61
  const I26 = sn(entrada.condicoesGravesSaude)        // E73
  const I28 = dias(entrada.tempoSemiaberto as Tempo | null | undefined)        // C40:E40
  const I30 = dias(entrada.tempoSemiabertoAberto as Tempo | null | undefined)  // C43:E43
  const I31 = String(entrada.sexo ?? '').toUpperCase() === 'FEMININO' ? 1 : 2  // E31
  const I32 = sn(entrada.gestanteOuFilho14)           // E75
  const I33 = sn(entrada.mulherFilho12)               // E77
  const I34 = sn(entrada.mulherFilho16)               // E79
  const I35 = sn(entrada.homemUnicoResponsavel)       // E81
  const I36 = sn(entrada.imprescindivelCrianca)       // E83
  const I37 = sn(entrada.avoNetos)                    // E85
  const I38 = sn(entrada.deficiencia)                 // E71
  const I39 = sn(entrada.justicaRestaurativa)         // E51
  const I40 = sn(entrada.crimeContraCrianca)          // E93
  const I41 = sn(entrada.periodoLiberdade2Anos)       // E55
  const I45 = sn(entrada.faltaGraveAno)               // E57
  const I46 = sn(entrada.faltaGraveExecucao)          // E59
  const I49 = sn(entrada.crimePatrimonio)             // E101
  const I50 = sn(entrada.reparouDano)                 // E103
  const I51 = sn(entrada.valorBemSalarioMinimo)       // E105
  const I54 = sn(entrada.hipossuficiente)             // E113
  const I56 = sn(entrada.saidasOuTrabalhoExterno)     // E87
  const I57 = regimeCod(entrada.regime)               // E37 — 1 fechado, 2 semiaberto, 3 aberto
  const I58 = sn(entrada.livramentoCondicional)       // E45
  const I59 = sn(entrada.penasSubstituidas)           // E97
  const I60 = sn(entrada.condenacaoAberto)            // E99
  const I61 = sn(entrada.respondendoOutroCrimeViolento) // E95
  const I62 = faixaEgressa(entrada.programaEgressos)  // E49 — 1..4
  const I63 = faixaMonitoracao(entrada.monitoramentoSV56) // E47 — 1..4
  const I64 = faixaEstudo(entrada.estudo)             // E89 — 1..4
  const I65 = sn(entrada.concluiuCurso)               // E91
  const I66 = sn(entrada.cumpriuFracaoViolenciaDataFato ?? 'SIM') // E109 (default SIM, como na planilha)

  // ---- Cálculo!D53 — valor da pena de multa (E111)
  const D53 = Number(entrada.valorMulta ?? 0)

  // ---- Cálculo!D43/D47/F43 — datas. F43 é em dias-calendário REAIS, não 30/360.
  const D47 = String(entrada.dataNascimento ?? '')
  const F43 = diasCorridos(parseData(entrada.dataUltimaPrisao), new Date(2024, 11, 25))
  /** 25/12/1964 — `DATE(2024-60,12,25)`, o corte de idade do §2º. */
  const nascidoAteCorteP = D47 !== '' && D47 <= '1964-12-25'

  // ---- A trava comum (coluna E de todo dispositivo)
  const travaOk = !(I22 === 1 || I23 === 1 || I24 === 1 || I45 === 1 || I21 === 1)
  // ---- A trava do Art. 13 e do §4º: a mesma, SEM o I21 (colaboração premiada)
  const travaComut = !(I22 === 1 || I23 === 1 || I24 === 1 || I45 === 1)
  // ---- O requisito da data do fato do crime impeditivo (coluna G/F/H, varia)
  const dataFatoImpeditivoOk = I18 === 1 || I18 === 3
  // ---- O requisito da fração do crime com violência (coluna K)
  //      🔴 SÓ "SIM" passa. A comercial removeu o ramo do I66=3, que era morto:
  //      I66 nunca vale 3, porque a fórmula da planilha não tem esse ramo.
  const dataFatoViolenciaOk = I66 === 1
  // ---- Os 2/3 do crime impeditivo (coluna H/G/I, varia)
  const doisTercosOk = M6 === 0 || M13 >= (M6 * 2) / 3
  // ---- A regra especial do §2º (coluna P) — 60 anos, 5 marcadores
  const perfilP =
    nascidoAteCorteP || I32 === 1 || I35 === 1 || I36 === 1 || I38 === 1 || I39 === 1
  // ---- Coluna Q: o crime não foi contra filho, filha, criança ou adolescente
  const naoContraCrianca = I40 === 2

  const V = (ok: boolean): Veredito => (ok ? 'preenche' : 'nao_preenche')

  // ===== Cálculo!69 — Art. 9º, I: pena ≤ 8 anos, sem violência, 1/5 (não reinc.) ou 1/3 (reinc.)
  {
    const E = travaOk
    const F = M9 <= 8 * 360
    const G = dataFatoImpeditivoOk
    const H = doisTercosOk
    const I = I20 === 2 ? D6 + G8 + G7 <= M13 : D6 + F8 + F7 <= M13
    const J = M8 !== 0
    const K = dataFatoViolenciaOk
    // O69: SUM(E70:K70) = 7 — as SETE colunas E..K, todas OK.
    const geral = E && F && G && H && I && J && K
    // T69: E,F,G,H,J,K + P,Q,R = 9. 🔴 O `I` (a fração cheia) NÃO entra; quem
    // entra no lugar é o R, a mesma fração pela metade.
    const R = I20 === 2 ? D6 + G8 / 2 + G7 / 2 <= M13 : D6 + F8 / 2 + F7 / 2 <= M13
    const especial = E && F && G && H && J && K && perfilP && naoContraCrianca && R
    incisos.push({ id: 'art9_I', geral: V(geral), especial: V(especial) })
  }

  // ===== Cálculo!72 — Art. 9º, II: pena ≤ 12 anos, sem violência, 1/3 (não reinc.) ou 1/2 (reinc.)
  {
    const E = travaOk
    const F = M9 <= 12 * 360
    const G = dataFatoImpeditivoOk
    const H = doisTercosOk
    const I = I20 === 2 ? D6 + F8 + F7 <= M13 : D6 + H8 + H7 <= M13
    const J = M8 !== 0
    const K = dataFatoViolenciaOk
    // O72: SUM(E73:K73) = 7 — as SETE colunas E..K.
    const geral = E && F && G && H && I && J && K
    // T72: E,F,G,H,J,K + P,Q,R = 9. O `I` não entra; entra o R (mesma fração, metade).
    const R = I20 === 2 ? D6 + F8 / 2 + F7 / 2 <= M13 : D6 + H8 / 2 + H7 / 2 <= M13
    const especial = E && F && G && H && J && K && perfilP && naoContraCrianca && R
    incisos.push({ id: 'art9_II', geral: V(geral), especial: V(especial) })
  }

  // ===== Cálculo!75 — Art. 9º, III: pena ≤ 4 anos, sem violência, 1/3 (não reinc.) ou 1/2 (reinc.)
  {
    const E = travaOk
    const F = M9 <= 4 * 360
    const G = dataFatoImpeditivoOk
    const H = doisTercosOk
    const I = I20 === 2 ? D6 + F8 + F7 <= M13 : D6 + H8 + H7 <= M13
    const J = M7 !== 0
    const K = dataFatoViolenciaOk
    // O75: SUM(E76:K76) = 7 — as SETE colunas E..K.
    const geral = E && F && G && H && I && J && K
    // T75: E,F,G,H,J,K + P,Q,R = 9. O `I` não entra; entra o R (mesma fração, metade).
    const R = I20 === 2 ? D6 + F8 / 2 + F7 / 2 <= M13 : D6 + H8 / 2 + H7 / 2 <= M13
    const especial = E && F && G && H && J && K && perfilP && naoContraCrianca && R
    incisos.push({ id: 'art9_III', geral: V(geral), especial: V(especial) })
  }

  // ===== Cálculo!78 — Art. 9º, IV: livramento condicional humanitário (idade/prisão contínua)
  {
    const E = travaOk
    const F = dataFatoImpeditivoOk
    const G = doisTercosOk
    // H78: se não reincidente, tempo ininterrupto (F43+I25) >= 15 anos-calendário
    //      (5480 dias); se reincidente, >= 20 anos-calendário (7306 dias).
    const H =
      I20 === 2 ? F43 + I25 >= 5480 : I20 === 1 ? F43 + I25 >= 7306 : false
    // I78 — 🔴 fórmula literal `OR(M8=0)*(M7=0)`: OR de 1 termo é o próprio termo,
    // então a multiplicação equivale a E — NÃO só quando M8=0 E M7=0.
    const I = !(M8 === 0 && M7 === 0)
    const J = I20 === 2 ? M13 >= D6 + 15 * 360 : I20 === 1 ? M13 >= D6 + 20 * 360 : false
    // O78: SUM(E79:J79) = 6 — as SEIS colunas E..J.
    const geral = E && F && G && H && I && J
    // T78: E,F,G,I,P,Q,R,S = 8. H e J não entram; entram R e S (metade dos tetos).
    const R =
      I20 === 2 ? F43 + I25 >= 5480 / 2 : I20 === 1 ? F43 + I25 >= 7306 / 2 : false
    const S =
      I20 === 2 ? M13 >= D6 + (15 * 360) / 2 : I20 === 1 ? M13 >= D6 + (20 * 360) / 2 : false
    const especial = E && F && G && I && perfilP && naoContraCrianca && R && S
    incisos.push({ id: 'art9_IV', geral: V(geral), especial: V(especial) })
  }

  // ===== Cálculo!81 — Art. 9º, V: livramento condicional pela pena total cumprida
  {
    const E = travaOk
    const F = dataFatoImpeditivoOk
    const G = doisTercosOk
    // H81: pena total cumprida >= 20 anos (não reinc.) ou >= 25 anos (reinc./demais).
    const H = I20 === 2 ? M13 >= 20 * 360 : 25 * 360 <= M13
    const I = !(M8 === 0 && M7 === 0)
    const J = I20 === 2 ? M13 >= D6 + 20 * 360 : M13 >= D6 + 25 * 360
    const K = I41 !== 1
    // O81: SUM(E82:K82) = 7 — as SETE colunas E..K.
    const geral = E && F && G && H && I && J && K
    // T81: E,F,G,I,K,P,Q,R,S = 9. H e J não entram; entram R e S.
    const R = I20 === 2 ? M13 >= (20 * 360) / 2 : (25 * 360) / 2 <= M13
    const S = I20 === 2 ? M13 >= D6 + (20 * 360) / 2 : M13 >= D6 + (25 * 360) / 2
    const especial = E && F && G && I && K && perfilP && naoContraCrianca && R && S
    incisos.push({ id: 'art9_V', geral: V(geral), especial: V(especial) })
  }

  // ===== Cálculo!84 — Art. 9º, VI: progressão ao regime aberto pelo tempo no semiaberto
  {
    const E = travaOk
    const F = dataFatoImpeditivoOk
    const G = doisTercosOk
    // H84: tempo no semiaberto >= 10 anos (não reinc.) ou >= 15 anos (reinc./demais).
    const H = I20 === 2 ? I28 >= 10 * 360 : 15 * 360 <= I28
    const I = !(M8 === 0 && M7 === 0)
    const J = I20 === 2 ? M13 >= D6 + 10 * 360 : M13 >= D6 + 15 * 360
    const K = I57 === 2
    // O84: SUM(E85:K85) = 7 — as SETE colunas E..K.
    const geral = E && F && G && H && I && J && K
    // T84: E,F,G,I,K,P,Q,R,S = 9. H e J não entram; entram R e S.
    const R = I20 === 2 ? I28 >= (10 * 360) / 2 : (15 * 360) / 2 <= I28
    const S = I20 === 2 ? M13 >= D6 + (10 * 360) / 2 : M13 >= D6 + (15 * 360) / 2
    const especial = E && F && G && I && K && perfilP && naoContraCrianca && R && S
    incisos.push({ id: 'art9_VI', geral: V(geral), especial: V(especial) })
  }

  // ===== Cálculo!87 — Art. 9º, VII: pena substituída/suspensa ou condenação em aberto
  {
    const E = travaOk
    const F = I59 === 1 || I60 === 1
    const G = dataFatoImpeditivoOk
    const H = doisTercosOk
    // I87: 1/6 (não reinc.) ou 1/5 (reinc./demais) de L7+L8, mais 2/3 do hediondo.
    const I = I20 === 2 ? D6 + I7 + I8 <= M13 : D6 + G7 + G8 <= M13
    const J = !(M8 === 0 && M7 === 0)
    // O87: SUM(E88:J88) = 6 — as SEIS colunas E..J.
    const geral = E && F && G && H && I && J
    // T87: E,F,G,H,J,P,Q,R = 8. O `I` não entra; entra o R (mesma fração, metade).
    const R = I20 === 2 ? D6 + I7 / 2 + I8 / 2 <= M13 : D6 + G7 / 2 + G8 / 2 <= M13
    const especial = E && F && G && H && J && perfilP && naoContraCrianca && R
    incisos.push({ id: 'art9_VII', geral: V(geral), especial: V(especial) })
  }

  // ===== Cálculo!90 — Art. 9º, VIII: progressão ao aberto/livramento pela remanescente
  {
    const E = travaOk
    const F = I57 === 3 || I58 === 1
    const G = dataFatoImpeditivoOk
    const H = doisTercosOk
    // I90: teto da remanescente NÃO impeditiva (M17) — 6 anos (não reinc.) ou 4 (reinc.).
    const I = I20 === 2 ? M17 <= 6 * 360 : M17 <= 4 * 360
    const J = !(M8 === 0 && M7 === 0)
    // O90: SUM(E91:J91) = 6 — as SEIS colunas E..J.
    const geral = E && F && G && H && I && J
    // T90: E,F,G,H,J,P,Q,R = 8. O `I` não entra; entra o R.
    // 🔴 Ambiguidade preservada: o §2º DOBRA o teto (×2) em vez de reduzi-lo à
    // metade — diferente de todo outro dispositivo desta lista.
    const R = I20 === 2 ? M17 <= 6 * 360 * 2 : M17 <= 4 * 360 * 2
    const especial = E && F && G && H && J && perfilP && naoContraCrianca && R
    incisos.push({ id: 'art9_VIII', geral: V(geral), especial: V(especial) })
  }

  // ===== Cálculo!93 — Art. 9º, IX: egressa (mais de 2 anos) com pena substituída/livramento
  {
    const E = travaOk
    const F = I59 === 1 || I60 === 1 || I58 === 1
    const G = dataFatoImpeditivoOk
    const H = doisTercosOk
    const I = I62 === 4
    const J = !(M8 === 0 && M7 === 0)
    // O93: SUM(E94:J94) = 6 — as SEIS colunas E..J.
    const geral = E && F && G && H && I && J
    // T93: E,F,G,H,J,P,Q,R = 8. O `I` não entra; entra o R (egressa há 1-2 OU +2 anos).
    const R = I62 === 3 || I62 === 4
    const especial = E && F && G && H && J && perfilP && naoContraCrianca && R
    incisos.push({ id: 'art9_IX', geral: V(geral), especial: V(especial) })
  }

  // ===== Cálculo!96 — Art. 9º, X: regime semiaberto com monitoração há mais de 3 anos
  {
    const E = travaOk
    const F = dataFatoImpeditivoOk
    const G = doisTercosOk
    const H = I57 === 2
    const I = I63 === 4
    const J = !(M8 === 0 && M7 === 0)
    // O96: SUM(E97:J97) = 6 — as SEIS colunas E..J.
    const geral = E && F && G && H && I && J
    // T96: E,F,G,H,J,P,Q,R = 8. O `I` não entra; entra o R (monitoração há 1½-3 OU +3 anos).
    const R = I63 === 3 || I63 === 4
    const especial = E && F && G && H && J && perfilP && naoContraCrianca && R
    incisos.push({ id: 'art9_X', geral: V(geral), especial: V(especial) })
  }

  // ===== Cálculo!99 — Art. 9º, XI: pena ≤ 12 anos, saídas/trabalho externo, semiaberto/aberto
  {
    const E = travaOk
    const F = M9 <= 12 * 360
    const G = I56 === 1
    const H = dataFatoImpeditivoOk
    const I = doisTercosOk
    // J99: 1/3 (não reinc.) ou 1/2 (reinc.) de L7+L8, mais 2/3 do hediondo.
    const J = I20 === 2 ? D6 + F8 + F7 <= M13 : D6 + H8 + H7 <= M13
    const K = !(M8 === 0 && M7 === 0)
    const L = I57 !== 1
    // M99: tempo no semiaberto+aberto >= 1/3 (não reinc.) ou >= 1/2 (reinc.) de L7+L8.
    const M = I20 === 2 ? I30 >= F7 + F8 : H7 + H8 <= I30
    // O99: SUM(E100:M100) = 9 — as NOVE colunas E..M.
    const geral = E && F && G && H && I && J && K && L && M
    // T99: E,F,G,H,I,K,L,P,Q,R,S = 11. J e M não entram; entram R e S (metade).
    const R = I20 === 2 ? D6 + F8 / 2 + F7 / 2 <= M13 : D6 + H8 / 2 + H7 / 2 <= M13
    const S = I20 === 2 ? I30 >= (F7 + F8) / 2 : (H7 + H8) / 2 <= I30
    const especial = E && F && G && H && I && K && L && perfilP && naoContraCrianca && R && S
    incisos.push({ id: 'art9_XI', geral: V(geral), especial: V(especial) })
  }

  // ===== Cálculo!102 — Art. 9º, XII: pena ≤ 12 anos, estudo. Sem §2º.
  {
    const E = travaOk
    const F = M9 <= 12 * 360
    // G102: estudo >= 12 meses/3anos (não reinc.) ou >= 18 meses/5anos (reinc.).
    const G = I20 === 2 ? I64 === 3 : I64 === 4
    const H = dataFatoImpeditivoOk
    const I = doisTercosOk
    // J102: 1/5 (não reinc.) ou 1/4 (reinc.) de L7+L8, mais 2/3 do hediondo.
    const J = I20 === 2 ? D6 + G8 + G7 <= M13 : D6 + E8 + E7 <= M13
    const K = !(M8 === 0 && M7 === 0)
    // O102: SUM(E103:K103) = 7 — as SETE colunas E..K.
    const geral = E && F && G && H && I && J && K
    incisos.push({ id: 'art9_XII', geral: V(geral), especial: 'sem_previsao' })
  }

  // ===== Cálculo!105 — Art. 9º, XIII: pena ≤ 12 anos, conclusão de curso. Sem §2º.
  {
    const E = travaOk
    const F = M9 <= 12 * 360
    const G = I65 === 1
    const H = dataFatoImpeditivoOk
    const I = doisTercosOk
    // J105: 1/5 (não reinc.) ou 1/4 (reinc.) de L7+L8, mais 2/3 do hediondo.
    const J = I20 === 2 ? D6 + G8 + G7 <= M13 : D6 + E8 + E7 <= M13
    const K = !(M8 === 0 && M7 === 0)
    // O105: SUM(E106:K106) = 7 — as SETE colunas E..K.
    const geral = E && F && G && H && I && J && K
    incisos.push({ id: 'art9_XIII', geral: V(geral), especial: 'sem_previsao' })
  }

  // ===== Cálculo!108 — Art. 9º, XIV: crime contra o patrimônio de pequeno valor. Sem §2º.
  {
    const E = travaOk
    const F = I49 === 1
    const G = I51 === 1
    const H = M13 >= 90 + D6
    const I = M8 !== 0
    const J = doisTercosOk
    // O108: SUM(E109:J109) = 6 — as SEIS colunas E..J.
    const geral = E && F && G && H && I && J
    incisos.push({ id: 'art9_XIV', geral: V(geral), especial: 'sem_previsao' })
  }

  // ===== Cálculo!111 — Art. 9º, XV: crime contra o patrimônio, dano reparado/hipossuficiente. Sem §2º.
  {
    const E = travaOk
    const F = I49 === 1
    const G = I50 === 1 || I54 === 1
    const H = dataFatoImpeditivoOk
    const I = doisTercosOk
    const J = M8 !== 0
    const K = dataFatoViolenciaOk
    // O111: SUM(E112:K112) = 7 — as SETE colunas E..K.
    const geral = E && F && G && H && I && J && K
    incisos.push({ id: 'art9_XV', geral: V(geral), especial: 'sem_previsao' })
  }

  // ===== Cálculo!114 — Art. 9º, XVI: condições graves de saúde. Sem §2º.
  {
    const E = travaOk
    const F = I26 === 1
    const G = dataFatoImpeditivoOk
    const H = doisTercosOk
    const I = !(M8 === 0 && M7 === 0)
    // O114: SUM(E115:I115) = 5 — as CINCO colunas E..I.
    const geral = E && F && G && H && I
    incisos.push({ id: 'art9_XVI', geral: V(geral), especial: 'sem_previsao' })
  }

  // ===== Cálculo!117 — Art. 10: indulto humanitário (mães, avós, mulheres ≥60/<21, deficiência)
  {
    const E = travaOk
    const F = I46 !== 1
    const G = dataFatoImpeditivoOk
    const H = doisTercosOk
    const I = M8 !== 0
    const J = M7 === 0
    const K = I61 !== 1
    const L = I31 !== 2
    // M117: (mãe com filho ≤12 OU avó com netos OU mulher ≥60/<21 anos) cumprindo
    // 1/6 (D6+I7+I8), OU mulher com deficiência (sem exigência de fração).
    // 25/12/1964 = DATE(2024-60,12,25); 25/12/2003 = DATE(2024-21,12,25).
    const idade60ouMenor21 = nascidoAteCorteP || (D47 !== '' && D47 >= '2003-12-25')
    const fracaoUmSexto = D6 + I7 + I8 <= M13
    const M =
      (I33 === 1 && fracaoUmSexto) ||
      (I37 === 1 && fracaoUmSexto) ||
      (idade60ouMenor21 && fracaoUmSexto) ||
      I38 === 1
    // O117: SUM(E118:M118) = 9 — as NOVE colunas E..M.
    const geral = E && F && G && H && I && J && K && L && M
    incisos.push({ id: 'art10', geral: V(geral), especial: 'sem_previsao' })
  }

  // ===== Cálculo!120 — Art. 12: indulto da pena de multa
  {
    const E = travaOk
    const F = D53 > 20000 ? I54 === 1 : true
    const G = !(M8 === 0 && M7 === 0)
    // O120: multa zerada não é "não preenche" — é "A analisar".
    const geral: Veredito = D53 === 0 ? 'a_analisar' : E && F && G ? 'preenche' : 'nao_preenche'
    incisos.push({ id: 'art12', geral, especial: 'sem_previsao' })
  }

  // ---- Cálculo!M14 — pena cumprida descontando os 2/3 do impeditivo
  const M14 = M13 - D6 >= M7 + M8 ? M7 + M8 : M13 - D6

  /** Cálculo!G142/G143 — a base da comutação do Art. 13 e do §4º.
   *  ⚖️ AMBIGUIDADE PRESERVADA: é o MAIOR entre pena cumprida e remanescente,
   *  quando a comutação legalmente incide sobre a remanescente. Fiel à planilha. */
  const baseComut = M6 === 0 ? Math.max(M13, M16) : Math.max(M14, M17)

  // ===== Cálculo!123 — Art. 11, I: mulher reincidente, pena ≤ 8 anos, sem violência → 1/4
  {
    const E = travaOk
    const F = dataFatoImpeditivoOk
    const G = doisTercosOk
    const H = M8 !== 0
    const I = M9 <= 8 * 360
    // ⚖️ AMBIGUIDADE PRESERVADA: a fórmula testa `I20 <> 2`, não `I20 = 1`. Logo
    // "NÃO SE APLICA" (3) satisfaz TANTO este requisito de reincidente obrigatório
    // quanto o de não reincidente do inciso II.
    const J = I20 !== 2
    const K = I31 !== 2 // mulher
    const L = D6 + F8 + F7 <= M13
    const preenche = E && F && G && H && I && J && K && L
    incisos.push({
      id: 'art11_I',
      geral: V(preenche),
      especial: 'sem_previsao',
      quantum: preenche ? M8 / 4 : null,
      penaApos: null,
    })
  }

  // ===== Cálculo!126 — Art. 11, II: mulher NÃO reincidente, com filho, sem violência → 2/3
  {
    const E = travaOk
    const F = dataFatoImpeditivoOk
    const G = doisTercosOk
    const H = M8 !== 0
    // 🔴 I126 é `IF(I34=2,"NÃO","OK")`: o marcador ÚNICO de 2024 para "mulher com filho
    // menor de 16 anos, ou com deficiência/doença crônica grave que necessite de cuidados".
    // Em 2025 este requisito virou um OR de três combinações — não copie de lá.
    const I = I34 !== 2
    // ⚖️ Mesma ambiguidade do inciso I: testa a diferença, não a igualdade.
    const J = I20 !== 1
    const K = I31 !== 2 // mulher
    const L = D6 + G8 + G7 <= M13
    const preenche = E && F && G && H && I && J && K && L
    incisos.push({
      id: 'art11_II',
      geral: V(preenche),
      especial: 'sem_previsao',
      quantum: preenche ? (M8 * 2) / 3 : null,
      penaApos: null,
    })
  }

  // ===== Cálculo!129 — Art. 11, III: mulher REINCIDENTE, com filho, sem violência → 1/2
  {
    const E = travaOk
    const F = dataFatoImpeditivoOk
    const G = doisTercosOk
    const H = M8 !== 0
    const I = I34 !== 2
    const J = I20 !== 2
    const K = I31 !== 2 // mulher
    const L = D6 + G8 + G7 <= M13
    const preenche = E && F && G && H && I && J && K && L
    incisos.push({
      id: 'art11_III',
      geral: V(preenche),
      especial: 'sem_previsao',
      quantum: preenche ? M8 / 2 : null,
      penaApos: null,
    })
  }

  // ===== Cálculo!132 — Art. 13: comutação de 1/5 da remanescente
  {
    const E = travaComut
    const F = dataFatoImpeditivoOk
    const G = doisTercosOk
    // ✅ AMBIGUIDADE RESOLVIDA PELO DONO DO PRODUTO (antes: `<`, divergindo da planilha).
    // A planilha exigia pena cumprida MAIOR que a fração, com `<` estrito; o texto do
    // Art. 13 fala em "que tenham cumprido […] um quinto da pena", o que INCLUI o exato,
    // e todos os demais dispositivos usam `<=` — inclusive o §4º logo abaixo. O `<` era
    // erro da planilha e prejudicava quem cumpriu exatamente a fração. `<=` aqui é
    // INTENCIONAL: não "restaure" o `<` para bater com a planilha — a divergência é o
    // ponto. O cenário congelado que cai na igualdade exata é desvio DOCUMENTADO em
    // motor-2024.spec.ts.
    const H = I20 === 2 ? D6 + G7 + G8 <= M13 : D6 + E7 + E8 <= M13
    const I = !(M8 === 0 && M7 === 0)
    const preenche = E && F && G && H && I
    incisos.push({
      id: 'art13',
      geral: V(preenche),
      especial: 'sem_previsao',
      quantum: preenche ? baseComut / 5 : null,
      // 🔴 `null` sempre: a planilha de 2024 não calcula a pena após a comutação.
      penaApos: null,
    })
  }

  // ===== Cálculo!135 — Art. 13, §4º: 2/3 para o perfil do Art. 9º, §2º
  {
    const E = travaComut
    const F = dataFatoImpeditivoOk
    const G = doisTercosOk
    const H = I20 === 2 ? D6 + G7 + G8 <= M13 : D6 + E7 + E8 <= M13
    const I = perfilP
    const J = !(M8 === 0 && M7 === 0)
    const preenche = E && F && G && H && I && J
    incisos.push({
      id: 'art13_4',
      geral: V(preenche),
      especial: 'sem_previsao',
      quantum: preenche ? (baseComut * 2) / 3 : null,
      penaApos: null,
    })
  }

  return {
    incisos,
    resumo: {
      totalImposto: M9,
      // A fatia IMPEDITIVA do imposto — "Total de penas de crimes IMPEDITIVOS" na tela.
      // É `M6` (e não `D6`, que são os 2/3 dele), o mesmo valor que `penaImpeditiva` traz.
      totalImpeditivo: M6,
      // A fatia NÃO impeditiva — a SOMA dos dois outros campos do questionário. Fecha o
      // `totalImposto` com o de cima (`totalImpeditivo + totalPermissivo == totalImposto`).
      totalPermissivo: M7 + M8,
      totalCumprido: M13,
      penaCumpridaImpeditivos: M15,
      // O que sobra do cumprido para os permissivos: diferença entre os dois valores ACIMA,
      // não entre campos do formulário. O `Math.max(0, ...)` é guarda de sanidade — a
      // fórmula limita o impeditivo a `M13`, mas número negativo aqui iria para petição.
      penaCumpridaPermissivos: Math.max(0, M13 - M15),
      // O impeditivo que FALTA cumprir até o que conta: o total impeditivo (`M6`) menos o
      // cumprido impeditivo (`M15`). Também entre cards. `2/3 de M6 <= M6`, então não fica
      // negativo; o `Math.max` é guarda, não correção.
      remanescenteImpeditivo: Math.max(0, M6 - M15),
      // O remanescente da parte NÃO impeditiva: card 7 menos card 8, como os outros dois
      // derivados. Em 2024 o remanescente é `M16` e o impeditivo remanescente é
      // `max(0, M6 - M15)`.
      remanescentePermissivo: Math.max(0, M16 - Math.max(0, M6 - M15)),
      remanescente: M16,
      fracoes: {
        doisTercosImpeditivos: D6,
        umQuinto: G7 + G8,
        umQuarto: E7 + E8,
        umTerco: F7 + F8,
        metade: H7 + H8,
      },
    },
    avisos: [],
  }
}
