import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// 🔴 O hash da senha temporária só fica fora do navegador enquanto `membros` tiver `select`
// coluna a coluna. Qualquer grant de tabela posterior o reabre, sem erro e sem aviso.

const DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url))
const semComentario = (sql: string) => sql.replace(/^\s*--.*$/gm, '')

describe('o hash da senha temporária continua fora do navegador', () => {
  it('a 0064 revoga o select de tabela e não concede as colunas da senha', () => {
    const sql = semComentario(readFileSync(`${DIR}/0064_vendas_e_ofertas.sql`, 'utf8'))
    expect(sql).toMatch(/revoke\s+select\s+on\s+table\s+public\.membros\s+from\s+anon,\s*authenticated/i)

    const concessao = /grant\s+select\s*\(([^)]*)\)\s*on\s+table\s+public\.membros\s+to\s+authenticated/i.exec(sql)
    expect(concessao).not.toBeNull()
    const colunas = (concessao as RegExpExecArray)[1].split(',').map((c) => c.trim())
    expect(colunas).not.toContain('senha_temporaria_hash')
    expect(colunas).not.toContain('senha_temporaria_expira_em')
  })

  it('nenhuma migration posterior reabre o select de membros para o navegador', () => {
    const posteriores = readdirSync(DIR)
      .filter((nome) => nome.endsWith('.sql') && Number(nome.slice(0, 4)) > 64)
    for (const nome of posteriores) {
      const sql = semComentario(readFileSync(`${DIR}/${nome}`, 'utf8'))
      expect(sql, `${nome}: grant em todas as tabelas reabre o hash`)
        .not.toMatch(/grant\s[^;]*\bon\s+all\s+tables\s+in\s+schema\s+public/i)
      expect(sql, `${nome}: grant de tabela em membros reabre o hash`)
        .not.toMatch(/grant\s+(all|select)(\s+privileges)?\s+on\s+(table\s+)?public\.membros\b/i)
    }
  })
})
