'use client'

// A área de documentos da base de conhecimento: escolher/soltar arquivos, enviar um por vez
// direto ao Storage (TUS, retomável), e a lista com o status de cada um.
//
// Review Focus 1: a página recarregada no meio do envio. O `versaoId` fica guardado no
// localStorage sob `chaveDeRetomada(arquivo, documento)`; escolher o mesmo arquivo de novo manda
// esse id como `retomarVersaoId`, o servidor devolve a mesma versão (mesmo caminho, token novo) e
// o tus continua de onde parou.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Upload, X } from 'lucide-react'
import Botao from '@/components/ui/Botao'
import { TIPOS_ACEITOS } from '@/lib/base-documentos/tipos'
import { validarPedidoDeEnvio } from '@/lib/base-documentos/regras-de-envio'
import { formatarMB, precisaAcompanhar } from '@/lib/base-documentos/tela'
import { hrefDaAba } from '@/lib/agentes-abas'
import {
  cancelarEnvio,
  confirmarEnvio,
  iniciarEnvio,
  listarDocumentos,
  type DocumentoNaTela,
} from './acoes-documentos'
import {
  chaveDeRetomada,
  enviarArquivo,
  EnvioCancelado,
  esquecerVersao,
  guardarVersao,
  lerVersaoGuardada,
} from './envio-tus'
import ItemDocumento from './ItemDocumento'
import estilos from '../config/config.module.css'
import local from './documentos.module.css'

const INTERVALO_MS = 5000
const ACEITOS = [...Object.keys(TIPOS_ACEITOS).map((e) => `.${e}`), ...Object.values(TIPOS_ACEITOS)].join(',')
const MB = 1024 * 1024

type Pedido = { arquivo: File; documentoId: string | null }
type EnvioAtual = { nome: string; enviados: number; total: number; versaoId: string | null }

export default function Documentos({
  documentos,
  erroAoListar,
  limiteBytes,
  temChave,
  ehDono,
  ehOwner,
  assistentes,
}: {
  documentos: DocumentoNaTela[]
  erroAoListar: string | null
  limiteBytes: number
  temChave: boolean
  ehDono: boolean
  ehOwner: boolean
  assistentes: Array<{ id: string; nomeInterno: string }>
}) {
  const [lista, setLista] = useState(documentos)
  const [origem, setOrigem] = useState(documentos)
  // A página do servidor mandou uma lista nova (router.refresh / revalidação): ela vence.
  if (origem !== documentos) {
    setOrigem(documentos)
    setLista(documentos)
  }

  const [erroLista, setErroLista] = useState<string | null>(erroAoListar)
  const [errosEnvio, setErrosEnvio] = useState<string[]>([])
  const [envio, setEnvio] = useState<EnvioAtual | null>(null)
  const [naFila, setNaFila] = useState<string[]>([])
  const [arrastando, setArrastando] = useState(false)

  const filaRef = useRef<Pedido[]>([])
  const rodandoRef = useRef(false)
  const cancelarRef = useRef<(() => void) | null>(null)
  const entradaNovos = useRef<HTMLInputElement>(null)
  const entradaSubstituir = useRef<HTMLInputElement>(null)
  const alvoSubstituir = useRef<string | null>(null)

  async function recarregar() {
    try {
      const r = await listarDocumentos()
      if (Array.isArray(r)) {
        setLista(r)
        setErroLista(null)
      } else {
        setErroLista(r.erro)
      }
    } catch {
      // Falha de rede numa recarga: a lista que está na tela continua valendo.
    }
  }

  // Enquanto o processador tem trabalho, a lista se atualiza sozinha.
  const acompanhar = ehOwner && precisaAcompanhar(lista)
  useEffect(() => {
    if (!acompanhar) return
    const id = window.setInterval(() => {
      void recarregar()
    }, INTERVALO_MS)
    return () => window.clearInterval(id)
  }, [acompanhar])

  function anotarErro(texto: string) {
    setErrosEnvio((atual) => [...atual, texto])
  }

  async function enviarUm({ arquivo, documentoId }: Pedido) {
    const pedido = { nomeArquivo: arquivo.name, tamanho: arquivo.size }
    const v = validarPedidoDeEnvio(pedido, limiteBytes)
    if (!v.ok) {
      anotarErro(`${arquivo.name}: ${v.erro}`)
      return
    }

    setEnvio({ nome: arquivo.name, enviados: 0, total: arquivo.size, versaoId: null })
    const chave = chaveDeRetomada(arquivo, documentoId)
    const retomar = lerVersaoGuardada(chave)
    let dados: Awaited<ReturnType<typeof iniciarEnvio>>
    try {
      dados = await iniciarEnvio({
        ...pedido,
        documentoId: documentoId ?? undefined,
        retomarVersaoId: retomar ?? undefined,
      })
    } catch {
      anotarErro(`${arquivo.name}: não consegui falar com o servidor. Tente de novo em instantes.`)
      return
    }
    if ('erro' in dados) {
      anotarErro(`${arquivo.name}: ${dados.erro}`)
      return
    }
    const versaoId = dados.versaoId
    guardarVersao(chave, versaoId)

    const envioTus = enviarArquivo(
      arquivo,
      dados,
      (enviados, total) => setEnvio({ nome: arquivo.name, enviados, total, versaoId }),
      documentoId,
    )
    cancelarRef.current = envioTus.cancelar
    setEnvio((atual) => (atual ? { ...atual, versaoId } : atual))
    void recarregar()

    try {
      await envioTus.promessa
    } catch (err) {
      if (err instanceof EnvioCancelado) {
        esquecerVersao(chave)
        const r = await cancelarEnvio(versaoId).catch(() => null)
        if (r && 'erro' in r) anotarErro(`${arquivo.name}: ${r.erro}`)
        return
      }
      // A mensagem do tus traz URL e resposta crua do Storage — fica só no console.
      console.warn('[base-documentos] envio parou:', err)
      anotarErro(
        `${arquivo.name}: o envio parou no meio. Escolha o mesmo arquivo de novo para continuar de onde parou.`,
      )
      return
    } finally {
      cancelarRef.current = null
    }

    const r = await confirmarEnvio(versaoId).catch(() => ({
      erro: 'Não consegui confirmar o envio. Recarregue a página e veja se o documento entrou na fila.',
    }))
    if ('erro' in r) anotarErro(`${arquivo.name}: ${r.erro}`)
    else esquecerVersao(chave)
  }

  async function drenar() {
    if (rodandoRef.current) return
    rodandoRef.current = true
    try {
      for (;;) {
        const proximo = filaRef.current.shift()
        if (!proximo) break
        setNaFila(filaRef.current.map((p) => p.arquivo.name))
        await enviarUm(proximo)
        await recarregar()
      }
    } finally {
      rodandoRef.current = false
      setEnvio(null)
      setNaFila([])
    }
  }

  function adicionar(arquivos: FileList | File[] | null, documentoId: string | null) {
    if (!arquivos || arquivos.length === 0) return
    setErrosEnvio([])
    const escolhidos = documentoId ? [Array.from(arquivos)[0]] : Array.from(arquivos)
    filaRef.current.push(...escolhidos.map((arquivo) => ({ arquivo, documentoId })))
    setNaFila(filaRef.current.map((p) => p.arquivo.name))
    void drenar()
  }

  function substituir(documentoId: string) {
    alvoSubstituir.current = documentoId
    entradaSubstituir.current?.click()
  }

  const progresso = envio && envio.total > 0 ? Math.min(100, (envio.enviados / envio.total) * 100) : 0

  return (
    <section className={estilos.bloco}>
      <div className={estilos.blocoCab}>
        <h2 className={estilos.blocoTitulo}>Documentos</h2>
        <span className={estilos.blocoMeta}>
          {lista.length === 1 ? '1 documento' : `${lista.length} documentos`}
        </span>
      </div>

      {!temChave ? (
        <p className={estilos.ajuda}>
          Sem a chave de IA os documentos ficam guardados, mas não são processados — o assistente só
          passa a usá-los depois que a chave for cadastrada
          {ehDono ? (
            <>
              {' '}
              em{' '}
              <Link href={hrefDaAba('servidor')} className={estilos.linkExterno}>
                Agentes de IA → Servidor
              </Link>
            </>
          ) : null}
          .
        </p>
      ) : null}

      {!ehOwner ? (
        <p className={estilos.ajuda}>
          Só quem administra este espaço de trabalho pode enviar, ver ou alterar documentos.
        </p>
      ) : (
        <>
          <div
            className={`${local.zona} ${arrastando ? local.zonaAtiva : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setArrastando(true)
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => {
              e.preventDefault()
              setArrastando(false)
              adicionar(e.dataTransfer.files, null)
            }}
          >
            <div className={local.zonaTexto}>
              <strong>Solte arquivos aqui ou escolha no computador</strong>
              <span className={local.dica}>
                PDF, DOCX, MD, TXT, JSON ou CSV, até {Math.round(limiteBytes / MB)} MB cada. Vários de
                uma vez entram na fila e sobem um por vez.
              </span>
            </div>
            <Botao type="button" onClick={() => entradaNovos.current?.click()}>
              <Upload size={16} strokeWidth={1.75} /> Escolher arquivos
            </Botao>
            <input
              ref={entradaNovos}
              className={local.escondido}
              type="file"
              multiple
              accept={ACEITOS}
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                adicionar(e.target.files, null)
                e.target.value = ''
              }}
            />
            <input
              ref={entradaSubstituir}
              className={local.escondido}
              type="file"
              accept={ACEITOS}
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                adicionar(e.target.files, alvoSubstituir.current)
                alvoSubstituir.current = null
                e.target.value = ''
              }}
            />
          </div>

          {envio ? (
            <div className={local.envio} aria-live="polite">
              <div className={local.envioLinha}>
                <span className={local.envioNome}>Enviando {envio.nome}</span>
                <span className={local.numeros}>
                  {formatarMB(envio.enviados)} de {formatarMB(envio.total)}
                </span>
                <Botao
                  variante="fantasma"
                  tamanho="pequeno"
                  type="button"
                  desabilitado={!envio.versaoId}
                  onClick={() => cancelarRef.current?.()}
                >
                  <X size={16} strokeWidth={1.75} /> Cancelar
                </Botao>
              </div>
              <div
                className={local.barra}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progresso)}
                aria-label={`Envio de ${envio.nome}`}
              >
                <div className={local.barraCheia} style={{ width: `${progresso}%` }} />
              </div>
              {naFila.length > 0 ? (
                <span className={local.dica}>Na fila: {naFila.join(', ')}</span>
              ) : null}
            </div>
          ) : null}

          {errosEnvio.map((texto, i) => (
            <p key={i} className={estilos.erro} role="alert">
              {texto}
            </p>
          ))}

          {erroLista ? (
            <p className={estilos.erro} role="alert">
              {erroLista}
            </p>
          ) : null}

          {lista.length === 0 && !erroLista ? (
            <p className={estilos.vazio}>
              Nenhum documento ainda. O que estiver nos documentos enviados aqui passa a ser
              consultado pelo assistente, junto com as entradas escritas abaixo.
            </p>
          ) : (
            <ul className={estilos.lista}>
              {lista.map((doc) => (
                <ItemDocumento
                  key={doc.id}
                  doc={doc}
                  ehOwner={ehOwner}
                  assistentes={assistentes}
                  enviandoAqui={Boolean(envio?.versaoId && doc.pendente?.id === envio.versaoId)}
                  aoMudar={recarregar}
                  aoSubstituir={substituir}
                />
              ))}
            </ul>
          )}

          <p className={estilos.ajuda}>
            Desligado, o documento some das respostas e continua guardado aqui. Substituir troca o
            arquivo e mantém a versão atual respondendo até a nova ficar pronta.
          </p>
        </>
      )}
    </section>
  )
}
