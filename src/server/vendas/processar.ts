import 'server-only'
import { admin } from '@/server/supabase'
import { lerConfig } from '@/server/configuracoes'
import { enfileirar } from '@/server/email/fila'
import { emitirSenhaTemporaria, urlDeEntrada } from '@/server/auth/temporaria'
import { resolverMembro } from '@/server/vendas/identidade'
import { CHAVE_URL_PUBLICA } from '@/lib/canais/url-publica'
import { detalheSeguro } from '@/lib/sanitizar-erro'
import { PRODUTOS, ehProdutoConhecido, rotuloDoProduto } from '@/lib/produtos/catalogo'
import { ehDuracao, type Duracao } from '@/lib/vendas/duracao'
import { decidirEmails } from '@/lib/vendas/emails'
import { formatarValor, formatarVencimento, vencimentoMaisTardio } from '@/lib/vendas/formatos'
import { lerEventoHotmart, statusInicialDaVenda, type EventoHotmart, type StatusEncerramento } from '@/lib/vendas/hotmart'
import { calcularPeriodos, type PeriodoExistente, type PeriodoNovo } from '@/lib/vendas/periodos'

type Aprovada = Extract<EventoHotmart, { tipo: 'aprovada' }>
type Encerrada = Extract<EventoHotmart, { tipo: 'encerrada' }>
type Desfecho = { resultado: string; detalhe?: string | null; workspaceId?: string | null }

export type ResultadoNotificacao =
  | { ok: true }
  | { erro: 'venda_inativa' | 'membro_inexistente' | 'conta_indisponivel' | 'sem_url_publica' | 'falha_emitir' | 'falha_enfileirar' }

type LinhaVenda = {
  id: string
  workspace_id: string
  membro_id: string
  status: string
  produtos: string[]
  duracao: string
  aprovada_em: string
  notificacao_pendente: boolean
}

const COLUNAS_VENDA = 'id, workspace_id, membro_id, status, produtos, duracao, aprovada_em, notificacao_pendente'

function juntar(...partes: (string | null | undefined)[]): string | null {
  const texto = partes.filter(Boolean).join(' · ')
  return texto || null
}

// ── recebimento ──────────────────────────────────────────────────────────────────────────────

/**
 * Grava o payload ANTES de processar (§7.2) e processa. `ok` inclui o que não é deste sistema;
 * `falhou` é só erro inesperado, para a Hotmart reenviar (§7.6).
 */
export async function receberCompra(plataforma: 'hotmart', payload: unknown, corpoBruto: string): Promise<'ok' | 'falhou'> {
  const cli = admin()
  const evento = lerEventoHotmart(payload)

  const { data, error } = await cli
    .from('webhook_compras_recebidas')
    .insert({
      plataforma,
      event_id: evento.eventId,
      evento: evento.evento,
      transacao: evento.transacao,
      payload: payload ?? { corpo_invalido: corpoBruto.slice(0, 10_000) },
    })
    .select('id')
    .single()
  if (!error) return processarRegistro((data as { id: string }).id, evento)

  if (error.code !== '23505' || !evento.eventId) {
    console.error('[vendas] auditoria do webhook não foi gravada:', detalheSeguro(error))
    return 'falhou'
  }

  // A mesma entrega chegou de novo: só reprocessa se a anterior não concluiu.
  const { data: anterior, error: erroAnterior } = await cli
    .from('webhook_compras_recebidas')
    .select('id, processado_em, resultado')
    .eq('plataforma', plataforma)
    .eq('event_id', evento.eventId)
    .maybeSingle()
  if (erroAnterior || !anterior) return 'falhou'
  if (anterior.processado_em && anterior.resultado !== 'falhou') return 'ok'
  return processarRegistro(anterior.id as string, evento)
}

export async function reprocessarEvento(auditId: string): Promise<'ok' | 'falhou'> {
  const { data, error } = await admin()
    .from('webhook_compras_recebidas')
    .select('id, payload')
    .eq('id', auditId)
    .maybeSingle()
  if (error || !data) return 'falhou'
  return processarRegistro(auditId, lerEventoHotmart(data.payload))
}

async function processarRegistro(auditId: string, evento: EventoHotmart): Promise<'ok' | 'falhou'> {
  let desfecho: Desfecho
  try {
    if (evento.tipo === 'aprovada') desfecho = await aprovar(auditId, evento)
    else if (evento.tipo === 'encerrada') desfecho = await encerrar(evento)
    else desfecho = { resultado: evento.motivo === 'payload_invalido' ? 'payload_invalido' : 'evento_ignorado' }
  } catch (err) {
    await marcar(auditId, { resultado: 'falhou', detalhe: String(detalheSeguro(err)).slice(0, 500) })
    return 'falhou'
  }
  await marcar(auditId, desfecho)
  return 'ok'
}

async function marcar(auditId: string, desfecho: Desfecho): Promise<void> {
  const { error } = await admin()
    .from('webhook_compras_recebidas')
    .update({
      processado_em: new Date().toISOString(),
      resultado: desfecho.resultado,
      detalhe: desfecho.detalhe ?? null,
      ...(desfecho.workspaceId ? { workspace_id: desfecho.workspaceId } : {}),
    })
    .eq('id', auditId)
  if (error) console.warn('[vendas] auditoria não foi marcada:', detalheSeguro(error))
}

// ── aprovação ────────────────────────────────────────────────────────────────────────────────

async function aprovar(auditId: string, evento: Aprovada): Promise<Desfecho> {
  const cli = admin()

  const { data: oferta, error: erroOferta } = await cli
    .from('ofertas')
    .select('id, workspace_id, produtos, duracao, ativa')
    .eq('plataforma', 'hotmart')
    .eq('codigo', evento.codigoOferta)
    .maybeSingle()
  if (erroOferta) throw erroOferta
  // Compra de algo que não é deste sistema: passa sem ruído (§7.5.1).
  if (!oferta) return { resultado: 'oferta_desconhecida' }
  const ws = oferta.workspace_id as string
  if (!oferta.ativa) return { resultado: 'oferta_desconhecida', detalhe: 'oferta inativa', workspaceId: ws }

  const produtos = (oferta.produtos as string[]).filter(ehProdutoConhecido)
  const duracao = oferta.duracao as string
  if (produtos.length === 0 || !ehDuracao(duracao)) {
    return { resultado: 'oferta_invalida', detalhe: 'sem produto conhecido, ou duração inválida', workspaceId: ws }
  }

  // A transação já virou venda? Então é reenvio — completa o que tiver faltado.
  const { data: existente, error: erroExistente } = await cli
    .from('vendas')
    .select(COLUNAS_VENDA)
    .eq('plataforma', 'hotmart')
    .eq('transacao', evento.transacao)
    .maybeSingle()
  if (erroExistente) throw erroExistente
  if (existente) return retomar(existente as LinhaVenda)

  const membro = await resolverMembro(ws, evento.comprador)

  // Encerramentos desta transação que chegaram antes da aprovação (§16.1, item 9).
  const status = (await encerramentoRegistrado(evento.transacao, auditId)) ?? 'ativa'

  // 🔴 O histórico é lido ANTES de gravar a venda, senão ela entra na própria conta.
  const { existentes, jaTidos } = await historicoDoMembro(ws, membro.membroId)
  const novos = status === 'ativa' ? produtos.filter((p) => !jaTidos.has(p)) : []

  const { data: venda, error: erroVenda } = await cli
    .from('vendas')
    .insert({
      workspace_id: ws,
      membro_id: membro.membroId,
      oferta_id: oferta.id,
      plataforma: 'hotmart',
      transacao: evento.transacao,
      status,
      produtos,
      produtos_novos: novos,
      duracao,
      aprovada_em: evento.aprovadaEm.toISOString(),
      valor: evento.valor,
      moeda: evento.moeda,
      encerrada_em: status === 'ativa' ? null : new Date().toISOString(),
      notificacao_pendente: status === 'ativa',
      observacao: membro.observacao,
    })
    .select(COLUNAS_VENDA)
    .single()
  if (erroVenda) {
    if (erroVenda.code !== '23505') throw erroVenda
    const { data: corrida } = await cli
      .from('vendas')
      .select(COLUNAS_VENDA)
      .eq('plataforma', 'hotmart')
      .eq('transacao', evento.transacao)
      .maybeSingle()
    if (!corrida) throw erroVenda
    return retomar(corrida as LinhaVenda)
  }

  const gravada = venda as LinhaVenda
  if (status !== 'ativa') {
    return { resultado: 'venda_criada_encerrada', workspaceId: ws, detalhe: juntar(`nasceu ${status}`, membro.observacao) }
  }

  // Um encerramento pode ter chegado ENTRE a leitura acima e a gravação da venda.
  const tardio = await encerramentoRegistrado(evento.transacao, auditId)
  if (tardio) {
    const { error: erroTardio } = await cli
      .from('vendas')
      .update({ status: tardio, encerrada_em: new Date().toISOString(), notificacao_pendente: false, produtos_novos: [] })
      .eq('id', gravada.id)
      .eq('status', 'ativa')
    if (erroTardio) throw erroTardio
    return { resultado: 'venda_criada_encerrada', workspaceId: ws, detalhe: juntar(`encerrada durante a aprovação: ${tardio}`, membro.observacao) }
  }

  await gravarPeriodos(ws, membro.membroId, gravada.id, calcularPeriodos({
    produtos,
    duracao,
    aprovadaEm: evento.aprovadaEm,
    existentes,
  }))
  // 🔴 Falha ao enfileirar os e-mails LANÇA: o evento fica `falhou`, a rota devolve 500 e a Hotmart
  // reenvia — o reenvio cai em `retomar`, que completa sem duplicar. Devolver só um aviso deixaria
  // o comprador sem a senha até alguém reparar.
  await notificarOuFalhar(gravada.id)
  return { resultado: 'venda_criada', workspaceId: ws, detalhe: membro.observacao }
}

async function encerramentoRegistrado(transacao: string, excluirAuditId: string): Promise<StatusEncerramento | null> {
  const { data, error } = await admin()
    .from('webhook_compras_recebidas')
    .select('evento')
    .eq('plataforma', 'hotmart')
    .eq('transacao', transacao)
    .neq('id', excluirAuditId)
    .order('recebido_em', { ascending: true })
  if (error) throw error
  const status = statusInicialDaVenda(
    (data ?? []).map((a) => a.evento as string | null).filter((e): e is string => typeof e === 'string'),
  )
  return status === 'ativa' ? null : status
}

/**
 * Reenvio de uma transação que já é venda. Se o processamento anterior caiu entre gravar a venda e
 * gravar os períodos, ou antes de enfileirar os e-mails, completa aqui — senão o comprador teria
 * pago sem acesso.
 */
async function retomar(venda: LinhaVenda): Promise<Desfecho> {
  await garantirPeriodos(venda)
  if (venda.status === 'ativa' && venda.notificacao_pendente) await notificarOuFalhar(venda.id)
  return { resultado: 'venda_existente', workspaceId: venda.workspace_id }
}

async function garantirPeriodos(venda: LinhaVenda): Promise<void> {
  const duracao = venda.duracao
  if (venda.status !== 'ativa' || !ehDuracao(duracao)) return
  const { count, error } = await admin()
    .from('vendas_periodos')
    .select('id', { count: 'exact', head: true })
    .eq('venda_id', venda.id)
  if (error) throw error
  if ((count ?? 0) > 0) return
  const { existentes } = await historicoDoMembro(venda.workspace_id, venda.membro_id, venda.id)
  await gravarPeriodos(venda.workspace_id, venda.membro_id, venda.id, calcularPeriodos({
    produtos: venda.produtos.filter(ehProdutoConhecido),
    duracao: duracao as Duracao,
    aprovadaEm: new Date(venda.aprovada_em),
    existentes,
  }))
}

async function gravarPeriodos(ws: string, membroId: string, vendaId: string, periodos: PeriodoNovo[]): Promise<void> {
  if (periodos.length === 0) return
  const { error } = await admin()
    .from('vendas_periodos')
    .insert(periodos.map((p) => ({
      workspace_id: ws,
      membro_id: membroId,
      venda_id: vendaId,
      produto_id: p.produtoId,
      inicia_em: p.iniciaEm.toISOString(),
      expira_em: p.expiraEm ? p.expiraEm.toISOString() : null,
    })))
  // Chave (venda, produto) repetida: outro processamento da mesma venda gravou primeiro.
  if (error && error.code !== '23505') throw error
}

async function historicoDoMembro(
  ws: string,
  membroId: string,
  excluirVendaId?: string,
): Promise<{ existentes: PeriodoExistente[]; jaTidos: Set<string> }> {
  const cli = admin()
  const { data: vendas, error } = await cli
    .from('vendas')
    .select('id, status')
    .eq('workspace_id', ws)
    .eq('membro_id', membroId)
  if (error) throw error
  const lista = ((vendas ?? []) as Array<{ id: string; status: string }>).filter((v) => v.id !== excluirVendaId)
  if (lista.length === 0) return { existentes: [], jaTidos: new Set() }

  const ativa = new Map(lista.map((v) => [v.id, v.status === 'ativa']))
  const { data: periodos, error: erroPeriodos } = await cli
    .from('vendas_periodos')
    .select('venda_id, produto_id, expira_em')
    .in('venda_id', [...ativa.keys()])
  if (erroPeriodos) throw erroPeriodos

  const existentes = ((periodos ?? []) as Array<{ venda_id: string; produto_id: string; expira_em: string | null }>).map((p) => ({
    produtoId: p.produto_id,
    expiraEm: p.expira_em ? new Date(p.expira_em) : null,
    vendaAtiva: ativa.get(p.venda_id) ?? false,
  }))
  return { existentes, jaTidos: new Set(existentes.map((e) => e.produtoId)) }
}

// ── encerramento ─────────────────────────────────────────────────────────────────────────────

async function encerrar(evento: Encerrada): Promise<Desfecho> {
  const cli = admin()
  const { data: venda, error } = await cli
    .from('vendas')
    .select('id, workspace_id, status')
    .eq('plataforma', 'hotmart')
    .eq('transacao', evento.transacao)
    .maybeSingle()
  if (error) throw error
  // Sem venda: pode ser de outro produto, ou chegou antes da aprovação — fica na auditoria.
  if (!venda) return { resultado: 'transacao_desconhecida' }
  if (venda.status !== 'ativa') return { resultado: 'venda_ja_encerrada', workspaceId: venda.workspace_id }

  const { error: erroUpdate } = await cli
    .from('vendas')
    .update({ status: evento.status, encerrada_em: new Date().toISOString(), notificacao_pendente: false })
    .eq('id', venda.id)
    .eq('status', 'ativa')
  if (erroUpdate) throw erroUpdate
  return { resultado: 'venda_encerrada', workspaceId: venda.workspace_id, detalhe: evento.status }
}

export async function encerrarVendaManual(workspaceId: string, vendaId: string): Promise<{ ok: true } | { erro: string }> {
  const { data, error } = await admin()
    .from('vendas')
    .update({ status: 'cancelada', encerrada_em: new Date().toISOString(), notificacao_pendente: false })
    .eq('workspace_id', workspaceId)
    .eq('id', vendaId)
    .eq('status', 'ativa')
    .select('id')
  if (error) throw error
  return data?.length ? { ok: true } : { erro: 'Venda não encontrada, ou já encerrada.' }
}

// ── e-mails ──────────────────────────────────────────────────────────────────────────────────

async function notificarOuFalhar(vendaId: string): Promise<void> {
  const r = await notificar(vendaId)
  if ('erro' in r) throw new Error(`e-mails da venda ficaram pendentes: ${r.erro}`)
}

export async function reenviarNotificacoes(
  workspaceId: string,
  vendaId: string,
): Promise<ResultadoNotificacao | { erro: 'venda_inexistente' }> {
  const { data, error } = await admin()
    .from('vendas')
    .select(COLUNAS_VENDA)
    .eq('workspace_id', workspaceId)
    .eq('id', vendaId)
    .maybeSingle()
  if (error) throw error
  if (!data) return { erro: 'venda_inexistente' }
  // Sem períodos, o e-mail anunciaria "sem data de término": completa-os antes.
  await garantirPeriodos(data as LinhaVenda)
  return notificar(vendaId, { manual: true })
}

/**
 * Enfileira os e-mails de uma venda ativa (§7.5.2). Idempotente pela chave de cada e-mail, para o
 * reprocessamento não duplicar; `manual` gera uma chave nova, porque aí o reenvio é o pedido.
 */
export async function notificar(vendaId: string, opcoes: { manual?: boolean } = {}): Promise<ResultadoNotificacao> {
  const cli = admin()
  const { data: venda, error } = await cli
    .from('vendas')
    .select('id, workspace_id, membro_id, oferta_id, status, produtos, produtos_novos, valor, moeda, transacao')
    .eq('id', vendaId)
    .maybeSingle()
  if (error) throw error
  if (!venda || venda.status !== 'ativa') return { erro: 'venda_inativa' }

  const [membroR, ofertaR, periodosR] = await Promise.all([
    cli.from('membros').select('user_id, nome').eq('id', venda.membro_id).maybeSingle(),
    cli.from('ofertas').select('nome').eq('id', venda.oferta_id).maybeSingle(),
    cli.from('vendas_periodos').select('produto_id, expira_em').eq('venda_id', venda.id),
  ])
  if (membroR.error) throw membroR.error
  if (ofertaR.error) throw ofertaR.error
  if (periodosR.error) throw periodosR.error
  const membro = membroR.data as { user_id: string; nome: string | null } | null
  if (!membro) return { erro: 'membro_inexistente' }

  const { data: conta, error: erroConta } = await cli.auth.admin.getUserById(membro.user_id)
  const usuario = conta?.user
  if (erroConta || !usuario?.email) return { erro: 'conta_indisponivel' }
  const email = usuario.email

  const origem = await lerConfig(CHAVE_URL_PUBLICA)
  const login = await urlDeEntrada()
  if (!origem || !login) return { erro: 'sem_url_publica' }

  const produtos = (venda.produtos as string[]).filter(ehProdutoConhecido)
  const novos = ((venda.produtos_novos ?? []) as string[]).filter(ehProdutoConhecido)
  const decisao = decidirEmails({
    vendaAtiva: true,
    nuncaEntrou: !usuario.last_sign_in_at,
    produtosOferta: produtos,
    produtosJaTidos: produtos.filter((p) => !novos.includes(p)),
  })

  const periodos = (periodosR.data ?? []) as Array<{ produto_id: string; expira_em: string | null }>
  const vencimentoDe = (ids: readonly string[]) =>
    formatarVencimento(vencimentoMaisTardio(
      periodos.filter((p) => ids.includes(p.produto_id)).map((p) => (p.expira_em ? new Date(p.expira_em) : null)),
    ))
  const base = {
    MEMBER_NAME: membro.nome ?? email,
    MEMBER_EMAIL: email,
    OFFER_NAME: (ofertaR.data as { nome: string } | null)?.nome ?? '',
    LOGIN_URL: login,
  }
  const sufixo = opcoes.manual ? `:manual:${Date.now()}` : ''

  if (decisao.boasVindas) {
    const r = await emitirSenhaTemporaria({ userId: membro.user_id, workspaceId: venda.workspace_id, tipo: 'boas_vindas', forcar: false })
    if ('erro' in r) return { erro: r.erro }
  }

  if (decisao.entrega.length > 0) {
    const ids = decisao.entrega.filter(ehProdutoConhecido)
    const ferramenta = PRODUTOS.find((p) => p.id === ids[0])
    const r = await enfileirar({
      workspaceId: venda.workspace_id,
      tipo: 'entrega_produto',
      para: email,
      chave: `venda:${venda.id}:entrega${sufixo}`,
      valores: {
        ...base,
        PRODUCT_NAME: ids.map(rotuloDoProduto).join(', '),
        EXPIRES_AT: vencimentoDe(ids),
        TOOL_URL: ferramenta ? new URL(ferramenta.href, origem).href : login,
      },
    })
    if ('erro' in r) return { erro: 'falha_enfileirar' }
  }

  if (decisao.pagamentoRecebido) {
    const r = await enfileirar({
      workspaceId: venda.workspace_id,
      tipo: 'pagamento_recebido',
      para: email,
      chave: `venda:${venda.id}:pagamento${sufixo}`,
      valores: {
        ...base,
        PRODUCT_NAME: produtos.map(rotuloDoProduto).join(', '),
        EXPIRES_AT: vencimentoDe(produtos),
        VALUE: formatarValor(venda.valor === null ? null : Number(venda.valor), venda.moeda as string | null),
        TRANSACTION: venda.transacao as string,
      },
    })
    if ('erro' in r) return { erro: 'falha_enfileirar' }
  }

  const { error: erroMarca } = await cli.from('vendas').update({ notificacao_pendente: false }).eq('id', venda.id)
  if (erroMarca) throw erroMarca
  return { ok: true }
}
