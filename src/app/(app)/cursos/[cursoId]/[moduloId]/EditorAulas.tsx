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
import { GripVertical, Plus } from 'lucide-react'
import {
  criarAula, salvarAula, excluirAula, reordenarAulas, type AulaItem, type ModuloComAulas,
} from '@/server/cursos/acoes'
import { extrairIdYoutube } from '@/lib/cursos/youtube'
import { reordenarLista } from '@/lib/cursos/ordenar'
import { anunciosDeArraste, INSTRUCAO_DE_ARRASTE, PAPEL_ARRASTAVEL } from '@/lib/anuncios-de-arraste'
import Botao from '@/components/ui/Botao'
import { Entrada, AreaTexto } from '@/components/ui/Campo'
import estilos from '../../cursos.module.css'

const ERRO_PT: Record<string, string> = {
  titulo_vazio: 'Dê um título à aula.',
  modulo_nao_encontrado: 'Módulo não encontrado.',
  sem_workspace: 'Não foi possível identificar seu espaço de trabalho.',
}
function traduz(e: string) { return ERRO_PT[e] ?? 'Não foi possível concluir. Tente novamente.' }

type Resposta = { ok: true } | { ok: true; id: string } | { erro: string }

export default function EditorAulas({ modulo }: { modulo: ModuloComAulas }) {
  const router = useRouter()
  const [aulas, setAulas] = useState(modulo.aulas)
  const [aulasDoServidor, setAulasDoServidor] = useState(modulo.aulas)
  if (aulasDoServidor !== modulo.aulas) { setAulasDoServidor(modulo.aulas); setAulas(modulo.aulas) }
  const [novo, setNovo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const [abertaId, setAbertaId] = useState<string | null>(null)

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
    const de = aulas.findIndex((a) => a.id === active.id)
    const para = aulas.findIndex((a) => a.id === over.id)
    if (de < 0 || para < 0) return
    const antigo = aulas
    const reordenado = reordenarLista(aulas, de, para)
    setAulas(reordenado)
    const r = await reordenarAulas({ moduloId: modulo.id, ordemIds: reordenado.map((a) => a.id) })
    if ('erro' in r) { setAulas(antigo); setErro(traduz(r.erro)) }
    else router.refresh()
  }

  function adicionar() {
    if (!novo.trim()) return
    // Sem id fabricado (mesmo motivo do GestorCursos.tsx da Task 3): router.refresh() dentro de
    // roda() traz a lista com o id real assim que o servidor responde.
    roda(() => criarAula({ moduloId: modulo.id, titulo: novo }), () => setNovo(''))
  }

  function excluir(id: string) {
    if (!window.confirm('Excluir esta aula?')) return
    roda(() => excluirAula({ id }), () => setAulas((as) => as.filter((a) => a.id !== id)))
  }

  function salvar(aula: AulaItem, campos: Partial<Pick<AulaItem, 'titulo' | 'descricao' | 'video_youtube_id' | 'publicado'>>) {
    const atualizada = { ...aula, ...campos }
    roda(
      () => salvarAula({
        id: aula.id, titulo: atualizada.titulo, descricao: atualizada.descricao,
        videoYoutubeId: atualizada.video_youtube_id, publicado: atualizada.publicado,
      }),
      () => setAulas((as) => as.map((a) => (a.id === aula.id ? atualizada : a))),
    )
  }

  return (
    <section className={estilos.painel}>
      <h2 className={estilos.subtitulo}>Aulas</h2>
      <p className={estilos.ajuda}>Arraste para reordenar. Cole o link do YouTube (ou só o id) em cada aula.</p>
      {erro && <p className={estilos.erro}>{erro}</p>}

      {aulas.length === 0 ? (
        <p className={estilos.ajuda}>Nenhuma aula ainda.</p>
      ) : (
        <DndContext
          id="aulas-lista"
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={{
            announcements: anunciosDeArraste((id) => aulas.find((a) => a.id === id)?.titulo ?? ''),
            screenReaderInstructions: { draggable: INSTRUCAO_DE_ARRASTE },
          }}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={aulas.map((a) => a.id)} strategy={verticalListSortingStrategy}>
            <ul className={estilos.lista}>
              {aulas.map((aula) => (
                <LinhaAula
                  key={aula.id}
                  aula={aula}
                  pendente={pendente}
                  aberta={abertaId === aula.id}
                  onAbrir={() => setAbertaId(abertaId === aula.id ? null : aula.id)}
                  onSalvar={(campos) => salvar(aula, campos)}
                  onExcluir={() => excluir(aula.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <div className={estilos.novoRow}>
        <Entrada value={novo} placeholder="Nova aula (ex.: Aula 1 — Introdução)"
          onChange={(e) => setNovo(e.target.value)} disabled={pendente}
          onKeyDown={(e) => { if (e.key === 'Enter') adicionar() }} />
        <Botao variante="primario" type="button" carregando={pendente} desabilitado={!novo.trim()} onClick={adicionar}>
          <Plus size={15} /> Adicionar aula
        </Botao>
      </div>
    </section>
  )
}

function LinhaAula({ aula, pendente, aberta, onAbrir, onSalvar, onExcluir }: {
  aula: AulaItem; pendente: boolean; aberta: boolean
  onSalvar: (campos: Partial<Pick<AulaItem, 'titulo' | 'descricao' | 'video_youtube_id' | 'publicado'>>) => void
  onAbrir: () => void; onExcluir: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: aula.id, attributes: { roleDescription: PAPEL_ARRASTAVEL } })
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const [titulo, setTitulo] = useState(aula.titulo)
  const [descricao, setDescricao] = useState(aula.descricao ?? '')
  const [linkVideo, setLinkVideo] = useState(aula.video_youtube_id ?? '')

  function salvarCampos() {
    onSalvar({ titulo, descricao: descricao.trim() || null, video_youtube_id: extrairIdYoutube(linkVideo) })
  }

  return (
    <li ref={setNodeRef} style={style} className={estilos.item}>
      <div className={estilos.itemLinha}>
        <button type="button" className={estilos.grip} aria-label="Arrastar para reordenar" {...attributes} {...listeners}>
          <GripVertical size={16} />
        </button>
        <span className={estilos.itemNome}>{aula.titulo}</span>
        {!aula.publicado && <span className={estilos.tag}>rascunho</span>}
        <span className={estilos.itemAcoes}>
          <Botao variante="fantasma" tamanho="pequeno" onClick={onAbrir}>{aberta ? 'Fechar' : 'Editar'}</Botao>
          <Botao variante="fantasma" tamanho="pequeno" carregando={pendente} onClick={() => onSalvar({ publicado: !aula.publicado })}>
            {aula.publicado ? 'Despublicar' : 'Publicar'}
          </Botao>
          <Botao variante="fantasma" tamanho="pequeno" tom="erro" carregando={pendente} onClick={onExcluir}>Excluir</Botao>
        </span>
      </div>

      {aberta && (
        <div className={estilos.campo} style={{ paddingBottom: 'var(--s-4)' }}>
          <label className={estilos.rotulo} htmlFor={`aula-titulo-${aula.id}`}>Título</label>
          <Entrada id={`aula-titulo-${aula.id}`} value={titulo} onChange={(e) => setTitulo(e.target.value)} disabled={pendente} />

          <label className={estilos.rotulo} htmlFor={`aula-descricao-${aula.id}`}>Descrição</label>
          <AreaTexto id={`aula-descricao-${aula.id}`} value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={pendente} rows={3} />

          <label className={estilos.rotulo} htmlFor={`aula-video-${aula.id}`}>Link ou id do vídeo no YouTube</label>
          <Entrada id={`aula-video-${aula.id}`} value={linkVideo} onChange={(e) => setLinkVideo(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..." disabled={pendente} />
          {extrairIdYoutube(linkVideo) && (
            <iframe
              className={estilos.videoPreview}
              src={`https://www.youtube.com/embed/${extrairIdYoutube(linkVideo)}`}
              title="Pré-visualização do vídeo"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          )}
          {linkVideo.trim() && !extrairIdYoutube(linkVideo) && <p className={estilos.erro}>Não reconheci um vídeo do YouTube nesse link.</p>}

          <div className={estilos.linhaForm}>
            <Botao variante="primario" carregando={pendente} desabilitado={!titulo.trim()} onClick={salvarCampos}>Salvar</Botao>
          </div>
        </div>
      )}
    </li>
  )
}
