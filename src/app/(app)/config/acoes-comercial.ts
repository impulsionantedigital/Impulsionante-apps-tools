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
import { encerrarVendaManual, reenviarNotificacoes, reprocessarEvento } from '@/server/vendas/processar'
import { CHAVE_URL_PUBLICA } from '@/lib/canais/url-publica'
import { PRODUTOS, ehProdutoConhecido, rotuloDoProduto } from '@/lib/produtos/catalogo'
import { DURACOES } from '@/lib/vendas/duracao'
import { CHAVE_HOTTOK_HOTMART } from '@/lib/vendas/hotmart'
import { formatarValor, formatarVencimento, vencimentoMaisTardio } from '@/lib/vendas/formatos'
import { detalheSeguro } from '@/lib/sanitizar-erro'

type Resposta = { ok: true } | { erro: string }

export interface OfertaItem {
  id: string
  codigo: string
  nome: string
  produtos: string[]
  duracao: string
  ativa: boolean
}

export interface VendaItem {
  id: string
  membro: string
  transacao: string
  status: string
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
  duracoes: string[]
  souDonoDoDeploy: boolean
  temToken: boolean
  urlPublica: string | null
}

const NAO_AUTORIZADO = 'Só quem é dono deste espaço de trabalho mexe no comercial.'
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

/** Dado comercial: só o owner do espaço de trabalho. A sessão decide, nunca o cliente. */
async function workspaceDoOwner(): Promise<string | null> {
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
      .select('id, codigo, nome, produtos, duracao, ativa')
      .eq('workspace_id', ws)
      .order('criado_em', { ascending: false })
    if (erroOfertas) throw erroOfertas

    const { data: vendas, error: erroVendas } = await db
      .from('vendas')
      .select('id, membro_id, transacao, status, produtos, aprovada_em, valor, moeda, notificacao_pendente, observacao')
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
      ofertas: (ofertas ?? []) as OfertaItem[],
      vendas: listaVendas.map((v) => {
        const vencimentos = periodos
          .filter((p) => p.venda_id === v.id)
          .map((p) => (p.expira_em ? new Date(p.expira_em) : null))
        const conhecidos = v.produtos.filter(ehProdutoConhecido)
        return {
          id: v.id,
          membro: nomes.get(v.membro_id) ?? 'membro removido',
          transacao: v.transacao,
          status: v.status,
          produtos: conhecidos.length > 0 ? conhecidos.map(rotuloDoProduto).join(', ') : v.produtos.join(', '),
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
      produtos: PRODUTOS.map((p) => ({ id: p.id, rotulo: p.rotulo })),
      duracoes: [...DURACOES],
      souDonoDoDeploy,
      temToken: souDonoDoDeploy ? Boolean(await getSecret(CHAVE_HOTTOK_HOTMART)) : false,
      urlPublica: await lerConfig(CHAVE_URL_PUBLICA),
    }
  } catch (err) {
    console.error('[comercial] leitura falhou:', detalheSeguro(err))
    return { erro: 'Não foi possível carregar os dados comerciais.' }
  }
}

const OfertaSchema = z.object({
  id: Uuid.optional(),
  codigo: z.string().trim().min(1).max(200),
  nome: z.string().trim().min(1).max(200),
  produtos: z.array(z.string().refine(ehProdutoConhecido)).min(1).max(50),
  duracao: z.enum(DURACOES),
  ativa: z.boolean(),
})

export async function salvarOferta(entrada: unknown): Promise<Resposta> {
  await exigirEngineLiberado()
  const ws = await workspaceDoOwner()
  if (!ws) return { erro: NAO_AUTORIZADO }
  const r = OfertaSchema.safeParse(entrada)
  if (!r.success) return { erro: 'Confira o código, o nome, os produtos e a duração da oferta.' }

  const { id, ...campos } = r.data
  const dados = { ...campos, produtos: [...new Set(campos.produtos)], plataforma: 'hotmart' }
  const db = admin()
  const { data, error } = id
    ? await db.from('ofertas').update(dados).eq('workspace_id', ws).eq('id', id).select('id')
    : await db.from('ofertas').insert({ ...dados, workspace_id: ws }).select('id')
  if (error) {
    return { erro: error.code === '23505' ? 'Este código de oferta já está cadastrado.' : 'Não foi possível salvar a oferta.' }
  }
  if (!data?.length) return { erro: 'Oferta não encontrada.' }
  return { ok: true }
}

export async function salvarTokenHotmart(token: string): Promise<Resposta> {
  await exigirEngineLiberado()
  if (!(await ehDonoDoDeploy())) return { erro: 'Só o dono do servidor configura o token da Hotmart.' }
  const limpo = typeof token === 'string' ? token.trim() : ''
  if (!limpo || limpo.length > 4096) return { erro: 'Cole o token de verificação (hottok) da Hotmart.' }
  return (await setSecret(CHAVE_HOTTOK_HOTMART, limpo)) ? { ok: true } : { erro: 'Não foi possível guardar o token.' }
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
