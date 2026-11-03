'use client'

import { useState, useTransition } from 'react'
import { FileUp, Pencil, Power, PowerOff, RefreshCw, Trash2, Users, X } from 'lucide-react'
import Botao from '@/components/ui/Botao'
import { Entrada } from '@/components/ui/Campo'
import { formatarTamanho } from '@/lib/anexo'
import { formatarDataHora } from '@/lib/data-hora'
import { acoesDoDocumento, formatarCusto, rotuloDoStatus } from '@/lib/base-documentos/tela'
import {
  alternarDocumento,
  cancelarEnvio,
  excluirDocumento,
  renomearDocumento,
  reprocessarDocumento,
  trocarAssistentesDoDocumento,
  type DocumentoNaTela,
  type ResumoVersao,
} from './acoes-documentos'
import TrechosDoDocumento from './TrechosDoDocumento'
import estilos from '../config/config.module.css'
import local from './documentos.module.css'

const TETO_NOME = 120

type Painel = 'renomear' | 'excluir' | 'assistentes' | 'trechos' | null

function corDoSelo(v: ResumoVersao): string {
  if (v.status === 'pronto') return estilos.selo_ok
  if (v.status === 'erro') return estilos.selo_erro
  return estilos.selo_neutro
}

function Selo({ versao, prefixo }: { versao: ResumoVersao; prefixo?: string }) {
  const emAndamento = versao.status === 'na_fila' || versao.status === 'processando'
  return (
    <>
      <span className={`${estilos.selo} ${corDoSelo(versao)}`}>
        {prefixo ? `${prefixo}: ` : ''}
        {rotuloDoStatus(versao)}
      </span>
      {emAndamento && versao.custoEstimadoUsd != null ? (
        <span className={local.meta} title="Custo estimado do processamento">
          {formatarCusto(versao.custoEstimadoUsd)}
        </span>
      ) : null}
    </>
  )
}

export default function ItemDocumento({
  doc,
  ehOwner,
  assistentes,
  enviandoAqui,
  aoMudar,
  aoSubstituir,
}: {
  doc: DocumentoNaTela
  ehOwner: boolean
  assistentes: Array<{ id: string; nomeInterno: string }>
  /** Esta aba está mandando o arquivo da versão pendente (o cancelamento é o da barra). */
  enviandoAqui: boolean
  aoMudar: () => Promise<void>
  aoSubstituir: (documentoId: string) => void
}) {
  const [pendente, iniciar] = useTransition()
  const [painel, setPainel] = useState<Painel>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [nome, setNome] = useState(doc.nome)
  const [modo, setModo] = useState<'todos' | 'so_estes'>(doc.assistentes.length > 0 ? 'so_estes' : 'todos')
  const [selecionados, setSelecionados] = useState<string[]>(doc.assistentes)

  function abrir(p: Painel) {
    setErro(null)
    if (p === 'renomear') setNome(doc.nome)
    if (p === 'assistentes') {
      setModo(doc.assistentes.length > 0 ? 'so_estes' : 'todos')
      setSelecionados(doc.assistentes)
    }
    setPainel((atual) => (atual === p ? null : p))
  }

  function rodar(acao: () => Promise<{ ok: true } | { erro: string }>, depois?: () => void) {
    setErro(null)
    iniciar(async () => {
      const r = await acao()
      if ('erro' in r) {
        setErro(r.erro)
        return
      }
      depois?.()
      await aoMudar()
    })
  }

  function salvarNome() {
    const limpo = nome.trim()
    if (!limpo || limpo === doc.nome) {
      setPainel(null)
      return
    }
    rodar(
      () => renomearDocumento(doc.id, limpo),
      () => setPainel(null),
    )
  }

  const acoes = new Set(
    acoesDoDocumento({
      ehOwner,
      ativa: doc.ativa,
      pendente: doc.pendente,
      enviandoAqui,
      variosAssistentes: assistentes.length > 1,
    }),
  )
  const nomesDosAssistentes =
    doc.assistentes.length === 0
      ? 'todos os assistentes'
      : assistentes
          .filter((a) => doc.assistentes.includes(a.id))
          .map((a) => a.nomeInterno || 'Assistente sem nome')
          .join(', ') || 'assistentes que não existem mais'

  return (
    <li className={estilos.item}>
      <div className={estilos.itemInfo}>
        {ehOwner && painel === 'renomear' ? (
          <div className={local.nomeLinha}>
            <Entrada
              aria-label="Nome do documento"
              maxLength={TETO_NOME}
              value={nome}
              autoFocus
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') salvarNome()
                if (e.key === 'Escape') setPainel(null)
              }}
            />
            <Botao variante="primario" tamanho="pequeno" type="button" carregando={pendente} onClick={salvarNome}>
              Salvar
            </Botao>
            <Botao tamanho="pequeno" type="button" carregando={pendente} onClick={() => setPainel(null)}>
              Cancelar
            </Botao>
          </div>
        ) : (
          <span className={`${estilos.itemRotulo} ${local.nome}`}>{doc.nome}</span>
        )}
        <span className={local.meta}>
          {doc.extensao.toUpperCase()} · {formatarTamanho(doc.tamanho)}
          {doc.ativa ? ` · ${doc.trechos === 1 ? '1 trecho' : `${doc.trechos} trechos`}` : ''} ·{' '}
          {formatarDataHora(doc.atualizadoEm)}
        </span>
        <span className={local.selos}>
          {doc.ativa ? <Selo versao={doc.ativa} prefixo={doc.pendente ? 'Em uso' : undefined} /> : null}
          {doc.pendente ? <Selo versao={doc.pendente} prefixo={doc.ativa ? 'Nova versão' : undefined} /> : null}
          {!doc.ativa && !doc.pendente ? (
            <span className={`${estilos.selo} ${estilos.selo_neutro}`}>sem versão</span>
          ) : null}
          {!doc.ligado ? <span className={`${estilos.selo} ${estilos.selo_neutro}`}>desligado</span> : null}
          {assistentes.length > 1 ? <span className={local.meta}>Usado por: {nomesDosAssistentes}</span> : null}
        </span>
      </div>

      <div className={estilos.acoes}>
        {acoes.has('alternar') ? (
          <Botao
            variante="fantasma"
            tamanho="pequeno"
            type="button"
            carregando={pendente}
            aria-label={`${doc.ligado ? 'Desligar' : 'Ligar'} ${doc.nome}`}
            onClick={() => rodar(() => alternarDocumento(doc.id, !doc.ligado))}
          >
            {doc.ligado ? (
              <>
                <PowerOff size={16} strokeWidth={1.75} /> Desligar
              </>
            ) : (
              <>
                <Power size={16} strokeWidth={1.75} /> Ligar
              </>
            )}
          </Botao>
        ) : null}
        {acoes.has('renomear') ? (
          <Botao
            variante="fantasma"
            tamanho="pequeno"
            type="button"
            carregando={pendente}
            onClick={() => abrir('renomear')}
          >
            <Pencil size={16} strokeWidth={1.75} /> Renomear
          </Botao>
        ) : null}
        {acoes.has('substituir') ? (
          <Botao
            variante="fantasma"
            tamanho="pequeno"
            type="button"
            carregando={pendente}
            onClick={() => aoSubstituir(doc.id)}
          >
            <FileUp size={16} strokeWidth={1.75} /> Substituir
          </Botao>
        ) : null}
        {acoes.has('reprocessar') ? (
          <Botao
            variante="fantasma"
            tamanho="pequeno"
            type="button"
            carregando={pendente}
            onClick={() => rodar(() => reprocessarDocumento(doc.id))}
          >
            <RefreshCw size={16} strokeWidth={1.75} /> Reprocessar
          </Botao>
        ) : null}
        {acoes.has('cancelar') && doc.pendente ? (
          <Botao
            variante="fantasma"
            tamanho="pequeno"
            type="button"
            carregando={pendente}
            onClick={() => rodar(() => cancelarEnvio(doc.pendente!.id))}
          >
            <X size={16} strokeWidth={1.75} /> Cancelar {doc.ativa ? 'nova versão' : 'envio'}
          </Botao>
        ) : null}
        {acoes.has('assistentes') ? (
          <Botao
            variante="fantasma"
            tamanho="pequeno"
            type="button"
            carregando={pendente}
            onClick={() => abrir('assistentes')}
          >
            <Users size={16} strokeWidth={1.75} /> Assistentes
          </Botao>
        ) : null}
        {acoes.has('trechos') ? (
          <Botao variante="fantasma" tamanho="pequeno" type="button" onClick={() => abrir('trechos')}>
            {painel === 'trechos' ? 'Fechar trechos' : 'Ver trechos'}
          </Botao>
        ) : null}
        {acoes.has('excluir') ? (
          <Botao
            variante="fantasma"
            tamanho="pequeno"
            tom="erro"
            type="button"
            carregando={pendente}
            aria-label={`Excluir ${doc.nome}`}
            onClick={() => abrir('excluir')}
          >
            <Trash2 size={16} strokeWidth={1.75} /> Excluir
          </Botao>
        ) : null}
      </div>

      {ehOwner && painel === 'excluir' ? (
        <div className={estilos.confirmacao} aria-live="polite">
          <p className={estilos.ajuda}>
            O documento, todas as versões e os trechos saem de vez, e o assistente deixa de usar o que estava nele.
          </p>
          <Botao
            variante="primario"
            tom="erro"
            type="button"
            carregando={pendente}
            onClick={() =>
              rodar(
                () => excluirDocumento(doc.id),
                () => setPainel(null),
              )
            }
          >
            Excluir mesmo assim
          </Botao>
          <Botao type="button" carregando={pendente} onClick={() => abrir('excluir')}>
            Cancelar
          </Botao>
        </div>
      ) : null}

      {ehOwner && painel === 'assistentes' ? (
        <div className={local.painel}>
          <span className={estilos.rotulo}>Quem pode usar este documento</span>
          <div className={estilos.linhaForm}>
            <label className={estilos.ajuda}>
              <input
                type="radio"
                name={`recorte-doc-${doc.id}`}
                checked={modo === 'todos'}
                onChange={() => setModo('todos')}
              />{' '}
              todos os assistentes
            </label>
            <label className={estilos.ajuda}>
              <input
                type="radio"
                name={`recorte-doc-${doc.id}`}
                checked={modo === 'so_estes'}
                onChange={() => setModo('so_estes')}
              />{' '}
              só estes
            </label>
          </div>
          {modo === 'so_estes' ? (
            <div className={estilos.linhaForm}>
              {assistentes.map((a) => (
                <label key={a.id} className={estilos.ajuda}>
                  <input
                    type="checkbox"
                    checked={selecionados.includes(a.id)}
                    onChange={(e) =>
                      setSelecionados((atual) =>
                        e.target.checked ? [...atual, a.id] : atual.filter((sel) => sel !== a.id),
                      )
                    }
                  />{' '}
                  {a.nomeInterno || 'Assistente sem nome'}
                </label>
              ))}
            </div>
          ) : null}
          {modo === 'so_estes' && selecionados.length === 0 ? (
            <p className={estilos.ajuda}>
              Escolha pelo menos um assistente para salvar — ou volte para &quot;todos os assistentes&quot;.
            </p>
          ) : (
            <p className={estilos.ajuda}>
              Por padrão, todo assistente usa este documento. Restrinja só se ele não deve valer para todos.
            </p>
          )}
          <div className={estilos.acoes}>
            <Botao
              variante="primario"
              tamanho="pequeno"
              type="button"
              carregando={pendente}
              desabilitado={modo === 'so_estes' && selecionados.length === 0}
              onClick={() =>
                rodar(
                  () => trocarAssistentesDoDocumento(doc.id, modo === 'todos' ? [] : selecionados),
                  () => setPainel(null),
                )
              }
            >
              Salvar
            </Botao>
            <Botao tamanho="pequeno" type="button" carregando={pendente} onClick={() => setPainel(null)}>
              Cancelar
            </Botao>
          </div>
        </div>
      ) : null}

      {painel === 'trechos' ? (
        <div className={local.painel}>
          <TrechosDoDocumento documentoId={doc.id} />
        </div>
      ) : null}

      {erro ? (
        <div className={local.painel}>
          <p className={estilos.erro} role="alert">
            {erro}
          </p>
        </div>
      ) : null}
    </li>
  )
}
