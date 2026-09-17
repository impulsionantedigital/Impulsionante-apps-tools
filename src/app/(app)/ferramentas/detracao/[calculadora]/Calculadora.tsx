'use client'

import { useMemo, useState } from 'react'
import Formulario from './Formulario'
import Resultado from './Resultado'
import Resumo from './Resumo'
import CabecalhoAnexo from './CabecalhoAnexo'
import BarraSalvar from './BarraSalvar'
import BotaoImprimir from './BotaoImprimir'
import BotaoPeticao from './BotaoPeticao'
import { calcular } from '@/lib/detracao/recolhimento-noturno/motor'
import { entradaFormularioParaCalculo, segmentoFormularioEmBranco } from '@/lib/detracao/recolhimento-noturno/formulario'
import type { EntradaFormulario } from '@/lib/detracao/recolhimento-noturno/formulario'
import type { EntradaCalculo, ResultadoCalculo } from '@/lib/detracao/recolhimento-noturno/tipos'
import estilos from './calculadora.module.css'

function entradaInicial(inicial?: EntradaCalculo): EntradaFormulario {
  if (!inicial) {
    return { timezone: 'America/Sao_Paulo', segmentos: [segmentoFormularioEmBranco()] }
  }
  return {
    timezone: inicial.timezone,
    observacoes: inicial.observacoes,
    monitoramentoEletronico: inicial.monitoramentoEletronico,
    segmentos: inicial.segmentos.map((s) => ({
      dataInicio: s.dataInicio,
      dataFim: s.dataFim,
      horaInicioNoturno: s.horaInicioNoturno,
      horaFimNoturno: s.horaFimNoturno,
      diasSemanaNoturno: s.diasSemanaNoturno,
      diasFolgaIntegral: s.diasFolgaIntegral,
      feriadosIntegral: s.feriadosIntegral,
      // `?? false`: cálculos gravados antes deste campo existir (RN-1.1 e anteriores) não o têm
      // no jsonb, e reabri-los não pode quebrar a tela.
      incluirFeriadosUteis: s.incluirFeriadosUteis ?? false,
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

  const calculo = useMemo<{ ok: true; entrada: EntradaCalculo; valor: ResultadoCalculo } | { ok: false; erro: string }>(() => {
    try {
      const e = entradaFormularioParaCalculo(entrada)
      return { ok: true, entrada: e, valor: calcular(e) }
    } catch (err) {
      return { ok: false, erro: err instanceof Error ? err.message : 'Confira os dados do cálculo.' }
    }
  }, [entrada])

  return (
    <div className={estilos.layout}>
      <div className={estilos.coluna}>
        <fieldset disabled={somenteLeitura} className={estilos.fieldsetSemBorda}>
          <Formulario entrada={entrada} aoMudar={setEntrada} avancado={avancado} aoMudarAvancado={mudarAvancado} />
        </fieldset>
      </div>
      <div className={estilos.coluna}>
        {somenteLeitura ? (
          <div className={estilos.barraImprimir}>
            <BotaoImprimir />
            {calculo.ok && <BotaoPeticao entrada={calculo.entrada} resultado={calculo.valor} />}
          </div>
        ) : (
          <BarraSalvar
            entrada={entrada}
            calculoId={calculoId}
            titulo={titulo}
            aoMudarTitulo={setTitulo}
            acoesExtras={
              <>
                <BotaoImprimir />
                {calculo.ok && <BotaoPeticao entrada={calculo.entrada} resultado={calculo.valor} />}
              </>
            }
          />
        )}
        {calculo.ok ? (
          <>
            {/* Só no papel: identifica o caso no anexo. Ver CabecalhoAnexo.tsx. */}
            <CabecalhoAnexo titulo={titulo} calculoId={calculoId} />
            <Resultado resultado={calculo.valor} />
            <Resumo entrada={entrada} resultado={calculo.valor} observacoes={entrada.observacoes} />
          </>
        ) : (
          <p className={estilos.mensagem} data-tom="erro" role="alert">
            {calculo.erro}
          </p>
        )}
      </div>
    </div>
  )
}
