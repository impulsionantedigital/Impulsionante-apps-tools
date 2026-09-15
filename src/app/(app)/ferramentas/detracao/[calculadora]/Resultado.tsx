'use client'

import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { Intervalo, ResultadoCalculo } from '@/lib/detracao/recolhimento-noturno/tipos'
import { formatarInstante, paraInstante } from '@/lib/detracao/recolhimento-noturno/intervalos'
import estilos from './calculadora.module.css'

/**
 * Resultado — exibe o cálculo de detração por recolhimento noturno.
 *
 * Props:
 *   resultado: ResultadoCalculo — resultado do motor de cálculo
 *   deDados: (s: string) => void — callback para expandir/colapsar seções
 */
export default function Resultado({
  resultado,
  deDados,
}: {
  resultado: ResultadoCalculo
  deDados: (s: string) => void
}) {
  const [abertaIntervalos, setAbertaIntervalos] = useState(false)

  function calcularDuracao(intervalo: Intervalo): string {
    const inicio = paraInstante(intervalo.inicio)
    const fim = paraInstante(intervalo.fim)
    const ms = fim - inicio
    const minutos = Math.floor(ms / 60_000)
    const horas = Math.floor(minutos / 60)
    const mins = minutos % 60
    return `${horas}h ${mins}min`
  }

  function toggleIntervalos() {
    setAbertaIntervalos(!abertaIntervalos)
    deDados('intervalos')
  }

  return (
    <section className={estilos.painel}>
      {/* Destaque: dias de detração com saldo */}
      <div className={estilos.destaque}>
        <span className={estilos.numero}>{resultado.diasDetracao}</span>
        <span className={estilos.rotuloNumero}>
          dias de detração<br />
          Saldo: {resultado.saldoHoras}
        </span>
      </div>

      {/* Horas totais */}
      <dl className={estilos.metricas}>
        <dt>Horas totais</dt>
        <dd>
          {resultado.totalHoras} ({resultado.totalMinutos} minutos)
        </dd>
      </dl>

      {/* Intervalos consolidados — seção colapsável */}
      <div className={estilos.memoria}>
        <summary onClick={toggleIntervalos}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <ChevronDown
              size={16}
              style={{
                transform: abertaIntervalos ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 0.2s ease',
              }}
            />
            Intervalos consolidados
          </span>
        </summary>

        {abertaIntervalos && (
          <div>
            {resultado.intervalosConsolidados.length === 0 ? (
              <p className={estilos.ajudaGrupo}>Nenhum intervalo consolidado.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--linha)' }}>
                      Data/Hora de Início
                    </th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--linha)' }}>
                      Data/Hora de Fim
                    </th>
                    <th style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid var(--linha)' }}>
                      Duração
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.intervalosConsolidados.map((intervalo, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--linha)', fontSize: 'var(--fs-body)', color: 'var(--tinta-2)' }}>
                        {formatarInstante(paraInstante(intervalo.inicio))}
                      </td>
                      <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--linha)', fontSize: 'var(--fs-body)', color: 'var(--tinta-2)' }}>
                        {formatarInstante(paraInstante(intervalo.fim))}
                      </td>
                      <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--linha)', textAlign: 'right', fontSize: 'var(--fs-body)', color: 'var(--tinta-2)' }}>
                        {calcularDuracao(intervalo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
