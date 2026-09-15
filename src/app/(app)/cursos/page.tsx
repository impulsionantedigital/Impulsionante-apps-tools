import { listarCursos } from '@/server/cursos/acoes'
import GestorCursos from './GestorCursos'
import estilos from './cursos.module.css'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import { tituloDaPagina } from '@/server/marca'

export async function generateMetadata() {
  return { title: await tituloDaPagina('Cursos') }
}

export default async function CursosPage() {
  const cursos = await listarCursos()

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina
        titulo="Cursos"
        subtitulo="Crie cursos e formações, organize em módulos e aulas, e libere pela oferta certa."
      />
      <GestorCursos cursos={cursos} />
    </div>
  )
}
