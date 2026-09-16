// src/lib/detracao/recolhimento-noturno/peticao.ts
//
// Texto de anotação processual para instruir o pedido de detração — um parágrafo fixo que relata
// o período e o total apurado, sem endereçamento nem fundamentação (isso fica a cargo de quem
// protocola). O número de dias é o mesmo `diasDetracao` do destaque na tela (floor de
// totalMinutos/1440) — não a fração bruta, para não divergir do que já aparece pro usuário.

import { paraInstante, formatarInstante } from './intervalos'
import type { ResultadoCalculo } from './tipos'

function formatarDataBR(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split('-')
  return `${dia}/${mes}/${ano}`
}

/** O `fim` de um intervalo pode cair exatamente em `T00:00:00` quando representa "até o fim do
 *  dia anterior" (dia de folga integral, ou janela da cautelar com fim exclusivo — ver
 *  `formulario.ts`). Nesse caso a data que importa pro relato é a do dia ANTERIOR ao instante
 *  exclusivo, não a dele mesmo. */
function dataDoFim(iso: string): string {
  if (iso.endsWith('T00:00:00')) {
    return formatarInstante(paraInstante(iso) - 1).slice(0, 10)
  }
  return iso.slice(0, 10)
}

/** `''` quando não há intervalo válido — o botão que chama isto decide não aparecer nesse caso. */
export function gerarTextoPeticao(resultado: ResultadoCalculo): string {
  const intervalos = resultado.intervalosConsolidados
  if (intervalos.length === 0) return ''

  const dataInicio = formatarDataBR(intervalos[0].inicio.slice(0, 10))
  const dataFim = formatarDataBR(dataDoFim(intervalos[intervalos.length - 1].fim))
  const horas = (resultado.totalMinutos / 60).toFixed(2)
  const dias = resultado.diasDetracao

  return `Em cumprimento à decisão exarada nos autos, procedo às seguintes anotações:
O recuperando permaneceu em recolhimento noturno do dia ${dataInicio} a ${dataFim}.
No período indicado, cumpriu ${horas} horas de recolhimento, correspondentes a ${dias} dias de detração.`
}
