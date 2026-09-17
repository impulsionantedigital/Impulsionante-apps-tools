'use client'

import Botao from '@/components/ui/Botao'
import { Campo, Entrada as EntradaControle, AreaTexto, Selecao } from '@/components/ui/Campo'
import CamposSegmento from './CamposSegmento'
import { versaoAtual, versaoPorRotulo } from '@/lib/detracao/recolhimento-noturno/versoes/registro'
import type { EntradaFormulario, SegmentoFormulario } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-0/formulario'
import estilos from './calculadora.module.css'

export default function Formulario({
  versao,
  entrada,
  aoMudar,
  avancado,
  aoMudarAvancado,
}: {
  /** 🔴 O rótulo da versão em uso — é ele que decide o `emBranco` de um segmento novo. Vem do
   *  pacote resolvido na `Calculadora` (ver `versoes/registro.ts`). */
  versao?: string
  entrada: EntradaFormulario
  aoMudar: (e: EntradaFormulario) => void
  avancado: boolean
  aoMudarAvancado: (v: boolean) => void
}) {
  function mudarSegmento(indice: number, s: SegmentoFormulario) {
    aoMudar({ ...entrada, segmentos: entrada.segmentos.map((seg, i) => (i === indice ? s : seg)) })
  }

  function adicionarSegmento() {
    // 🔴 O segmento em branco vem do PACOTE da versão em uso, e não de um import direto: uma versão
    // nova pode ter campos que a atual não tem, e é o formulário DELA que tem de aparecer.
    const pacote = versaoPorRotulo(versao ?? '') ?? versaoAtual()
    aoMudar({ ...entrada, segmentos: [...entrada.segmentos, pacote.formulario.emBranco()] })
  }

  function removerSegmento(indice: number) {
    aoMudar({ ...entrada, segmentos: entrada.segmentos.filter((_, i) => i !== indice) })
  }

  return (
    <div className={estilos.questionario}>
      <label className={estilos.alternadorModo}>
        <input type="checkbox" checked={avancado} onChange={(e) => aoMudarAvancado(e.target.checked)} />
        Modo avançado — múltiplos segmentos, feriados, exclusões e intervalos especiais
      </label>

      {entrada.segmentos.map((segmento, indice) => (
        <CamposSegmento
          key={indice}
          segmento={segmento}
          aoMudar={(s) => mudarSegmento(indice, s)}
          aoRemover={avancado && entrada.segmentos.length > 1 ? () => removerSegmento(indice) : undefined}
          avancado={avancado}
        />
      ))}

      {avancado && (
        <Botao type="button" variante="secundario" onClick={adicionarSegmento}>
          Adicionar segmento de regra (mudança de horário ou revogação no meio do período)
        </Botao>
      )}

      {avancado && (
        <div className={estilos.secao}>
          <b className={estilos.tituloSecao}>Outras informações</b>
          <div className={estilos.campos}>
            <Campo rotulo="Fuso horário" ajuda="Datas/horas locais da decisão.">
              <EntradaControle value={entrada.timezone} onChange={(e) => aoMudar({ ...entrada, timezone: e.target.value })} />
            </Campo>
            <Campo rotulo="Monitoramento eletrônico" ajuda="Informativo — nunca altera o cálculo.">
              <Selecao
                value={entrada.monitoramentoEletronico ?? 'nao_informado'}
                onChange={(e) =>
                  aoMudar({ ...entrada, monitoramentoEletronico: e.target.value as EntradaFormulario['monitoramentoEletronico'] })
                }
              >
                <option value="nao_informado">Não informado</option>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </Selecao>
            </Campo>
            <Campo rotulo="Observações" ajuda="Informação de auditoria, sem efeito matemático.">
              <AreaTexto value={entrada.observacoes ?? ''} onChange={(e) => aoMudar({ ...entrada, observacoes: e.target.value })} rows={3} />
            </Campo>
          </div>
        </div>
      )}
    </div>
  )
}
