'use client'

import { Plus, Trash2 } from 'lucide-react'
import Botao from '@/components/ui/Botao'
import { Campo, Entrada as EntradaControle } from '@/components/ui/Campo'
import { ROTULOS_DIA_SEMANA, WEEKDAYS } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-2/tipos'
import type { Weekday } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-2/tipos'
import type { SegmentoFormulario } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-2/formulario'
import estilos from './calculadora.module.css'

function SeletorDiasSemana({
  rotulo,
  valor,
  aoMudar,
  alternar,
  campo,
}: {
  rotulo: string
  valor: Weekday[]
  /** Chamado ao clicar num dia — recebe QUAL lista e qual dia, para tirar o dia da outra lista. */
  aoMudar: (v: Weekday[]) => void
  /** Presente quando o seletor faz parte de um par exclusivo. Sem ele, o clique só alterna nesta
   *  lista (é o comportamento de um seletor isolado). */
  alternar?: (campo: 'diasSemanaNoturno' | 'diasFolgaIntegral', dia: Weekday) => void
  campo?: 'diasSemanaNoturno' | 'diasFolgaIntegral'
}) {
  function clicar(dia: Weekday) {
    if (alternar && campo) return alternar(campo, dia)
    aoMudar(valor.includes(dia) ? valor.filter((d) => d !== dia) : [...valor, dia])
  }
  return (
    <div className={estilos.campoTempo}>
      <span className={estilos.rotuloGrupo}>{rotulo}</span>
      <div className={estilos.diasSemana}>
        {WEEKDAYS.map((dia) => (
          <label key={dia} className={estilos.diaSemanaItem}>
            <input type="checkbox" checked={valor.includes(dia)} onChange={() => clicar(dia)} />
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

  /** 🔴 Marca ou desmarca um dia em UMA das listas, tirando-o da outra.
   *
   *  As duas listas alimentam o mesmo motor com valores diferentes — `diasSemanaNoturno` vale
   *  H_NOTURNO, `diasFolgaIntegral` vale 24h. O mesmo dia nas duas deixava a decisão ambígua na
   *  tela: o motor resolvia por precedência (folga ganha), mas o membro não tinha como saber qual
   *  valeria.
   *
   *  A exclusão acontece AQUI, e não desabilitando a caixa na outra linha: todos os dias ficam
   *  clicáveis, e marcar num lado apenas move o dia para lá. O `Campo` de cada seletor continua
   *  tratando o próprio array — a troca entre os dois é responsabilidade de quem vê os dois. */
  function alternarDia(campo: 'diasSemanaNoturno' | 'diasFolgaIntegral', dia: Weekday) {
    const outro = campo === 'diasSemanaNoturno' ? 'diasFolgaIntegral' : 'diasSemanaNoturno'
    const atual = segmento[campo]
    const marcando = !atual.includes(dia)
    aoMudar({
      ...segmento,
      [campo]: marcando ? [...atual, dia] : atual.filter((d) => d !== dia),
      // Só precisa limpar o outro lado ao MARCAR: desmarcar não pode afetar a outra lista.
      [outro]: marcando ? segmento[outro].filter((d) => d !== dia) : segmento[outro],
    })
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

        {/* 🔴 Um dia não pode estar nas DUAS linhas. Marcar num lado TIRA o dia do outro — todos
         *  os dias ficam clicáveis, e a exclusão acontece na marcação (ver `alternarDia`). */}
        <SeletorDiasSemana
          rotulo="Dias em que a regra noturna se inicia"
          valor={segmento.diasSemanaNoturno}
          aoMudar={(v) => set('diasSemanaNoturno', v)}
          alternar={alternarDia}
          campo="diasSemanaNoturno"
        />
        <SeletorDiasSemana
          rotulo="Dias de folga integral"
          valor={segmento.diasFolgaIntegral}
          aoMudar={(v) => set('diasFolgaIntegral', v)}
          alternar={alternarDia}
          campo="diasFolgaIntegral"
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
         *  local —, então o membro digita cada um, com a data e o NOME. O nome não entra na conta;
         *  ele existe para o resumo e o anexo dizerem DE QUE feriado se trata, o que "09/07/2025"
         *  sozinho não faz. */}
        <div className={estilos.blocoSeparado}>
          <div className={estilos.editorCabecalho}>
            <span className={estilos.rotuloGrupo}>Feriados municipais e estaduais</span>
            <Botao
              type="button"
              tamanho="pequeno"
              onClick={() => set('feriadosIntegral', [...segmento.feriadosIntegral, { data: '', nome: '' }])}
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
          {segmento.feriadosIntegral.map((feriado, indice) => (
            <div key={indice} className={estilos.linhaIntervalo}>
              <Campo rotulo="Data" obrigatorio>
                <EntradaControle
                  type="date"
                  value={feriado.data}
                  onChange={(e) => {
                    const proximos = [...segmento.feriadosIntegral]
                    proximos[indice] = { ...feriado, data: e.target.value }
                    set('feriadosIntegral', proximos)
                  }}
                />
              </Campo>
              <Campo
                rotulo="Nome do feriado"
                ajuda="Ex.: Aniversário da cidade, Dia do Evangélico."
                className={estilos.campoNomeFeriado}
              >
                <EntradaControle
                  value={feriado.nome ?? ''}
                  maxLength={120}
                  placeholder="Ex.: Aniversário da cidade"
                  onChange={(e) => {
                    const proximos = [...segmento.feriadosIntegral]
                    proximos[indice] = { ...feriado, nome: e.target.value }
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
