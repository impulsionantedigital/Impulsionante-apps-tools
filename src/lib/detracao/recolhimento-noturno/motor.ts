// src/lib/detracao/recolhimento-noturno/motor.ts
//
// O pipeline da spec de cálculo de recolhimento domiciliar: itera DIA A DIA o período, classifica
// cada dia por PRECEDÊNCIA (folga integral > feriado nacional > regra noturna) e soma os minutos
// que cada classe vale. As faixas de tempo continuam sendo materializadas — não para somar, mas
// para a memória de cálculo, o resumo por categoria e o texto da petição.
//
// 🔴 O TOTAL NÃO É A SOMA DAS FAIXAS. Ele é `diasIntegrais × 24h + diasUteis × H_NOTURNO`, que é a
// conta do PASSO 4. As faixas são a materialização visual do mesmo cômputo.

import {
  type Faixa,
  intersectar,
  mergeIntervalos,
  paraInstante,
  paraInstanteDeData,
  somarDias,
  formatarInstante,
  proximoDia,
} from './intervalos'
import { feriadosNacionais } from './feriados'
import { ALGORITMO_VERSAO } from './tipos'
import type { EntradaCalculo, ResultadoCalculo, SegmentoRegra, Weekday } from './tipos'

const WEEKDAY_POR_INDICE_JS: readonly Weekday[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

export function diaSemanaDe(dataISO: string): Weekday {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataISO)
  if (!m) throw new Error(`data inválida: ${dataISO}`)
  const indice = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()
  return WEEKDAY_POR_INDICE_JS[indice]
}

function dataDeInstante(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

/** Do dia da data de início ao dia do último instante ANTES do fim (fim é exclusivo). */
function datasTocadasPorJanela(inicioMs: number, fimMs: number): string[] {
  if (fimMs <= inicioMs) return []
  const datas: string[] = []
  let cursor = dataDeInstante(inicioMs)
  const ultima = dataDeInstante(fimMs - 1)
  while (true) {
    datas.push(cursor)
    if (cursor === ultima) break
    cursor = proximoDia(cursor)
  }
  return datas
}

function validarHora(hora: string, campo: string) {
  if (!/^\d{2}:\d{2}$/.test(hora)) throw new Error(`${campo} deve estar no formato HH:MM.`)
}

function formatarHoras(totalMinutos: number): string {
  return `${Math.floor(totalMinutos / 60)}:${String(totalMinutos % 60).padStart(2, '0')}`
}

function formatarHHMM(totalMinutos: number): string {
  return `${String(Math.floor(totalMinutos / 60)).padStart(2, '0')}:${String(totalMinutos % 60).padStart(2, '0')}`
}

/** `H_NOTURNO` do PASSO 1: duração do turno noturno, em minutos. Quando o fim cai na madrugada
 *  (06:00 ≤ 22:00) a conta dá a volta pela meia-noite. Início igual ao fim é ambíguo e já foi
 *  rejeitado na validação do segmento — aqui não se presume "24 horas". */
function minutosNoturnos(segmento: SegmentoRegra): number {
  const [hi, mi] = segmento.horaInicioNoturno.split(':').map(Number)
  const [hf, mf] = segmento.horaFimNoturno.split(':').map(Number)
  const inicio = hi * 60 + mi
  const fim = hf * 60 + mf
  return fim <= inicio ? 1440 - inicio + fim : fim - inicio
}

/** Os dias integrais (24h) e os dias de regra noturna de UM segmento, com a PRECEDÊNCIA da spec:
 *
 *  1. dia em `diasFolgaIntegral` → 24h
 *  2. senão, feriado nacional em dia útil com o checkbox ligado → 24h
 *  3. senão, dia em `diasSemanaNoturno` → H_NOTURNO
 *  4. senão → 0
 *
 *  🔴 A precedência é o que impede a contagem dobrada: um feriado que cai em sábado (já folga
 *  integral) computa 24h UMA vez, porque a regra 1 o captura e a 2 nunca é alcançada. Somar as
 *  duas hipóteses somaria 48h no mesmo dia de calendário. */
function categoriaDoDia(
  segmento: SegmentoRegra,
  dataISO: string,
  feriadosDaJanela: Set<string>,
): 'integral' | 'noturno' | null {
  const diaSemana = diaSemanaDe(dataISO)
  if (segmento.diasFolgaIntegral.includes(diaSemana)) return 'integral'
  // Feriado declarado à mão pelo membro (modo avançado) — vale 24h sem depender do checkbox.
  if (segmento.feriadosIntegral.includes(dataISO)) return 'integral'
  if (segmento.incluirFeriadosUteis && feriadosDaJanela.has(dataISO)) return 'integral'
  if (segmento.diasSemanaNoturno.includes(diaSemana)) return 'noturno'
  return null
}

/** Os feriados nacionais que cobrem TODOS os segmentos — de menor início a maior fim. */
function feriadosDoPeriodo(segmentos: SegmentoRegra[]): Set<string> {
  let menor = Infinity
  let maior = -Infinity
  for (const s of segmentos) {
    const i = paraInstante(s.inicio)
    const f = paraInstante(s.fim)
    if (i < menor) menor = i
    if (f > maior) maior = f
  }
  const anoDe = (ms: number) => new Date(ms).getUTCFullYear()
  return new Set(feriadosNacionais(anoDe(menor), anoDe(maior)))
}

export function calcular(entrada: EntradaCalculo): ResultadoCalculo {
  if (!entrada.segmentos || entrada.segmentos.length === 0) {
    throw new Error('Informe ao menos um segmento de regra.')
  }

  const todasFaixas: Faixa[] = []

  // 🔴 Os feriados nacionais do período inteiro, uma vez só: `Set` dá a consulta O(1) do PASSO 3
  // e a comparação é TEXTUAL em `YYYY-MM-DD`, então não há fuso horário para errar aqui.
  const feriadosDaJanela = feriadosDoPeriodo(entrada.segmentos)

  let totalMinutos = 0
  let diasUteis = 0
  let diasIntegrais = 0
  for (const segmento of entrada.segmentos) {
    validarHora(segmento.horaInicioNoturno, 'horaInicioNoturno')
    validarHora(segmento.horaFimNoturno, 'horaFimNoturno')
    // 🔴 §12 do plano: 00:00–00:00 NÃO vira "24 horas" por presunção — é rejeitado.
    if (segmento.diasSemanaNoturno.length > 0 && segmento.horaInicioNoturno === segmento.horaFimNoturno) {
      throw new Error(
        'Horário noturno com início igual ao fim é ambíguo. Para dia inteiro, use dias de folga integral ou feriados, não o horário noturno.',
      )
    }

    const janela: Faixa = { inicio: paraInstante(segmento.inicio), fim: paraInstante(segmento.fim) }
    if (janela.fim <= janela.inicio) {
      throw new Error('A data final do segmento deve ser posterior à data inicial.')
    }

    // PASSO 3 da spec, e a ÚNICA fonte da contagem: o dia é classificado aqui, a faixa dele é
    // gerada aqui e o contador sobe aqui, na MESMA passada. Separar as duas coisas (contar de um
    // lado, materializar do outro) é o que fazia a contagem dizer 2194 dias e a memória de cálculo
    // listar 2193 faixas — o dia tocado pela janela cuja regra não produzia tempo nenhum dentro
    // dela contava sem aparecer. Classificação, faixa e contagem andam juntas por construção.
    for (const dataISO of datasTocadasPorJanela(janela.inicio, janela.fim)) {
      const categoria = categoriaDoDia(segmento, dataISO, feriadosDaJanela)
      if (!categoria) continue
      // 🔴 A faixa do dia tem o VALOR DA REGRA (24h ou o turno inteiro), e não o pedaço que sobra
      // do recorte pela janela — senão a memória de cálculo contradiria o total: com a janela
      // terminando à meia-noite, o turno de 22:00→06:00 aparecia como 22:00→00:00 (2h) e o total
      // dizia 8h. O corte pela janela fica só na BORDA (primeiro e último dia), que é onde a
      // data/hora exata do modo avançado precisa mandar; nos dias cheios do meio, a faixa é toda.
      let a: number
      let b: number
      if (categoria === 'integral') {
        a = paraInstanteDeData(dataISO, '00:00')
        b = somarDias(a, 1)
      } else {
        a = paraInstanteDeData(dataISO, segmento.horaInicioNoturno)
        b = paraInstanteDeData(dataISO, segmento.horaFimNoturno)
        if (b <= a) b = somarDias(b, 1)
      }

      const ehPrimeiroDia = dataISO === dataDeInstante(janela.inicio)
      const ehUltimoDia = dataISO === dataDeInstante(janela.fim - 1)
      const faixa =
        ehPrimeiroDia || ehUltimoDia
          ? intersectar({ inicio: a, fim: b }, janela)
          : { inicio: a, fim: b }
      // Dia cuja regra não produz NADA dentro da janela não conta nem aparece — as duas coisas
      // continuam valendo juntas.
      if (!faixa) continue
      todasFaixas.push(faixa)
      if (categoria === 'integral') diasIntegrais++
      else diasUteis++
    }

    // 🔴 NÃO HÁ intervalos adicionais nem excluídos nesta calculadora. A especificação do motor só
    // conhece as quatro listas de dias (regra noturna, folga integral, feriados nacionais, feriados
    // declarados); qualquer tempo a mais ou a menos se expressa mudando essas listas, e não
    // somando/descontando pedaços de tempo. Um campo de exclusão parcial de 2h, por exemplo, não
    // teria como entrar numa conta que decide o VALOR DO DIA — ele ficaria na tela mentindo que
    // desconta, sem descontar nada.
  }

  const consolidadas = mergeIntervalos(todasFaixas)

  // A contagem de DIAS manda no total — é ela o PASSO 3 da spec. As faixas ficam para a memória de
  // cálculo e a petição; o total NÃO é a soma das faixas. Se as duas discordassem, a que o membro
  // digitou (dias marcados) é a que vale, e a memória de cálculo mostraria o porquê.
  const minutosNoturno = minutosNoturnos(entrada.segmentos[0])
  totalMinutos = diasIntegrais * 1440 + diasUteis * minutosNoturno
  const diasDetracao = Math.floor(totalMinutos / 1440)
  const saldoMinutos = totalMinutos % 1440

  return {
    totalMinutos,
    totalHoras: formatarHoras(totalMinutos),
    diasDetracao,
    saldoMinutos,
    saldoHoras: formatarHHMM(saldoMinutos),
    intervalosConsolidados: consolidadas.map((f) => ({
      inicio: formatarInstante(f.inicio),
      fim: formatarInstante(f.fim),
    })),
    algoritmoVersao: ALGORITMO_VERSAO,
    diasUteis,
    diasIntegrais,
  }
}
