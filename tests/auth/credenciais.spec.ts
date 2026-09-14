import { describe, it, expect } from 'vitest'
import {
  criarCredencial, criarCredencialComSegredo, gerarSegredo, verificarCredencial, credencialPendente, decidirEmissao, validarNovaSenha, VALIDADE_MS, sessaoVeioDeSenhaTemporaria,
} from '@/lib/auth/credenciais'

const SETE_DIAS = 7 * 24 * 60 * 60 * 1000

describe('criarCredencial', () => {
  it('fixa a validade em 7 dias exatos', async () => {
    expect(VALIDADE_MS).toBe(SETE_DIAS)
    const c = await criarCredencial(1_000)
    expect(c.expiraEm).toBe(new Date(1_000 + SETE_DIAS).toISOString())
  })

  it('gera segredo e sal diferentes a cada emissão', async () => {
    const a = await criarCredencial(1_000)
    const b = await criarCredencial(1_000)
    expect(a.segredo).not.toBe(b.segredo)
    expect(a.hash).not.toBe(b.hash)
    expect(a.hash).toMatch(/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/)
  })

  it('não guarda o segredo dentro do hash', async () => {
    const c = await criarCredencial()
    expect(c.hash).not.toContain(c.segredo)
  })
})

describe('verificarCredencial', () => {
  it('aceita só o segredo certo, dentro da validade', async () => {
    const c = await criarCredencial(1_000)
    expect(await verificarCredencial(c.segredo, c.hash, c.expiraEm, 1_001)).toBe(true)
    expect(await verificarCredencial(c.segredo + 'x', c.hash, c.expiraEm, 1_001)).toBe(false)
  })

  it('recusa exatamente na expiração, e aceita 1 ms antes', async () => {
    const c = await criarCredencial(1_000)
    const fim = Date.parse(c.expiraEm)
    expect(await verificarCredencial(c.segredo, c.hash, c.expiraEm, fim - 1)).toBe(true)
    expect(await verificarCredencial(c.segredo, c.hash, c.expiraEm, fim)).toBe(false)
  })

  it('recusa hash adulterado, malformado ou ausente', async () => {
    const c = await criarCredencial(1_000)
    const adulterado = c.hash.slice(0, -1) + (c.hash.endsWith('0') ? '1' : '0')
    expect(await verificarCredencial(c.segredo, adulterado, c.expiraEm, 1_001)).toBe(false)
    expect(await verificarCredencial(c.segredo, 'malformado', c.expiraEm, 1_001)).toBe(false)
    expect(await verificarCredencial(c.segredo, null, c.expiraEm, 1_001)).toBe(false)
    expect(await verificarCredencial(c.segredo, c.hash, null, 1_001)).toBe(false)
  })

  it('recusa segredo vazio ou gigante', async () => {
    const c = await criarCredencial(1_000)
    expect(await verificarCredencial('', c.hash, c.expiraEm, 1_001)).toBe(false)
    expect(await verificarCredencial('a'.repeat(257), c.hash, c.expiraEm, 1_001)).toBe(false)
  })
})

describe('decidirEmissao', () => {
  const pendente = { hash: 'scrypt$x', expiraEm: new Date(10_000).toISOString() }

  it('mantém uma credencial válida pendente', () => {
    expect(credencialPendente(pendente.hash, pendente.expiraEm, 5_000)).toBe(true)
    expect(decidirEmissao({ ...pendente, forcar: false, agoraMs: 5_000 })).toBe('manter')
  })

  it('emite quando não há credencial, ou quando ela expirou', () => {
    expect(decidirEmissao({ hash: null, expiraEm: null, forcar: false, agoraMs: 5_000 })).toBe('emitir')
    expect(decidirEmissao({ ...pendente, forcar: false, agoraMs: 10_000 })).toBe('emitir')
  })

  it('a recuperação força uma nova mesmo com outra pendente', () => {
    expect(decidirEmissao({ ...pendente, forcar: true, agoraMs: 5_000 })).toBe('emitir')
  })
})

describe('validarNovaSenha', () => {
  it('exige 6 caracteres', () => {
    expect(validarNovaSenha('12345', '12345')).toEqual({ erro: 'curta' })
    expect(validarNovaSenha('123456', '123456')).toEqual({ ok: true, senha: '123456' })
  })

  it('limita a 72 bytes, contando caracteres acentuados como dois', () => {
    expect(validarNovaSenha('a'.repeat(72), 'a'.repeat(72))).toEqual({ ok: true, senha: 'a'.repeat(72) })
    expect(validarNovaSenha('á'.repeat(37), 'á'.repeat(37))).toEqual({ erro: 'longa' })
  })

  it('exige a confirmação igual', () => {
    expect(validarNovaSenha('segredo1', 'segredo2')).toEqual({ erro: 'diferente' })
  })

  it('recusa o que não é texto', () => {
    expect(validarNovaSenha(null, null)).toEqual({ erro: 'curta' })
  })
})

describe('formato da senha temporária', () => {
  // 🔴 O formato antigo era base64url (`eQroVvdHehFnLoum`). Ele mistura maiúscula e minúscula e
  // contém l/I/1 e O/0 — impossível de ditar ao telefone e fácil de digitar errado a partir do
  // e-mail. Trocado por grupos, num alfabeto sem ambiguidade.
  it('vem em três grupos de quatro, separados por hífen', async () => {
    const c = await criarCredencial()
    expect(c.segredo).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  })

  it('nunca usa caractere que se confunde com outro', () => {
    const proibidos = ['I', 'O', '0', '1']
    const visto = new Set<string>()
    for (let i = 0; i < 300; i++) {
      for (const ch of gerarSegredo().replace(/-/g, '')) visto.add(ch)
    }
    for (const p of proibidos) expect(visto.has(p), `usou ${p}`).toBe(false)
    // E o alfabeto tem de ser realmente usado: 300 senhas × 12 caracteres cobrem as 32 letras.
    expect(visto.size).toBe(32)
  })

  it('tem 60 bits de entropia: 12 posições sorteadas num alfabeto de 32', () => {
    const segredos = Array.from({ length: 200 }, () => gerarSegredo())
    expect(new Set(segredos).size).toBe(segredos.length)
    // Cada posição varia entre as amostras — pega gerador que fixa uma posição.
    for (let pos = 0; pos < 12; pos++) {
      const nessaPos = new Set(segredos.map((s) => s.replace(/-/g, '')[pos]))
      expect(nessaPos.size, `posição ${pos} quase não varia`).toBeGreaterThan(8)
    }
  })

  it('aceita a senha digitada sem hífen, em minúscula ou com espaço', async () => {
    const c = await criarCredencial()
    const nu = c.segredo.replace(/-/g, '')
    for (const digitado of [nu, nu.toLowerCase(), c.segredo.toLowerCase(), c.segredo.replace(/-/g, ' ')]) {
      expect(await verificarCredencial(digitado, c.hash, c.expiraEm), digitado).toBe(true)
    }
  })

  it('continua aceitando credencial antiga, em base64url', async () => {
    // Uma senha emitida antes da troca de formato não pode deixar de funcionar: há contas com
    // temporária pendente e válida por sete dias.
    const antiga = await criarCredencialComSegredo('eQroVvdHehFnLoum')
    expect(await verificarCredencial('eQroVvdHehFnLoum', antiga.hash, antiga.expiraEm)).toBe(true)
    // E a normalização não pode fazer uma senha ERRADA passar.
    expect(await verificarCredencial('eqrovvdhehfnloum', antiga.hash, antiga.expiraEm)).toBe(false)
  })

  it('não deixa a normalização virar porta dos fundos', async () => {
    const c = await criarCredencial()
    const nu = c.segredo.replace(/-/g, '')
    // Trocar um caractere continua recusado, mesmo depois de normalizar.
    const trocado = (nu[0] === 'A' ? 'B' : 'A') + nu.slice(1)
    expect(await verificarCredencial(trocado, c.hash, c.expiraEm)).toBe(false)
    // Sobra ou falta de caractere também.
    expect(await verificarCredencial(nu.slice(0, 11), c.hash, c.expiraEm)).toBe(false)
    expect(await verificarCredencial(nu + 'A', c.hash, c.expiraEm)).toBe(false)
  })
})

describe('sessaoVeioDeSenhaTemporaria', () => {
  it('reconhece sessão de link mágico ou OTP, nos dois formatos do claim', () => {
    expect(sessaoVeioDeSenhaTemporaria([{ method: 'magiclink', timestamp: 1 }])).toBe(true)
    expect(sessaoVeioDeSenhaTemporaria([{ method: 'otp', timestamp: 1 }])).toBe(true)
    expect(sessaoVeioDeSenhaTemporaria(['otp'])).toBe(true)
  })

  it('sessão provada por senha nunca conta, mesmo com outro método junto', () => {
    expect(sessaoVeioDeSenhaTemporaria([{ method: 'password', timestamp: 1 }])).toBe(false)
    expect(sessaoVeioDeSenhaTemporaria([{ method: 'password' }, { method: 'otp' }])).toBe(false)
    expect(sessaoVeioDeSenhaTemporaria(['password', 'magiclink'])).toBe(false)
  })

  it('sem claim reconhecível, não conta', () => {
    expect(sessaoVeioDeSenhaTemporaria(undefined)).toBe(false)
    expect(sessaoVeioDeSenhaTemporaria([])).toBe(false)
    expect(sessaoVeioDeSenhaTemporaria([{ method: 'oauth' }])).toBe(false)
    expect(sessaoVeioDeSenhaTemporaria('otp')).toBe(false)
  })
})
