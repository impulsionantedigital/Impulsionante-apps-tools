'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { salvarCurso, type CursoDetalhe } from '@/server/cursos/acoes'
import { CATEGORIAS_CURSO, type CategoriaCurso } from '@/lib/cursos/categorias'
import Botao from '@/components/ui/Botao'
import { Entrada, Selecao, AreaTexto } from '@/components/ui/Campo'
import estilos from '../cursos.module.css'

const ERRO_PT: Record<string, string> = {
  titulo_vazio: 'Dê um título ao curso.',
  produto_vazio: 'Defina o identificador do produto.',
  produto_duplicado: 'Já existe um curso com esse identificador de produto.',
  categoria_invalida: 'Escolha uma categoria válida.',
  sem_workspace: 'Não foi possível identificar seu espaço de trabalho.',
}
function traduz(e: string) { return ERRO_PT[e] ?? 'Não foi possível concluir. Tente novamente.' }

export default function EditorCurso({ curso }: { curso: CursoDetalhe }) {
  const router = useRouter()
  const [titulo, setTitulo] = useState(curso.titulo)
  const [categoria, setCategoria] = useState<CategoriaCurso>(curso.categoria as CategoriaCurso)
  const [produtoId, setProdutoId] = useState(curso.produto_id)
  const [descricao, setDescricao] = useState(curso.descricao ?? '')
  const [capaUrl, setCapaUrl] = useState(curso.capa_url ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)
  const [pendente, iniciar] = useTransition()

  function salvar() {
    setErro(null)
    setSucesso(false)
    iniciar(async () => {
      const r = await salvarCurso({
        id: curso.id, titulo, categoria, produtoId,
        descricao: descricao.trim() || null, capaUrl: capaUrl.trim() || null, publicado: curso.publicado,
      })
      if ('erro' in r) setErro(traduz(r.erro))
      else { setSucesso(true); router.refresh() }
    })
  }

  return (
    <section className={estilos.painel}>
      <h2 className={estilos.subtitulo}>Detalhes do curso</h2>
      {erro && <p className={estilos.erro}>{erro}</p>}
      {sucesso && <p className={estilos.ajuda}>Salvo.</p>}

      <div className={estilos.campo}>
        <label className={estilos.rotulo} htmlFor="curso-titulo">Título</label>
        <Entrada id="curso-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} disabled={pendente} />
      </div>

      <div className={estilos.campo}>
        <label className={estilos.rotulo} htmlFor="curso-categoria">Categoria</label>
        <Selecao id="curso-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaCurso)} disabled={pendente}>
          {CATEGORIAS_CURSO.map((c) => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
        </Selecao>
      </div>

      <div className={estilos.campo}>
        <label className={estilos.rotulo} htmlFor="curso-produto">Identificador do produto</label>
        <Entrada id="curso-produto" value={produtoId} onChange={(e) => setProdutoId(e.target.value)} disabled={pendente} />
        <p className={estilos.ajuda}>É este id que aparece na lista de produtos de uma oferta, em Configurações → Comercial.</p>
      </div>

      <div className={estilos.campo}>
        <label className={estilos.rotulo} htmlFor="curso-descricao">Descrição</label>
        <AreaTexto id="curso-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={pendente} rows={3} />
      </div>

      <div className={estilos.campo}>
        <label className={estilos.rotulo} htmlFor="curso-capa">URL da capa</label>
        <Entrada id="curso-capa" value={capaUrl} onChange={(e) => setCapaUrl(e.target.value)} placeholder="https://..." disabled={pendente} />
      </div>

      <div className={estilos.linhaForm}>
        <Botao variante="primario" carregando={pendente} desabilitado={!titulo.trim() || !produtoId.trim()} onClick={salvar}>
          Salvar
        </Botao>
      </div>
    </section>
  )
}
