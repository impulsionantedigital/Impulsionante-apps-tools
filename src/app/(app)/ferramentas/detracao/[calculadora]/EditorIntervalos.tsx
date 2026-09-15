'use client'

import { Plus, Trash2 } from 'lucide-react'
import Botao from '@/components/ui/Botao'
import { Campo, Entrada as EntradaControle } from '@/components/ui/Campo'
import type { Intervalo, IntervaloComMotivo } from '@/lib/detracao/recolhimento-noturno/tipos'
import estilos from './calculadora.module.css'

type Linha = Intervalo | IntervaloComMotivo

/** Reusado para `intervalosAdicionais` (`comMotivo={false}`) e `intervalosExcluidos`
 *  (`comMotivo={true}`) dentro de um segmento — o único jeito de exclusão entrar no cálculo é
 *  aqui, com motivo obrigatório (nunca inferida por falta de monitoramento eletrônico). */
export default function EditorIntervalos<T extends Linha>({
  titulo,
  ajuda,
  itens,
  aoMudar,
  comMotivo,
  emBranco,
}: {
  titulo: string
  ajuda?: string
  itens: T[]
  aoMudar: (itens: T[]) => void
  comMotivo: boolean
  emBranco: T
}) {
  function atualizar(indice: number, campo: 'inicio' | 'fim' | 'motivo', valor: string) {
    aoMudar(itens.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)) as T[])
  }

  function remover(indice: number) {
    aoMudar(itens.filter((_, i) => i !== indice))
  }

  return (
    <div className={estilos.editorLista}>
      <div className={estilos.editorCabecalho}>
        <span className={estilos.rotuloGrupo}>{titulo}</span>
        <Botao type="button" tamanho="pequeno" onClick={() => aoMudar([...itens, emBranco])}>
          <Plus size={14} strokeWidth={2} />
          Adicionar
        </Botao>
      </div>
      {ajuda && <p className={estilos.ajudaGrupo}>{ajuda}</p>}
      {itens.length === 0 ? (
        <p className={estilos.ajudaGrupo}>Nenhum intervalo adicionado.</p>
      ) : (
        itens.map((item, indice) => (
          <div key={indice} className={estilos.linhaIntervalo}>
            <Campo rotulo="Início">
              <EntradaControle
                type="datetime-local"
                value={item.inicio}
                onChange={(e) => atualizar(indice, 'inicio', e.target.value)}
              />
            </Campo>
            <Campo rotulo="Fim">
              <EntradaControle
                type="datetime-local"
                value={item.fim}
                onChange={(e) => atualizar(indice, 'fim', e.target.value)}
              />
            </Campo>
            {comMotivo && (
              <Campo rotulo="Motivo">
                <EntradaControle
                  value={(item as IntervaloComMotivo).motivo}
                  onChange={(e) => atualizar(indice, 'motivo', e.target.value)}
                  placeholder="Viagem autorizada, descumprimento…"
                />
              </Campo>
            )}
            <Botao
              type="button"
              variante="fantasma"
              tom="erro"
              soIcone
              aria-label="Remover intervalo"
              onClick={() => remover(indice)}
            >
              <Trash2 size={14} strokeWidth={1.75} />
            </Botao>
          </div>
        ))
      )}
    </div>
  )
}
