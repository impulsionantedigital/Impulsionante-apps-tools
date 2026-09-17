'use client'

import { useMemo, useState } from 'react'
import Formulario from './Formulario'
import Resultado from './Resultado'
import Resumo from './Resumo'
import CabecalhoAnexo from './CabecalhoAnexo'
import BarraSalvar from './BarraSalvar'
import BotaoImprimir from './BotaoImprimir'
import BotaoPeticao from './BotaoPeticao'
import { versaoPorRotulo, versaoAtual, pacoteTipado } from '@/lib/detracao/recolhimento-noturno/versoes/registro'
import type { EntradaCalculo, ResultadoCalculo } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-1/tipos'
import type { EntradaFormulario, SegmentoFormulario } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-1/formulario'
import estilos from './calculadora.module.css'

/** 🔴 SEM MODO AVANÇADO (RN-2.1): a entrada é UM período, e o formulário tem exatamente os campos
 *  que o motor lê. Não há mais segmentos extras, fuso, monitoramento nem observações — os três
 *  últimos eram metadados de auditoria que nunca entraram na conta, e os múltiplos segmentos eram
 *  o que obrigava o modo avançado a existir. */
function entradaInicial(inicial?: EntradaCalculo): EntradaFormulario {
  if (!inicial || inicial.segmentos.length === 0) {
    return { segmentos: [versaoAtual().formulario.emBranco() as SegmentoFormulario] }
  }
  // O cálculo salvo pode ter mais de um segmento (gravado quando o modo avançado existia). A tela
  // edita só o primeiro — os outros continuariam contando no total sem aparecer para o membro, que
  // é o defeito que a RN-2.1 veio eliminar.
  const s = inicial.segmentos[0]
  return {
    segmentos: [
      {
        dataInicio: s.dataInicio,
        dataFim: s.dataFim,
        horaInicioNoturno: s.horaInicioNoturno,
        horaFimNoturno: s.horaFimNoturno,
        diasSemanaNoturno: s.diasSemanaNoturno,
        diasFolgaIntegral: s.diasFolgaIntegral,
        feriadosIntegral: s.feriadosIntegral,
        incluirFeriadosUteis: s.incluirFeriadosUteis ?? false,
      },
    ],
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
  // 🔴 O pacote resolvido e tipado para o formulário da versão. É AQUI, e só aqui, que os tipos do
  // registro heterogêneo se encontram com os do formulário — ver `pacoteTipado` em `registro.ts`.
  const pacote = pacoteTipado<SegmentoFormulario, EntradaFormulario, EntradaCalculo>(
    versaoPorRotulo(rotulo) ?? versaoAtual(),
  )
  const [entrada, setEntrada] = useState<EntradaFormulario>(() => entradaInicial(inicial))
  const [titulo, setTitulo] = useState(tituloInicial ?? '')

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
          <Formulario versao={pacote.versao} entrada={entrada} aoMudar={setEntrada} />
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
            <Resumo entrada={entrada} resultado={exibido} />
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
