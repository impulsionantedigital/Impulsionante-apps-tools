// src/lib/detracao/recolhimento-noturno/motor.ts
//
// O motor, e ele é só isto: percorre os dias do período, classifica cada dia e SOMA.
//
//   total = dias integrais × 24h  +  dias de regra noturna × H_NOTURNO
//
// 🔴 Não há faixas de tempo, não há sobreposição para unir, não há turno atravessando a meia-noite
// para recortar. O turno de 22:00→06:00 vale 8h no dia em que a regra diz que ele incide, e pronto
// — ninguém precisa saber em que data civil cada hora cai. A versão anterior materializava faixas e
// recortava por uma janela, e era justamente daí que saíam os números errados na tela.

import { feriadosDoIntervalo, feriadosNacionais } from './feriados'
import type { FeriadoConsiderado } from './feriados'
import { ALGORITMO_VERSAO } from './tipos'
import type { EntradaCalculo, ResultadoCalculo, SegmentoRegra, Weekday } from './tipos'

const WEEKDAY_POR_INDICE_JS: readonly Weekday[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

export function diaSemanaDe(dataISO: string): Weekday {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataISO)
  if (!m) throw new Error(`data inválida: ${dataISO}`)
  const indice = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()
  return WEEKDAY_POR_INDICE_JS[indice]
}

/** O dia seguinte a `dataISO`, no mesmo eixo sem fuso das outras datas. */
function proximoDia(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split('-').map(Number)
  const d = new Date(Date.UTC(ano, mes - 1, dia + 1))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

/** Toda data de `inicio` a `fim`, INCLUSIVE nas duas pontas. */
function diasEntre(inicio: string, fim: string): string[] {
  const datas: string[] = []
  let cursor = inicio
  while (cursor <= fim) {
    datas.push(cursor)
    cursor = proximoDia(cursor)
  }
  return datas
}

function validarData(data: string, campo: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error(`${campo} deve estar no formato AAAA-MM-DD.`)
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

/** As três casas do tempo de detração, com a convenção da execução penal: **1 ano = 365 dias** e
 *  **1 mês = 30 dias**, aplicadas sobre os DIAS INTEIROS (o saldo abaixo de 24h não entra — ele é
 *  resto, e é por isso que ele aparece separado no resumo). */
export type AnosMesesDias = { anos: number; meses: number; dias: number }

/** Converte dias de detração em anos/meses/dias pela convenção da execução penal.
 *
 *  🔴 365 e 30 são DIVISORES FIXOS da conta jurídica, não o calendário real: um ano de calendário
 *  tem 365 ou 366 dias, e um mês tem 28 a 31. A conta de execução penal não usa o calendário — usa
 *  o ano de 365 e o mês de 30, que é a mesma convenção da planilha de referência. Trocar por
 *  diferença de datas reais mudaria o número de cálculos já em uso. */
export function paraAnosMesesDias(diasDetracao: number): AnosMesesDias {
  const dias = Math.max(0, Math.floor(diasDetracao))
  const anos = Math.floor(dias / 365)
  const restoAposAnos = dias % 365
  const meses = Math.floor(restoAposAnos / 30)
  return { anos, meses, dias: restoAposAnos % 30 }
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

/** A classe de cada dia computado — usada na contagem e na composição do resumo.
 *
 *  🔴 `feriado` e `folgaIntegral` valem os dois 24h, mas são coisas diferentes para quem lê o
 *  resumo: um feriado nacional computado não é "fim de semana". Separar as duas aqui evita ter de
 *  reinventar a classificação a partir das faixas depois (o que a versão anterior fazia errado). */
export type ClasseDia = 'folgaIntegral' | 'feriadoIntegral' | 'noturno'

/** A classe de UM dia, com a PRECEDÊNCIA da spec:
 *
 *  1. dia em `diasFolgaIntegral` → folga integral (24h)
 *  2. senão, feriado (nacional com o checkbox ligado, ou em `feriadosIntegral`) → feriado (24h)
 *  3. senão, dia em `diasSemanaNoturno` → noturno (H_NOTURNO)
 *  4. senão → `null` (não computado)
 *
 *  🔴 A precedência é o que impede a contagem dobrada: um feriado que cai em sábado (já folga
 *  integral) computa 24h UMA vez, porque a regra 1 o captura e a 2 nunca é alcançada. Somar as
 *  duas hipóteses somaria 48h no mesmo dia de calendário. */
function classeDoDia(
  segmento: SegmentoRegra,
  dataISO: string,
  feriadosDoSet: Set<string>,
): ClasseDia | null {
  const diaSemana = diaSemanaDe(dataISO)
  if (segmento.diasFolgaIntegral.includes(diaSemana)) return 'folgaIntegral'
  // Feriado declarado à mão pelo membro (modo avançado) — vale 24h sem depender do checkbox.
  if (segmento.feriadosIntegral.includes(dataISO)) return 'feriadoIntegral'
  if (segmento.incluirFeriadosUteis && feriadosDoSet.has(dataISO)) return 'feriadoIntegral'
  if (segmento.diasSemanaNoturno.includes(diaSemana)) return 'noturno'
  return null
}

/** Os feriados nacionais que cobrem TODOS os segmentos — do menor ao maior ano. */
function feriadosDoPeriodo(segmentos: SegmentoRegra[]): Set<string> {
  const anos = segmentos.flatMap((s) => [Number(s.dataInicio.slice(0, 4)), Number(s.dataFim.slice(0, 4))])
  return new Set(feriadosNacionais(Math.min(...anos), Math.max(...anos)))
}

export function calcular(entrada: EntradaCalculo): ResultadoCalculo {
  if (!entrada.segmentos || entrada.segmentos.length === 0) {
    throw new Error('Informe ao menos um segmento de regra.')
  }

  // Os feriados nacionais do período inteiro, uma vez só: `Set` dá a consulta O(1) e a comparação é
  // TEXTUAL em `YYYY-MM-DD`, então não há fuso horário para errar aqui.
  const feriadosDoSet = feriadosDoPeriodo(entrada.segmentos)
  // Os mesmos feriados, com nome e dia da semana, para a tela LISTAR o que entrou no cálculo.
  const feriadosConsiderados = entrada.segmentos
    .filter((s) => s.incluirFeriadosUteis)
    .flatMap((s) => feriadosDoIntervalo(s.dataInicio, s.dataFim))
    .filter((f, i, todos) => todos.findIndex((o) => o.data === f.data) === i)
    .sort((a, b) => a.data.localeCompare(b.data))

  let minutosNoturno = 0
  let diasUteis = 0
  let diasFeriados = 0
  let diasFolgaIntegral = 0
  for (const segmento of entrada.segmentos) {
    validarData(segmento.dataInicio, 'dataInicio')
    validarData(segmento.dataFim, 'dataFim')
    validarHora(segmento.horaInicioNoturno, 'horaInicioNoturno')
    validarHora(segmento.horaFimNoturno, 'horaFimNoturno')
    // 🔴 §12 da spec: 00:00–00:00 NÃO vira "24 horas" por presunção — é rejeitado.
    if (segmento.diasSemanaNoturno.length > 0 && segmento.horaInicioNoturno === segmento.horaFimNoturno) {
      throw new Error(
        'Horário noturno com início igual ao fim é ambíguo. Para dia inteiro, use dias de folga integral ou feriados, não o horário noturno.',
      )
    }
    if (segmento.dataFim < segmento.dataInicio) {
      throw new Error('A data final deve ser igual ou posterior à data inicial.')
    }

    minutosNoturno = Math.max(minutosNoturno, minutosNoturnos(segmento))

    // É isto, e só isto: um dia vale o que a sua REGRA diz, e o dia é o dia de CALENDÁRIO.
    // Nada de faixas, de virada de meia-noite ou de recorte por janela.
    for (const dataISO of diasEntre(segmento.dataInicio, segmento.dataFim)) {
      const classe = classeDoDia(segmento, dataISO, feriadosDoSet)
      if (classe === 'noturno') diasUteis++
      else if (classe === 'feriadoIntegral') diasFeriados++
      else if (classe === 'folgaIntegral') diasFolgaIntegral++
    }
  }

  const diasIntegrais = diasFeriados + diasFolgaIntegral
  const minutosUteis = diasUteis * minutosNoturno
  const minutosIntegrais = diasIntegrais * 1440
  const totalMinutos = minutosIntegrais + minutosUteis
  return {
    totalMinutos,
    totalHoras: formatarHoras(totalMinutos),
    diasDetracao: Math.floor(totalMinutos / 1440),
    detracaoEmAnosMesesDias: paraAnosMesesDias(Math.floor(totalMinutos / 1440)),
    saldoMinutos: totalMinutos % 1440,
    saldoHoras: formatarHHMM(totalMinutos % 1440),
    diasUteis,
    diasIntegrais,
    composicao: {
      diasUteis,
      minutosUteis,
      diasIntegrais,
      diasFeriados,
      diasFolgaIntegral,
      minutosIntegrais,
    },
    feriadosConsiderados,
    algoritmoVersao: ALGORITMO_VERSAO,
  }
}
