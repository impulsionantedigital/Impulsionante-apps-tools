// src/lib/detracao/recolhimento-noturno/motor.ts
//
// O pipeline do §5/§10 do plano de implementação: gera os intervalos de cada segmento, recorta
// pela vigência, subtrai exclusões, une sobreposições e só então soma e converte em dias.

import {
  type Faixa,
  intersectar,
  mergeIntervalos,
  subtrairIntervalos,
  duracaoMinutos,
  paraInstante,
  paraInstanteDeData,
  somarDias,
  formatarInstante,
  proximoDia,
} from './intervalos'
import { ALGORITMO_VERSAO } from './tipos'
import type { EntradaCalculo, IntervaloComMotivo, ResultadoCalculo, Weekday } from './tipos'

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

export function calcular(entrada: EntradaCalculo): ResultadoCalculo {
  if (!entrada.segmentos || entrada.segmentos.length === 0) {
    throw new Error('Informe ao menos um segmento de regra.')
  }

  const todasFaixas: Faixa[] = []
  const excluidasFaixas: Faixa[] = []
  const excluidasComMotivo: IntervaloComMotivo[] = []

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

    for (const dataISO of datasTocadasPorJanela(janela.inicio, janela.fim)) {
      const diaSemana = diaSemanaDe(dataISO)

      if (segmento.diasSemanaNoturno.includes(diaSemana)) {
        let a = paraInstanteDeData(dataISO, segmento.horaInicioNoturno)
        let b = paraInstanteDeData(dataISO, segmento.horaFimNoturno)
        if (b <= a) b = somarDias(b, 1)
        const cortado = intersectar({ inicio: a, fim: b }, janela)
        if (cortado) todasFaixas.push(cortado)
      }

      if (segmento.diasFolgaIntegral.includes(diaSemana) || segmento.feriadosIntegral.includes(dataISO)) {
        const a = paraInstanteDeData(dataISO, '00:00')
        const cortado = intersectar({ inicio: a, fim: somarDias(a, 1) }, janela)
        if (cortado) todasFaixas.push(cortado)
      }
    }

    for (const extra of segmento.intervalosAdicionais) {
      const cortado = intersectar({ inicio: paraInstante(extra.inicio), fim: paraInstante(extra.fim) }, janela)
      if (cortado) todasFaixas.push(cortado)
    }

    for (const exclusao of segmento.intervalosExcluidos) {
      const cortado = intersectar(
        { inicio: paraInstante(exclusao.inicio), fim: paraInstante(exclusao.fim) },
        janela,
      )
      if (cortado) {
        excluidasFaixas.push(cortado)
        excluidasComMotivo.push({
          inicio: formatarInstante(cortado.inicio),
          fim: formatarInstante(cortado.fim),
          motivo: exclusao.motivo,
        })
      }
    }
  }

  const validas = subtrairIntervalos(todasFaixas, excluidasFaixas)
  const consolidadas = mergeIntervalos(validas)
  const totalMinutos = duracaoMinutos(consolidadas)
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
    intervalosExcluidos: excluidasComMotivo,
    algoritmoVersao: ALGORITMO_VERSAO,
  }
}
