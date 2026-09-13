'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import Botao from '@/components/ui/Botao'
import { excluirCalculo } from './acoes'
import estilos from './calculadora.module.css'

/**
 * Exclusão em duas etapas, no padrão do produto (`_crm/ExcluirAtividade.tsx`,
 * `_crm/BotaoExcluir.tsx`): o primeiro clique só abre a confirmação — nunca
 * `window.confirm`. O nome é `ExcluirCalculo`, não `BotaoExcluir`, para não
 * existirem dois componentes com o mesmo nome no projeto.
 *
 * Não reaproveita o `_crm/BotaoExcluir`: ele chama `aoExcluir({ id })` com
 * objeto (aqui `excluirCalculo` recebe a string direto), amarra o `alvo` ao
 * tipo fechado `AlvoExclusao` (contato/empresa/negócio) e troca qualquer erro
 * por "Não consegui excluir" — esta tela precisa mostrar a mensagem que a
 * action devolver (ex.: o cálculo já não existe mais na conta do membro).
 *
 * A exclusão é o direito do membro sobre dado pessoal de terceiro (spec §9):
 * tem de funcionar, e a confirmação tem de deixar claro que não dá para
 * desfazer.
 */
export default function ExcluirCalculo({ id }: { id: string }) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function excluir() {
    setErro(null)
    iniciar(async () => {
      const r = await excluirCalculo(id)
      if ('erro' in r) {
        setErro(r.erro)
        return
      }
      router.push('/ferramentas/indulto-comutacao')
      router.refresh()
    })
  }

  if (!confirmando) {
    return (
      <div className={estilos.excluirWrap}>
        <Botao
          type="button"
          variante="fantasma"
          tom="erro"
          carregando={pendente}
          onClick={() => setConfirmando(true)}
        >
          <Trash2 size={14} strokeWidth={1.75} />
          Excluir este cálculo
        </Botao>
        {erro && (
          <p className={estilos.mensagem} data-tom="erro" role="alert">
            {erro}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className={estilos.excluirWrap}>
      <div className={estilos.confirmaExcluir} role="alertdialog" aria-live="polite">
        <p className={estilos.confirmaTexto}>
          Este cálculo será apagado de vez, com tudo o que foi respondido nele. Não dá para
          desfazer.
        </p>
        <div className={estilos.confirmaAcoes}>
          <Botao
            type="button"
            variante="primario"
            tom="erro"
            carregando={pendente}
            onClick={excluir}
          >
            {pendente ? 'Excluindo…' : 'Excluir mesmo assim'}
          </Botao>
          <Botao type="button" carregando={pendente} onClick={() => setConfirmando(false)}>
            Cancelar
          </Botao>
        </div>
        {erro && (
          <p className={estilos.mensagem} data-tom="erro" role="alert">
            {erro}
          </p>
        )}
      </div>
    </div>
  )
}
