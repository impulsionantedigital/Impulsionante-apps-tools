'use client'

import { Plus, Trash2 } from 'lucide-react'
import Botao from '@/components/ui/Botao'
import { Campo, Entrada as EntradaControle } from '@/components/ui/Campo'
import { ROTULOS_DIA_SEMANA, WEEKDAYS } from '@/lib/detracao/recolhimento-noturno/tipos'
import type { Weekday } from '@/lib/detracao/recolhimento-noturno/tipos'
import type { SegmentoFormulario } from '@/lib/detracao/recolhimento-noturno/formulario'
import estilos from './calculadora.module.css'

function SeletorDiasSemana({
  rotulo,
  valor,
  aoMudar,
}: {
  rotulo: string
  valor: Weekday[]
  aoMudar: (v: Weekday[]) => void
}) {
  function alternar(dia: Weekday) {
    aoMudar(valor.includes(dia) ? valor.filter((d) => d !== dia) : [...valor, dia])
  }
  return (
    <div className={estilos.campoTempo}>
      <span className={estilos.rotuloGrupo}>{rotulo}</span>
      <div className={estilos.diasSemana}>
        {WEEKDAYS.map((dia) => (
          <label key={dia} className={estilos.diaSemanaItem}>
            <input type="checkbox" checked={valor.includes(dia)} onChange={() => alternar(dia)} />
            {ROTULOS_DIA_SEMANA[dia]}
          </label>
        ))}
      </div>
    </div>
  )
}

export default function CamposSegmento({
  segmento,
  aoMudar,
  aoRemover,
  avancado,
}: {
  segmento: SegmentoFormulario
  aoMudar: (s: SegmentoFormulario) => void
  aoRemover?: () => void
  avancado: boolean
}) {
  function set<K extends keyof SegmentoFormulario>(campo: K, valor: SegmentoFormulario[K]) {
    aoMudar({ ...segmento, [campo]: valor })
  }

  return (
    <div className={estilos.secao}>
      <div className={estilos.editorCabecalho}>
        <b className={estilos.tituloSecao}>Regra do período</b>
        {aoRemover && (
          <Botao type="button" variante="fantasma" tom="erro" tamanho="pequeno" onClick={aoRemover}>
            <Trash2 size={14} strokeWidth={1.75} />
            Remover segmento
          </Botao>
        )}
      </div>

      <div className={estilos.campos}>
        <Campo rotulo="Início da cautelar" obrigatorio>
          <EntradaControle type="date" value={segmento.dataInicio} onChange={(e) => set('dataInicio', e.target.value)} />
        </Campo>
        <Campo rotulo="Fim da cautelar" obrigatorio>
          <EntradaControle type="date" value={segmento.dataFim} onChange={(e) => set('dataFim', e.target.value)} />
        </Campo>

        {avancado && (
          <>
            <Campo
              rotulo="Data/hora exata de início (opcional)"
              ajuda="Use quando a cautelar começa no meio do dia — evita computar horas anteriores."
            >
              <EntradaControle
                type="datetime-local"
                value={segmento.dataHoraInicioExata ?? ''}
                onChange={(e) => set('dataHoraInicioExata', e.target.value || undefined)}
              />
            </Campo>
            <Campo
              rotulo="Data/hora exata de fim (opcional)"
              ajuda="Use quando a cautelar termina ou é revogada no meio do dia."
            >
              <EntradaControle
                type="datetime-local"
                value={segmento.dataHoraFimExata ?? ''}
                onChange={(e) => set('dataHoraFimExata', e.target.value || undefined)}
              />
            </Campo>
          </>
        )}

        <Campo rotulo="Início do horário noturno" obrigatorio>
          <EntradaControle type="time" value={segmento.horaInicioNoturno} onChange={(e) => set('horaInicioNoturno', e.target.value)} />
        </Campo>
        <Campo rotulo="Fim do horário noturno" obrigatorio ajuda="Pode cair no dia seguinte.">
          <EntradaControle type="time" value={segmento.horaFimNoturno} onChange={(e) => set('horaFimNoturno', e.target.value)} />
        </Campo>

        <SeletorDiasSemana
          rotulo="Dias em que a regra noturna se inicia"
          valor={segmento.diasSemanaNoturno}
          aoMudar={(v) => set('diasSemanaNoturno', v)}
        />
        <SeletorDiasSemana
          rotulo="Dias de folga integral"
          valor={segmento.diasFolgaIntegral}
          aoMudar={(v) => set('diasFolgaIntegral', v)}
        />

        {/* 🔴 Fica no modo SIMPLES também, e não só no avançado: é uma escolha jurídica do caso
         *  (computar feriado nacional como dia cheio), não uma configuração de exceção. */}
        <label className={estilos.alternadorModo}>
          <input
            type="checkbox"
            checked={segmento.incluirFeriadosUteis}
            onChange={(e) => set('incluirFeriadosUteis', e.target.checked)}
          />
          Computar feriados nacionais que caem em dias úteis como dia integral (24h)
        </label>

        {avancado && (
          <>
            <div className={estilos.editorLista}>
              <div className={estilos.editorCabecalho}>
                <span className={estilos.rotuloGrupo}>Feriados de recolhimento integral</span>
                <Botao type="button" tamanho="pequeno" onClick={() => set('feriadosIntegral', [...segmento.feriadosIntegral, ''])}>
                  <Plus size={14} strokeWidth={2} />
                  Adicionar
                </Botao>
              </div>
              {segmento.feriadosIntegral.map((data, indice) => (
                <div key={indice} className={estilos.linhaIntervalo}>
                  <Campo rotulo={`Feriado ${indice + 1}`}>
                    <EntradaControle
                      type="date"
                      value={data}
                      onChange={(e) => {
                        const proximos = [...segmento.feriadosIntegral]
                        proximos[indice] = e.target.value
                        set('feriadosIntegral', proximos)
                      }}
                    />
                  </Campo>
                  <Botao
                    type="button"
                    variante="fantasma"
                    tom="erro"
                    soIcone
                    aria-label="Remover feriado"
                    onClick={() => set('feriadosIntegral', segmento.feriadosIntegral.filter((_, i) => i !== indice))}
                  >
                    <Trash2 size={14} strokeWidth={1.75} />
                  </Botao>
                </div>
              ))}
            </div>

          </>
        )}
      </div>
    </div>
  )
}
