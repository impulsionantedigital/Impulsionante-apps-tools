'use client'

import { useMemo, useState } from 'react'
import Formulario from './Formulario'
import Resultado from './Resultado'
import Resumo from './Resumo'
import CabecalhoAnexo from './CabecalhoAnexo'
import BarraSalvar from './BarraSalvar'
import BotaoImprimir from './BotaoImprimir'
import BotaoPeticao from './BotaoPeticao'
import { versaoPorRotulo, versaoAtual } from '@/lib/detracao/recolhimento-noturno/versoes/registro'
import type { EntradaFormulario } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-0/formulario'
import type { EntradaCalculo, ResultadoCalculo } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-0/tipos'
import estilos from './calculadora.module.css'

function entradaInicial(inicial?: EntradaCalculo): EntradaFormulario {
  if (!inicial) {
    return { timezone: 'America/Sao_Paulo', segmentos: [versaoAtual().formulario.emBranco()] }
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
  /** 🔴 A versão do MOTOR com que este cálculo é feito. Ausente em cálculo NOVO — aí vale a
   *  versão atual do registro. Num cálculo salvo, é a versão GRAVADA (`algoritmo_versao`), e é ela
   *  que decide o motor, o formulário e o resumo exibidos (ver `versoes/registro.ts`). */
  versao: rotulo = versaoAtual().versao,
  /** O resultado GRAVADO, num cálculo salvo. Presente = a tela exibe ESTE número, e não um
   *  recalculado: é o documento como ele foi salvo. Ausente = recalcula a cada tecla. */
  resultadoSalvo,
  inicial,
  calculoId,
  tituloInicial,
  somenteLeitura,
}: {
  versao?: string
  resultadoSalvo?: ResultadoCalculo
  inicial?: EntradaCalculo
  calculoId?: string
  tituloInicial?: string
  somenteLeitura?: boolean
}) {
  // 🔴 A versão vem do RÓTULO gravado e é resolvida aqui, não recebida pronta: assim o pacote
  // (motor + formulário + resumo) é sempre o mesmo objeto, e não há como a tela receber o motor de
  // uma versão com o formulário de outra.
  const pacote = versaoPorRotulo(rotulo) ?? versaoAtual()
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
      const e = pacote.formulario.paraCalculo(entrada)
      return { ok: true, entrada: e, valor: pacote.calcular(e) }
    } catch (err) {
      return { ok: false, erro: err instanceof Error ? err.message : 'Confira os dados do cálculo.' }
    }
  }, [entrada, pacote])

  // 🔴 O número que a tela mostra. Num cálculo SALVO é o GRAVADO — o documento como foi salvo, na
  // versão que o produziu. Recalcular e exibir o novo apagaria da tela o número que pode ter virado
  // petição, sem que ninguém percebesse. Num cálculo NOVO não há gravado, e aí sim recalcula.
  const exibido = resultadoSalvo ?? (calculo.ok ? calculo.valor : null)

  return (
    <div className={estilos.layout}>
      <div className={estilos.coluna}>
        <fieldset disabled={somenteLeitura} className={estilos.fieldsetSemBorda}>
          <Formulario
            versao={pacote.versao}
            entrada={entrada}
            aoMudar={setEntrada}
            avancado={avancado}
            aoMudarAvancado={mudarAvancado}
          />
        </fieldset>
      </div>
      <div className={estilos.coluna}>
        {somenteLeitura ? (
          <div className={estilos.barraImprimir}>
            <BotaoImprimir />
            {exibido && calculo.ok && <BotaoPeticao entrada={calculo.entrada} resultado={exibido} />}
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
                {exibido && calculo.ok && <BotaoPeticao entrada={calculo.entrada} resultado={exibido} />}
              </>
            }
          />
        )}
        {exibido ? (
          <>
            {/* Só no papel: identifica o caso no anexo. Ver CabecalhoAnexo.tsx. */}
            <CabecalhoAnexo titulo={titulo} calculoId={calculoId} />
            <Resultado resultado={exibido} />
            <Resumo entrada={entrada} resultado={exibido} observacoes={entrada.observacoes} />
          </>
        ) : (
          <p className={estilos.mensagem} data-tom="erro" role="alert">
            {calculo.ok ? 'Confira os dados do cálculo.' : calculo.erro}
          </p>
        )}
      </div>
    </div>
  )
}
