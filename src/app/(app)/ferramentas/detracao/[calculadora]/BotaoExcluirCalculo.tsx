'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import Botao from '@/components/ui/Botao'
import { excluirCalculo } from './acoes'

export default function BotaoExcluirCalculo({ id }: { id: string }) {
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function handleExcluir() {
    setErro(null)
    iniciar(async () => {
      const r = await excluirCalculo(id)
      if ('erro' in r) {
        setErro(r.erro)
        return
      }
      // Revalidar a página após exclusão
      window.location.reload()
    })
  }

  return (
    <>
      <Botao
        type="button"
        variante="fantasma"
        tom="erro"
        tamanho="pequeno"
        carregando={pendente}
        onClick={handleExcluir}
        title="Excluir este cálculo"
      >
        <Trash2 size={14} strokeWidth={1.75} />
      </Botao>
      {erro && (
        <p style={{ color: 'var(--erro)', fontSize: '0.875rem', margin: '0.5rem 0 0' }}>
          {erro}
        </p>
      )}
    </>
  )
}
