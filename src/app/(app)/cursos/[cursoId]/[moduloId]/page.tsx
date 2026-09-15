import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { carregarModuloComAulas } from '@/server/cursos/acoes'
import EditorAulas from './EditorAulas'
import estilos from '../../cursos.module.css'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import { tituloDaPagina } from '@/server/marca'

// 🔴 Título estático, mesmo motivo do page.tsx de Task 4: carregarModuloComAulas não é cacheada,
// e o corpo da página já a chama uma vez — chamar de novo aqui dobraria as idas ao banco.
export async function generateMetadata() {
  return { title: await tituloDaPagina('Módulo') }
}

export default async function ModuloPage({ params }: { params: Promise<{ cursoId: string; moduloId: string }> }) {
  const { cursoId, moduloId } = await params
  const modulo = await carregarModuloComAulas(moduloId)
  if (!modulo || modulo.curso_id !== cursoId) notFound()

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina
        acima={<Link href={`/cursos/${cursoId}`} className={estilos.voltar}><ChevronLeft size={16} strokeWidth={2} />{modulo.curso_titulo}</Link>}
        titulo={modulo.titulo}
        subtitulo="Aulas deste módulo"
      />
      <EditorAulas modulo={modulo} />
    </div>
  )
}
