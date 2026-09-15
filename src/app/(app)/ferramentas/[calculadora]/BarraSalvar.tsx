'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Botao from '@/components/ui/Botao'
// Mesmo vocabulário de formulário do produto que o Questionario.tsx já usa —
// os apelidos evitam a colisão com os tipos de domínio `Campo`/`Entrada`.
import { Campo as CampoUI, Entrada as EntradaControle } from '@/components/ui/Campo'
import type { Entrada, MotorDecreto } from '@/lib/indulto-comutacao/tipos'
import { caminhoDoProduto } from '@/lib/produtos/catalogo'
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
  slug,
  entrada,
  calculoId,
  titulo,
  aoMudarTitulo,
  acoesExtras,
}: {
  motor: MotorDecreto
  /** Slug da rota atual — para onde navegar depois de criar o cálculo. */
  slug: string
  entrada: Entrada
  calculoId?: string
  /** 🔴 O título vive na `Calculadora`, não aqui: o cabeçalho do anexo impresso precisa dele, e
   *  a barra some na impressão. Duas cópias do mesmo texto divergiriam ao primeiro rascunho. */
  titulo: string
  aoMudarTitulo: (valor: string) => void
  /** Botões que entram na mesma linha do "Salvar alterações" — hoje o Imprimir e, quando
   *  aplicável, a Petição. Ficam aqui, e não soltos em `Calculadora`, porque é esta linha
   *  (`.linhaTitulo`) que já resolve o alinhamento com o campo de título. */
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
      router.push(`${caminhoDoProduto(slug)}/${r.id}`)
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
