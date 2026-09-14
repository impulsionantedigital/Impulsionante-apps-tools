import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const derivar = promisify(scrypt) as (senha: string, sal: string, tamanho: number) => Promise<Buffer>

/** A senha temporária abre a conta por 7 dias; depois disso, só a recuperação. */
export const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000
/** Igual ao cadastro do produto. */
export const SENHA_MINIMA = 6
/** Limite do Supabase, em bytes. */
export const SENHA_MAXIMA_BYTES = 72

export interface Credencial {
  /** Texto claro. Existe só para ir no e-mail — nunca é gravado. */
  segredo: string
  hash: string
  expiraEm: string
}

export async function criarCredencial(agoraMs = Date.now()): Promise<Credencial> {
  const segredo = randomBytes(12).toString('base64url')
  const sal = randomBytes(16).toString('hex')
  const chave = await derivar(segredo, sal, 64)
  return {
    segredo,
    hash: `scrypt$${sal}$${chave.toString('hex')}`,
    expiraEm: new Date(agoraMs + VALIDADE_MS).toISOString(),
  }
}

export async function verificarCredencial(
  segredo: string,
  hash: string | null,
  expiraEm: string | null,
  agoraMs = Date.now(),
): Promise<boolean> {
  if (typeof segredo !== 'string' || segredo.length === 0 || segredo.length > 256) return false
  if (!credencialPendente(hash, expiraEm, agoraMs)) return false
  const partes = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(hash as string)
  if (!partes) return false
  const obtida = await derivar(segredo, partes[1], 64)
  return timingSafeEqual(obtida, Buffer.from(partes[2], 'hex'))
}

/** Há uma credencial emitida e ainda dentro da validade. A fronteira é exclusiva. */
export function credencialPendente(hash: string | null, expiraEm: string | null, agoraMs = Date.now()): boolean {
  if (!hash || !expiraEm) return false
  return Date.parse(expiraEm) > agoraMs
}

/**
 * Uma credencial válida pendente NÃO é trocada: reenvios da Hotmart não podem invalidar a senha
 * que já foi por e-mail. Só a recuperação de senha força uma nova.
 */
export function decidirEmissao(args: {
  hash: string | null
  expiraEm: string | null
  forcar: boolean
  agoraMs?: number
}): 'emitir' | 'manter' {
  if (args.forcar) return 'emitir'
  return credencialPendente(args.hash, args.expiraEm, args.agoraMs ?? Date.now()) ? 'manter' : 'emitir'
}

export function validarNovaSenha(
  senha: unknown,
  confirmacao: unknown,
): { ok: true; senha: string } | { erro: 'curta' | 'longa' | 'diferente' } {
  if (typeof senha !== 'string' || senha.length < SENHA_MINIMA) return { erro: 'curta' }
  if (Buffer.byteLength(senha, 'utf8') > SENHA_MAXIMA_BYTES) return { erro: 'longa' }
  if (senha !== confirmacao) return { erro: 'diferente' }
  return { ok: true, senha }
}

/**
 * A sessão nasceu da senha temporária? Decide-se pelo claim `amr` do token — a ORIGEM da sessão —
 * e não pela presença do hash. O login temporário usa link mágico (`magiclink` ou `otp`, conforme
 * a versão do Auth); o produto não oferece nenhum outro login por link. Uma sessão que traga
 * `password` nunca conta, mesmo com outro método junto.
 */
export function sessaoVeioDeSenhaTemporaria(amr: unknown): boolean {
  if (!Array.isArray(amr)) return false
  const metodos = amr.map((entrada) => {
    if (typeof entrada === 'string') return entrada
    if (typeof entrada === 'object' && entrada !== null) return (entrada as { method?: unknown }).method
    return null
  })
  if (metodos.includes('password')) return false
  return metodos.some((m) => m === 'magiclink' || m === 'otp')
}
