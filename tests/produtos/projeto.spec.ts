import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CATALOGO, ehProdutoInterno, produtoPorSlug, produtosDoProjeto, slugDoMotor } from '@/lib/produtos/catalogo'
import { PROJETOS, projetoAtual } from '@/lib/produtos/projeto'
import { PROJETOS_ACEITOS, validarConfig } from '../../config-deploy.mjs'

const ler = (caminho: string) => readFileSync(new URL(`../../${caminho}`, import.meta.url), 'utf8')

describe('projetoAtual', () => {
  it.each([undefined, '', '   ', 'gps', 'GPSDAPENA', 'trilhas'])('lança com %j', (valor) => {
    expect(() => projetoAtual({ PROJETO: valor })).toThrow(/PROJETO inválido ou ausente/)
  })

  it('aceita os projetos da lista, sem ligar para espaço em volta', () => {
    expect(projetoAtual({ PROJETO: 'gpsdapena' })).toBe('gpsdapena')
    expect(projetoAtual({ PROJETO: ' trilhasdearuanda ' })).toBe('trilhasdearuanda')
  })
})

describe('o catálogo por projeto', () => {
  it('todo produto declara ao menos um projeto, e só projetos que existem', () => {
    for (const p of CATALOGO) {
      expect(p.projetos.length, p.id).toBeGreaterThan(0)
      for (const projeto of p.projetos) expect(PROJETOS).toContain(projeto)
    }
  })

  it('o GPS da Pena tem as calculadoras', () => {
    const ids = produtosDoProjeto({ PROJETO: 'gpsdapena' }).map((p) => p.id)
    expect(ids).toEqual(expect.arrayContaining(['indulto-comutacao-2025', 'indulto-comutacao-2024', 'detracao-recolhimento-noturno']))
  })

  it('o Trilhas de Aruanda NÃO tem produto que seja só do GPS da Pena', () => {
    const doTrilhas = produtosDoProjeto({ PROJETO: 'trilhasdearuanda' })
    for (const p of doTrilhas) expect(p.projetos).toContain('trilhasdearuanda')
    expect(doTrilhas.map((p) => p.id)).not.toContain('indulto-comutacao-2025')
    expect(doTrilhas.map((p) => p.id)).not.toContain('detracao-recolhimento-noturno')
  })

  it('sem PROJETO, a lista não cai num padrão: lança', () => {
    expect(() => produtosDoProjeto({})).toThrow(/PROJETO/)
  })
})

describe('num deploy do Trilhas de Aruanda, produto do GPS não existe', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('não é produto interno, não tem rota e não tem slug', () => {
    vi.stubEnv('PROJETO', 'trilhasdearuanda')
    // `ehProdutoInterno` falso faz a oferta recusar o id (ehIdDeProdutoAceito) e o e-mail ignorá-lo.
    expect(ehProdutoInterno('indulto-comutacao-2025')).toBe(false)
    // `produtoPorSlug` nulo faz o layout da rota dar 404.
    expect(produtoPorSlug('cic-2025')).toBeNull()
    expect(produtoPorSlug('recolhimento-noturno')).toBeNull()
    expect(slugDoMotor('indulto-comutacao-2024')).toBeNull()
  })

  it('e no do GPS da Pena, existe', () => {
    vi.stubEnv('PROJETO', 'gpsdapena')
    expect(ehProdutoInterno('indulto-comutacao-2025')).toBe(true)
    expect(produtoPorSlug('cic-2025')?.id).toBe('indulto-comutacao-2025')
  })
})

describe('as rotas das calculadoras', () => {
  // 🔴 O gate da rota é o layout: ele cobre lista, /novo e /[id]. Sem ele, as páginas de detração
  // abririam num deploy de outro projeto, porque fixam o produto no código.
  it.each([
    ['src/app/(app)/ferramentas/[calculadora]/layout.tsx', 'indulto-comutacao'],
    ['src/app/(app)/ferramentas/detracao/[calculadora]/layout.tsx', 'detracao'],
  ])('%s dá 404 para produto fora do projeto', (arquivo, familia) => {
    const txt = ler(arquivo)
    expect(txt).toMatch(/produtoPorSlug\(calculadora\)/)
    expect(txt).toContain(`'${familia}'`)
    expect(txt).toMatch(/notFound\(\)/)
  })
})

describe('a verificação do boot (preflight)', () => {
  const chaves = {
    SUPABASE_DB_URL: 'postgresql://postgres.abc:senha@aws-0-sa-east-1.pooler.supabase.com:5432/postgres',
    SUPABASE_ANON_KEY: 'sb_publishable_x',
    SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_y',
  }
  const temProblemaDeProjeto = (env: Record<string, string>) =>
    validarConfig(env).problemas.some((p: { codigo: string }) => p.codigo === 'projeto_invalido')

  it('a lista do .mjs é a mesma do .ts', () => {
    expect([...PROJETOS_ACEITOS]).toEqual([...PROJETOS])
  })

  it('recusa subir sem PROJETO ou com valor desconhecido', () => {
    expect(temProblemaDeProjeto(chaves)).toBe(true)
    expect(temProblemaDeProjeto({ ...chaves, PROJETO: 'outro' })).toBe(true)
  })

  it('aceita os dois projetos', () => {
    expect(temProblemaDeProjeto({ ...chaves, PROJETO: 'gpsdapena' })).toBe(false)
    expect(temProblemaDeProjeto({ ...chaves, PROJETO: 'trilhasdearuanda' })).toBe(false)
  })
})
