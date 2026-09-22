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
import { PRODUTOS, ehProdutoConhecido, rotuloDoProduto, type ProdutoId } from '@/lib/produtos/catalogo'
import {
  DEGUSTACAO,
  DURACAO_PADRAO_DA_DEGUSTACAO,
  OPCOES_TEMPO_DE_ACESSO,
  duracaoDaOferta,
  lerTempoDeAcesso,
  rotuloDaDuracao,
  rotuloDoTempoDeAcesso,
  valorDaDegustacao,
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
  /** O valor do seletor "Tempo de acesso" que reabre esta oferta na opção certa. */
  tempoDeAcesso: string
  ativa: boolean
  /** As filhas desta oferta: quem compra a principal ganha os produtos delas como brinde. */
  filhas: string[]
  /** Quem é a principal desta oferta, quando ela é filha. Uma filha não tem filha nem venda. */
  pai: string | null
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
  /** Só as ofertas que podem ser filhas: ativas, de degustação, e ainda livres de vínculo. */
  candidatasAFilha: Array<{ id: string; rotulo: string }>
  temposDeAcesso: Array<{ valor: string; rotulo: string }>
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
    // O vínculo pai-filha: uma leitura só, e o mapa é montado em memória.
    const { data: vinculos, error: erroVinculos } = await db
      .from('ofertas_filhas')
      .select('oferta_pai_id, oferta_filha_id')
    if (erroVinculos) throw erroVinculos
    const filhasDe = new Map<string, string[]>()
    const paiDe = new Map<string, string>()
    for (const v of (vinculos ?? []) as Array<{ oferta_pai_id: string; oferta_filha_id: string }>) {
      filhasDe.set(v.oferta_pai_id, [...(filhasDe.get(v.oferta_pai_id) ?? []), v.oferta_filha_id])
      paiDe.set(v.oferta_filha_id, v.oferta_pai_id)
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
      ofertas: ((ofertas ?? []) as Array<Omit<OfertaItem, 'diasDegustacao' | 'filhas' | 'pai' | 'tempoDeAcesso'> & { dias_degustacao: number | null }>).map((o) => ({
        ...o,
        diasDegustacao: o.dias_degustacao,
        // O valor que o seletor precisa para reabrir a oferta na opção certa. Os DIAS vêm primeiro:
        // eles —— e não `duracao`, que guarda um nome dos sete —— identificam a degustação.
        tempoDeAcesso: o.dias_degustacao ? valorDaDegustacao(o.dias_degustacao) : o.duracao,
        filhas: filhasDe.get(o.id) ?? [],
        pai: paiDe.get(o.id) ?? null,
      })),
      // Só pode ser filha quem é degustação (a filha É o brinde), está ativa, não vende código
      // conhecido da Hotmart e ainda não tem principal — a chave única do banco só permite uma.
      candidatasAFilha: ((ofertas ?? []) as Array<{ id: string; nome: string; codigo: string; duracao: string; ativa: boolean }>)
        .filter((o) => o.duracao === DEGUSTACAO && o.ativa && !paiDe.has(o.id))
        .map((o) => ({ id: o.id, rotulo: `${o.nome} (${o.codigo})` })),
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
          duracao: rotuloDaDuracao(v.duracao, v.dias_degustacao),
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
      temposDeAcesso: OPCOES_TEMPO_DE_ACESSO.map((valor) => ({ valor, rotulo: rotuloDoTempoDeAcesso(valor) })),
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
    produtos: z.array(z.string().refine(ehProdutoConhecido)).min(1).max(50),
    /**
     * O valor do seletor "Tempo de acesso": uma das sete durações, ou `trial:7` / `trial:15`.
     *
     * 🔴 É `string`, e não `z.enum([...DURACOES, DEGUSTACAO])`: o par leva os DIAS junto, e o que
     * valida é `lerTempoDeAcesso`, que recusa um prazo fora da lista fechada. Deixar o enum aqui
     * aceitaria `duracao: 'degustacao'` sem prazo — a oferta que recusaria toda compra depois.
     */
    tempoDeAcesso: z.string().max(50),
    /** As filhas: quem compra esta oferta ganha os produtos delas como brinde, pelo prazo delas. */
    filhas: z.array(Uuid).max(20).optional(),
    ativa: z.boolean(),
    // Não é coluna da oferta — é um gatilho de uma ação (bônus retroativo), só faz sentido ao
    // editar (por isso não entra em `campos`/`dados` abaixo).
    reprocessarVendas: z.boolean().optional(),
  })
  // 🔴 A degustação não tem prazo de reserva: sem um prazo da lista, a oferta é recusada aqui, e
  // não gravada para virar `oferta_invalida` na primeira compra.
  .refine((o) => lerTempoDeAcesso(o.tempoDeAcesso) !== null, {
    path: ['tempoDeAcesso'],
    message: 'Escolha um tempo de acesso válido.',
  })

export async function salvarOferta(entrada: unknown): Promise<Resposta> {
  await exigirEngineLiberado()
  const ws = await workspaceDoOwner()
  if (!ws) return { erro: NAO_AUTORIZADO }
  const r = OfertaSchema.safeParse(entrada)
  if (!r.success) return { erro: 'Confira o código, o nome, os produtos e o tempo de acesso da oferta.' }

  const { id, reprocessarVendas, tempoDeAcesso, filhas, ...campos } = r.data
  // Já validado pelo `refine`: aqui a leitura não pode falhar. O `?? null` é só para o tipo.
  const tempo = lerTempoDeAcesso(tempoDeAcesso) ?? { duracao: 'mensal' as const }
  const degustacao = tempo.duracao === DEGUSTACAO
  const dados = {
    ...campos,
    // 🔴 `duracao` NUNCA recebe 'degustacao': a coluna tem `ofertas_duracao_dominio_check`, que
    // aceita só os sete nomes, e o banco recusa o insert com 23514. Quem identifica a degustação é
    // `dias_degustacao` — é ele que `duracaoDaOferta` lê primeiro. Gravar 'degustacao' aqui
    // contradizia a decisão tomada na migration 0069 (que não alarga o domínio), e foi o defeito
    // que fez toda oferta de trial falhar ao salvar.
    duracao: degustacao ? DURACAO_PADRAO_DA_DEGUSTACAO : tempo.duracao,
    plataforma: 'hotmart',
    produtos: [...new Set(campos.produtos)],
    // O prazo em dias só existe na degustação; nas outras durações a coluna volta a nulo, para
    // uma oferta que deixou de ser degustação não guardar um número que ninguém mais lê.
    dias_degustacao: degustacao ? tempo.diasDegustacao : null,
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

  // 🔴 Só mexe no vínculo quando há o que mexer. Chamar sempre fazia um `delete` em
  // `ofertas_filhas` numa oferta sem filhas — e essa tabela só existe depois da 0070: numa
  // instalação com o banco atrasado, salvar QUALQUER oferta comum falhava por causa de uma
  // tabela que a oferta nem usa. O caminho de quem não usa o recurso tem de continuar funcionando.
  if (!degustacao && filhas !== undefined) {
    const erroVinculo = await gravarFilhas({ db, ws, paiId: ofertaId, filhas })
    if (erroVinculo) return erroVinculo
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
 * Regrava o conjunto de filhas de uma oferta, com as recusas que protegem o processamento.
 *
 * 🔴 As três recusas existem porque cada uma delas quebraria o `aprovar` de um jeito diferente:
 *
 *  • **produto repetido** — a principal já vende o produto, e a filha concederia o MESMO produto
 *    na mesma venda. As duas linhas brigariam na chave (venda, produto), e o brinde silenciosamente
 *    não nasceria (o `23505` é engolido).
 *  • **ciclo** — a profundidade é 1 por decisão. Uma corrente de filhas nunca seria percorrida por
 *    inteiro: `concederBrindes` lê só um nível, e o resto sumiria sem erro nenhum.
 *  • **filha que não é degustação** — não é brinde, e `concederBrindes` a ignora em silêncio.
 */
async function gravarFilhas(args: {
  db: ReturnType<typeof admin>
  ws: string
  paiId: string
  filhas: string[]
}): Promise<{ erro: string } | null> {
  const { db, ws, paiId } = args
  const escolhidas = [...new Set(args.filhas)]
  if (escolhidas.includes(paiId)) return { erro: 'Uma oferta não pode ser filha de si mesma.' }

  if (escolhidas.length > 0) {
    const { data: principais, error: erroPrincipais } = await db
      .from('ofertas')
      .select('id, produtos, duracao, ativa')
      .eq('workspace_id', ws)
      .eq('id', paiId)
      .maybeSingle()
    if (erroPrincipais) return { erro: 'Não foi possível salvar as ofertas filhas.' }
    const produtosDaPrincipal = new Set(((principais?.produtos ?? []) as string[]).filter(ehProdutoConhecido))

    const { data: filhas, error: erroFilhas } = await db
      .from('ofertas')
      .select('id, nome, produtos, duracao, dias_degustacao')
      .eq('workspace_id', ws)
      .in('id', escolhidas)
    if (erroFilhas) return { erro: 'Não foi possível salvar as ofertas filhas.' }
    const linhas = (filhas ?? []) as Array<{ id: string; nome: string; produtos: string[]; duracao: string; dias_degustacao: number | null }>
    if (linhas.length !== escolhidas.length) return { erro: 'Uma das ofertas filhas escolhidas não existe.' }

    for (const filha of linhas) {
      const prazo = duracaoDaOferta({ duracao: filha.duracao, diasDegustacao: filha.dias_degustacao })
      if (typeof prazo !== 'number') {
        return { erro: `A oferta "${filha.nome}" não é de degustação, e só uma degustação pode ser filha (é ela que define o tempo do brinde).` }
      }
      const repetidos = filha.produtos.filter((p) => produtosDaPrincipal.has(p as ProdutoId))
      if (repetidos.length > 0) {
        return {
          erro: `A oferta "${filha.nome}" concede produto que esta oferta já vende (${repetidos.join(', ')}). O brinde seria perdido — tire o produto de uma das duas.`,
        }
      }
    }
  }

  // Regravar é apagar e reinserir: o conjunto escolhido é a verdade, e um vínculo que saiu da
  // seleção precisa mesmo sumir. Não há dado atrelado à linha do vínculo a preservar.
  const { error: erroApagar } = await db.from('ofertas_filhas').delete().eq('oferta_pai_id', paiId)
  if (erroApagar) {
    console.error('[comercial] limpar vínculos falhou:', detalheSeguro(erroApagar))
    return { erro: 'Não foi possível salvar as ofertas filhas.' }
  }
  if (escolhidas.length === 0) return null
  const { error: erroInserir } = await db
    .from('ofertas_filhas')
    .insert(escolhidas.map((filhaId) => ({ oferta_pai_id: paiId, oferta_filha_id: filhaId })))
  if (erroInserir) {
    console.error('[comercial] gravar vínculos falhou:', detalheSeguro(erroInserir))
    return {
      erro:
        erroInserir.code === '23505'
          ? 'Uma das ofertas escolhidas já é filha de outra oferta. Uma filha pertence a uma principal só.'
          : 'Não foi possível salvar as ofertas filhas.',
    }
  }
  return null
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
