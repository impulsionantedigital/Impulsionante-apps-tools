import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { carregarCursoComModulos } from '@/server/cursos/acoes'
import { rotuloDaCategoria } from '@/lib/cursos/categorias'
import EditorCurso from './EditorCurso'
import EditorModulos from './EditorModulos'
import estilos from '../cursos.module.css'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import { tituloDaPagina } from '@/server/marca'

export async function generateMetadata({ params }: { params: Promise<{ cursoId: string }> }) {
  const { cursoId } = await params
  const curso = await carregarCursoComModulos(cursoId)
  return { title: await tituloDaPagina(curso?.titulo ?? 'Curso') }
}

export default async function CursoPage({ params }: { params: Promise<{ cursoId: string }> }) {
  const { cursoId } = await params
  const curso = await carregarCursoComModulos(cursoId)
  if (!curso) notFound()

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina
        acima={<Link href="/cursos" className={estilos.voltar}><ChevronLeft size={16} strokeWidth={2} />Cursos</Link>}
        titulo={curso.titulo}
        subtitulo={`${rotuloDaCategoria(curso.categoria as 'curso' | 'formacao')} · produto ${curso.produto_id}`}
      />
      <EditorCurso curso={curso} />
      <EditorModulos curso={curso} />
    </div>
  )
}
