'use client'

import { useState } from 'react'
import { Copy } from 'lucide-react'
import Drawer from '@/components/ui/Drawer'
import Botao from '@/components/ui/Botao'
import estilos from './PeticaoOverlay.module.css'

/** Diferente do CIC (indulto/comutação), detração só tem um texto — sem etapa de escolha. */
export default function PeticaoOverlay({
  aberto,
  aoFechar,
  texto,
}: {
  aberto: boolean
  aoFechar: () => void
  texto: string
}) {
  const [copiado, setCopiado] = useState(false)

  function fechar() {
    setCopiado(false)
    aoFechar()
  }

  async function copiar() {
    await navigator.clipboard.writeText(texto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 3000)
  }

  return (
    <Drawer aberto={aberto} titulo="Petição" onFechar={fechar}>
      <div className={estilos.corpo}>
        <pre className={estilos.texto}>{texto}</pre>
        <div className={estilos.acoes}>
          <Botao variante="primario" onClick={copiar}>
            <Copy size={16} strokeWidth={2} aria-hidden="true" />
            {copiado ? 'Copiado!' : 'Copiar'}
          </Botao>
        </div>
      </div>
    </Drawer>
  )
}
