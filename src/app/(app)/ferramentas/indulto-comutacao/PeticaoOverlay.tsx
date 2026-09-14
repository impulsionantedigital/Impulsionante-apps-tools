// src/app/(app)/ferramentas/indulto-comutacao/PeticaoOverlay.tsx
'use client'

import { useState } from 'react'
import { Copy } from 'lucide-react'
import Drawer from '@/components/ui/Drawer'
import Botao from '@/components/ui/Botao'
import estilos from './PeticaoOverlay.module.css'

type Tipo = 'indulto' | 'comutacao'

export default function PeticaoOverlay({
  aberto,
  aoFechar,
  temIndulto,
  temComutacao,
  gerarTexto,
}: {
  aberto: boolean
  aoFechar: () => void
  temIndulto: boolean
  temComutacao: boolean
  gerarTexto: (tipo: Tipo) => string
}) {
  const [tipo, setTipo] = useState<Tipo | null>(null)
  const [copiado, setCopiado] = useState(false)

  // Só uma opção aplicável: pula a tela de escolha e vai direto para o texto.
  const soUmaOpcao = temIndulto !== temComutacao
  const tipoEfetivo = tipo ?? (soUmaOpcao ? (temIndulto ? 'indulto' : 'comutacao') : null)
  const textoGerado = tipoEfetivo ? gerarTexto(tipoEfetivo) : ''

  function fechar() {
    setTipo(null)
    setCopiado(false)
    aoFechar()
  }

  async function copiar() {
    await navigator.clipboard.writeText(textoGerado)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 3000)
  }

  return (
    <Drawer aberto={aberto} titulo="Petição" onFechar={fechar}>
      {!tipoEfetivo ? (
        <div className={estilos.escolha}>
          <p>Qual petição deseja gerar?</p>
          {temIndulto && (
            <Botao variante="secundario" onClick={() => setTipo('indulto')}>
              Petição de indulto
            </Botao>
          )}
          {temComutacao && (
            <Botao variante="secundario" onClick={() => setTipo('comutacao')}>
              Petição de comutação
            </Botao>
          )}
        </div>
      ) : (
        <div className={estilos.corpo}>
          <pre className={estilos.texto}>{textoGerado}</pre>
          <div className={estilos.acoes}>
            <Botao variante="primario" onClick={copiar}>
              <Copy size={16} strokeWidth={2} aria-hidden="true" />
              {copiado ? 'Copiado!' : 'Copiar'}
            </Botao>
            {!soUmaOpcao && (
              <Botao variante="fantasma" onClick={() => setTipo(null)}>
                Voltar
              </Botao>
            )}
          </div>
        </div>
      )}
    </Drawer>
  )
}
