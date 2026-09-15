'use client'
import { useState, useTransition } from 'react'
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
  criarCurso, alternarPublicadoCurso, excluirCurso, reordenarCursos, type CursoResumo,
} from '@/server/cursos/acoes'
import { CATEGORIAS_CURSO, rotuloDaCategoria, type CategoriaCurso } from '@/lib/cursos/categorias'
import { reordenarLista } from '@/lib/cursos/ordenar'
import { anunciosDeArraste, INSTRUCAO_DE_ARRASTE, PAPEL_ARRASTAVEL } from '@/lib/anuncios-de-arraste'
import Botao from '@/components/ui/Botao'
import { Entrada, Selecao } from '@/components/ui/Campo'
import estilos from './cursos.module.css'

const ERRO_PT: Record<string, string> = {
  titulo_vazio: 'Dê um título ao curso.',
  produto_vazio: 'Defina o identificador do produto.',
  produto_duplicado: 'Já existe um curso com esse identificador de produto.',
  categoria_invalida: 'Escolha uma categoria válida.',
  em_uso: 'Este curso tem módulos — exclua-os antes de excluir o curso.',
  sem_workspace: 'Não foi possível identificar seu espaço de trabalho.',
}
function traduz(e: string) { return ERRO_PT[e] ?? 'Não foi possível concluir. Tente novamente.' }

type Resposta = { ok: true } | { ok: true; id: string } | { erro: string }

export default function GestorCursos({ cursos: cursosIniciais }: { cursos: CursoResumo[] }) {
  const [cursos, setCursos] = useState(cursosIniciais)
  const [novoTitulo, setNovoTitulo] = useState('')
  const [novaCategoria, setNovaCategoria] = useState<CategoriaCurso>('curso')
  const [novoProduto, setNovoProduto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function roda(fn: () => Promise<Resposta>, aoSucesso?: () => void) {
    setErro(null)
    iniciar(async () => {
      const r = await fn()
      if ('erro' in r) setErro(traduz(r.erro))
      else aoSucesso?.()
    })
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const de = cursos.findIndex((c) => c.id === active.id)
    const para = cursos.findIndex((c) => c.id === over.id)
    if (de < 0 || para < 0) return
    const antigo = cursos
    const reordenado = reordenarLista(cursos, de, para)
    setCursos(reordenado)
    const r = await reordenarCursos({ ordemIds: reordenado.map((c) => c.id) })
    if ('erro' in r) { setCursos(antigo); setErro(traduz(r.erro)) }
  }

  function adicionar() {
    if (!novoTitulo.trim() || !novoProduto.trim()) return
    roda(
      () => criarCurso({ titulo: novoTitulo, categoria: novaCategoria, produtoId: novoProduto }),
      () => {
        setCursos((c) => [...c, {
          id: crypto.randomUUID(), produto_id: novoProduto, categoria: novaCategoria,
          titulo: novoTitulo, publicado: false, ordem: c.length,
        }])
        setNovoTitulo(''); setNovoProduto('')
      },
    )
  }

  function alternarPublicado(curso: CursoResumo) {
    roda(
      () => alternarPublicadoCurso({ id: curso.id, publicado: !curso.publicado }),
      () => setCursos((cs) => cs.map((c) => (c.id === curso.id ? { ...c, publicado: !c.publicado } : c))),
    )
  }

  function excluir(id: string) {
    if (!window.confirm('Excluir este curso?')) return
    roda(() => excluirCurso({ id }), () => setCursos((cs) => cs.filter((c) => c.id !== id)))
  }

  return (
    <section className={estilos.painel}>
      <h2 className={estilos.subtitulo}>Seus cursos</h2>
      <p className={estilos.ajuda}>Arraste para reordenar. O identificador de produto é o que entra na lista de produtos de uma oferta.</p>
      {erro && <p className={estilos.erro}>{erro}</p>}

      {cursos.length === 0 ? (
        <p className={estilos.ajuda}>Nenhum curso ainda.</p>
      ) : (
        <DndContext
          id="cursos-lista"
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={{
            announcements: anunciosDeArraste((id) => cursos.find((c) => c.id === id)?.titulo ?? ''),
            screenReaderInstructions: { draggable: INSTRUCAO_DE_ARRASTE },
          }}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={cursos.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <ul className={estilos.lista}>
              {cursos.map((curso) => (
                <LinhaCurso key={curso.id} curso={curso} pendente={pendente}
                  onTogglePublicado={() => alternarPublicado(curso)} onExcluir={() => excluir(curso.id)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <div className={estilos.novoRow}>
        <Entrada value={novoTitulo} placeholder="Título (ex.: Formação de Médium)"
          onChange={(e) => setNovoTitulo(e.target.value)} disabled={pendente} />
        <Selecao value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value as CategoriaCurso)} disabled={pendente}>
          {CATEGORIAS_CURSO.map((c) => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
        </Selecao>
        <Entrada value={novoProduto} placeholder="Identificador do produto (ex.: formacao-medium-2026)"
          onChange={(e) => setNovoProduto(e.target.value)} disabled={pendente} />
        <Botao variante="primario" type="button" carregando={pendente}
          desabilitado={!novoTitulo.trim() || !novoProduto.trim()} onClick={adicionar}>
          <Plus size={15} /> Novo curso
        </Botao>
      </div>
    </section>
  )
}

function LinhaCurso({ curso, pendente, onTogglePublicado, onExcluir }: {
  curso: CursoResumo; pendente: boolean; onTogglePublicado: () => void; onExcluir: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: curso.id, attributes: { roleDescription: PAPEL_ARRASTAVEL } })
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
        <span className={estilos.itemNome}>
          <Link href={`/cursos/${curso.id}`}>{curso.titulo}</Link>
        </span>
        <span className={estilos.tag}>{rotuloDaCategoria(curso.categoria as 'curso' | 'formacao')}</span>
        <code className={estilos.tag}>{curso.produto_id}</code>
        <span className={estilos.itemAcoes}>
          <Botao variante="fantasma" tamanho="pequeno" carregando={pendente} onClick={onTogglePublicado}>
            {curso.publicado ? 'Despublicar' : 'Publicar'}
          </Botao>
          <Botao variante="fantasma" tamanho="pequeno" tom="erro" carregando={pendente} onClick={onExcluir}>
            Excluir
          </Botao>
        </span>
      </div>
    </li>
  )
}
