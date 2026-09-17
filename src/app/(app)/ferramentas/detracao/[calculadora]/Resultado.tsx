import type { ResultadoCalculo } from '@/lib/detracao/recolhimento-noturno/tipos'
import estilos from './calculadora.module.css'

function formatarInstanteExibicao(iso: string): string {
  return iso.replace('T', ' ').slice(0, 16)
}

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

      <details className={estilos.memoria}>
        <summary>Memória de cálculo</summary>

        <b className={estilos.tituloSecao}>Intervalos consolidados</b>
        {resultado.intervalosConsolidados.length === 0 ? (
          <p className={estilos.ajudaGrupo}>Nenhum intervalo válido — total 0.</p>
        ) : (
          <ul className={estilos.listaMemoria}>
            {resultado.intervalosConsolidados.map((iv, i) => (
              <li key={i}>
                {formatarInstanteExibicao(iv.inicio)} — {formatarInstanteExibicao(iv.fim)}
              </li>
            ))}
          </ul>
        )}

      </details>
    </div>
  )
}
