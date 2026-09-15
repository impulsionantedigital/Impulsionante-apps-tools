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
 * Ambiguidades da planilha, PRESERVADAS — nenhuma "consertada". Todas saem em
 * AVISOS_2024.validarJuridicamente, que é o que a tela mostra:
 *   1. Inciso VIII: o §2º DOBRA o teto da pena remanescente em vez de reduzi-lo
 *      à metade, e a base é a remanescente NÃO impeditiva (M17) — em 2025 é a
 *      total (N16);
 *   2. Art. 13 (`c13`): exige cumprimento MAIOR que a fração (`<` estrito,
 *      Cálculo!H132), onde todo outro dispositivo aceita o exato (`<=`);
 *   3. base da comutação do Art. 13 e §4º: o max entre cumprida e remanescente;
 *   4. Art. 11: "NÃO SE APLICA" na reincidência satisfaz tanto o requisito de
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

  return {
    incisos,
    resumo: {
      totalImposto: M9,
      totalCumprido: M13,
      penaCumpridaImpeditivos: M15,
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
