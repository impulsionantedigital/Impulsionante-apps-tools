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

    it('toda `create table` usa schema qualificado (ex.: `public.<tabela>`)', () => {
      // Sem esquema explícito, a tabela ainda nasce (no schema do `search_path` padrão), mas
      // escapa às regras abaixo, que só enxergam `create table if not exists public.(\w+)` —
      // e assim nasce sem RLS e sem grant, e a guarda nem percebe que ela existe.
      const alvos = [...semComentario.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(\S+)/gi)].map(
        (m) => m[1],
      )
      const semEsquema = alvos.filter((alvo) => !/^\w+\.\w+/.test(alvo))
      expect(semEsquema).toEqual([])
    })

    it('não cria índice sem `if not exists`', () => {
      const cruas = [...semComentario.matchAll(/create\s+(unique\s+)?index\s+(?!if\s+not\s+exists)/gi)]
      expect(cruas.map((m) => m[0])).toEqual([])
    })

    it('não acrescenta coluna sem `if not exists`', () => {
      const cruas = [...semComentario.matchAll(/add\s+column\s+(?!if\s+not\s+exists)/gi)]
      expect(cruas.map((m) => m[0])).toEqual([])
    })

    it('toda `create policy` cai dentro de um bloco `do $$ ... end $$`', () => {
      // Verificação de posição, não heurística de contagem ou de indentação: calcula os
      // intervalos de cada bloco `do $$ ... end $$` e exige que toda ocorrência de
      // `create policy` caia dentro de algum deles — só assim ela sobrevive à segunda passada.
      const blocos: Array<[number, number]> = []
      const abre = /do\s+\$\$/gi
      let aberto: RegExpExecArray | null
      while ((aberto = abre.exec(semComentario))) {
        const fecha = /end\s+\$\$\s*;/gi
        fecha.lastIndex = aberto.index
        const fechado = fecha.exec(semComentario)
        if (fechado) blocos.push([aberto.index, fechado.index + fechado[0].length])
      }

      const foraDoBloco = [...semComentario.matchAll(/create\s+policy/gi)].filter(
        (m) => !blocos.some(([inicio, fim]) => m.index >= inicio && m.index < fim),
      )
      expect(foraDoBloco.map((m) => m[0])).toEqual([])
    })

    it('nomeia toda restrição `check`', () => {
      // Pega tanto `add check (...)` (sem nome) quanto uma coluna com `check (...)` inline —
      // qualquer `check (` que não venha logo depois de `constraint <nome>` é anônima, e o
      // Postgres batiza a anônima com `<tabela>_<coluna>_check`, o padrão que outras migrations
      // usam para localizar e alargar domínios. Exclui `with check (...)`: essa é a cláusula de
      // `create policy`, não uma restrição de tabela — RLS não nomeia isso.
      const anonimas = [
        ...semComentario.matchAll(/(?<!constraint\s+\w+\s+)(?<!with\s+)check\s*\(/gi),
      ]
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
