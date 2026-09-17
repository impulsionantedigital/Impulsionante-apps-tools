import type { ResultadoCalculo } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-0/tipos'
import estilos from './calculadora.module.css'

export default function Resultado({ resultado }: { resultado: ResultadoCalculo }) {
  return (
    <div className={estilos.painel}>
      <div className={estilos.destaque}>
        <span className={estilos.numero}>{resultado.diasDetracao}</span>
        <span className={estilos.rotuloNumero}>
          {resultado.diasDetracao === 1 ? 'dia de detração' : 'dias de detração'}
        </span>
      </div>

      <dl className={estilos.metricas}>
        <div>
          <dt>Total computável</dt>
          <dd>{resultado.totalHoras}</dd>
        </div>
        <div>
          <dt>Saldo abaixo de 24h (não gera dia a mais)</dt>
          <dd>{resultado.saldoHoras}</dd>
        </div>
        <div>
          <dt>Versão do algoritmo</dt>
          <dd>{resultado.algoritmoVersao}</dd>
        </div>
      </dl>

      {/* A memória de cálculo é a própria conta, aberta: quantos dias de cada tipo, e o que cada
       *  tipo vale. É o que permite conferir o total de cabeça, e substitui a lista de intervalos
       *  que existia antes (dezenas de timestamps que diziam menos do que esta tabela). */}
      <details className={estilos.memoria}>
        <summary>Memória de cálculo</summary>

        <b className={estilos.tituloSecao}>Como o total foi composto</b>
        <ul className={estilos.listaMemoria}>
          <li>
            {resultado.composicao.diasUteis} dias de regra noturna ×{' '}
            {(resultado.composicao.minutosUteis / Math.max(resultado.composicao.diasUteis, 1) / 60).toFixed(2)}h ={' '}
            {(resultado.composicao.minutosUteis / 60).toFixed(2)}h
          </li>
          <li>
            {resultado.composicao.diasFeriados} feriados × 24h ={' '}
            {(resultado.composicao.diasFeriados * 24).toFixed(2)}h
          </li>
          <li>
            {resultado.composicao.diasFolgaIntegral} dias de folga integral × 24h ={' '}
            {(resultado.composicao.diasFolgaIntegral * 24).toFixed(2)}h
          </li>
          <li>
            <b>Total: {(resultado.totalMinutos / 60).toFixed(2)}h</b>
          </li>
        </ul>
      </details>
    </div>
  )
}
