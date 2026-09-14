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

  it('a 0065 deixa cada um ver só a própria linha, e o owner o workspace', () => {
    const sql = semComentario(readFileSync(`${DIR}/0065_membros_e_workspaces_so_para_quem_pode.sql`, 'utf8'))
    expect(sql).toMatch(/create\s+policy\s+membros_sel\s+on\s+public\.membros\s+for\s+select\s+to\s+authenticated\s+using\s*\(\s*user_id\s*=\s*auth\.uid\(\)\s+or\s+public\.e_owner\(workspace_id\)\s*\)/i)
    expect(sql).toMatch(/revoke\s+execute\s+on\s+function\s+public\.criar_workspace\(text,\s*uuid\)\s+from\s+authenticated/i)
  })

  it('nenhuma migration posterior recria a membros_sel nem devolve criar_workspace ao navegador', () => {
    const posteriores = readdirSync(DIR).filter((nome) => nome.endsWith('.sql') && Number(nome.slice(0, 4)) > 65)
    for (const nome of posteriores) {
      const sql = semComentario(readFileSync(`${DIR}/${nome}`, 'utf8'))
      expect(sql, `${nome}: recriar membros_sel pode reabrir a lista de compradores`).not.toMatch(/create\s+policy\s+membros_sel/i)
      expect(sql, `${nome}: criar_workspace não pode voltar a authenticated`).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.criar_workspace[^;]*\bauthenticated\b/i)
    }
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
