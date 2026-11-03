import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { TIPOS_ACEITOS } from '@/lib/base-documentos/tipos'

const sql = readFileSync('supabase/migrations/0076_base_documentos.sql', 'utf8').replace(/^\s*--.*$/gm, '')

describe('migration 0076 — documentos da base', () => {
  it('bucket base-arquivos é privado', () => expect(sql).toMatch(/'base-arquivos',\s*'base-arquivos',\s*false/))
  it('bucket aceita exatamente os mime de TIPOS_ACEITOS', () => {
    for (const mime of Object.values(TIPOS_ACEITOS)) expect(sql).toContain(`'${mime}'`)
  })
  it('não cria policy em storage.objects', () => expect(sql).not.toMatch(/on\s+storage\.objects/i))
  it.each([
    'base_conhecimento_buscar',
    'base_secoes_por_termos',
    'base_secao_do_trecho',
    'base_versao_reivindicar',
    'base_versao_promover',
    'base_versoes_faxina',
    'trocar_recorte_do_documento',
  ])('%s é revogada de authenticated e concedida a service_role', (fn) => {
    expect(sql).toMatch(
      new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\)\\s*from public, anon, authenticated`, 'i'),
    )
    expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\)\\s*to service_role`, 'i'))
  })
  it('fts nova inclui caminho_titulos e contexto', () =>
    expect(sql).toMatch(/coalesce\(caminho_titulos,''\)[\s\S]*coalesce\(contexto,''\)/))
  it('lista agrupa por seção', () => expect(sql).toMatch(/base_secoes_por_termos[\s\S]*group by[\s\S]*secao/i))
  it('as três funções de leitura usam a versão ativa', () =>
    expect(sql.match(/d\.versao_ativa_id = b\.versao_id/g)?.length).toBeGreaterThanOrEqual(3))
})
