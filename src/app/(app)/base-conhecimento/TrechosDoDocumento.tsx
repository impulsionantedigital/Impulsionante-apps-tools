'use client'

import { useEffect, useState } from 'react'
import Botao from '@/components/ui/Botao'
import { trechosDoDocumento } from './acoes-documentos'
import estilos from '../config/config.module.css'
import local from './documentos.module.css'

const POR_PAGINA = 50

type Trecho = { caminho: string; pagina: number | null; contexto: string | null; texto: string }
type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; texto: string }
  | { tipo: 'pronto'; total: number; itens: Trecho[] }

/** Os trechos da versão ativa, 50 por página, com caminho, página, contexto e texto. */
export default function TrechosDoDocumento({ documentoId }: { documentoId: string }) {
  const [pagina, setPagina] = useState(1)
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })

  useEffect(() => {
    let vivo = true
    trechosDoDocumento(documentoId, pagina)
      .then((r) => {
        if (!vivo) return
        setEstado('erro' in r ? { tipo: 'erro', texto: r.erro } : { tipo: 'pronto', total: r.total, itens: r.itens })
      })
      .catch(() => {
        if (vivo) setEstado({ tipo: 'erro', texto: 'Não consegui ler os trechos agora. Tente de novo em instantes.' })
      })
    return () => {
      vivo = false
    }
  }, [documentoId, pagina])

  function irPara(p: number) {
    setEstado({ tipo: 'carregando' })
    setPagina(p)
  }

  if (estado.tipo === 'carregando') return <p className={estilos.vazio}>Carregando os trechos…</p>
  if (estado.tipo === 'erro')
    return (
      <p className={estilos.erro} role="alert">
        {estado.texto}
      </p>
    )
  if (estado.total === 0) return <p className={estilos.vazio}>Este documento ainda não tem trechos.</p>

  const paginas = Math.max(1, Math.ceil(estado.total / POR_PAGINA))
  return (
    <>
      <ol className={local.trechos} start={(pagina - 1) * POR_PAGINA + 1}>
        {estado.itens.map((t, i) => (
          <li key={`${pagina}-${i}`} className={local.trecho}>
            <span className={local.trechoCaminho}>
              {t.caminho || 'Sem título'}
              {t.pagina != null ? ` · página ${t.pagina}` : ''}
            </span>
            {t.contexto ? <span className={local.trechoContexto}>{t.contexto}</span> : null}
            <span className={local.trechoTexto}>{t.texto}</span>
          </li>
        ))}
      </ol>
      {paginas > 1 ? (
        <div className={local.paginacao}>
          <Botao variante="fantasma" tamanho="pequeno" type="button" desabilitado={pagina <= 1} onClick={() => irPara(pagina - 1)}>
            Anterior
          </Botao>
          <span>
            Página {pagina} de {paginas} · {estado.total} trechos
          </span>
          <Botao
            variante="fantasma"
            tamanho="pequeno"
            type="button"
            desabilitado={pagina >= paginas}
            onClick={() => irPara(pagina + 1)}
          >
            Próxima
          </Botao>
        </div>
      ) : null}
    </>
  )
}
