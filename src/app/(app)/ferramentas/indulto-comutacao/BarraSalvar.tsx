'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Botao from '@/components/ui/Botao'
// Mesmo vocabulário de formulário do produto que o Questionario.tsx já usa —
// os apelidos evitam a colisão com os tipos de domínio `Campo`/`Entrada`.
import { Campo as CampoUI, Entrada as EntradaControle } from '@/components/ui/Campo'
import type { Entrada, MotorDecreto } from '@/lib/indulto-comutacao/tipos'
import { atualizarCalculo, salvarCalculo } from './acoes'
import estilos from './calculadora.module.css'

type Aviso = { tom: 'ok' | 'erro'; texto: string }

/**
 * Salva o cálculo em andamento: sem `calculoId` cria, com ele atualiza.
 *
 * Manda a ENTRADA, nunca o resultado — o servidor recalcula com o motor. O
 * padrão de aviso é o de `src/app/(app)/negocios/Board.tsx`: o componente
 * chama a action direto e mostra um aviso local que some sozinho.
 */
export default function BarraSalvar({
  motor,
  entrada,
  calculoId,
  tituloInicial = '',
}: {
  motor: MotorDecreto
  entrada: Entrada
  calculoId?: string
  tituloInicial?: string
}) {
  const router = useRouter()
  const [titulo, setTitulo] = useState(tituloInicial)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [pendente, iniciar] = useTransition()

  function avisar(tom: Aviso['tom'], texto: string) {
    setAviso({ tom, texto })
    setTimeout(() => setAviso(null), 6000)
  }

  function salvar() {
    iniciar(async () => {
      if (calculoId) {
        const r = await atualizarCalculo({ id: calculoId, titulo, decretoId: motor.id, entrada })
        if ('erro' in r) return avisar('erro', r.erro)
        avisar('ok', 'Alterações salvas.')
        router.refresh()
        return
      }
      const r = await salvarCalculo({ titulo, decretoId: motor.id, entrada })
      if ('erro' in r) return avisar('erro', r.erro)
      router.push(`/ferramentas/indulto-comutacao/${r.id}`)
    })
  }

  return (
    <div className={estilos.barra}>
      <CampoUI
        rotulo="Título do cálculo"
        ajuda="Use o nº de execução para não guardar o nome do sentenciado."
        className={estilos.campoTitulo}
      >
        {/* 🔴 O botão fica DENTRO do campo, na mesma linha do input, e não ao lado do campo
            inteiro. Fora, ele se alinhava pelo fim do bloco — que inclui o texto de ajuda
            abaixo do input — e descia um degrau. Aqui a ajuda passa a correr sob os dois. */}
        <div className={estilos.linhaTitulo}>
          <EntradaControle
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Nº de execução ou identificação do caso"
            maxLength={200}
          />
          <Botao variante="primario" onClick={salvar} carregando={pendente} desabilitado={pendente}>
            {calculoId ? 'Salvar alterações' : 'Salvar cálculo'}
          </Botao>
        </div>
      </CampoUI>
      {aviso && (
        <p
          role={aviso.tom === 'erro' ? 'alert' : 'status'}
          className={estilos.mensagem}
          data-tom={aviso.tom}
        >
          {aviso.texto}
        </p>
      )}
    </div>
  )
}
