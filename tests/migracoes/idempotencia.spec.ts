import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url))
const PRIMEIRA_NOVA = 63

const novas = readdirSync(DIR)
  .filter((nome) => nome.endsWith('.sql'))
  .filter((nome) => Number(nome.slice(0, 4)) >= PRIMEIRA_NOVA)
  .sort()

describe('migrations novas aguentam rodar duas vezes', () => {
  it('existe ao menos uma migration nova para verificar', () => {
    expect(novas.length).toBeGreaterThan(0)
  })

  describe.each(novas)('%s', (nome) => {
    const sql = readFileSync(`${DIR}/${nome}`, 'utf8')
    const semComentario = sql.replace(/^\s*--.*$/gm, '')

    it('não cria tabela sem `if not exists`', () => {
      const cruas = [...semComentario.matchAll(/create\s+table\s+(?!if\s+not\s+exists)/gi)]
      expect(cruas.map((m) => m[0])).toEqual([])
    })

    it('não cria índice sem `if not exists`', () => {
      const cruas = [...semComentario.matchAll(/create\s+(unique\s+)?index\s+(?!if\s+not\s+exists)/gi)]
      expect(cruas.map((m) => m[0])).toEqual([])
    })

    it('não acrescenta coluna sem `if not exists`', () => {
      const cruas = [...semComentario.matchAll(/add\s+column\s+(?!if\s+not\s+exists)/gi)]
      expect(cruas.map((m) => m[0])).toEqual([])
    })

    it('embrulha `create policy` num bloco do-$$, que é onde a segunda passada falharia', () => {
      const politicas = (semComentario.match(/create\s+policy/gi) ?? []).length
      const blocos = (semComentario.match(/do\s+\$\$/gi) ?? []).length
      if (politicas > 0) expect(blocos).toBeGreaterThan(0)
    })

    it('não usa `create policy` fora de bloco, na coluna zero', () => {
      expect(semComentario).not.toMatch(/^create\s+policy/im)
    })

    it('nomeia toda restrição `check`', () => {
      const anonimas = [...semComentario.matchAll(/add\s+check\s*\(/gi)]
      expect(anonimas.map((m) => m[0])).toEqual([])
    })

    it('concede privilégio aos três papéis em toda tabela que cria', () => {
      const criadas = [...semComentario.matchAll(/create\s+table\s+if\s+not\s+exists\s+public\.(\w+)/gi)]
        .map((m) => m[1])
      for (const tabela of criadas) {
        expect(semComentario).toMatch(new RegExp(`grant\\s+all\\s+on\\s+table\\s+public\\.${tabela}`, 'i'))
      }
    })

    it('liga row level security em toda tabela que cria', () => {
      const criadas = [...semComentario.matchAll(/create\s+table\s+if\s+not\s+exists\s+public\.(\w+)/gi)]
        .map((m) => m[1])
      for (const tabela of criadas) {
        expect(semComentario).toMatch(
          new RegExp(`alter\\s+table\\s+public\\.${tabela}\\s+enable\\s+row\\s+level\\s+security`, 'i'),
        )
      }
    })
  })
})
