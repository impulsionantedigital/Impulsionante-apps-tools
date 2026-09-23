'use server'

import { z } from 'zod'
import { admin } from '@/server/supabase'
import { criarClienteServidor } from '@/server/supabase-session'
import { resolverWorkspaceAtivo } from '@/server/auth/workspace-ativo'
import { ehOwnerDoWorkspace } from '@/server/auth/owner-workspace'
import { ehDonoDoDeploy } from '@/server/auth/dono-deploy'
import { exigirEngineLiberado } from '@/server/license/exigir'
import { getSecret, setSecret } from '@/server/secrets'
import { lerConfig } from '@/server/configuracoes'
import { bonificarVendasDaOferta, encerrarVendaManual, reenviarNotificacoes, reprocessarEvento } from '@/server/vendas/processar'
import { esquecerTokenHotmart } from '@/server/vendas/token-hotmart'
import { CHAVE_URL_PUBLICA } from '@/lib/canais/url-publica'
import { PRODUTOS, ehProdutoInterno, type ProdutoId } from '@/lib/produtos/catalogo'
import { rotuloDeId } from '@/lib/produtos/rotulos'
import { rotulosDosProdutos } from '@/server/produtos/rotulos'
import { lerProdutosExternos, type ProdutoExternoItem } from './acoes-produtos-externos'
import {
  DEGUSTACAO,
  DURACAO_PADRAO_DA_DEGUSTACAO,
  PRAZOS_DE_DEGUSTACAO,
  rotuloDaDuracao,
  rotuloDoTempoDeAcesso,
} from '@/lib/vendas/degustacao'
import { DURACOES } from '@/lib/vendas/duracao'
import { CHAVE_HOTTOK_HOTMART } from '@/lib/vendas/hotmart'
import { formatarValor, formatarVencimento, vencimentoMaisTardio } from '@/lib/vendas/formatos'
import { detalheSeguro } from '@/lib/sanitizar-erro'

type Resposta = { ok: true; detalhe?: string } | { erro: string }

export interface OfertaItem {
  id: string
  codigo: string
  nome: string
  produtos: string[]
  duracao: string
  /** Só vale quando `duracao` é a degustação — é o prazo, em dias, que a compra concede. */
  diasDegustacao: number | null
  /** O valor do seletor da duração dos produtos vendidos. */
  tempoDeAcesso: string
  /** Produtos vendidos e produtos de degustação configurados nesta oferta. */
  produtosVenda: string[]
  produtosDegustacao: string[]
  ativa: boolean
  /**
   * Quantas vendas apontam para esta oferta. **Decide se ela pode ser excluída**: a FK
   * `vendas.oferta_id` é `on delete restrict`, então uma oferta com venda não sai do banco —
   * e é essa a regra, não uma checagem nossa que poderia divergir dela.
   */
  vendas: number
}

export interface VendaItem {
  id: string
  membro: string
  transacao: string
  status: string
  /** O prazo que ESTA compra concedeu, já em forma de rótulo — degustação mostra os dias. */
  duracao: string
  produtos: string
  aprovadaEm: string
  vencimento: string
  valor: string
  notificacaoPendente: boolean
  observacao: string | null
}

export interface EventoItem {
  id: string
  evento: string | null
  transacao: string | null
  recebidoEm: string
  resultado: string | null
  detalhe: string | null
}

export interface VistaComercial {
  ofertas: OfertaItem[]
  vendas: VendaItem[]
  eventos: EventoItem[]
  produtos: Array<{ id: string; rotulo: string }>
  produtosExternos: ProdutoExternoItem[]
  temposDeAcesso: Array<{ valor: string; rotulo: string }>
  temposDeDegustacao: Array<{ valor: string; rotulo: string }>
  souDonoDoDeploy: boolean
  temToken: boolean
  urlPublica: string | null
}

const NAO_AUTORIZADO = 'Só o dono do servidor mexe no comercial.'
const Uuid = z.string().uuid()

const MENSAGEM_NOTIFICACAO: Record<string, string> = {
  venda_inativa: 'A venda não está ativa.',
  venda_inexistente: 'Venda não encontrada.',
  membro_inexistente: 'O membro desta venda não existe mais.',
  conta_indisponivel: 'A conta do comprador não foi encontrada.',
  sem_url_publica: 'Configure o endereço público deste CRM antes de enviar e-mails.',
  falha_emitir: 'Não foi possível emitir a senha temporária.',
  falha_enfileirar: 'Não foi possível pôr o e-mail na fila.',
}

/**
 * Dado comercial: só o DONO DO SERVIDOR, no workspace de que é owner. A sessão decide, nunca o
 * cliente. 🔴 Owner de workspace não basta: qualquer usuário logado cria o seu, e poderia cadastrar
 * primeiro o código de oferta de outra pessoa e capturar os compradores dela.
 */
async function workspaceDoOwner(): Promise<string | null> {
  if (!(await ehDonoDoDeploy())) return null
  const cliente = await criarClienteServidor()
  const ws = await resolverWorkspaceAtivo({ cliente })
  if (!ws || !(await ehOwnerDoWorkspace(ws))) return null
  return ws
}

type LinhaVenda = {
  id: string
  membro_id: string
  transacao: string
  status: string
  duracao: string
  dias_degustacao: number | null
  produtos: string[]
  aprovada_em: string
  valor: number | string | null
  moeda: string | null
  notificacao_pendente: boolean
  observacao: string | null
}

export async function lerComercial(): Promise<VistaComercial | { erro: string }> {
  const ws = await workspaceDoOwner()
  if (!ws) return { erro: NAO_AUTORIZADO }
  try {
    const db = admin()
    const souDonoDoDeploy = await ehDonoDoDeploy()

    const { data: ofertas, error: erroOfertas } = await db
      .from('ofertas')
      .select('id, codigo, nome, produtos, duracao, dias_degustacao, ativa')
      .eq('workspace_id', ws)
      .order('criado_em', { ascending: false })
    if (erroOfertas) throw erroOfertas
    const { data: produtosDasOfertas, error: erroProdutosDasOfertas } = await db
      .from('ofertas_produtos')
      .select('oferta_id, produto_id, tipo')
    if (erroProdutosDasOfertas) throw erroProdutosDasOfertas
    const produtosPorOferta = new Map<string, { venda: string[]; degustacao: string[] }>()
    for (const item of (produtosDasOfertas ?? []) as Array<{ oferta_id: string; produto_id: string; tipo: string }>) {
      const atual = produtosPorOferta.get(item.oferta_id) ?? { venda: [], degustacao: [] }
      if (item.tipo === 'degustacao') atual.degustacao.push(item.produto_id)
      else atual.venda.push(item.produto_id)
      produtosPorOferta.set(item.oferta_id, atual)
    }

    const { data: vendas, error: erroVendas } = await db
      .from('vendas')
      .select('id, membro_id, transacao, status, duracao, dias_degustacao, produtos, aprovada_em, valor, moeda, notificacao_pendente, observacao')
      .eq('workspace_id', ws)
      .order('criado_em', { ascending: false })
      .limit(50)
    if (erroVendas) throw erroVendas

    // Eventos de oferta desconhecida nascem sem workspace: só o dono do servidor os vê.
    let consultaEventos = db
      .from('webhook_compras_recebidas')
      .select('id, evento, transacao, recebido_em, resultado, detalhe')
    consultaEventos = souDonoDoDeploy
      ? consultaEventos.or(`workspace_id.eq.${ws},workspace_id.is.null`)
      : consultaEventos.eq('workspace_id', ws)
    const { data: eventos, error: erroEventos } = await consultaEventos
      .order('recebido_em', { ascending: false })
      .limit(50)
    if (erroEventos) throw erroEventos

    const listaVendas = (vendas ?? []) as LinhaVenda[]
    const idsVenda = listaVendas.map((v) => v.id)
    const idsMembro = [...new Set(listaVendas.map((v) => v.membro_id))]

    // 🔴 Uma consulta para todas as vendas, não uma por venda: o rótulo do produto externo vive no
    // banco, e a lista mostra 50 vendas.
    const todosOsIds = [...new Set(listaVendas.flatMap((v) => v.produtos ?? []))]
    const nomesProdutos = await rotulosDosProdutos(ws, todosOsIds)

    /* 🔴 A contagem vem de uma consulta PRÓPRIA, sem `limit`, e não da lista de cima: aquela é um
       `limit(50)` para exibição, e uma oferta com a 51ª venda mais antiga pareceria sem venda
       nenhuma — o botão de excluir apareceria, e o banco recusaria o delete (`on delete restrict`
       em `vendas.oferta_id`). O erro só apareceria no clique, depois de a tela ter mentido. */
    const { data: vendasDasOfertas, error: erroVendasDasOfertas } = await db
      .from('vendas')
      .select('oferta_id')
      .eq('workspace_id', ws)
    if (erroVendasDasOfertas) throw erroVendasDasOfertas
    const vendasPorOferta = new Map<string, number>()
    for (const v of (vendasDasOfertas ?? []) as Array<{ oferta_id: string }>) {
      vendasPorOferta.set(v.oferta_id, (vendasPorOferta.get(v.oferta_id) ?? 0) + 1)
    }

    const periodos: Array<{ venda_id: string; expira_em: string | null }> = []
    if (idsVenda.length > 0) {
      const { data, error } = await db.from('vendas_periodos').select('venda_id, expira_em').in('venda_id', idsVenda)
      if (error) throw error
      periodos.push(...((data ?? []) as typeof periodos))
    }

    const nomes = new Map<string, string>()
    if (idsMembro.length > 0) {
      const { data, error } = await db.from('membros').select('id, user_id, nome').in('id', idsMembro)
      if (error) throw error
      await Promise.all(
        ((data ?? []) as Array<{ id: string; user_id: string; nome: string | null }>).map(async (m) => {
          if (m.nome) {
            nomes.set(m.id, m.nome)
            return
          }
          const { data: conta } = await db.auth.admin.getUserById(m.user_id)
          nomes.set(m.id, conta?.user?.email ?? 'membro sem nome')
        }),
      )
    }

    return {
      ofertas: ((ofertas ?? []) as Array<Omit<OfertaItem, 'diasDegustacao' | 'tempoDeAcesso' | 'produtosVenda' | 'produtosDegustacao' | 'vendas'> & { dias_degustacao: number | null }>).map((o) => {
        const produtos = produtosPorOferta.get(o.id) ?? { venda: o.produtos, degustacao: [] }
        return {
          ...o,
          diasDegustacao: o.dias_degustacao,
          tempoDeAcesso: o.duracao,
          produtosVenda: produtos.venda,
          produtosDegustacao: produtos.degustacao,
          vendas: vendasPorOferta.get(o.id) ?? 0,
        }
      }),
      vendas: listaVendas.map((v) => {
        const vencimentos = periodos
          .filter((p) => p.venda_id === v.id)
          .map((p) => (p.expira_em ? new Date(p.expira_em) : null))
        return {
          id: v.id,
          membro: nomes.get(v.membro_id) ?? 'membro removido',
          transacao: v.transacao,
          status: v.status,
          duracao: rotuloDaDuracao(v.duracao, v.dias_degustacao),
          produtos:
            v.produtos.length > 0
              ? v.produtos.map((p) => rotuloDeId(p, nomesProdutos)).join(', ')
              : '—',
          aprovadaEm: v.aprovada_em,
          vencimento: vencimentos.length > 0 ? formatarVencimento(vencimentoMaisTardio(vencimentos)) : '—',
          valor: formatarValor(v.valor === null ? null : Number(v.valor), v.moeda),
          notificacaoPendente: v.notificacao_pendente,
          observacao: v.observacao,
        }
      }),
      eventos: ((eventos ?? []) as Array<{
        id: string
        evento: string | null
        transacao: string | null
        recebido_em: string
        resultado: string | null
        detalhe: string | null
      }>).map((e) => ({
        id: e.id,
        evento: e.evento,
        transacao: e.transacao,
        recebidoEm: e.recebido_em,
        resultado: e.resultado,
        detalhe: e.detalhe,
      })),
      produtosExternos: await lerProdutosExternos(ws),
    produtos: PRODUTOS.map((p) => ({ id: p.id, rotulo: p.rotulo })),
      temposDeAcesso: DURACOES.map((valor) => ({ valor, rotulo: rotuloDoTempoDeAcesso(valor) })),
      temposDeDegustacao: PRAZOS_DE_DEGUSTACAO.map((dias) => ({ valor: String(dias), rotulo: `Degustação — ${dias} dias` })),
      souDonoDoDeploy,
      temToken: souDonoDoDeploy ? Boolean(await getSecret(CHAVE_HOTTOK_HOTMART)) : false,
      urlPublica: await lerConfig(CHAVE_URL_PUBLICA),
    }
  } catch (err) {
    console.error('[comercial] leitura falhou:', detalheSeguro(err))
    return { erro: 'Não foi possível carregar os dados comerciais.' }
  }
}

const OfertaSchema = z
  .object({
    id: Uuid.optional(),
    codigo: z.string().trim().min(1).max(200),
    nome: z.string().trim().min(1).max(200),
    produtos: z.array(z.string().refine(ehProdutoInterno)).min(1).max(50),
    produtosDegustacao: z.array(z.string().refine(ehProdutoInterno)).max(50).optional().default([]),
    /** Duração normal dos produtos marcados como venda. */
    tempoDeAcesso: z.enum(DURACOES),
    /** Prazo único para todos os produtos marcados como degustação. */
    diasDegustacao: z.union([z.literal(7), z.literal(15)]).nullable().optional(),
    ativa: z.boolean(),
    // Não é coluna da oferta — é um gatilho de uma ação (bônus retroativo), só faz sentido ao
    // editar (por isso não entra em `campos`/`dados` abaixo).
    reprocessarVendas: z.boolean().optional(),
  })
  .refine((o) => o.produtos.some((p) => !o.produtosDegustacao.includes(p)), {
    path: ['produtos'],
    message: 'Escolha pelo menos um produto para venda; degustação não cria venda direta.',
  })
  .refine((o) => o.produtosDegustacao.length === 0 || o.diasDegustacao === 7 || o.diasDegustacao === 15, {
    path: ['diasDegustacao'],
    message: 'Escolha 7 ou 15 dias para os produtos em degustação.',
  })
  .refine((o) => o.produtosDegustacao.every((p) => o.produtos.includes(p)), {
    path: ['produtosDegustacao'],
    message: 'Os produtos de degustação precisam estar na lista da oferta.',
  })

export async function salvarOferta(entrada: unknown): Promise<Resposta> {
  await exigirEngineLiberado()
  const ws = await workspaceDoOwner()
  if (!ws) return { erro: NAO_AUTORIZADO }
  const r = OfertaSchema.safeParse(entrada)
  if (!r.success) return { erro: 'Confira o código, o nome, os produtos e o tempo de acesso da oferta.' }

  const { id, reprocessarVendas, tempoDeAcesso, produtosDegustacao, diasDegustacao, ...campos } = r.data
  const tempo = { duracao: tempoDeAcesso as (typeof DURACOES)[number] }
  const degustacao = produtosDegustacao.length > 0
  const produtosSelecionados = [...new Set([...(campos.produtos ?? []), ...produtosDegustacao])]
  const dados = {
    ...campos,
    // 🔴 `duracao` NUNCA recebe 'degustacao': a coluna tem `ofertas_duracao_dominio_check`, que
    // aceita só os sete nomes, e o banco recusa o insert com 23514. Quem identifica a degustação é
    // `dias_degustacao` — é ele que `duracaoDaOferta` lê primeiro. Gravar 'degustacao' aqui
    // contradizia a decisão tomada na migration 0069 (que não alarga o domínio), e foi o defeito
    // que fez toda oferta de trial falhar ao salvar.
    duracao: degustacao ? DURACAO_PADRAO_DA_DEGUSTACAO : tempo.duracao,
    plataforma: 'hotmart',
    produtos: produtosSelecionados,
    // O prazo em dias só existe quando há produtos de degustação; todos eles compartilham o mesmo prazo.
    dias_degustacao: degustacao ? diasDegustacao : null,
  }
  const db = admin()
  const { data, error } = id
    ? await db.from('ofertas').update(dados).eq('workspace_id', ws).eq('id', id).select('id')
    : await db.from('ofertas').insert({ ...dados, workspace_id: ws }).select('id')
  if (error) {
    // 🔴 `42703` é coluna inexistente: a migration não rodou no banco. Vale a mensagem própria
    // porque o sintoma é indistinguível de erro de formulário, e o dono ficaria procurando o
    // problema no lugar errado — foi o que aconteceu de verdade, e a mensagem genérica escondeu.
    if (error.code === '42703') {
      console.error('[comercial] oferta recusada por coluna inexistente:', detalheSeguro(error))
      return { erro: 'O banco deste CRM está sem as colunas da degustação. Reinicie o servidor para aplicar as migrations pendentes.' }
    }
    if (error.code === '23505') return { erro: 'Este código de oferta já está cadastrado.' }
    console.error('[comercial] salvar oferta falhou:', detalheSeguro(error))
    return { erro: 'Não foi possível salvar a oferta.' }
  }
  if (!data?.length) return { erro: 'Oferta não encontrada.' }
  const ofertaId = (data[0] as { id: string }).id
  // 🔴 A vaca sagrada: uma oferta de DEGUSTAÇÃO nunca recebe venda (§7.5.1). O código dela é
  // escolhido à mão e não existe na Hotmart; se alguém colar ali o código de uma oferta real, a
  // compra cairia numa oferta que não vende — e o membro pagaria sem receber.
  if (degustacao && campos.ativa) {
    const { data: colide, error: erroColide } = await db
      .from('ofertas')
      .select('id')
      .eq('plataforma', 'hotmart')
      .eq('codigo', campos.codigo)
      .neq('id', ofertaId)
      .limit(1)
    if (erroColide) {
      console.error('[comercial] conferência de código colidiu falhou:', detalheSeguro(erroColide))
      return { erro: 'Não foi possível salvar a oferta.' }
    }
    if (colide?.length) {
      return { erro: 'Este código já pertence a outra oferta. A oferta de degustação não recebe vendas, então o código dela precisa ser livre.' }
    }
  }

  const { error: erroProdutos } = await db.from('ofertas_produtos').delete().eq('oferta_id', ofertaId)
  if (erroProdutos) {
    console.error('[comercial] limpar produtos da oferta falhou:', detalheSeguro(erroProdutos))
    return { erro: 'Não foi possível salvar os produtos da oferta.' }
  }
  const linhasProdutos = produtosSelecionados.map((produtoId) => ({
    oferta_id: ofertaId,
    produto_id: produtoId,
    tipo: produtosDegustacao.includes(produtoId) ? 'degustacao' : 'venda',
  }))
  const { error: erroInserirProdutos } = await db.from('ofertas_produtos').insert(linhasProdutos)
  if (erroInserirProdutos) {
    console.error('[comercial] gravar produtos da oferta falhou:', detalheSeguro(erroInserirProdutos))
    return { erro: 'Não foi possível salvar os produtos da oferta.' }
  }
  if (id && reprocessarVendas) {
    try {
      const { vendasAtualizadas, periodosNovos } = await bonificarVendasDaOferta(ws, id)
      return {
        ok: true,
        detalhe:
          vendasAtualizadas > 0
            ? `Oferta salva. ${vendasAtualizadas} venda(s) vigente(s) ganharam ${periodosNovos} produto(s) novo(s).`
            : 'Oferta salva. Nenhuma venda vigente precisava de produto novo.',
      }
    } catch (err) {
      console.error('[comercial] bônus de vendas falhou:', detalheSeguro(err))
      return { ok: true, detalhe: 'Oferta salva, mas o reprocessamento das vendas falhou. Tente reprocessar de novo.' }
    }
  }

  return { ok: true }
}

/**
 * Exclui uma oferta **sem venda nenhuma**. É o único caso em que ela pode sair: a FK
 * `vendas.oferta_id` é `on delete restrict`, porque a venda é a fotografia da oferta no dia da
 * compra (§7.4) — apagar a oferta apagaria a explicação de por que aquele membro recebeu aqueles
 * produtos por aquele prazo.
 *
 * 🔴 Quem recusa é o BANCO, não um `if` daqui. A conferência local existe para dar a mensagem
 * certa em vez de um erro de FK cru, mas a decisão de gravar continua sendo uma só, no schema: se
 * uma venda entrar entre a contagem e o delete, o `restrict` segura do mesmo jeito.
 *
 * `ofertas_produtos` sai junto pelo `on delete cascade` da própria tabela (migration 0071).
 */
export async function excluirOferta(id: string): Promise<Resposta> {
  await exigirEngineLiberado()
  const ws = await workspaceDoOwner()
  if (!ws) return { erro: NAO_AUTORIZADO }
  if (!Uuid.safeParse(id).success) return { erro: 'Oferta inválida.' }

  const db = admin()
  const { data: vendas, error: erroVendas } = await db
    .from('vendas')
    .select('id')
    .eq('workspace_id', ws)
    .eq('oferta_id', id)
    .limit(1)
  if (erroVendas) {
    console.error('[comercial] conferir vendas da oferta falhou:', detalheSeguro(erroVendas))
    return { erro: 'Não foi possível conferir as vendas desta oferta.' }
  }
  if (vendas?.length) {
    return {
      erro: 'Esta oferta já tem venda e não pode ser excluída — o histórico de quem comprou aponta para ela. Desative a oferta para parar de liberar compras novas.',
    }
  }

  const { data, error } = await db.from('ofertas').delete().eq('workspace_id', ws).eq('id', id).select('id')
  if (error) {
    // A corrida: uma venda entrou depois da contagem acima. O `on delete restrict` recusou —
    // a mesma resposta da contagem, para o clique não virar um erro de banco na cara do usuário.
    if (error.code === '23503') {
      return {
        erro: 'Esta oferta já tem venda e não pode ser excluída — o histórico de quem comprou aponta para ela. Desative a oferta para parar de liberar compras novas.',
      }
    }
    console.error('[comercial] excluir oferta falhou:', detalheSeguro(error))
    return { erro: 'Não foi possível excluir a oferta.' }
  }
  if (!data?.length) return { erro: 'Oferta não encontrada.' }

  return { ok: true }
}


export async function salvarTokenHotmart(token: string): Promise<Resposta> {
  await exigirEngineLiberado()
  if (!(await ehDonoDoDeploy())) return { erro: 'Só o dono do servidor configura o token da Hotmart.' }
  const limpo = typeof token === 'string' ? token.trim() : ''
  if (!limpo || limpo.length > 4096) return { erro: 'Cole o token de verificação (hottok) da Hotmart.' }
  if (!(await setSecret(CHAVE_HOTTOK_HOTMART, limpo))) return { erro: 'Não foi possível guardar o token.' }
  esquecerTokenHotmart()
  return { ok: true }
}

export async function encerrarVenda(id: string): Promise<Resposta> {
  await exigirEngineLiberado()
  const ws = await workspaceDoOwner()
  if (!ws) return { erro: NAO_AUTORIZADO }
  if (!Uuid.safeParse(id).success) return { erro: 'Venda inválida.' }
  try {
    return await encerrarVendaManual(ws, id)
  } catch (err) {
    console.error('[comercial] encerrar venda falhou:', detalheSeguro(err))
    return { erro: 'Não foi possível encerrar a venda.' }
  }
}

export async function reenviarEmails(id: string): Promise<Resposta> {
  await exigirEngineLiberado()
  const ws = await workspaceDoOwner()
  if (!ws) return { erro: NAO_AUTORIZADO }
  if (!Uuid.safeParse(id).success) return { erro: 'Venda inválida.' }
  try {
    const r = await reenviarNotificacoes(ws, id)
    return 'erro' in r ? { erro: MENSAGEM_NOTIFICACAO[r.erro] ?? 'Não foi possível reenviar.' } : { ok: true }
  } catch (err) {
    console.error('[comercial] reenviar e-mails falhou:', detalheSeguro(err))
    return { erro: 'Não foi possível reenviar os e-mails.' }
  }
}

async function eventoAutorizado(id: string): Promise<{ ok: true; payload: unknown } | { erro: string }> {
  const ws = await workspaceDoOwner()
  if (!ws) return { erro: NAO_AUTORIZADO }
  if (!Uuid.safeParse(id).success) return { erro: 'Evento inválido.' }
  const { data, error } = await admin()
    .from('webhook_compras_recebidas')
    .select('workspace_id, payload')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return { erro: 'Evento não encontrado.' }
  const permitido = data.workspace_id === ws || (data.workspace_id === null && (await ehDonoDoDeploy()))
  return permitido ? { ok: true, payload: data.payload } : { erro: 'Evento não encontrado.' }
}

export async function reprocessar(id: string): Promise<Resposta> {
  await exigirEngineLiberado()
  const autorizado = await eventoAutorizado(id)
  if ('erro' in autorizado) return autorizado
  return (await reprocessarEvento(id)) === 'ok'
    ? { ok: true }
    : { erro: 'O reprocessamento falhou. Veja o detalhe do evento.' }
}

export async function lerPayload(id: string): Promise<{ ok: true; texto: string } | { erro: string }> {
  const autorizado = await eventoAutorizado(id)
  if ('erro' in autorizado) return autorizado
  return { ok: true, texto: JSON.stringify(autorizado.payload, null, 2).slice(0, 20_000) }
}
