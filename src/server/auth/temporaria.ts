import 'server-only'
import { admin } from '@/server/supabase'
import { criarClienteServidor } from '@/server/supabase-session'
import { lerConfig } from '@/server/configuracoes'
import { enfileirar } from '@/server/email/fila'
import { CHAVE_URL_PUBLICA } from '@/lib/canais/url-publica'
import { consumir, type Balde, type EstadoBalde } from '@/lib/canais/rateLimit'
import { detalheSeguro } from '@/lib/sanitizar-erro'
import { criarCredencial, decidirEmissao, validarNovaSenha, verificarCredencial } from '@/lib/auth/credenciais'

// A senha temporária é uma credencial PARALELA (§8.5): emiti-la nunca toca na senha principal.

const POR_CONTA: Balde = { capacidade: 5, recargaPorMs: 5 / 3_600_000, teto: 10_000 }
const POR_ORIGEM: Balde = { capacidade: 30, recargaPorMs: 30 / 3_600_000, teto: 10_000 }
const LOGIN_POR_CONTA: Balde = { capacidade: 10, recargaPorMs: 10 / 3_600_000, teto: 10_000 }

// Um mapa por balde: podar() usa os parâmetros do balde, e misturá-los podaria errado.
const RECUPERAR_CONTA = new Map<string, EstadoBalde>()
const RECUPERAR_ORIGEM = new Map<string, EstadoBalde>()
const ENTRAR_CONTA = new Map<string, EstadoBalde>()

type LinhaCredencial = {
  nome: string | null
  senha_temporaria_hash: string | null
  senha_temporaria_expira_em: string | null
}

async function origemDaRequisicao(): Promise<string> {
  const { headers } = await import('next/headers')
  return (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconhecida'
}

/** O link dos e-mails. Vem do "Endereço público deste CRM", que o produto já configura. */
export async function urlDeEntrada(): Promise<string | null> {
  const origem = await lerConfig(CHAVE_URL_PUBLICA)
  if (!origem) return null
  try {
    return new URL('/entrar', origem).href
  } catch {
    return null
  }
}

async function buscarUsuarioPorEmail(email: string): Promise<string | null> {
  const { data, error } = await admin().rpc('buscar_usuario_por_email', { p_email: email })
  if (error) throw error
  return (data as string | null) ?? null
}

export type ResultadoEmissao =
  | { ok: true; emitida: boolean }
  | { erro: 'sem_url_publica' | 'conta_indisponivel' | 'falha_emitir' | 'falha_enfileirar' }

export async function emitirSenhaTemporaria(args: {
  userId: string
  workspaceId: string
  tipo: 'boas_vindas' | 'recuperacao_senha'
  forcar: boolean
}): Promise<ResultadoEmissao> {
  const login = await urlDeEntrada()
  if (!login) return { erro: 'sem_url_publica' }

  const cli = admin()
  const { data: conta, error: erroConta } = await cli.auth.admin.getUserById(args.userId)
  const email = conta?.user?.email
  if (erroConta || !email) return { erro: 'conta_indisponivel' }

  const { data, error } = await cli
    .from('membros')
    .select('nome, senha_temporaria_hash, senha_temporaria_expira_em')
    .eq('user_id', args.userId)
    .eq('workspace_id', args.workspaceId)
    .maybeSingle()
  if (error || !data) return { erro: 'conta_indisponivel' }
  const atual = data as LinhaCredencial

  const decisao = decidirEmissao({
    hash: atual.senha_temporaria_hash,
    expiraEm: atual.senha_temporaria_expira_em,
    forcar: args.forcar,
  })
  if (decisao === 'manter') return { ok: true, emitida: false }

  const credencial = await criarCredencial()

  // 🔴 Grava só se ninguém gravou entretanto: duas emissões concorrentes não podem mandar dois
  // e-mails com senhas diferentes, das quais só uma funciona.
  let gravacao = cli
    .from('membros')
    .update({ senha_temporaria_hash: credencial.hash, senha_temporaria_expira_em: credencial.expiraEm })
    .eq('user_id', args.userId)
    .eq('workspace_id', args.workspaceId)
  gravacao = atual.senha_temporaria_hash === null
    ? gravacao.is('senha_temporaria_hash', null)
    : gravacao.eq('senha_temporaria_hash', atual.senha_temporaria_hash)
  const { data: gravado, error: erroGravacao } = await gravacao.select('id')
  if (erroGravacao) return { erro: 'falha_emitir' }
  if (!gravado?.length) return { ok: true, emitida: false }

  const fila = await enfileirar({
    workspaceId: args.workspaceId,
    tipo: args.tipo,
    para: email,
    valores: {
      MEMBER_NAME: atual.nome ?? email,
      MEMBER_EMAIL: email,
      TEMP_PASSWORD: credencial.segredo,
      LOGIN_URL: login,
    },
  })
  if ('erro' in fila) {
    // Desfaz só a NOSSA emissão: uma senha que ninguém recebeu não pode ficar pendente, e o
    // filtro pelo hash impede apagar uma emissão concorrente que venceu.
    await cli
      .from('membros')
      .update({ senha_temporaria_hash: null, senha_temporaria_expira_em: null })
      .eq('user_id', args.userId)
      .eq('workspace_id', args.workspaceId)
      .eq('senha_temporaria_hash', credencial.hash)
    return { erro: 'falha_enfileirar' }
  }
  return { ok: true, emitida: true }
}

/** Resposta pública uniforme: exista a conta ou não, o chamador não descobre. */
export async function recuperarSenha(emailBruto: string): Promise<void> {
  const email = typeof emailBruto === 'string' ? emailBruto.trim().toLowerCase() : ''
  if (!email || email.length > 254 || !email.includes('@')) return
  try {
    const agora = Date.now()
    if (!consumir(RECUPERAR_ORIGEM, POR_ORIGEM, await origemDaRequisicao(), agora)) return
    if (!consumir(RECUPERAR_CONTA, POR_CONTA, email, agora)) return

    const userId = await buscarUsuarioPorEmail(email)
    if (!userId) return
    const { data } = await admin()
      .from('membros')
      .select('workspace_id')
      .eq('user_id', userId)
      .order('criado_em', { ascending: true })
      .limit(1)
      .maybeSingle()
    const workspaceId = (data as { workspace_id: string } | null)?.workspace_id
    if (!workspaceId) return

    const r = await emitirSenhaTemporaria({ userId, workspaceId, tipo: 'recuperacao_senha', forcar: true })
    if ('erro' in r) console.warn('[auth] recuperação não emitida:', r.erro)
  } catch (err) {
    console.warn('[auth] recuperação falhou:', detalheSeguro(err))
  }
}

/**
 * O segundo caminho do login. A sessão nasce SEM tocar na senha principal: gera-se um link
 * mágico no servidor e troca-se o token dele por sessão no cliente de cookies. Nada é enviado.
 */
export async function entrarComSenhaTemporaria(emailBruto: string, senha: string): Promise<boolean> {
  const email = emailBruto.trim().toLowerCase()
  if (!email || !senha) return false
  try {
    const cli = admin()
    const userId = await buscarUsuarioPorEmail(email)
    if (!userId) return false

    const { data, error } = await cli
      .from('membros')
      .select('senha_temporaria_hash, senha_temporaria_expira_em')
      .eq('user_id', userId)
      .not('senha_temporaria_hash', 'is', null)
    if (error || !data?.length) return false

    // O limite só entra quando há credencial a verificar: é o scrypt que ele protege.
    if (!consumir(ENTRAR_CONTA, LOGIN_POR_CONTA, email, Date.now())) return false

    let valida = false
    for (const linha of data as LinhaCredencial[]) {
      if (await verificarCredencial(senha, linha.senha_temporaria_hash, linha.senha_temporaria_expira_em)) {
        valida = true
        break
      }
    }
    if (!valida) return false

    const link = await cli.auth.admin.generateLink({ type: 'magiclink', email })
    const tokenHash = link.data?.properties?.hashed_token
    if (link.error || !tokenHash) return false

    const sessao = await criarClienteServidor()
    const { data: verificado, error: erroOtp } = await sessao.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash })
    return !erroOtp && verificado.user?.id === userId
  } catch (err) {
    console.warn('[auth] entrada com senha temporária falhou:', detalheSeguro(err))
    return false
  }
}

/** Quem entrou com a senha principal provou que a sabe: a temporária perde a função. */
export async function limparSenhaTemporaria(userId: string): Promise<void> {
  const { error } = await admin()
    .from('membros')
    .update({ senha_temporaria_hash: null, senha_temporaria_expira_em: null })
    .eq('user_id', userId)
    .not('senha_temporaria_hash', 'is', null)
  if (error) console.warn('[auth] senha temporária não foi limpa:', detalheSeguro(error))
}

/**
 * Hash presente = a sessão veio da senha temporária, porque entrar com a principal o apaga.
 * Enquanto for verdade, o membro fica preso em /trocar-senha.
 */
export async function precisaTrocarSenha(userId: string): Promise<boolean> {
  const { data, error } = await admin()
    .from('membros')
    .select('id')
    .eq('user_id', userId)
    .not('senha_temporaria_hash', 'is', null)
    .limit(1)
  if (error) throw error
  return (data?.length ?? 0) > 0
}

export type ResultadoTroca = { ok: true } | { erro: 'nao_autorizado' | 'curta' | 'longa' | 'diferente' | 'falha' }

export async function trocarSenha(senha: unknown, confirmacao: unknown): Promise<ResultadoTroca> {
  const validacao = validarNovaSenha(senha, confirmacao)
  if ('erro' in validacao) return validacao

  const sessao = await criarClienteServidor()
  const { data: { user } } = await sessao.auth.getUser()
  if (!user) return { erro: 'nao_autorizado' }
  if (!(await precisaTrocarSenha(user.id))) return { erro: 'nao_autorizado' }

  const { error } = await admin().auth.admin.updateUserById(user.id, { password: validacao.senha })
  if (error) return { erro: 'falha' }
  await limparSenhaTemporaria(user.id)
  return { ok: true }
}
