import { describe, it, expect } from 'vitest'
import {
  criarCredencial, verificarCredencial, credencialPendente, decidirEmissao, validarNovaSenha, VALIDADE_MS,
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

  it('recusa segredo vazio ou gigante sem calcular nada', async () => {
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
