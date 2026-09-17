'use client'

import { Plus, Trash2 } from 'lucide-react'
import Botao from '@/components/ui/Botao'
import { Campo, Entrada as EntradaControle } from '@/components/ui/Campo'
import { ROTULOS_DIA_SEMANA, WEEKDAYS } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-1/tipos'
import type { Weekday } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-1/tipos'
import type { SegmentoFormulario } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-1/formulario'
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

// 🔴 O MODO SIMPLES É O ÚNICO a partir da RN-2.1. Não há mais a prop `avancado`: todos os campos
// aparecem sempre, e os feriados municipais/estaduais — que eram a última coisa escondida atrás do
// modo avançado — passam a ser preenchidos aqui, ao lado dos nacionais.

export default function CamposSegmento({
  segmento,
  aoMudar,
}: {
  segmento: SegmentoFormulario
  aoMudar: (s: SegmentoFormulario) => void
}) {
  function set<K extends keyof SegmentoFormulario>(campo: K, valor: SegmentoFormulario[K]) {
    aoMudar({ ...segmento, [campo]: valor })
  }

  return (
    <div className={estilos.secao}>
      <div className={estilos.editorCabecalho}>
        <b className={estilos.tituloSecao}>Regra do período</b>
      </div>

      <div className={estilos.campos}>
        <Campo rotulo="Início da cautelar" obrigatorio>
          <EntradaControle type="date" value={segmento.dataInicio} onChange={(e) => set('dataInicio', e.target.value)} />
        </Campo>
        <Campo rotulo="Fim da cautelar" obrigatorio ajuda="O último dia conta por inteiro.">
          <EntradaControle type="date" value={segmento.dataFim} onChange={(e) => set('dataFim', e.target.value)} />
        </Campo>

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

        {/* Feriados NACIONAIS: lista homologada de `feriados.ts`, ligada por este checkbox. */}
        <label className={estilos.alternadorModo}>
          <input
            type="checkbox"
            checked={segmento.incluirFeriadosUteis}
            onChange={(e) => set('incluirFeriadosUteis', e.target.checked)}
          />
          Computar feriados nacionais que caem em dias úteis como dia integral (24h)
        </label>

        {/* 🔴 Feriados MUNICIPAIS e ESTADUAIS. Não há lista automática possível — dependem de lei
         *  local —, então o membro digita cada um. Vêm do modo avançado na RN-2.1: o motor já os
         *  lia desde a RN-2.0, e o que faltava era um jeito de preenchê-los que não fosse escondido. */}
        <div className={estilos.editorLista}>
          <div className={estilos.editorCabecalho}>
            <span className={estilos.rotuloGrupo}>Feriados municipais e estaduais</span>
            <Botao
              type="button"
              tamanho="pequeno"
              onClick={() => set('feriadosIntegral', [...segmento.feriadosIntegral, ''])}
            >
              <Plus size={14} strokeWidth={2} />
              Adicionar
            </Botao>
          </div>
          {segmento.feriadosIntegral.length === 0 && (
            <p className={estilos.ajudaGrupo}>
              Nenhum. Use para os feriados da comarca ou do estado que a decisão mande computar por inteiro.
            </p>
          )}
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
      </div>
    </div>
  )
}
