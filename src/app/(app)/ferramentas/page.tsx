import Link from 'next/link'
import { ChevronRight, Scale } from 'lucide-react'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import { tituloDaPagina } from '@/server/marca'
import { REGISTRO } from '@/lib/indulto-comutacao/registro'
import estilos from './ferramentas.module.css'

export async function generateMetadata() {
  return { title: await tituloDaPagina('Ferramentas') }
}

export default function FerramentasPage() {
  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina titulo="Ferramentas" subtitulo="Cálculos de execução penal." />

      <div className={estilos.destinos}>
        <Link href="/ferramentas/indulto-comutacao" className={estilos.destino}>
          <span className={estilos.destinoIcone}>
            <Scale size={16} strokeWidth={1.75} />
          </span>
          <span className={estilos.destinoTexto}>
            <span className={estilos.destinoNome}>Indulto e comutação</span>
            <span className={estilos.destinoSub}>
              Verifica, dispositivo por dispositivo, os requisitos de indulto e de comutação.
            </span>
            {}
            <span className={estilos.destinoMeta}>
              {REGISTRO.length === 1
                ? REGISTRO[0].rotulo
                : `${REGISTRO.length} decretos disponíveis`}
            </span>
          </span>
          <ChevronRight size={16} strokeWidth={1.75} className={estilos.destinoSeta} />
        </Link>
      </div>
    </div>
  )
}
