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

// 🔴 Título estático, sem chamar carregarCursoComModulos aqui: a mesma função já roda no corpo
// da página (abaixo), e não é cacheada — chamá-la duas vezes dobraria as idas ao banco por
// carregamento. Mesmo padrão de `src/app/(app)/contatos/[id]/page.tsx` e `empresas/[id]/page.tsx`
// (título genérico, sem buscar a entidade em generateMetadata).
export async function generateMetadata() {
  return { title: await tituloDaPagina('Curso') }
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
