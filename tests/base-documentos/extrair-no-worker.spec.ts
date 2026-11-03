// Roda o worker de extração DE VERDADE: empacota `extrator.worker.ts` com o mesmo script do build
// num arquivo temporário e aponta `extrairNoWorker` para ele.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { empacotarWorker } from '../../scripts/empacotar-worker.mjs'
import type { Trecho } from '@/lib/base-documentos/tipos'
import {
  extrairNoWorker,
  LOTE_DE_TRECHOS,
  MEMORIA_WORKER_MB,
  TEMPO_MAX_EXTRACAO_MS,
} from '@/server/base-documentos/extrair-no-worker'
import { docxMinimo, pdfMinimo } from './fixtures'

let pasta: string
let caminhoDoWorker: string
const sempre = { aoHash: async () => true, aoLote: async () => true }

beforeAll(async () => {
  pasta = mkdtempSync(path.join(tmpdir(), 'extrator-'))
  caminhoDoWorker = path.join(pasta, 'extrator.gen.mjs')
  await empacotarWorker(caminhoDoWorker)
}, 60_000)

afterAll(() => rmSync(pasta, { recursive: true, force: true }))

describe('extrairNoWorker', () => {
  it('constantes do contrato', () => {
    expect(TEMPO_MAX_EXTRACAO_MS).toBe(10 * 60_000)
    expect(MEMORIA_WORKER_MB).toBe(768)
    expect(LOTE_DE_TRECHOS).toBe(500)
  })

  it('md pequeno: hash, lotes e total', async () => {
    const lotes: Trecho[][] = []
    const r = await extrairNoWorker(
      new TextEncoder().encode('# A\num.\n# B\ndois.'),
      'md',
      { aoHash: async () => true, aoLote: async (t) => (lotes.push(t), true) },
      { caminhoDoWorker },
    )
    expect(r).toMatchObject({ ok: true, total: 2 })
    expect((r as { hash: string }).hash).toMatch(/^[0-9a-f]{64}$/)
    expect(lotes.flat().map((t) => t.caminho)).toEqual([['A'], ['B']])
  })

  it('hash é o SHA-256 do conteúdo e chega antes de qualquer lote', async () => {
    const dados = new TextEncoder().encode('conteúdo qualquer')
    const { createHash } = await import('node:crypto')
    const esperado = createHash('sha256').update(dados).digest('hex')
    const ordem: string[] = []
    const r = await extrairNoWorker(
      new Uint8Array(dados),
      'txt',
      { aoHash: async (h) => (ordem.push(`hash:${h}`), true), aoLote: async () => (ordem.push('lote'), true) },
      { caminhoDoWorker },
    )
    expect(r).toEqual({ ok: true, total: 1, hash: esperado })
    expect(ordem).toEqual([`hash:${esperado}`, 'lote'])
  })

  it('aoHash false para antes de extrair', async () => {
    const aoLote = vi.fn(async () => true)
    expect(
      await extrairNoWorker(new TextEncoder().encode('x'), 'txt', { aoHash: async () => false, aoLote }, { caminhoDoWorker }),
    ).toEqual({ ok: false, parou: true })
    expect(aoLote).not.toHaveBeenCalled()
  })

  it('aoLote false para no primeiro lote', async () => {
    // Cada linha de csv vira um registro; bem mais que um lote.
    const csv = 'nome,valor\n' + Array.from({ length: 2000 }, (_, i) => `item ${i},${i}`).join('\n')
    const aoLote = vi.fn(async () => false)
    expect(
      await extrairNoWorker(new TextEncoder().encode(csv), 'csv', { aoHash: async () => true, aoLote }, { caminhoDoWorker }),
    ).toEqual({ ok: false, parou: true })
    expect(aoLote).toHaveBeenCalledTimes(1)
  })

  it('lotes de no máximo LOTE_DE_TRECHOS', async () => {
    const md = Array.from({ length: 1200 }, (_, i) => `# T${i}\ntexto ${i}.`).join('\n')
    const tamanhos: number[] = []
    const r = await extrairNoWorker(
      new TextEncoder().encode(md),
      'md',
      { aoHash: async () => true, aoLote: async (t) => (tamanhos.push(t.length), true) },
      { caminhoDoWorker },
    )
    expect(r).toMatchObject({ ok: true, total: 1200 })
    expect(tamanhos).toEqual([500, 500, 200])
  })

  it('erro de extração chega com o motivo', async () => {
    expect(await extrairNoWorker(new TextEncoder().encode('oi'), 'pdf', sempre, { caminhoDoWorker })).toEqual({
      ok: false,
      motivo: expect.stringContaining('não parece um arquivo .pdf'),
    })
  })

  it('pdf passa pelo worker empacotado (unpdf embutido)', async () => {
    const lotes: Trecho[][] = []
    const r = await extrairNoWorker(
      pdfMinimo(['Ogum gosta de', 'feijoada com cerveja. ' + 'x '.repeat(250)]),
      'pdf',
      { aoHash: async () => true, aoLote: async (t) => (lotes.push(t), true) },
      { caminhoDoWorker },
    )
    expect(r).toMatchObject({ ok: true })
    const texto = lotes.flat().map((t) => t.texto).join(' ')
    expect(texto).toContain('Ogum gosta de')
    expect(lotes.flat()[0].pagina).toBe(1)
  })

  it('docx passa pelo worker empacotado (mammoth embutido)', async () => {
    const lotes: Trecho[][] = []
    const r = await extrairNoWorker(
      docxMinimo([{ estilo: 'Heading1', texto: 'Ogum' }, { texto: 'Senhor dos caminhos.' }]),
      'docx',
      { aoHash: async () => true, aoLote: async (t) => (lotes.push(t), true) },
      { caminhoDoWorker },
    )
    expect(r).toMatchObject({ ok: true, total: 1 })
    expect(lotes.flat()[0]).toMatchObject({ caminho: ['Ogum'], texto: expect.stringContaining('Senhor dos caminhos.') })
  })

  it('passou do tempo: interrompe com o motivo', async () => {
    const md = Array.from({ length: 20_000 }, (_, i) => `# T${i}\n${'palavra '.repeat(50)}`).join('\n')
    expect(
      await extrairNoWorker(new TextEncoder().encode(md), 'md', sempre, { caminhoDoWorker, tempoMaxMs: 1 }),
    ).toEqual({ ok: false, motivo: 'A leitura do arquivo passou de 10 minutos e foi interrompida.' })
  })

  it('gancho que lança: rejeita com o erro dele', async () => {
    const ganchos = { aoHash: async () => { throw new Error('banco caiu') }, aoLote: async () => true }
    await expect(extrairNoWorker(new TextEncoder().encode('x'), 'txt', ganchos, { caminhoDoWorker })).rejects.toThrow('banco caiu')
  })

  it('o worker já terminou quando extrairNoWorker devolve, em toda saída', async () => {
    const criados: Worker[] = []
    const vivos = new Set<number>()
    const aoCriar = (w: Worker) => {
      criados.push(w)
      const id = w.threadId // depois do 'exit' o threadId vira -1
      vivos.add(id)
      w.once('exit', () => vivos.delete(id))
    }
    const op = { caminhoDoWorker, aoCriar }
    const enc = (s: string) => new TextEncoder().encode(s)
    const grande = Array.from({ length: 20_000 }, (_, i) => `# T${i}\n${'palavra '.repeat(50)}`).join('\n')
    const casos: Array<() => Promise<unknown>> = [
      () => extrairNoWorker(enc('# A\num.'), 'md', sempre, op),
      () => extrairNoWorker(enc('x'), 'txt', { aoHash: async () => false, aoLote: async () => true }, op),
      () => extrairNoWorker(enc('# A\num.'), 'md', { aoHash: async () => true, aoLote: async () => false }, op),
      () => extrairNoWorker(enc('oi'), 'pdf', sempre, op),
      () => extrairNoWorker(enc(grande), 'md', sempre, { ...op, tempoMaxMs: 1 }),
      () => extrairNoWorker(enc('x'), 'txt', { aoHash: async () => { throw new Error('x') }, aoLote: async () => true }, op).catch(() => null),
    ]
    for (const caso of casos) {
      await caso()
      expect(vivos.size).toBe(0)
    }
    expect(criados).toHaveLength(casos.length)
  }, 30_000)
})
