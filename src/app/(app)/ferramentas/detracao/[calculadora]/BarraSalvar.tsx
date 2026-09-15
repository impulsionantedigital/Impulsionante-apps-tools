'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Botao from '@/components/ui/Botao'
import { Campo as CampoUI, Entrada as EntradaControle } from '@/components/ui/Campo'
import { caminhoDoProduto } from '@/lib/produtos/catalogo'
import { entradaFormularioParaCalculo } from '@/lib/detracao/recolhimento-noturno/formulario'
import type { EntradaFormulario } from '@/lib/detracao/recolhimento-noturno/formulario'
import { atualizarCalculo, salvarCalculo } from './acoes'
import estilos from './calculadora.module.css'

type Aviso = { tom: 'ok' | 'erro'; texto: string }

const SLUG = 'recolhimento-noturno'

export default function BarraSalvar({
  entrada,
  calculoId,
  titulo,
  aoMudarTitulo,
  acoesExtras,
}: {
  entrada: EntradaFormulario
  calculoId?: string
  titulo: string
  aoMudarTitulo: (valor: string) => void
  /** Botões que entram na mesma linha do "Salvar cálculo" — hoje o Imprimir. */
  acoesExtras?: ReactNode
}) {
  const router = useRouter()
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [pendente, iniciar] = useTransition()

  function avisar(tom: Aviso['tom'], texto: string) {
    setAviso({ tom, texto })
    setTimeout(() => setAviso(null), 6000)
  }

  function salvar() {
    let entradaCalculo
    try {
      entradaCalculo = entradaFormularioParaCalculo(entrada)
    } catch (err) {
      avisar('erro', err instanceof Error ? err.message : 'Confira os dados do cálculo antes de salvar.')
      return
    }
    iniciar(async () => {
      if (calculoId) {
        const r = await atualizarCalculo({ id: calculoId, titulo, entrada: entradaCalculo })
        if ('erro' in r) return avisar('erro', r.erro)
        avisar('ok', 'Alterações salvas.')
        router.refresh()
        return
      }
      const r = await salvarCalculo({ titulo, entrada: entradaCalculo })
      if ('erro' in r) return avisar('erro', r.erro)
      router.push(`${caminhoDoProduto(SLUG)}/${r.id}`)
    })
  }

  return (
    <div className={estilos.barra}>
      <CampoUI
        rotulo="Título do cálculo"
        ajuda="Use o nº de execução para não guardar o nome do sentenciado."
        className={estilos.campoTitulo}
      >
        <div className={estilos.linhaTitulo}>
          <EntradaControle
            value={titulo}
            onChange={(e) => aoMudarTitulo(e.target.value)}
            placeholder="Nº de execução ou identificação do caso"
            maxLength={200}
          />
          <Botao variante="primario" onClick={salvar} carregando={pendente} desabilitado={pendente}>
            {calculoId ? 'Salvar alterações' : 'Salvar cálculo'}
          </Botao>
          {acoesExtras}
        </div>
      </CampoUI>
      {aviso && (
        <p role={aviso.tom === 'erro' ? 'alert' : 'status'} className={estilos.mensagem} data-tom={aviso.tom}>
          {aviso.texto}
        </p>
      )}
    </div>
  )
}
