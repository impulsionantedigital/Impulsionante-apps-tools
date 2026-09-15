'use client'

import { useMemo, useState } from 'react'
import Formulario from './Formulario'
import Resultado from './Resultado'
import BarraSalvar from './BarraSalvar'
import { calcular } from '@/lib/detracao/recolhimento-noturno/motor'
import { paraInstante } from '@/lib/detracao/recolhimento-noturno/intervalos'
import { entradaFormularioParaCalculo, segmentoFormularioEmBranco } from '@/lib/detracao/recolhimento-noturno/formulario'
import type { EntradaFormulario } from '@/lib/detracao/recolhimento-noturno/formulario'
import type { EntradaCalculo, ResultadoCalculo } from '@/lib/detracao/recolhimento-noturno/tipos'
import estilos from './calculadora.module.css'

/** O `fim` salvo é sempre exclusivo (ex.: "dia seguinte às 00:00" para representar o último dia
 *  inteiro — ver `formulario.ts`). Mostrar essa data direto no campo "Fim da cautelar" adiantaria
 *  um dia na tela; a data exibida é a do ÚLTIMO INSTANTE ainda dentro da janela. */
function dataFimExibicao(fimISO: string): string {
  return new Date(paraInstante(fimISO) - 1).toISOString().slice(0, 10)
}

function entradaInicial(inicial?: EntradaCalculo): EntradaFormulario {
  if (!inicial) {
    return { timezone: 'America/Sao_Paulo', segmentos: [segmentoFormularioEmBranco()] }
  }
  return {
    timezone: inicial.timezone,
    observacoes: inicial.observacoes,
    monitoramentoEletronico: inicial.monitoramentoEletronico,
    // O segmento salvo já tem `inicio`/`fim` exatos — reaproveitados como data/hora exata, para
    // que reabrir um cálculo nunca perca precisão nem recalcule diferente do que foi gravado.
    // `dataInicio`/`dataFim` só alimentam a EXIBIÇÃO do modo simples; quem manda no recálculo é
    // sempre `dataHoraInicioExata`/`dataHoraFimExata` (ver `segmentoParaRegra`).
    segmentos: inicial.segmentos.map((s) => ({
      dataInicio: s.inicio.slice(0, 10),
      dataFim: dataFimExibicao(s.fim),
      dataHoraInicioExata: s.inicio,
      dataHoraFimExata: s.fim,
      horaInicioNoturno: s.horaInicioNoturno,
      horaFimNoturno: s.horaFimNoturno,
      diasSemanaNoturno: s.diasSemanaNoturno,
      diasFolgaIntegral: s.diasFolgaIntegral,
      feriadosIntegral: s.feriadosIntegral,
      intervalosAdicionais: s.intervalosAdicionais,
      intervalosExcluidos: s.intervalosExcluidos,
    })),
  }
}

export default function Calculadora({
  inicial,
  calculoId,
  tituloInicial,
  somenteLeitura,
}: {
  inicial?: EntradaCalculo
  calculoId?: string
  tituloInicial?: string
  somenteLeitura?: boolean
}) {
  const [entrada, setEntrada] = useState<EntradaFormulario>(() => entradaInicial(inicial))
  const [avancado, setAvancado] = useState(() => Boolean(inicial && inicial.segmentos.length > 1))
  const [titulo, setTitulo] = useState(tituloInicial ?? '')

  // Sair do modo avançado descarta segmentos extras — em modo simples só o primeiro é editável,
  // e deixá-los "escondidos" contribuindo pro cálculo confundiria o membro (ver spec §4).
  function mudarAvancado(v: boolean) {
    setAvancado(v)
    if (!v) setEntrada((e) => ({ ...e, segmentos: e.segmentos.slice(0, 1) }))
  }

  const resultado = useMemo<{ ok: true; valor: ResultadoCalculo } | { ok: false; erro: string }>(() => {
    try {
      return { ok: true, valor: calcular(entradaFormularioParaCalculo(entrada)) }
    } catch (err) {
      return { ok: false, erro: err instanceof Error ? err.message : 'Confira os dados do cálculo.' }
    }
  }, [entrada])

  return (
    <div className={estilos.layout}>
      <div className={estilos.coluna}>
        {!somenteLeitura && (
          <BarraSalvar
            entrada={entrada}
            calculoId={calculoId}
            titulo={titulo}
            aoMudarTitulo={setTitulo}
          />
        )}
        <fieldset disabled={somenteLeitura} className={estilos.fieldsetSemBorda}>
          <Formulario entrada={entrada} aoMudar={setEntrada} avancado={avancado} aoMudarAvancado={mudarAvancado} />
        </fieldset>
      </div>
      <div className={estilos.coluna}>
        {resultado.ok ? (
          <Resultado resultado={resultado.valor} />
        ) : (
          <p className={estilos.mensagem} data-tom="erro" role="alert">
            {resultado.erro}
          </p>
        )}
      </div>
    </div>
  )
}
