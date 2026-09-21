'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Botao from '@/components/ui/Botao'
import { Entrada, Selecao } from '@/components/ui/Campo'
import {
  encerrarVenda,
  lerPayload,
  reenviarEmails,
  reprocessar,
  salvarOferta,
  salvarTokenHotmart,
  type OfertaItem,
  type VistaComercial,
} from './acoes-comercial'
import { salvarUrlPublica } from './acoes-canais'
import { DEGUSTACAO, diasDeDegustacao, rotuloDaDuracao } from '@/lib/vendas/degustacao'
import estilos from './config.module.css'

type Resposta = { ok: true; detalhe?: string } | { erro: string }

type PropsBloco = {
  vista: VistaComercial
  executar: (acao: () => Promise<Resposta>, sucesso: string) => void
  pendente: boolean
}

export default function ComercialCard({ inicial }: { inicial: VistaComercial }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [recado, setRecado] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)

  // Lê sempre a vista das props, e depois de cada ação pede ao servidor uma nova: sem cópia local,
  // não há estado velho a regravar por cima do novo.
  function executar(acao: () => Promise<Resposta>, sucesso: string) {
    iniciar(async () => {
      const r = await acao()
      if ('erro' in r) {
        setRecado({ tom: 'erro', texto: r.erro })
        return
      }
      setRecado({ tom: 'ok', texto: r.detalhe ?? sucesso })
      router.refresh()
    })
  }

  const props = { vista: inicial, executar, pendente }
  return (
    <>
      {recado ? (
        <p className={recado.tom === 'erro' ? estilos.erro : estilos.frase} role="status">
          {recado.texto}
        </p>
      ) : null}
      <WebhookBloco {...props} />
      <OfertasBloco {...props} />
      <VendasBloco {...props} />
      <EventosBloco {...props} />
    </>
  )
}

function WebhookBloco({ vista, executar, pendente }: PropsBloco) {
  const [url, setUrl] = useState(vista.urlPublica ?? '')
  const [token, setToken] = useState('')
  const endereco = vista.urlPublica ? `${vista.urlPublica}/api/webhook/hotmart` : null

  return (
    <section className={estilos.bloco}>
      <div className={estilos.blocoCab}>
        <h2 className={estilos.blocoTitulo}>Webhook da Hotmart</h2>
        <span className={estilos.blocoMeta}>Vale para o servidor inteiro</span>
      </div>

      <p className={estilos.ajuda}>
        Na Hotmart, cadastre este endereço (versão 2.0.0) e marque os eventos de compra aprovada,
        cancelada, reembolsada, pedido de reembolso e chargeback.
      </p>
      {endereco ? (
        <p className={estilos.frase}>
          <code className={estilos.campoTag}>{endereco}</code>
        </p>
      ) : (
        <p className={estilos.erro}>
          Falta o endereço público deste CRM: sem ele não há endereço de webhook nem links nos e-mails.
        </p>
      )}

      {vista.souDonoDoDeploy ? (
        <>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="comercial-url">Endereço público deste CRM</label>
            <div className={estilos.linhaForm}>
              <Entrada
                id="comercial-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://crm.suaempresa.com.br"
                autoComplete="off"
                disabled={pendente}
              />
              <Botao variante="primario" carregando={pendente} onClick={() => executar(() => salvarUrlPublica(url), 'Endereço salvo.')}>
                Salvar
              </Botao>
            </div>
          </div>

          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="comercial-hottok">Token de verificação (hottok)</label>
            <div className={estilos.linhaForm}>
              <Entrada
                id="comercial-hottok"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={vista.temToken ? 'já configurado — cole outro para trocar' : 'cole o hottok da Hotmart'}
                autoComplete="off"
                disabled={pendente}
              />
              <Botao
                variante="primario"
                carregando={pendente}
                onClick={() =>
                  executar(async () => {
                    const r = await salvarTokenHotmart(token)
                    if ('ok' in r) setToken('')
                    return r
                  }, 'Token salvo.')
                }
              >
                Salvar
              </Botao>
            </div>
          </div>
          <p className={estilos.ajuda}>
            {vista.temToken
              ? 'O webhook está pronto para receber compras. Trate o token como uma senha.'
              : 'Sem o token, o webhook recusa todas as chamadas.'}
          </p>
        </>
      ) : (
        <p className={estilos.ajuda}>Só o dono do servidor configura o endereço e o token.</p>
      )}
    </section>
  )
}

type Formulario = {
  id?: string
  codigo: string
  nome: string
  produtos: string[]
  duracao: string
  /** Texto, e não número: enquanto a pessoa digita, o campo precisa aceitar o que ela digitou. */
  diasDegustacao: string
  ativa: boolean
  reprocessarVendas: boolean
}
const FORMULARIO_VAZIO: Formulario = { codigo: '', nome: '', produtos: [], duracao: 'mensal', diasDegustacao: '', ativa: true, reprocessarVendas: false }

/** Do item da lista para o formulário: os dias só aparecem quando a oferta é de degustação. */
function formularioDe(o: OfertaItem): Formulario {
  return {
    id: o.id,
    codigo: o.codigo,
    nome: o.nome,
    produtos: o.produtos,
    duracao: o.duracao,
    diasDegustacao: o.diasDegustacao === null ? '' : String(o.diasDegustacao),
    ativa: o.ativa,
    // Sempre desmarcado: reprocessar é uma ação pontual, não um estado da oferta.
    reprocessarVendas: false,
  }
}

/**
 * O que a ação do servidor recebe. `diasDegustacao` é convertido aqui, no clique de salvar, e não
 * a cada tecla: o campo em branco vale nulo — quem decide se ele é obrigatório é a regra da oferta,
 * não a digitação.
 */
function dadosDaOferta(form: Formulario) {
  return {
    id: form.id,
    codigo: form.codigo,
    nome: form.nome,
    produtos: form.produtos,
    duracao: form.duracao,
    diasDegustacao: form.diasDegustacao.trim() ? diasDeDegustacao(form.diasDegustacao) : null,
    ativa: form.ativa,
    reprocessarVendas: form.reprocessarVendas,
  }
}

function OfertasBloco({ vista, executar, pendente }: PropsBloco) {
  const [form, setForm] = useState<Formulario | null>(null)

  function editar(o: OfertaItem) {
    setForm(formularioDe(o))
  }

  function alternarProduto(id: string) {
    setForm((f) => (f ? { ...f, produtos: f.produtos.includes(id) ? f.produtos.filter((p) => p !== id) : [...f.produtos, id] } : f))
  }

  return (
    <section className={estilos.bloco}>
      <div className={estilos.blocoCab}>
        <h2 className={estilos.blocoTitulo}>Ofertas</h2>
        <span className={estilos.blocoMeta}>Vale para este espaço de trabalho</span>
      </div>
      <p className={estilos.ajuda}>
        Cada oferta da Hotmart libera um ou mais produtos por um período. Compras de ofertas que não
        estão aqui passam sem efeito — é o caso de produtos que não são deste sistema. Uma oferta
        desativada deixa de liberar compras novas, sem mexer nas vendas que já existem.
      </p>

      {vista.ofertas.length === 0 ? (
        <p className={estilos.vazio}>Nenhuma oferta cadastrada.</p>
      ) : (
        <ul className={estilos.lista}>
          {vista.ofertas.map((o) => (
            <li key={o.id} className={estilos.item}>
              <span className={estilos.itemInfo}>
                <span className={estilos.itemRotulo}>{o.nome}</span>
                <code className={estilos.campoTag}>{o.codigo}</code>
                <span className={`${estilos.selo} ${estilos.selo_neutro}`}>{rotuloDaDuracao(o.duracao, o.diasDegustacao)}</span>
                {!o.ativa && <span className={`${estilos.selo} ${estilos.selo_neutro}`}>desativada</span>}
              </span>
              <span className={estilos.acoes}>
                <Botao variante="fantasma" tamanho="pequeno" onClick={() => editar(o)}>
                  Editar
                </Botao>
              </span>
            </li>
          ))}
        </ul>
      )}

      {form ? (
        <div className={estilos.modeloEditor}>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="oferta-codigo">Código da oferta na Hotmart</label>
            <Entrada id="oferta-codigo" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="ex.: h2p73ki9" autoComplete="off" />
          </div>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="oferta-nome">Nome (só para você)</label>
            <Entrada id="oferta-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="ex.: Calculadora 2025 — anual" autoComplete="off" />
          </div>
          <div className={estilos.campo}>
            <span className={estilos.rotulo}>Produtos que esta oferta libera</span>
            {vista.produtos.map((p) => (
              <label key={p.id} className={estilos.ajuda}>
                <input type="checkbox" checked={form.produtos.includes(p.id)} onChange={() => alternarProduto(p.id)} /> {p.rotulo}
              </label>
            ))}
          </div>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="oferta-duracao">Tempo de acesso</label>
            <Selecao id="oferta-duracao" value={form.duracao} onChange={(e) => setForm({ ...form, duracao: e.target.value })}>
              {vista.temposDeAcesso.map((t) => (
                <option key={t.valor} value={t.valor}>{t.rotulo}</option>
              ))}
            </Selecao>
          </div>
          {form.duracao === DEGUSTACAO ? (
            <div className={estilos.campo}>
              <label className={estilos.rotulo} htmlFor="oferta-degustacao-dias">Dias de degustação</label>
              <Entrada
                id="oferta-degustacao-dias"
                inputMode="numeric"
                value={form.diasDegustacao}
                onChange={(e) => setForm({ ...form, diasDegustacao: e.target.value })}
                placeholder={`ex.: 7 (de 1 a ${vista.maxDiasDegustacao})`}
                autoComplete="off"
              />
              <p className={estilos.ajuda}>
                A compra desta oferta libera os produtos por estes dias corridos, contados da aprovação do
                pagamento. A duração acima volta a valer se a degustação for desligada — as vendas que já
                existem guardam os dias que compraram.
              </p>
            </div>
          ) : null}
          <label className={estilos.ajuda}>
            <input type="checkbox" checked={form.ativa} onChange={(e) => setForm({ ...form, ativa: e.target.checked })} /> Oferta ativa
          </label>
          {form.id ? (
            <label className={estilos.ajuda}>
              <input
                type="checkbox"
                checked={form.reprocessarVendas}
                onChange={(e) => setForm({ ...form, reprocessarVendas: e.target.checked })}
              />{' '}
              Reprocessar vendas já realizadas com esta oferta (dá de bônus, para quem está com acesso em dia, os produtos que a
              oferta ganhou — não estende nem renova nada)
            </label>
          ) : null}
          <div className={estilos.acoes}>
            <Botao
              variante="primario"
              carregando={pendente}
              onClick={() =>
                executar(async () => {
                  const r = await salvarOferta(dadosDaOferta(form))
                  if ('ok' in r) setForm(null)
                  return r
                }, 'Oferta salva.')
              }
            >
              Salvar oferta
            </Botao>
            <Botao variante="fantasma" onClick={() => setForm(null)}>
              Cancelar
            </Botao>
          </div>
        </div>
      ) : (
        <Botao variante="fantasma" onClick={() => setForm({ ...FORMULARIO_VAZIO })}>
          Nova oferta
        </Botao>
      )}
    </section>
  )
}

function VendasBloco({ vista, executar, pendente }: PropsBloco) {
  return (
    <section className={estilos.bloco}>
      <div className={estilos.blocoCab}>
        <h2 className={estilos.blocoTitulo}>Vendas</h2>
        <span className={estilos.blocoMeta}>As 50 mais recentes</span>
      </div>

      {vista.vendas.length === 0 ? (
        <p className={estilos.vazio}>Nenhuma venda ainda.</p>
      ) : (
        <ul className={estilos.lista}>
          {vista.vendas.map((v) => (
            <li key={v.id} className={estilos.item}>
              <span className={estilos.itemInfo}>
                <span className={estilos.itemRotulo}>{v.membro}</span>
                <span className={`${estilos.selo} ${estilos.selo_neutro}`}>{v.status}</span>
                <span className={`${estilos.selo} ${estilos.selo_neutro}`}>{v.duracao}</span>
                <span className={estilos.ajuda}>
                  {v.produtos} · {v.valor} · aprovada em {new Date(v.aprovadaEm).toLocaleDateString('pt-BR')} · vence {v.vencimento}
                </span>
                <code className={estilos.campoTag}>{v.transacao}</code>
                {v.status === 'ativa' && v.notificacaoPendente ? <span className={estilos.erro}>e-mails pendentes</span> : null}
                {v.observacao ? <span className={estilos.ajuda}>{v.observacao}</span> : null}
              </span>
              {v.status === 'ativa' ? (
                <span className={estilos.acoes}>
                  <Botao variante="fantasma" tamanho="pequeno" carregando={pendente} onClick={() => executar(() => reenviarEmails(v.id), 'E-mails postos na fila.')}>
                    Reenviar e-mails
                  </Botao>
                  <Botao
                    variante="fantasma"
                    tamanho="pequeno"
                    tom="erro"
                    carregando={pendente}
                    onClick={() => {
                      if (window.confirm('Encerrar esta venda? O acesso aos produtos dela para agora.')) {
                        executar(() => encerrarVenda(v.id), 'Venda encerrada.')
                      }
                    }}
                  >
                    Encerrar
                  </Botao>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function EventosBloco({ vista, executar, pendente }: PropsBloco) {
  const [aberto, setAberto] = useState<{ id: string; texto: string } | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function alternarPayload(id: string) {
    if (aberto?.id === id) {
      setAberto(null)
      return
    }
    const r = await lerPayload(id)
    if ('erro' in r) {
      setErro(r.erro)
      return
    }
    setErro(null)
    setAberto({ id, texto: r.texto })
  }

  return (
    <section className={estilos.bloco}>
      <div className={estilos.blocoCab}>
        <h2 className={estilos.blocoTitulo}>Eventos recebidos</h2>
        <span className={estilos.blocoMeta}>Os 50 mais recentes, com o payload original</span>
      </div>
      <p className={estilos.ajuda}>
        Todo aviso da Hotmart fica guardado antes de ser processado. <code className={estilos.campoTag}>oferta_desconhecida</code> é
        o esperado para produtos que não são deste sistema; um evento com <code className={estilos.campoTag}>falhou</code> pode
        ser reprocessado.
      </p>

      {vista.eventos.length === 0 ? (
        <p className={estilos.vazio}>Nenhum evento recebido.</p>
      ) : (
        <ul className={estilos.lista}>
          {vista.eventos.map((e) => (
            <li key={e.id} className={estilos.item}>
              <span className={estilos.itemInfo}>
                <span className={estilos.itemRotulo}>{e.evento ?? 'evento ilegível'}</span>
                <span className={`${estilos.selo} ${estilos.selo_neutro}`}>{e.resultado ?? 'não processado'}</span>
                <span className={estilos.ajuda}>
                  {new Date(e.recebidoEm).toLocaleString('pt-BR')}
                  {e.transacao ? ` · ${e.transacao}` : ''}
                  {e.detalhe ? ` · ${e.detalhe}` : ''}
                </span>
                {aberto?.id === e.id ? (
                  <pre className={estilos.campoTag} style={{ whiteSpace: 'pre-wrap', overflowX: 'auto', maxHeight: 320 }}>
                    {aberto.texto}
                  </pre>
                ) : null}
              </span>
              <span className={estilos.acoes}>
                <Botao variante="fantasma" tamanho="pequeno" onClick={() => alternarPayload(e.id)}>
                  {aberto?.id === e.id ? 'Fechar' : 'Ver payload'}
                </Botao>
                <Botao variante="fantasma" tamanho="pequeno" carregando={pendente} onClick={() => executar(() => reprocessar(e.id), 'Evento reprocessado.')}>
                  Reprocessar
                </Botao>
              </span>
            </li>
          ))}
        </ul>
      )}
      {erro ? <p className={estilos.erro} role="alert">{erro}</p> : null}
    </section>
  )
}
