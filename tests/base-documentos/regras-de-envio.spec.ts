import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  validarPedidoDeEnvio,
  nomeDeExibicaoInicial,
  versaoParaCancelar,
  podeRetomar,
  escolherPendente,
} from '@/lib/base-documentos/regras-de-envio'
import { limiteBytesArquivo } from '@/server/base-documentos/config'

const MB = 1024 * 1024

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('validarPedidoDeEnvio', () => {
  it('aceita os seis tipos', () => {
    for (const n of ['a.pdf', 'a.docx', 'a.md', 'a.txt', 'a.json', 'a.csv'])
      expect(validarPedidoDeEnvio({ nomeArquivo: n, tamanho: 10 }, 100)).toMatchObject({ ok: true })
  })
  it('devolve a extensão reconhecida', () => {
    expect(validarPedidoDeEnvio({ nomeArquivo: 'Apostila.PDF', tamanho: 10 }, 100)).toEqual({ ok: true, ext: 'pdf' })
  })
  it('recusa .doc com a frase da tela', () =>
    expect(validarPedidoDeEnvio({ nomeArquivo: 'a.doc', tamanho: 10 }, 100)).toEqual({
      ok: false,
      erro: 'Esse tipo de arquivo não é aceito. Envie pdf, docx, md, txt, json ou csv.',
    }))
  it('recusa acima do limite dizendo o limite em MB', () =>
    expect(validarPedidoDeEnvio({ nomeArquivo: 'a.pdf', tamanho: 101 * MB }, 100 * MB)).toEqual({
      ok: false,
      erro: 'O arquivo passa do limite de 100 MB.',
    }))
  it('aceita exatamente no limite', () =>
    expect(validarPedidoDeEnvio({ nomeArquivo: 'a.pdf', tamanho: 100 * MB }, 100 * MB)).toMatchObject({ ok: true }))
  it('recusa vazio', () =>
    expect(validarPedidoDeEnvio({ nomeArquivo: 'a.md', tamanho: 0 }, 100)).toMatchObject({
      ok: false,
      erro: 'O arquivo está vazio.',
    }))
  it('recusa tamanho que não é número inteiro positivo', () => {
    expect(validarPedidoDeEnvio({ nomeArquivo: 'a.md', tamanho: Number.NaN }, 100)).toMatchObject({ ok: false })
    expect(validarPedidoDeEnvio({ nomeArquivo: 'a.md', tamanho: -5 }, 100)).toMatchObject({ ok: false })
  })
})

describe('nomeDeExibicaoInicial', () => {
  it('tira a extensão e troca _ e - por espaço', () =>
    expect(nomeDeExibicaoInicial('almanaque_das-ervas.md')).toBe('almanaque das ervas'))
  it('corta em 120', () => {
    const nome = nomeDeExibicaoInicial(`${'a'.repeat(200)}.pdf`)
    expect(nome).toHaveLength(120)
  })
  it('nunca devolve vazio', () => {
    expect(nomeDeExibicaoInicial('___.md').trim().length).toBeGreaterThan(0)
    expect(nomeDeExibicaoInicial('.md').trim().length).toBeGreaterThan(0)
  })
})

describe('versaoParaCancelar', () => {
  it('acha a pendente e nunca a ativa (Review Focus 2)', () => {
    expect(versaoParaCancelar([{ id: 'a', status: 'pronto' }, { id: 'p', status: 'processando' }], 'a')).toBe('p')
    expect(versaoParaCancelar([{ id: 'a', status: 'pronto' }, { id: 'e', status: 'erro' }], 'a')).toBeNull()
    expect(versaoParaCancelar([{ id: 'n', status: 'enviando' }], null)).toBe('n')
  })
  it('na_fila também é pendente', () =>
    expect(versaoParaCancelar([{ id: 'f', status: 'na_fila' }], 'x')).toBe('f'))
  it('a ativa não é cancelada mesmo se estiver em status pendente', () =>
    expect(versaoParaCancelar([{ id: 'a', status: 'processando' }], 'a')).toBeNull())
})

describe('podeRetomar', () => {
  const pedido = { nomeArquivo: 'a.pdf', tamanho: 500 }
  it('retoma a versão ainda enviando do mesmo arquivo', () =>
    expect(podeRetomar({ status: 'enviando', nomeArquivo: 'a.pdf', tamanho: 500 }, pedido)).toBe(true))
  it('não retoma versão que não existe', () => expect(podeRetomar(null, pedido)).toBe(false))
  it('não retoma versão que já saiu de enviando', () =>
    expect(podeRetomar({ status: 'na_fila', nomeArquivo: 'a.pdf', tamanho: 500 }, pedido)).toBe(false))
  it('não retoma arquivo de outro nome ou tamanho', () => {
    expect(podeRetomar({ status: 'enviando', nomeArquivo: 'b.pdf', tamanho: 500 }, pedido)).toBe(false)
    expect(podeRetomar({ status: 'enviando', nomeArquivo: 'a.pdf', tamanho: 501 }, pedido)).toBe(false)
  })
})

describe('limiteBytesArquivo', () => {
  it('lê o env e cai em 100', () => {
    vi.stubEnv('BASE_ARQUIVO_MAX_MB', '250')
    expect(limiteBytesArquivo()).toBe(250 * MB)
    vi.stubEnv('BASE_ARQUIVO_MAX_MB', 'x')
    expect(limiteBytesArquivo()).toBe(100 * MB)
  })
  it('zero, negativo ou ausente caem em 100', () => {
    vi.stubEnv('BASE_ARQUIVO_MAX_MB', '0')
    expect(limiteBytesArquivo()).toBe(100 * MB)
    vi.stubEnv('BASE_ARQUIVO_MAX_MB', '-3')
    expect(limiteBytesArquivo()).toBe(100 * MB)
    vi.stubEnv('BASE_ARQUIVO_MAX_MB', '')
    expect(limiteBytesArquivo()).toBe(100 * MB)
  })
})

describe('escolherPendente', () => {
  it('mostra a mais nova que não terminou bem, posterior à ativa', () => {
    const v = [
      { id: 'n', status: 'na_fila' as const },
      { id: 'a', status: 'pronto' as const },
    ]
    expect(escolherPendente(v, 'a')?.id).toBe('n')
  })
  it('mostra o erro do último envio', () =>
    expect(escolherPendente([{ id: 'e', status: 'erro' as const }], null)?.id).toBe('e'))
  it('ignora erro anterior à ativa', () =>
    expect(escolherPendente([{ id: 'a', status: 'pronto' as const }, { id: 'e', status: 'erro' as const }], 'a')).toBeNull())
  it('sem nada além da ativa devolve null', () =>
    expect(escolherPendente([{ id: 'a', status: 'pronto' as const }], 'a')).toBeNull())
})
