// Roda a 0076 de verdade num Postgres em memória (PGlite + pgvector) por cima das migrations da
// base de conhecimento que ela pressupõe, DUAS vezes, e exercita as funções com dados de exemplo.
// O teste de disco (`migracao.spec.ts`) confere o texto; este confere o comportamento.
//
// Os objetos que as migrations antigas tocam e que não são da base (workspaces, assistentes,
// mensagens, papéis do Supabase, storage) entram como esboços mínimos aqui — nenhuma migration
// antiga é editada.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'

const MIGRATIONS = [
  '0030_base_conhecimento.sql',
  '0031_base_conhecimento_tipos.sql',
  '0041_base_por_assistente.sql',
  '0044_recorte_transacional.sql',
  '0049_indices_busca_e_tetos.sql',
]
const NOVA = '0076_base_documentos.sql'
const ler = (nome: string) => readFileSync(`supabase/migrations/${nome}`, 'utf8')

const ESBOCOS = `
create schema if not exists extensions;
create schema if not exists storage;
create schema if not exists auth;
create role anon;
create role authenticated;
create role service_role;
create table auth.users (id uuid primary key);
create table storage.buckets (
  id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
);
create table public.workspaces (id uuid primary key);
create table public.assistentes (
  id uuid primary key, workspace_id uuid not null, unique (workspace_id, id)
);
create table public.mensagens (
  criado_em timestamptz, status text, direcao text, desistido_em timestamptz
);
create function public.e_membro(uuid) returns boolean language sql stable as 'select true';
create function public.set_atualizado_em() returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end $$;
`

// Identificadores fixos, legíveis no erro.
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const W = id(1)
const W2 = id(2)
const A1 = id(11)
const A2 = id(12)
const C1 = id(21) // card manual
const D1 = id(31) // documento ligado
const D2 = id(32) // documento desligado
const D3 = id(33) // documento recortado para A1
const V1 = id(41) // versão ativa de D1
const V0 = id(40) // versão NÃO ativa de D1 (em processamento)
const V2 = id(42) // ativa de D2
const V3 = id(43) // ativa de D3
const K1 = id(101)
const K2 = id(102)
const K3 = id(103)
const K4 = id(104)
const K5 = id(105)
const K9 = id(109)
const K20 = id(120)
const K30 = id(130)

let db: PGlite

async function aplicar(nome: string) {
  const sql = ler(nome)
  await db.transaction(async (tx) => {
    await tx.exec(sql)
  })
}

async function linhas<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

async function versao(v: string, doc: string, opts: Record<string, string> = {}) {
  const status = opts.status ?? 'pronto'
  await db.query(
    `insert into public.base_documento_versoes
       (id, workspace_id, documento_id, nome_arquivo, extensao, tamanho, caminho, status, origem)
     values ($1, $2, $3, 'a.pdf', 'pdf', 10, $4, $5, 'envio')`,
    [v, opts.ws ?? W, doc, opts.caminho ?? `${opts.ws ?? W}/${doc}/${v}.pdf`, status],
  )
}

async function trecho(
  k: string,
  doc: string,
  v: string,
  secao: number,
  posicao: number,
  caminho: string | null,
  conteudo: string,
  pagina: number | null = null,
) {
  await db.query(
    `insert into public.base_conhecimento
       (id, workspace_id, titulo, conteudo, documento_id, versao_id, secao, posicao, caminho_titulos, pagina)
     values ($1, $2, 'Trecho', $3, $4, $5, $6, $7, $8, $9)`,
    [k, W, conteudo, doc, v, secao, posicao, caminho, pagina],
  )
}

const buscar = (query: string, assistente: string | null = null) =>
  linhas<{ id: string; documento: string | null; caminho_titulos: string | null; pagina: number | null }>(
    `select * from public.base_conhecimento_buscar($1, $2, null, null, 50, null, $3)`,
    [W, query, assistente],
  )

const secoes = (termos: string[], assistente: string | null = null) =>
  linhas<{ id: string; documento: string | null; recorte: string; total: number }>(
    `select * from public.base_secoes_por_termos($1, $2::text[], $3, 50, 0)`,
    [W, termos, assistente],
  )

const secaoDo = (trechoId: string, modo: string) =>
  linhas<{ id: string; alvo: boolean; posicao: number | null }>(
    `select * from public.base_secao_do_trecho($1, $2, null, $3)`,
    [W, trechoId, modo],
  )

beforeAll(async () => {
  db = new PGlite({ extensions: { vector } })
  await db.exec(ESBOCOS)
  for (const nome of MIGRATIONS) await aplicar(nome)
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe('0076 aplicada num Postgres de verdade (PGlite)', () => {
  it('aplica a primeira vez', async () => {
    await expect(aplicar(NOVA)).resolves.toBeUndefined()
  })

  it('aplica a segunda vez sem erro e sem refazer a fts', async () => {
    await db.query(`insert into public.workspaces values ($1), ($2)`, [W, W2])
    await db.query(`insert into public.base_conhecimento (id, workspace_id, titulo, conteudo) values ($1, $2, 'x', 'sentinela')`, [
      id(999),
      W,
    ])
    await expect(aplicar(NOVA)).resolves.toBeUndefined()
    const [{ expr }] = await linhas<{ expr: string }>(
      `select pg_get_expr(d.adbin, d.adrelid) as expr
         from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
        where d.adrelid = 'public.base_conhecimento'::regclass and a.attname = 'fts'`,
    )
    expect(expr).toContain('caminho_titulos')
    expect(expr).toContain('contexto')
    expect(await linhas(`select 1 from public.base_conhecimento where fts @@ to_tsquery('portuguese', 'sentinela')`)).toHaveLength(1)
    await db.query(`delete from public.base_conhecimento where id = $1`, [id(999)])
  })

  it('bucket privado com os seis mime', async () => {
    const [b] = await linhas<{ public: boolean; allowed_mime_types: string[]; file_size_limit: number | null }>(
      `select * from storage.buckets where id = 'base-arquivos'`,
    )
    expect(b.public).toBe(false)
    expect(b.file_size_limit).toBeNull()
    expect(b.allowed_mime_types).toHaveLength(6)
  })

  it('monta os dados de exemplo', async () => {
    await db.query(`insert into public.assistentes values ($1, $3), ($2, $3)`, [A1, A2, W])
    await db.query(
      `insert into public.base_conhecimento (id, workspace_id, titulo, conteudo)
       values ($1, $2, 'Prazo', 'O prazo de entrega e de sete dias.')`,
      [C1, W],
    )
    await db.query(
      `insert into public.base_documentos (id, workspace_id, nome_exibicao, nome_arquivo, ligado)
       values ($1, $4, 'Manual', 'manual.pdf', true),
              ($2, $4, 'Desligado', 'desligado.pdf', false),
              ($3, $4, 'Exclusivo', 'exclusivo.pdf', true)`,
      [D1, D2, D3, W],
    )
    await versao(V1, D1)
    await versao(V0, D1, { status: 'processando' })
    await db.query(`update public.base_documento_versoes set trabalhando_ate = now() + interval '1 hour' where id = $1`, [V0])
    await versao(V2, D2)
    await versao(V3, D3)
    await db.query(`update public.base_documentos set versao_ativa_id = $1 where id = $2`, [V1, D1])
    await db.query(`update public.base_documentos set versao_ativa_id = $1 where id = $2`, [V2, D2])
    await db.query(`update public.base_documentos set versao_ativa_id = $1 where id = $2`, [V3, D3])

    await trecho(K1, D1, V1, 1, 1, 'Cap 1 > Entrega', 'A entrega rapida acontece em dois dias.', 3)
    await trecho(K2, D1, V1, 1, 2, 'Cap 1 > Entrega', 'Mais sobre a entrega e o frete gratis.', 4)
    await trecho(K3, D1, V1, 2, 3, 'Cap 2 > Garantia', 'A garantia cobre defeitos de fabrica.', 5)
    await trecho(K4, D1, V1, 3, 4, '', 'Transcricao: a entrega foi explicada na aula.')
    await trecho(K5, D1, V1, 3, 5, null, 'Outra fala sobre entrega no fim da aula.')
    await trecho(K9, D1, V0, 1, 1, 'Cap 1 > Entrega', 'Texto antigo de entrega que nao vale.')
    await trecho(K20, D2, V2, 1, 1, 'Cap', 'Entrega de documento desligado.')
    await trecho(K30, D3, V3, 1, 1, 'Cap', 'Entrega exclusiva do assistente um.')
    await db.query(`select public.trocar_recorte_do_documento($1, $2, $3::uuid[])`, [W, D3, [A1]])
  })

  it('(a) busca devolve card e trecho da versão ativa, com documento, caminho e página', async () => {
    const r = await buscar('entrega')
    const ids = r.map((x) => x.id)
    expect(ids).toContain(C1)
    expect(ids).toContain(K1)
    const card = r.find((x) => x.id === C1)!
    expect(card.documento).toBeNull()
    const k1 = r.find((x) => x.id === K1)!
    expect(k1.documento).toBe('Manual')
    expect(k1.caminho_titulos).toBe('Cap 1 > Entrega')
    expect(k1.pagina).toBe(3)
  })

  it('(b) trecho de versão não ativa não aparece', async () => {
    expect((await buscar('antigo')).map((x) => x.id)).not.toContain(K9)
    expect((await buscar('entrega')).map((x) => x.id)).not.toContain(K9)
  })

  it('(c) documento desligado esconde os trechos', async () => {
    expect((await buscar('desligado')).map((x) => x.id)).not.toContain(K20)
  })

  it('(d) assistente_documentos restringe o documento a um assistente', async () => {
    expect((await buscar('exclusiva', A1)).map((x) => x.id)).toContain(K30)
    expect((await buscar('exclusiva', A2)).map((x) => x.id)).not.toContain(K30)
    expect(await linhas(`select 1 from public.assistente_documentos where documento_id = $1`, [D3])).toHaveLength(1)
  })

  it('(d2) trocar_recorte_do_documento devolve 0 e 2 como a do bloco', async () => {
    const [{ r: deOutro }] = await linhas<{ r: number }>(
      `select public.trocar_recorte_do_documento($1, $2, '{}'::uuid[]) as r`,
      [W2, D3],
    )
    expect(deOutro).toBe(0)
    const [{ r: assistenteAlheio }] = await linhas<{ r: number }>(
      `select public.trocar_recorte_do_documento($1, $2, $3::uuid[]) as r`,
      [W, D3, [id(77)]],
    )
    expect(assistenteAlheio).toBe(2)
  })

  it('(e) seções: uma linha por seção com título, uma por trecho sem título, total conta seções', async () => {
    const r = await secoes(['entrega'], A2)
    const ids = r.map((x) => x.id).sort()
    // C1 (card), seção 1 de V1 (K1 e K2 casam, uma linha só, representante K1), K4 e K5 sem título.
    expect(ids).toEqual([C1, K1, K4, K5].sort())
    expect(r.every((x) => Number(x.total) === 4)).toBe(true)
    expect(r.find((x) => x.id === K1)!.documento).toBe('Manual')
    expect(r.find((x) => x.id === K1)!.recorte).toContain('entrega')
  })

  it('(e) seções exigem TODOS os termos, em trechos diferentes da mesma seção', async () => {
    const r = await secoes(['rapida', 'frete'])
    expect(r.map((x) => x.id)).toEqual([K1])
    expect(Number(r[0].total)).toBe(1)
    expect(await secoes(['garantia', 'frete'])).toEqual([])
  })

  it('(e) seções respeitam versão ativa, ligado e recorte', async () => {
    expect((await secoes(['antigo'])).map((x) => x.id)).toEqual([])
    expect((await secoes(['desligado'])).map((x) => x.id)).toEqual([])
    expect((await secoes(['exclusiva'], A2)).map((x) => x.id)).toEqual([])
    expect((await secoes(['exclusiva'], A1)).map((x) => x.id)).toEqual([K30])
  })

  it('(e) com embedding, o representante é o trecho mais parecido e a ordem é pela distância', async () => {
    const vetor = (eixo: number) => `[${Array.from({ length: 1536 }, (_, i) => (i === eixo ? 1 : 0)).join(',')}]`
    const quase = `[${Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : i === 1 ? 0.2 : 0)).join(',')}]`
    await db.query(`update public.base_conhecimento set embedding = $1::extensions.vector, embed_versao = 'v' where id = $2`, [vetor(1), K1])
    await db.query(`update public.base_conhecimento set embedding = $1::extensions.vector, embed_versao = 'v' where id = $2`, [vetor(0), K2])
    await db.query(`update public.base_conhecimento set embedding = $1::extensions.vector, embed_versao = 'v' where id = $2`, [vetor(2), K4])
    const r = await linhas<{ id: string; recorte: string }>(
      `select * from public.base_secoes_por_termos($1, array['entrega'], null, 50, 0, $2::extensions.vector, 'v')`,
      [W, quase],
    )
    expect(r[0].id).toBe(K2)
    expect(r[0].recorte).toBe('Mais sobre a entrega e o frete gratis.')
    expect(r.map((x) => x.id)).toContain(K4)
    expect(r).toHaveLength(5) // sem assistente (null) o documento recortado também aparece
    await db.query(`update public.base_conhecimento set embedding = null, embed_versao = null where id = any($1::uuid[])`, [
      [K1, K2, K4],
    ])
  })

  it('(f) seção do trecho devolve os trechos da seção em ordem, marcando o alvo', async () => {
    const r = await secaoDo(K2, 'secao')
    expect(r.map((x) => x.id)).toEqual([K1, K2])
    expect(r.map((x) => x.alvo)).toEqual([false, true])
  })

  it('(f) vizinhos e card manual', async () => {
    expect((await secaoDo(K3, 'vizinhos')).map((x) => x.id)).toEqual([K2, K3, K4])
    expect((await secaoDo(C1, 'secao')).map((x) => x.id)).toEqual([C1])
  })

  it('(f) trecho invisível não devolve nada', async () => {
    expect(await secaoDo(K9, 'secao')).toEqual([])
    expect(await secaoDo(K20, 'vizinhos')).toEqual([])
  })

  it('(g) promover troca a ativa, apaga a antiga com os trechos e devolve o caminho antigo', async () => {
    const V4 = id(44)
    await versao(V4, D1, { status: 'processando' })
    await trecho(id(140), D1, V4, 1, 1, 'Cap', 'Entrega nova.')
    const [{ r }] = await linhas<{ r: string | null }>(`select public.base_versao_promover($1, $2) as r`, [W, V4])
    expect(r).toBe(`${W}/${D1}/${V1}.pdf`)
    const [doc] = await linhas<{ versao_ativa_id: string }>(`select * from public.base_documentos where id = $1`, [D1])
    expect(doc.versao_ativa_id).toBe(V4)
    expect(await linhas(`select 1 from public.base_documento_versoes where id = $1`, [V1])).toEqual([])
    expect(await linhas(`select 1 from public.base_conhecimento where versao_id = $1`, [V1])).toEqual([])
    const [nova] = await linhas<{ status: string; etapa: string | null; trabalhando_ate: string | null }>(
      `select * from public.base_documento_versoes where id = $1`,
      [V4],
    )
    expect(nova).toMatchObject({ status: 'pronto', etapa: null, trabalhando_ate: null })
  })

  it("(g) promover sem ativa devolve '' e versão sumida devolve null", async () => {
    const D4 = id(34)
    const V5 = id(45)
    await db.query(
      `insert into public.base_documentos (id, workspace_id, nome_exibicao, nome_arquivo) values ($1, $2, 'Novo', 'novo.pdf')`,
      [D4, W],
    )
    await versao(V5, D4, { status: 'processando' })
    const [{ r }] = await linhas<{ r: string | null }>(`select public.base_versao_promover($1, $2) as r`, [W, V5])
    expect(r).toBe('')
    const [{ r: sumiu }] = await linhas<{ r: string | null }>(`select public.base_versao_promover($1, $2) as r`, [
      W,
      id(4999),
    ])
    expect(sumiu).toBeNull()
    // Versão de outro espaço de trabalho também não é encontrada.
    const [{ r: alheia }] = await linhas<{ r: string | null }>(`select public.base_versao_promover($1, $2) as r`, [W2, V5])
    expect(alheia).toBeNull()
  })

  it('apagar a versão ativa zera só versao_ativa_id (o workspace_id fica)', async () => {
    await db.query(`delete from public.base_documento_versoes where id = $1`, [V3])
    const [doc] = await linhas<{ workspace_id: string; versao_ativa_id: string | null }>(
      `select * from public.base_documentos where id = $1`,
      [D3],
    )
    expect(doc).toMatchObject({ workspace_id: W, versao_ativa_id: null })
    expect(await linhas(`select 1 from public.base_conhecimento where id = $1`, [K30])).toEqual([])
  })

  it('(h) reivindicar respeita a reserva e o teto de tentativas, e conta a tentativa', async () => {
    const D6 = id(36)
    await db.query(
      `insert into public.base_documentos (id, workspace_id, nome_exibicao, nome_arquivo) values ($1, $2, 'Fila', 'fila.pdf')`,
      [D6, W],
    )
    const livre = id(46)
    const reservada = id(47)
    const esgotada = id(48)
    await versao(livre, D6, { status: 'na_fila' })
    await versao(reservada, D6, { status: 'processando' })
    await versao(esgotada, D6, { status: 'na_fila' })
    await db.query(`update public.base_documento_versoes set criado_em = now() - interval '2 hours' where id = $1`, [livre])
    await db.query(
      `update public.base_documento_versoes set trabalhando_ate = now() + interval '1 hour', criado_em = now() - interval '3 hours' where id = $1`,
      [reservada],
    )
    await db.query(
      `update public.base_documento_versoes set tentativas = 5, criado_em = now() - interval '4 hours' where id = $1`,
      [esgotada],
    )

    const r = await linhas<{ id: string; status: string; tentativas: number; reserva_s: number }>(
      `select v.*, extract(epoch from (v.trabalhando_ate - now()))::int as reserva_s
         from public.base_versao_reivindicar(60) v`,
    )
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ id: livre, status: 'processando', tentativas: 1, reserva_s: 60 })
    // A livre agora está reservada; a reservada e a esgotada continuam fora.
    expect(await linhas(`select * from public.base_versao_reivindicar(60)`)).toEqual([])
  })

  it('(i) faxina marca erro nas esgotadas e apaga os envios abandonados', async () => {
    const D7 = id(37)
    const D8 = id(38)
    await db.query(
      `insert into public.base_documentos (id, workspace_id, nome_exibicao, nome_arquivo)
       values ($1, $3, 'Abandonado', 'ab.pdf'), ($2, $3, 'Recente', 're.pdf')`,
      [D7, D8, W],
    )
    const vencida = id(49)
    const abandonada = id(50)
    const recente = id(51)
    await versao(vencida, D7, { status: 'processando' })
    await db.query(
      `update public.base_documento_versoes set tentativas = 5, trabalhando_ate = now() - interval '1 minute' where id = $1`,
      [vencida],
    )
    await versao(abandonada, D7, { status: 'enviando', caminho: 'w/abandonada.pdf' })
    await db.query(`update public.base_documento_versoes set criado_em = now() - interval '25 hours' where id = $1`, [
      abandonada,
    ])
    await versao(recente, D8, { status: 'enviando', caminho: 'w/recente.pdf' })
    await db.query(`update public.base_documento_versoes set criado_em = now() - interval '1 hour' where id = $1`, [recente])

    const r = await linhas<{ caminho: string }>(`select * from public.base_versoes_faxina()`)
    expect(r.map((x) => x.caminho)).toEqual(['w/abandonada.pdf'])

    const [v] = await linhas<{ status: string; motivo_erro: string }>(
      `select * from public.base_documento_versoes where id = $1`,
      [vencida],
    )
    expect(v.status).toBe('erro')
    expect(v.motivo_erro).toBe(
      'O processamento falhou cinco vezes seguidas. Tente reprocessar; se continuar, fale com quem instalou o CRM.',
    )
    // D7 ainda tem a versão com erro, então fica; a recente fica.
    expect(await linhas(`select 1 from public.base_documentos where id = $1`, [D7])).toHaveLength(1)
    expect(await linhas(`select 1 from public.base_documento_versoes where id = $1`, [recente])).toHaveLength(1)

    // Documento que fica sem nenhuma versão sai junto.
    const D9 = id(39)
    const sozinha = id(52)
    await db.query(
      `insert into public.base_documentos (id, workspace_id, nome_exibicao, nome_arquivo) values ($1, $2, 'So', 'so.pdf')`,
      [D9, W],
    )
    await versao(sozinha, D9, { status: 'enviando', caminho: 'w/sozinha.pdf' })
    await db.query(`update public.base_documento_versoes set criado_em = now() - interval '30 hours' where id = $1`, [
      sozinha,
    ])
    const r2 = await linhas<{ caminho: string }>(`select * from public.base_versoes_faxina()`)
    expect(r2.map((x) => x.caminho)).toEqual(['w/sozinha.pdf'])
    expect(await linhas(`select 1 from public.base_documentos where id = $1`, [D9])).toEqual([])
  })
})
