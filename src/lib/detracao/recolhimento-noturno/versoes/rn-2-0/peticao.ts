// src/lib/detracao/recolhimento-noturno/peticao.ts
//
// Texto de anotação processual para instruir o pedido de detração — um parágrafo fixo que relata
// o período e o total apurado, sem endereçamento nem fundamentação (isso fica a cargo de quem
// protocola). O número de dias é o mesmo `diasDetracao` do destaque na tela (floor de
// totalMinutos/1440) — não a fração bruta, para não divergir do que já aparece pro usuário.

import type { EntradaCalculo, ResultadoCalculo } from './tipos'

function formatarDataBR(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split('-')
  return `${dia}/${mes}/${ano}`
}

/** O texto do anexo. As datas vêm da ENTRADA (o que o membro digitou), não de uma releitura das
 *  datas computadas — o relato é do período da cautelar, e é isso que ele informou.
 *
 *  `''` quando não há período informado: o botão que chama isto decide não aparecer nesse caso. */
export function gerarTextoPeticao(entrada: EntradaCalculo, resultado: ResultadoCalculo): string {
  const primeiro = entrada.segmentos[0]
  if (!primeiro || !primeiro.dataInicio || !primeiro.dataFim) return ''

  const dataInicio = formatarDataBR(primeiro.dataInicio)
  const dataFim = formatarDataBR(entrada.segmentos[entrada.segmentos.length - 1].dataFim)
  const horas = (resultado.totalMinutos / 60).toFixed(2)
  const dias = resultado.diasDetracao
  return `Em cumprimento à decisão exarada nos autos, procedo às seguintes anotações:
O recuperando permaneceu em recolhimento noturno do dia ${dataInicio} a ${dataFim}.
No período indicado, cumpriu ${horas} horas de recolhimento, correspondentes a ${dias} dias de detração.`
}
