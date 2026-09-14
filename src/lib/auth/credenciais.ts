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

/**
 * Alfabeto sem par que se confunda: fora `I` (parece `1`), `O` (parece `0`), e os próprios `0`
 * e `1`. O `L` fica: sem o `1` no alfabeto, não há com o que confundi-lo. Sobram 32 símbolos — exatamente 5 bits cada, o que deixa o sorteio por byte
 * uniforme sem descarte (256 é múltiplo de 32).
 */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const GRUPOS = 3
const POR_GRUPO = 4

/**
 * Doze símbolos em três grupos: `K7RM-92PX-4TLD`.
 *
 * 🔴 O formato antigo era base64url (`eQroVvdHehFnLoum`): misturava caixa, continha `l`/`I`/`1` e
 * `O`/`0`, e era impossível ditar ao telefone. Isto custa entropia — 60 bits contra 96 — e a troca
 * é deliberada: a credencial vale 7 dias, o login por ela é limitado por conta e origem, e o hash
 * é scrypt. 2^60 tentativas não acontecem nem online nem offline; uma senha mal digitada acontece
 * todo dia.
 *
 * Separado de `criarCredencial` de propósito: sortear não precisa de scrypt, e o teste que mede o
 * alfabeto e a variação por posição precisa de centenas de amostras.
 */
export function gerarSegredo(): string {
  const bytes = randomBytes(GRUPOS * POR_GRUPO)
  const grupos: string[] = []
  for (let g = 0; g < GRUPOS; g++) {
    let grupo = ''
    for (let i = 0; i < POR_GRUPO; i++) {
      grupo += ALFABETO[bytes[g * POR_GRUPO + i] % ALFABETO.length]
    }
    grupos.push(grupo)
  }
  return grupos.join('-')
}

/**
 * O que a pessoa digitou, na forma canónica: maiúsculas, só os símbolos do alfabeto, hífen a cada
 * quatro. Assim `k7rm92px4tld`, `K7RM 92PX 4TLD` e `K7RM-92PX-4TLD` são a mesma senha.
 *
 * 🔴 Devolve `null` para o que não couber no formato — inclusive para uma senha do formato antigo,
 * que tem minúsculas e `_`. É esse `null` que impede a normalização de virar porta dos fundos:
 * ela só entra em cena quando produz uma senha do formato novo.
 */
export function normalizarSegredo(digitado: string): string | null {
  const limpo = digitado.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (limpo.length !== GRUPOS * POR_GRUPO) return null
  if (![...limpo].every((ch) => ALFABETO.includes(ch))) return null
  const grupos: string[] = []
  for (let g = 0; g < GRUPOS; g++) grupos.push(limpo.slice(g * POR_GRUPO, (g + 1) * POR_GRUPO))
  return grupos.join('-')
}

export async function criarCredencial(agoraMs = Date.now()): Promise<Credencial> {
  return criarCredencialComSegredo(gerarSegredo(), agoraMs)
}

/** Só para quem já tem o segredo em mãos — testes, e a reemissão de uma senha ditada. */
export async function criarCredencialComSegredo(
  segredo: string,
  agoraMs = Date.now(),
): Promise<Credencial> {
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
  const esperado = Buffer.from(partes[2], 'hex')
  if (timingSafeEqual(await derivar(segredo, partes[1], 64), esperado)) return true

  // Segunda chance só para o formato novo digitado de outro jeito (sem hífen, em minúscula).
  // `normalizarSegredo` devolve `null` para tudo o mais, então uma credencial do formato antigo
  // nunca chega aqui, e nenhuma senha errada ganha uma tentativa extra de graça.
  const canonico = normalizarSegredo(segredo)
  if (canonico === null || canonico === segredo) return false
  return timingSafeEqual(await derivar(canonico, partes[1], 64), esperado)
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
