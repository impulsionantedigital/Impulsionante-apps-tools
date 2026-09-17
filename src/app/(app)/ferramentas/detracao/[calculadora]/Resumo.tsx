import { calcularResumoDetalhado } from '@/lib/detracao/recolhimento-noturno/resumo'
import { feriadosNacionais } from '@/lib/detracao/recolhimento-noturno/feriados'
import type { EntradaFormulario } from '@/lib/detracao/recolhimento-noturno/formulario'
import type { ResultadoCalculo } from '@/lib/detracao/recolhimento-noturno/tipos'
import estilos from './calculadora.module.css'

/** Os feriados nacionais que cobrem os segmentos do formulário — mesma janela do motor. */
function feriadosDoPeriodoDosSegmentos(entrada: EntradaFormulario): string[] {
  const datas = entrada.segmentos.flatMap((s) => [s.dataInicio, s.dataFim]).filter(Boolean)
  if (datas.length === 0) return []
  const anos = datas.map((d) => Number(d.slice(0, 4))).filter(Number.isFinite)
  if (anos.length === 0) return []
  return feriadosNacionais(Math.min(...anos), Math.max(...anos))
}

function formatarDataBR(dataISO: string): string {
  if (!dataISO) return '—'
  const [ano, mes, dia] = dataISO.split('-')
  return `${dia}/${mes}/${ano}`
}

function duracaoNoturnaMinutos(horaInicio: string, horaFim: string): number {
  const [hi, mi] = horaInicio.split(':').map(Number)
  const [hf, mf] = horaFim.split(':').map(Number)
  const inicioMin = hi * 60 + mi
  let fimMin = hf * 60 + mf
  if (fimMin <= inicioMin) fimMin += 24 * 60
  return fimMin - inicioMin
}

function formatarHoras(minutos: number): string {
  return (minutos / 60).toFixed(2)
}

/** Resumo para apoiar a decisão do juízo e a redação da impressão/petição — é o único painel
 *  visível quando a página vai para o papel (ver `@media print` em calculadora.module.css).
 *
 *  🔴 O total SEMPRE aparece aqui, e não é redundância com o `Resultado`: no papel o `.painel` fica
 *  oculto, e sem esta linha o anexo ia para o juízo com as datas e a composição por categoria —
 *  mas sem o número que o cálculo apurou. Por isso o destaque é um `<b>` dentro do próprio texto,
 *  e não um `<b class="numero">` grande como o da tela: o tamanho é só desta tela (ver `<style>`
 *  abaixo), e quem imprimir com CSS forçado ainda leva o número mesmo sem a folha de estilo. */
export default function Resumo({
  entrada,
  resultado,
  observacoes,
}: {
  entrada: EntradaFormulario
  resultado: ResultadoCalculo
  observacoes?: string
}) {
  // Os feriados que a classificação por categoria conhece: os DECLARADOS à mão em cada segmento e,
  // quando o checkbox está ligado, também os NACIONAIS do (`feriados.ts`) — sem estes
  // últimos, um feriado nacional computado a 24h apareceria no resumo como "dia útil".
  const feriados = [
    ...entrada.segmentos.flatMap((s) => s.feriadosIntegral),
    ...(entrada.segmentos.some((s) => s.incluirFeriadosUteis) ? feriadosDoPeriodoDosSegmentos(entrada) : []),
  ].filter(Boolean)
  const categorias = calcularResumoDetalhado(resultado.intervalosConsolidados, feriados)
  const total = `Você tem ${resultado.diasDetracao} dias de detração`
  // 🔴 O rótulo diz a UNIDADE (dias de 24h) porque abaixo, em "Composição por dia de calendário",
  // "dias" significa outra coisa. Sem esta desambiguação o advogado lê os dois como o mesmo número.
  const rotuloTotal =
    resultado.diasDetracao === 1
      ? 'Total de detração — em dias de 24h'
      : 'Total de detração — em dias de 24h cada'

  return (
    <div className={estilos.resumo}>
      {/* Só na tela: o mesmo número saibro como linha do resumo, que sai no papel. */}
      <style>{`.${estilos.destaquePapel} { font-size: 2.5rem; font-weight: 700; }`}</style>

      <b className={estilos.tituloSecao}>Resumo</b>

      <div className={estilos.resumoSegmento}>
        <div className={estilos.resumoLinha}>
          <span>{rotuloTotal}</span>
          <b>{total}</b>
        </div>
        <div className={estilos.resumoLinha}>
          <span>Saldo abaixo de 24h (não gera dia a mais)</span>
          <b>{resultado.saldoHoras}</b>
        </div>
      </div>

      {entrada.segmentos.map((segmento, indice) => (
        <div key={indice} className={estilos.resumoSegmento}>
          <div className={estilos.resumoLinha}>
            <span>Data de início</span>
            <b>{formatarDataBR(segmento.dataInicio)}</b>
          </div>
          <div className={estilos.resumoLinha}>
            <span>Data de fim</span>
            <b>{formatarDataBR(segmento.dataFim)}</b>
          </div>
          <div className={estilos.resumoLinha}>
            <span>Período noturno</span>
            <b>
              {segmento.horaInicioNoturno} às {segmento.horaFimNoturno} (
              {formatarHoras(duracaoNoturnaMinutos(segmento.horaInicioNoturno, segmento.horaFimNoturno))}{' '}
              horas/dia)
            </b>
          </div>
        </div>
      ))}

      {/* 🔴 "dias de calendário" aqui, e NÃO "dias de detração" do bloco acima. São métricas
       *  diferentes e nunca coincidem: acima, `diasDetracao = floor(totalMinutos / 1440)` (dias de
       *  24h acumulados); aqui, quantos DIAS DO CALENDÁRIO foram tocados por algum recolhimento —
       *  um turno de 22:00 às 06:00 toca dois dias de calendário e vale 0 dias de detração. Sem
       *  esta distinção no rótulo, a tela parece contradizer a si mesma. */}
      <div className={estilos.resumoCategorias}>
        <div className={estilos.resumoLinha}>
          <span className={estilos.resumoSubCategoria}>Composição por dia de calendário (não é o total de detração)</span>
        </div>
        <div className={estilos.resumoLinha}>
          <span>Dias úteis alcançados</span>
          <b>
            {categorias.util.dias} dias — {formatarHoras(categorias.util.minutos)} horas
          </b>
        </div>
        <div className={estilos.resumoLinha}>
          <span>Finais de semana alcançados</span>
          <b>
            {categorias.fimDeSemana.dias} dias — {formatarHoras(categorias.fimDeSemana.minutos)} horas
          </b>
        </div>
        <div className={estilos.resumoLinha}>
          <span>Feriados alcançados</span>
          <b>
            {categorias.feriado.dias} dias — {formatarHoras(categorias.feriado.minutos)} horas
          </b>
        </div>
      </div>

      {/* 🔴 Só na tela. Ao contrário das respostas do CIC, este campo é texto LIVRE do advogado —
       *  num anexo de petição ele é rascunho, e rascunho não vai assinado ao juízo (ver
       *  `@media print` em calculadora.module.css). */}
      {observacoes?.trim() ? (
        <div className={estilos.resumoObservacoes}>
          <span>Observações</span>
          <p className={estilos.resumoObservacoesTexto}>{observacoes}</p>
        </div>
      ) : null}
    </div>
  )
}
