'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors,
  closestCenter, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import Link from 'next/link'
import { GripVertical, Plus } from 'lucide-react'
import {
  criarModulo, renomearModulo, excluirModulo, reordenarModulos,
  type CursoDetalhe, type ModuloResumo,
} from '@/server/cursos/acoes'
import { reordenarLista } from '@/lib/cursos/ordenar'
import { anunciosDeArraste, INSTRUCAO_DE_ARRASTE, PAPEL_ARRASTAVEL } from '@/lib/anuncios-de-arraste'
import Botao from '@/components/ui/Botao'
import { Entrada } from '@/components/ui/Campo'
import estilos from '../cursos.module.css'

const ERRO_PT: Record<string, string> = {
  titulo_vazio: 'Dê um título ao módulo.',
  curso_nao_encontrado: 'Curso não encontrado.',
  em_uso: 'Este módulo tem aulas — exclua-as antes de excluir o módulo.',
  sem_workspace: 'Não foi possível identificar seu espaço de trabalho.',
}
function traduz(e: string) { return ERRO_PT[e] ?? 'Não foi possível concluir. Tente novamente.' }

type Resposta = { ok: true } | { ok: true; id: string } | { erro: string }
type CursoComModulos = CursoDetalhe & { modulos: ModuloResumo[] }

export default function EditorModulos({ curso }: { curso: CursoComModulos }) {
  const router = useRouter()
  const [modulos, setModulos] = useState(curso.modulos)
  const [modulosDoServidor, setModulosDoServidor] = useState(curso.modulos)
  if (modulosDoServidor !== curso.modulos) { setModulosDoServidor(curso.modulos); setModulos(curso.modulos) }
  const [novo, setNovo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const [editando, setEditando] = useState<string | null>(null)
  const [nomeEditado, setNomeEditado] = useState('')

  function roda(fn: () => Promise<Resposta>, aoSucesso?: () => void) {
    setErro(null)
    iniciar(async () => {
      const r = await fn()
      if ('erro' in r) setErro(traduz(r.erro))
      else { aoSucesso?.(); router.refresh() }
    })
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const de = modulos.findIndex((m) => m.id === active.id)
    const para = modulos.findIndex((m) => m.id === over.id)
    if (de < 0 || para < 0) return
    const antigo = modulos
    const reordenado = reordenarLista(modulos, de, para)
    setModulos(reordenado)
    const r = await reordenarModulos({ cursoId: curso.id, ordemIds: reordenado.map((m) => m.id) })
    if ('erro' in r) { setModulos(antigo); setErro(traduz(r.erro)) }
    else router.refresh()
  }

  function adicionar() {
    if (!novo.trim()) return
    // Sem id fabricado (mesmo motivo do GestorCursos.tsx da Task 3): router.refresh() dentro de
    // roda() traz a lista com o id real assim que o servidor responde.
    roda(() => criarModulo({ cursoId: curso.id, titulo: novo }), () => setNovo(''))
  }

  function salvarNome(id: string) {
    if (!nomeEditado.trim()) return
    roda(
      () => renomearModulo({ id, titulo: nomeEditado }),
      () => { setModulos((ms) => ms.map((m) => (m.id === id ? { ...m, titulo: nomeEditado } : m))); setEditando(null) },
    )
  }

  function excluir(id: string) {
    if (!window.confirm('Excluir este módulo?')) return
    roda(() => excluirModulo({ id }), () => setModulos((ms) => ms.filter((m) => m.id !== id)))
  }

  return (
    <section className={estilos.painel}>
      <h2 className={estilos.subtitulo}>Módulos</h2>
      <p className={estilos.ajuda}>Arraste para reordenar. Clique num módulo para editar as aulas dele.</p>
      {erro && <p className={estilos.erro}>{erro}</p>}

      {modulos.length === 0 ? (
        <p className={estilos.ajuda}>Nenhum módulo ainda.</p>
      ) : (
        <DndContext
          id="modulos-lista"
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={{
            announcements: anunciosDeArraste((id) => modulos.find((m) => m.id === id)?.titulo ?? ''),
            screenReaderInstructions: { draggable: INSTRUCAO_DE_ARRASTE },
          }}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={modulos.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            <ul className={estilos.lista}>
              {modulos.map((modulo) => (
                <LinhaModulo
                  key={modulo.id}
                  modulo={modulo}
                  cursoId={curso.id}
                  pendente={pendente}
                  editando={editando === modulo.id}
                  nomeEditado={nomeEditado}
                  onIniciarEdicao={() => { setNomeEditado(modulo.titulo); setEditando(modulo.id) }}
                  onMudarNome={setNomeEditado}
                  onSalvarNome={() => salvarNome(modulo.id)}
                  onCancelarEdicao={() => setEditando(null)}
                  onExcluir={() => excluir(modulo.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <div className={estilos.novoRow}>
        <Entrada value={novo} placeholder="Novo módulo (ex.: Fundamentos)"
          onChange={(e) => setNovo(e.target.value)} disabled={pendente}
          onKeyDown={(e) => { if (e.key === 'Enter') adicionar() }} />
        <Botao variante="primario" type="button" carregando={pendente} desabilitado={!novo.trim()} onClick={adicionar}>
          <Plus size={15} /> Adicionar módulo
        </Botao>
      </div>
    </section>
  )
}

function LinhaModulo({ modulo, cursoId, pendente, editando, nomeEditado, onIniciarEdicao, onMudarNome, onSalvarNome, onCancelarEdicao, onExcluir }: {
  modulo: ModuloResumo; cursoId: string; pendente: boolean; editando: boolean; nomeEditado: string
  onIniciarEdicao: () => void; onMudarNome: (v: string) => void; onSalvarNome: () => void
  onCancelarEdicao: () => void; onExcluir: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: modulo.id, attributes: { roleDescription: PAPEL_ARRASTAVEL } })
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <li ref={setNodeRef} style={style} className={estilos.item}>
      <div className={estilos.itemLinha}>
        <button type="button" className={estilos.grip} aria-label="Arrastar para reordenar" {...attributes} {...listeners}>
          <GripVertical size={16} />
        </button>
        {editando ? (
          <Entrada value={nomeEditado} autoFocus onChange={(e) => onMudarNome(e.target.value)} disabled={pendente}
            onKeyDown={(e) => { if (e.key === 'Enter') onSalvarNome(); if (e.key === 'Escape') onCancelarEdicao() }} />
        ) : (
          <span className={estilos.itemNome}>
            <Link href={`/cursos/${cursoId}/${modulo.id}`}>{modulo.titulo}</Link>
          </span>
        )}
        <span className={estilos.tag}>{modulo.total_aulas} aula(s)</span>
        <span className={estilos.itemAcoes}>
          {editando
            ? <Botao variante="fantasma" tamanho="pequeno" carregando={pendente} onClick={onSalvarNome}>Salvar</Botao>
            : <Botao variante="fantasma" tamanho="pequeno" carregando={pendente} onClick={onIniciarEdicao}>Renomear</Botao>}
          <Botao variante="fantasma" tamanho="pequeno" tom="erro" carregando={pendente} onClick={onExcluir}>Excluir</Botao>
        </span>
      </div>
    </li>
  )
}
