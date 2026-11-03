# Base de conhecimento com arquivos — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O dono da instalação envia pdf/docx/md/txt/json/csv de até 100 MB, o servidor corta em trechos com contexto e vetor em segundo plano, e o agente do WhatsApp responde perguntas pontuais, longas, por tema e de lista só com esse material, citando a fonte.

**Architecture:** O navegador envia o arquivo direto ao Storage por TUS com token assinado pelo servidor. Cada envio é uma *versão* de um *documento*; um processador em segundo plano (disparado pelo tick, rodando fora dele) extrai e corta o texto num `worker_thread` com teto de memória, grava os trechos como linhas de `base_conhecimento` invisíveis, gera frase de contexto e vetor, e só então troca a versão ativa numa transação. A busca passa a enxergar trechos pela versão ativa do documento, e o agente ganha três ferramentas (significado, lista por termo, ler seção).

**Tech Stack:** Next 16 (standalone), Supabase (Postgres + pgvector + Storage/TUS), `tus-js-client`, `unpdf`, `mammoth`, `node-html-parser`, `papaparse`, OpenAI (`gpt-5-mini` e `text-embedding-3-small`), Vitest.

**Spec:** [docs/superpowers/specs/2026-11-03-base-conhecimento-arquivos-design.md](../specs/2026-11-03-base-conhecimento-arquivos-design.md)

## Global Constraints

- pnpm sempre (`pnpm add`, `pnpm build`, `pnpm run test`), nunca npm. Suíte verde e `pnpm build` verde ao fim de cada tarefa.
- Migration nova: **`0076_base_documentos.sql`** (a `0075` é a de cursos). Tudo nela roda duas vezes: `if not exists`; `create policy`/`create trigger`/`add constraint` dentro de `do $$ … end $$` consultando `pg_policies`/`pg_trigger`/`pg_constraint` com o nome **e** a relação; toda `check` nomeada; toda tabela com `workspace_id`, `enable row level security`, policy e `grant all on table public.<t>` (o teste `tests/migracoes/idempotencia.spec.ts` cobra tudo isso).
- Nenhuma `create policy … on storage.objects`. Bucket `base-arquivos` com `public = false`.
- Toda função `security definer` nova: `revoke all … from public, anon, authenticated` e `grant execute … to service_role`.
- Todo acesso com `admin()` filtra `workspace_id` (o processador roda sem sessão, para todos os espaços).
- Tipos aceitos: `pdf, docx, md, txt, json, csv`. Limite por arquivo num lugar só: env `BASE_ARQUIVO_MAX_MB`, padrão **100**.
- Ações da tela: `await exigirEngineLiberado()`, espaço da sessão, e `ehOwnerDoWorkspace` (mensagem `SO_O_OWNER` de [acoes.ts](../../../src/app/(app)/base-conhecimento/acoes.ts)).
- O agente nunca mostra identificador interno, caminho de arquivo nem link do Storage.
- **Nada de assunto de projeto no código de produção.** O mesmo código serve GPS da Pena, Trilhas de Aruanda e qualquer outro: descrições de ferramenta, prompt, mensagens de tela e regras de corte não citam orixá, erva, direito nem nenhum documento real. Exemplos assim só em teste e na Task 12.
- Os cards manuais continuam como estão: toda leitura/escrita de card filtra `documento_id is null`.
- Textos de tela em português com acento; textos de prompt seguem o estilo atual de [prompt-agente.ts](../../../src/lib/canais/prompt-agente.ts) (sem acento).
- Antes de todo commit: `git branch --show-current` deve dizer `base-conhecimento-arquivos`. Nunca `git add -A` (o Codex usa a mesma pasta); adicionar só os arquivos da tarefa. Nunca push no `main` sem pedido explícito.

### Desvios da spec, decididos aqui

1. **Teto de gasto.** O CRM não tem teto em dinheiro hoje (só teto de rodadas do agente, que não se aplica). No lugar: teto de **20.000 trechos por versão** (passou → erro com motivo) e **custo estimado** gravado ao fim da extração e mostrado na tela durante o processamento.
2. **Hash.** Conferido no servidor logo depois do envio (primeira coisa da extração), não antes. Arquivo repetido termina em erro com motivo e o objeto é apagado.
3. **Versões.** Uma tabela de documentos (o que a pessoa vê) e uma de versões (cada arquivo enviado). Reprocessar = nova versão com cópia do objeto, para nunca deixar o agente sem a versão antiga.

## Review Focus

1. **Página recarregada no meio do envio** → ao escolher o mesmo arquivo de novo, o envio continua de onde parou (não recomeça do zero). Teste: Task 11, `chaveDeRetomada`.
2. **Reenvio do mesmo nome enquanto a versão anterior ainda processa** → a pendente é cancelada (linha e objeto), a ativa segue respondendo, e só a nova entra. Teste: Task 10, `versaoParaCancelar`.
3. **Documento excluído no meio do processamento** → o processador para sem erro, não recria nada, e o objeto não fica órfão. Teste: Task 8, `documento excluído no meio para com 'sumiu'`.
4. **Servidor reiniciado no meio** → a versão volta à fila quando a reserva vence; depois de 5 tentativas vira erro com motivo, nunca "processando" para sempre. Teste: Task 8, `faxina` + `retoma etapa`.
5. **txt/csv salvo no Windows (acentos em Windows-1252)** → acentos corretos nos trechos, não `�`. Teste: Task 4, `decodificarTexto`.

---

### Task 1: Branch, spike de envio retomável e de worker no build standalone

Este é o único passo sem código de produção. Ele confirma os dois riscos da spec antes de construir em cima.

**Files:**
- Create: `docs/superpowers/ESTADO-base-conhecimento-arquivos.md`
- Create (temporário, scratchpad, não commitado): `spike-tus.mjs`, `spike-worker/`

- [ ] **Step 1: Criar a branch e commitar a spec**

```bash
git switch -c base-conhecimento-arquivos main
git add docs/superpowers/specs/2026-11-03-base-conhecimento-arquivos-design.md docs/superpowers/plans/2026-11-03-base-conhecimento-arquivos.md
git commit -m "docs: spec e plano da base de conhecimento com arquivos"
```

- [ ] **Step 2: Perguntar ao usuário qual Supabase usar no spike**

O `.env` local pode apontar para produção. O spike cria e apaga um bucket temporário `spike-tus` (privado). Só seguir com o "pode" do usuário e com o projeto que ele indicar (de preferência o do Trilhas de Aruanda ou um de teste).

- [ ] **Step 3: Spike TUS com token assinado**

Script Node no scratchpad (`pnpm add -D tus-js-client` só no scratchpad, ou `npx`-free com o pacote do projeto depois da Task 11). Fluxo: `admin.storage.createBucket('spike-tus', { public: false })` → `createSignedUploadUrl('spike-tus', 'x/arquivo.bin')` → `tus.Upload` de um arquivo aleatório de **120 MB** com `endpoint: <url>/storage/v1/upload/resumable/sign`, `headers: { 'x-signature': token, apikey: <anon> }`, `chunkSize: 6 * 1024 * 1024`, `metadata: { bucketName, objectName, contentType: 'application/pdf' }` → `abort()` em ~40% → novo `Upload` com `findPreviousUploads()` + `resumeFromPreviousUpload()` → confere tamanho do objeto → apaga objeto e bucket.

Esperado: termina, retoma sem recomeçar, objeto com 120 MB. Se der 413 → limite global do projeto (anotar; o DEPLOY.md da Task 13 explica). Anotar quais cabeçalhos foram necessários (`apikey` sim ou não).

- [ ] **Step 4: Spike de worker no build standalone**

Num diretório scratch com Next 16 mínimo (`output: 'standalone'`), uma rota que faz `new Worker(new URL('./w.worker.ts', import.meta.url))` importando `unpdf`, roda `pnpm build && node .next/standalone/server.js` e chama a rota. Esperado: o worker responde. Se não funcionar, testar a alternativa: worker como `.mjs` em `src/server/base-documentos/`, incluído com `outputFileTracingIncludes` em `next.config.ts`, carregado por caminho absoluto `path.join(process.cwd(), …)`.

- [ ] **Step 5: Registrar o resultado e decidir**

Escrever em `docs/superpowers/ESTADO-base-conhecimento-arquivos.md`: cabeçalhos do TUS, se retomou, limite encontrado, e qual forma de worker funcionou (a Task 6 usa essa). **Se o TUS com token assinado não funcionar, parar e avisar o usuário** antes da Task 11 (a alternativa é envio assinado sem retomar, e retomar era objetivo).

```bash
git add docs/superpowers/ESTADO-base-conhecimento-arquivos.md
git commit -m "docs: resultado do spike de envio retomável e worker"
```

---

### Task 2: Migration 0076 — bucket, documentos, versões, trechos e funções de busca

**Files:**
- Create: `supabase/migrations/0076_base_documentos.sql`
- Create: `tests/base-documentos/migracao.spec.ts`
- Create: `src/lib/base-documentos/tipos.ts`
- Modify: `src/server/crm/base-conhecimento.ts:25,81`, `src/app/(app)/base-conhecimento/acoes.ts` (todas as `.from('base_conhecimento')`), `src/server/agente/painel.ts:221`

**Interfaces:**
- Produces (SQL): tabelas `base_documentos`, `base_documento_versoes`, `assistente_documentos`; colunas novas em `base_conhecimento`; funções `base_conhecimento_buscar`, `base_secoes_por_termos`, `base_secao_do_trecho`, `base_versao_reivindicar`, `base_versao_promover`, `base_versoes_faxina`, `trocar_recorte_do_documento`.
- Produces (TS, `src/lib/base-documentos/tipos.ts`):
  ```ts
  export const TIPOS_ACEITOS = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    md: 'text/markdown', txt: 'text/plain', json: 'application/json', csv: 'text/csv',
  } as const
  export type Extensao = keyof typeof TIPOS_ACEITOS
  export const BUCKET_ARQUIVOS = 'base-arquivos'
  export type StatusVersao = 'enviando' | 'na_fila' | 'processando' | 'pronto' | 'erro'
  export type Etapa = 'extraindo' | 'contextualizando' | 'vetorizando'
  export type Secao = { caminho: string[]; texto: string; paginas?: Array<{ offset: number; pagina: number }>; registros?: true }
  export type Trecho = { caminho: string[]; pagina: number | null; secao: number; posicao: number; texto: string }
  export function extensaoDe(nomeArquivo: string): Extensao | null
  export function caminhoDoObjeto(ws: string, documentoId: string, versaoId: string, ext: Extensao): string // `${ws}/${documentoId}/${versaoId}.${ext}`
  ```

**Esquema** (nomes de coluna são contrato para as tasks seguintes):

| Tabela | Colunas |
|---|---|
| `base_documentos` | `id`, `workspace_id`, `nome_exibicao text` (check nomeado 1..120), `nome_arquivo text`, `ligado bool default true`, `versao_ativa_id uuid null`, `criado_por uuid`, `criado_em`, `atualizado_em`; unique `(workspace_id, id)` |
| `base_documento_versoes` | `id`, `workspace_id`, `documento_id` (FK composta → documentos, cascade), `nome_arquivo`, `extensao` (check nomeado nas 6), `tamanho bigint`, `caminho text unique`, `hash text null`, `origem text` (check `envio`/`reprocesso`), `status text` (check nas 5 do `StatusVersao`, default `enviando`), `etapa text null` (check nas 3), `motivo_erro text null`, `trechos_total int default 0`, `custo_estimado_usd numeric null`, `tentativas int default 0`, `trabalhando_ate timestamptz null`, `enviado_por uuid`, `criado_em`, `atualizado_em`; unique `(workspace_id, id)`; índice `(status, trabalhando_ate)` |
| `assistente_documentos` | igual a `assistente_blocos` da 0041, com `documento_id` no lugar de `bloco_id` |
| `base_conhecimento` + | `documento_id uuid null`, `versao_id uuid null` (FK composta `(workspace_id, versao_id)` → versões, **on delete cascade**; FK composta `(workspace_id, documento_id)` → documentos, cascade), `caminho_titulos text null`, `pagina int null`, `secao int null`, `posicao int null`, `contexto text null` (null = ainda não tentou; `''` = tentou e falhou); índice `(workspace_id, versao_id, secao, posicao)` |

`versao_ativa_id` aponta para a versão com FK composta `on delete set null` (criada depois das duas tabelas, guardada por `pg_constraint`).

Bucket: `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('base-arquivos','base-arquivos', false, null, array[<os 6 mime de TIPOS_ACEITOS>]) on conflict (id) do nothing;` — `file_size_limit null`: o limite fica no código (env) e no limite global do projeto.

`fts` refeita para incluir caminho e contexto. Guarda: só se a expressão atual não contém `contexto` (`pg_get_expr(adbin, adrelid)` em `pg_attrdef` + `pg_attribute`), `alter table … drop column fts` e `add column if not exists fts tsvector generated always as (to_tsvector('portuguese', coalesce(titulo,'') || ' ' || coalesce(caminho_titulos,'') || ' ' || coalesce(contexto,'') || ' ' || coalesce(conteudo,''))) stored`; depois, fora do bloco, `create index if not exists base_conhecimento_fts_idx … using gin (fts)`.

**Predicado de visibilidade** — as três funções de leitura usam exatamente isto (`b` = `base_conhecimento`):

```sql
b.workspace_id = p_ws and b.habilitado and (
  (b.documento_id is null and coalesce(
     (select bool_or(ab.assistente_id = p_assistente) from public.assistente_blocos ab
       where ab.bloco_id = b.id and ab.workspace_id = b.workspace_id), true))
  or
  (b.documento_id is not null and exists (
     select 1 from public.base_documentos d
      where d.workspace_id = b.workspace_id and d.id = b.documento_id
        and d.ligado and d.versao_ativa_id = b.versao_id
        and coalesce((select bool_or(ad.assistente_id = p_assistente) from public.assistente_documentos ad
                       where ad.documento_id = d.id and ad.workspace_id = d.workspace_id), true)))
)
```

**Funções:**
- `base_conhecimento_buscar(p_ws, p_query, p_embedding, p_versao, p_limite, p_tipos, p_assistente)` — `drop function if exists` da assinatura de 7 argumentos e recria com o corpo da 0049 trocando o filtro pelo predicado. Retorno ganha colunas: `returns table (id uuid, titulo text, conteudo text, tipo text, score float, documento text, caminho_titulos text, pagina int)` (`documento` = `nome_exibicao`, null para card).
- `base_secoes_por_termos(p_ws uuid, p_termos text[], p_assistente uuid, p_limite int, p_deslocamento int, p_embedding extensions.vector(1536) default null, p_versao text default null) returns table (id uuid, documento text, titulo text, caminho_titulos text, pagina int, recorte text, total bigint)` — **devolve SEÇÕES, não trechos**: um verbete de ~4.000 caracteres vira 3–4 trechos, e a lista tem de contar e mostrar verbetes. Seção = `(versao_id, secao)` para trecho de documento **com título** (`caminho_titulos` não vazio); trecho **sem título** (transcrição, PDF sem sumário, txt) e card manual são, cada um, a sua própria seção — senão uma aula inteira viraria um item só da lista. Uma seção entra quando **cada** termo de `p_termos` (1 a 3, cada um em sintaxe `websearch_to_tsquery('portuguese', …)`, que aceita `OR`) casa com **algum** trecho visível dela — não precisa ser o mesmo trecho. Por seção, escolhe um trecho representante: com `p_embedding` (e `embed_versao = p_versao`), o mais parecido com ele; sem, o primeiro (por `posicao`) que casa com o primeiro termo. `id`, `pagina` e `caminho_titulos` são desse representante. `recorte`: sem `p_embedding`, `ts_headline('portuguese', conteudo, <query do 1º termo>, 'MaxWords=30, MinWords=10, StartSel=, StopSel=')`; com `p_embedding`, os primeiros 300 caracteres do representante. `total = count(*) over ()` (seções). Ordem: com `p_embedding`, pela distância do representante; sem, `documento, posicao`. Usa `search_path = extensions` como a busca híbrida.
- `base_secao_do_trecho(p_ws uuid, p_trecho uuid, p_assistente uuid, p_modo text) returns table (id uuid, documento text, caminho_titulos text, pagina int, posicao int, conteudo text, alvo boolean)` — se o trecho não passa no predicado, zero linhas. `p_modo = 'secao'`: todos os trechos visíveis com a mesma `versao_id` e `secao`; `'vizinhos'`: `posicao` entre `alvo-1` e `alvo+1` na mesma versão. Card manual: devolve só ele. Ordem por `posicao`.
- `base_versao_reivindicar(p_reserva_s int) returns setof base_documento_versoes` — uma linha `status in ('na_fila','processando') and coalesce(trabalhando_ate,'-infinity') < now() and tentativas < 5`, `order by criado_em`, `for update skip locked`; marca `status='processando'`, `trabalhando_ate = now() + p_reserva_s * interval '1 second'`, `tentativas = tentativas + 1`.
- `base_versao_promover(p_ws uuid, p_versao uuid) returns text` — numa transação: trava o documento; se a versão não existe mais, `return null`; guarda o `caminho` da versão ativa antiga; `update base_documentos set versao_ativa_id = p_versao`; versão nova `status='pronto', etapa=null, trabalhando_ate=null`; `delete` da versão antiga (os trechos dela saem pelo cascade); devolve o caminho antigo, ou `''` quando não havia ativa.
- `base_versoes_faxina() returns table (caminho text)` — versões com reserva vencida e `tentativas >= 5` → `status='erro'`, `motivo_erro='O processamento falhou cinco vezes seguidas. Tente reprocessar; se continuar, fale com quem instalou o CRM.'`; versões `enviando` com `criado_em < now() - interval '24 hours'` → apaga e devolve o `caminho` (o app apaga o objeto). Documento que fica sem nenhuma versão é apagado junto.
- `trocar_recorte_do_documento(p_ws, p_documento, p_assistentes uuid[]) returns int` — cópia de `trocar_recorte_do_bloco` (0044) sobre `assistente_documentos`; mesmos códigos 0/1/2.

- [ ] **Step 1: Teste de disco da migration**

```ts
// tests/base-documentos/migracao.spec.ts
const sql = readFileSync('supabase/migrations/0076_base_documentos.sql', 'utf8').replace(/^\s*--.*$/gm, '')
it('bucket base-arquivos é privado', () => expect(sql).toMatch(/'base-arquivos',\s*'base-arquivos',\s*false/))
it('bucket aceita exatamente os mime de TIPOS_ACEITOS', () => {
  for (const mime of Object.values(TIPOS_ACEITOS)) expect(sql).toContain(`'${mime}'`)
})
it('não cria policy em storage.objects', () => expect(sql).not.toMatch(/on\s+storage\.objects/i))
it.each(['base_conhecimento_buscar','base_secoes_por_termos','base_secao_do_trecho','base_versao_reivindicar','base_versao_promover','base_versoes_faxina','trocar_recorte_do_documento'])(
  '%s é revogada de authenticated e concedida a service_role', (fn) => {
    expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\)\\s*from public, anon, authenticated`, 'i'))
    expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\)\\s*to service_role`, 'i'))
  })
it('fts nova inclui caminho_titulos e contexto', () => expect(sql).toMatch(/coalesce\(caminho_titulos,''\)[\s\S]*coalesce\(contexto,''\)/))
it('lista agrupa por seção', () => expect(sql).toMatch(/base_secoes_por_termos[\s\S]*group by[\s\S]*secao/i))
it('as três funções de leitura usam a versão ativa', () => expect(sql.match(/d\.versao_ativa_id = b\.versao_id/g)?.length).toBeGreaterThanOrEqual(3))
```

Mais `tests/base-documentos/tipos.spec.ts`: `extensaoDe('Almanaque.MD') === 'md'`, `extensaoDe('a.markdown') === null`, `extensaoDe('semponto') === null`, `extensaoDe('x.tar.csv') === 'csv'`; `caminhoDoObjeto('w','d','v','pdf') === 'w/d/v.pdf'`.

- [ ] **Step 2: Rodar e ver falhar** — `pnpm vitest run tests/base-documentos` → FAIL (arquivo não existe).

- [ ] **Step 3: Escrever `tipos.ts` e a migration** seguindo o padrão da 0075 e o esquema acima.

- [ ] **Step 4: Cards ignoram trechos**

Em toda `.from('base_conhecimento')` de `src/server/crm/base-conhecimento.ts`, `src/app/(app)/base-conhecimento/acoes.ts` e `src/server/agente/painel.ts`, acrescentar `.is('documento_id', null)` (leitura, contagem, update e delete — um trecho não pode ser editado nem apagado pela tela de cards).

- [ ] **Step 5: Verificar** — `pnpm run test` (inclui `idempotencia.spec.ts` sobre a 0076) e `pnpm build` → verdes.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0076_base_documentos.sql src/lib/base-documentos/tipos.ts tests/base-documentos/ src/server/crm/base-conhecimento.ts "src/app/(app)/base-conhecimento/acoes.ts" src/server/agente/painel.ts
git commit -m "feat(base): tabelas de documentos e versões, trechos na base e busca pela versão ativa"
```

---

### Task 3: Corte em trechos

**Files:**
- Create: `src/lib/base-documentos/cortar.ts`
- Test: `tests/base-documentos/cortar.spec.ts`

**Interfaces:**
- Consumes: `Secao`, `Trecho` (Task 2).
- Produces: `export const ALVO_TRECHO = 1200, MAXIMO_TRECHO = 2000, SOBREPOSICAO_TRECHO = 200` e `export function cortarEmTrechos(secoes: Secao[]): Trecho[]`.

Regras: seção vazia (só espaço) não gera trecho. Seção com `texto.length <= MAXIMO_TRECHO` → um trecho. Maior → acumula parágrafos (`\n\n`) até `ALVO_TRECHO`; parágrafo maior que `MAXIMO_TRECHO` é partido em frases (`/(?<=[.!?…])\s+/`); frase maior que `MAXIMO_TRECHO` é partida no último espaço antes do limite. Cada pedaço depois do primeiro começa com o fim do anterior (até `SOBREPOSICAO_TRECHO` caracteres, a partir de um início de frase). Seção com `registros: true` (csv): agrupa parágrafos até `ALVO_TRECHO`, **sem sobreposição**, nunca parte um registro menor que `MAXIMO_TRECHO`. Nunca junta duas seções. `secao` = índice da seção em `secoes`; `posicao` = contador global a partir de 0. `pagina` = a página de `paginas` com maior `offset <= início do pedaço no texto da seção`, ou `null`.

- [ ] **Step 1: Testes**

```ts
it('verbete curto vira um trecho só, com o caminho', () => {
  const t = cortarEmTrechos([{ caminho: ['Ervas', 'Arruda'], texto: 'Erva quente de Ogum.' }])
  expect(t).toEqual([{ caminho: ['Ervas','Arruda'], pagina: null, secao: 0, posicao: 0, texto: 'Erva quente de Ogum.' }])
})
it('não junta verbetes vizinhos', () => {
  const t = cortarEmTrechos([{ caminho: ['A'], texto: 'um.' }, { caminho: ['B'], texto: 'dois.' }])
  expect(t.map((x) => [x.secao, x.posicao])).toEqual([[0, 0], [1, 1]])
})
it('seção longa é recortada em fim de parágrafo, todos herdam o caminho', () => {
  const par = 'Frase de teste. '.repeat(50).trim() // ~800
  const t = cortarEmTrechos([{ caminho: ['Xangô', 'Oferendas'], texto: [par, par, par, par].join('\n\n') }])
  expect(t.length).toBeGreaterThan(1)
  for (const x of t) { expect(x.caminho).toEqual(['Xangô','Oferendas']); expect(x.texto.length).toBeLessThanOrEqual(MAXIMO_TRECHO + SOBREPOSICAO_TRECHO) }
  expect(new Set(t.map((x) => x.secao))).toEqual(new Set([0]))
})
it('o segundo pedaço repete o fim do primeiro (sobreposição)', () => { /* t[1].texto começa com uma frase que termina t[0].texto */ })
it('transcrição sem parágrafo nem título é partida em frases', () => {
  const t = cortarEmTrechos([{ caminho: [], texto: 'Hoje falamos de prazo. '.repeat(300) }])
  expect(t.every((x) => /[.!?…]$/.test(x.texto.trim()))).toBe(true)
})
it('registros (csv) agrupam sem sobreposição e sem partir registro', () => {
  const regs = Array.from({ length: 30 }, (_, i) => `nome: item ${i}; uso: banho`)
  const t = cortarEmTrechos([{ caminho: [], texto: regs.join('\n\n'), registros: true }])
  expect(t.flatMap((x) => x.texto.split('\n\n'))).toEqual(regs)
})
it('pagina é a do início do pedaço', () => {
  const texto = 'a. '.repeat(500) + '\n\n' + 'b. '.repeat(500)
  const t = cortarEmTrechos([{ caminho: [], texto, paginas: [{ offset: 0, pagina: 1 }, { offset: 1502, pagina: 2 }] }])
  expect(t[0].pagina).toBe(1); expect(t.at(-1)!.pagina).toBe(2)
})
it('seção vazia não gera trecho', () => expect(cortarEmTrechos([{ caminho: ['Só título'], texto: '  \n ' }])).toEqual([]))
```

- [ ] **Step 2:** `pnpm vitest run tests/base-documentos/cortar.spec.ts` → FAIL.
- [ ] **Step 3:** Implementar `cortarEmTrechos`.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5: Commit** — `git add src/lib/base-documentos/cortar.ts tests/base-documentos/cortar.spec.ts && git commit -m "feat(base): corte de seções em trechos"`

---

### Task 4: Extração de md, txt, json e csv, conferência de conteúdo e decodificação

**Files:**
- Create: `src/lib/base-documentos/extrair/texto.ts` (decodificar, md, txt), `src/lib/base-documentos/extrair/dados.ts` (json, csv), `src/lib/base-documentos/extrair/index.ts` (despacho e conferência)
- Test: `tests/base-documentos/extrair-texto.spec.ts`, `tests/base-documentos/extrair-dados.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export class ErroDeExtracao extends Error {}            // message = motivo em português, para a tela
  export function decodificarTexto(dados: Uint8Array): string   // tira BOM; UTF-8 estrito, senão windows-1252
  export function extrairMarkdown(texto: string): Secao[]
  export function extrairTextoSimples(texto: string): Secao[]
  export function extrairJson(texto: string): Secao[]
  export function extrairCsv(texto: string): Secao[]
  export function conferirConteudo(ext: Extensao, dados: Uint8Array): void   // lança ErroDeExtracao
  export async function extrairSecoes(ext: Extensao, dados: Uint8Array): Promise<Secao[]>  // pdf/docx entram na Task 5
  ```
- Dependência: `pnpm add papaparse && pnpm add -D @types/papaparse`.

Regras: **md** — títulos ATX `#`…`######` fora de bloco de código cercado (```` ``` ````/`~~~`) mudam a pilha de caminho; texto antes do primeiro título tem caminho `[]`; front matter `---…---` no início é descartado; `\r\n` → `\n`. **txt** — uma seção, caminho `[]`. **json** — objeto cujos valores são todos primitivos (ou listas de primitivos) é um registro: uma seção com linhas `campo: valor` (lista vira `a, b, c`); o caminho é o caminho de chaves, e um item de lista usa o valor de `titulo`/`title`/`nome`/`name` quando existir, senão `#<n>` (1-based); objetos aninhados descem recursivamente; JSON inválido → `ErroDeExtracao('O arquivo JSON não é válido: …')`. **csv** — `Papa.parse(texto, { header: true, skipEmptyLines: true })` (detecta `;` ou `,`), cada linha vira `coluna: valor; …` só com valores não vazios; uma seção `{ caminho: [], texto: linhas.join('\n\n'), registros: true }`. **Conferência**: `pdf` começa com `%PDF-`; `docx` começa com `PK\x03\x04`; os de texto não podem conter byte `0x00` nos primeiros 8 KB. Falha → `ErroDeExtracao('O conteúdo não parece um arquivo .<ext>. Confira se a extensão está certa.')`.

- [ ] **Step 1: Testes**

```ts
it('decodificarTexto lê UTF-8 com BOM', () => expect(decodificarTexto(new Uint8Array([0xef,0xbb,0xbf,0x63,0x61,0xc3,0xa7,0xc3,0xa3]))).toBe('caçã'))
it('decodificarTexto lê Windows-1252 (Review Focus 5)', () => expect(decodificarTexto(new Uint8Array([0x4f,0x78,0x75,0x6d,0x20,0xe9,0x20,0xe1,0x67,0x75,0x61]))).toBe('Oxum é água'))
it('md: caminho segue os títulos', () => {
  const s = extrairMarkdown('# Ervas\n## Arruda\nQuente. Ogum.\n## Alecrim\nMorna.')
  expect(s.filter((x) => x.texto.trim())).toEqual([
    { caminho: ['Ervas','Arruda'], texto: 'Quente. Ogum.' },
    { caminho: ['Ervas','Alecrim'], texto: 'Morna.' },
  ])
})
it('md: # dentro de bloco de código não é título', () => expect(extrairMarkdown('# A\n```\n# não\n```').map((x) => x.caminho)).not.toContainEqual(['não']))
it('md: front matter é descartado', () => expect(extrairMarkdown('---\ntitle: x\n---\n# A\ntexto').flatMap((x) => x.texto)).not.toContain('title: x'))
it('json: lista de objetos usa o campo nome no caminho', () => {
  const s = extrairJson(JSON.stringify({ ervas: [{ nome: 'Arruda', orixas: ['Ogum','Oxóssi'], temperatura: 'quente' }] }))
  expect(s).toEqual([{ caminho: ['ervas','Arruda'], texto: 'nome: Arruda\norixas: Ogum, Oxóssi\ntemperatura: quente' }])
})
it('json inválido dá erro com motivo', () => expect(() => extrairJson('{x')).toThrow(ErroDeExtracao))
it('csv com ponto e vírgula vira registros', () => {
  const [s] = extrairCsv('nome;orixa;uso\nArruda;Ogum;banho\nAlfazema;;defumação\n')
  expect(s.registros).toBe(true)
  expect(s.texto).toBe('nome: Arruda; orixa: Ogum; uso: banho\n\nnome: Alfazema; uso: defumação')
})
it('pdf que não começa com %PDF- é recusado', () => expect(() => conferirConteudo('pdf', new TextEncoder().encode('oi'))).toThrow('não parece um arquivo .pdf'))
```

- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar → PASS.
- [ ] **Step 5: Commit** — `git add src/lib/base-documentos/extrair tests/base-documentos/extrair-*.spec.ts package.json pnpm-lock.yaml && git commit -m "feat(base): extração de md, txt, json e csv"`

---

### Task 5: Extração de docx e pdf

**Files:**
- Create: `src/lib/base-documentos/extrair/docx.ts`, `src/lib/base-documentos/extrair/pdf.ts`
- Modify: `src/lib/base-documentos/extrair/index.ts` (despacho)
- Create: `tests/base-documentos/fixtures.ts` (geradores de docx e pdf mínimos)
- Test: `tests/base-documentos/extrair-docx-pdf.spec.ts`

**Interfaces:**
- Produces: `export async function extrairDocx(dados: Uint8Array): Promise<Secao[]>`, `export async function extrairPdf(dados: Uint8Array): Promise<Secao[]>`.
- Dependências: `pnpm add mammoth node-html-parser unpdf`.
- Fixtures: `docxMinimo(blocos: Array<{ estilo?: 'Heading1'|'Heading2'; texto: string } | { tabela: string[][] }>): Uint8Array` (monta `[Content_Types].xml`, `_rels/.rels`, `word/document.xml`, `word/styles.xml` com os estilos `heading 1`/`heading 2` via `adm-zip`, que já é dependência); `pdfMinimo(paginas: string[], opts?: { contorno?: Array<{ titulo: string; pagina: number }> }): Uint8Array` (PDF 1.4 escrito à mão com fonte Helvetica, um `Tj` por linha, `/Outlines` opcional, xref com offsets calculados). Página com string vazia = página sem texto.

Regras: **docx** — `mammoth.convertToHtml({ buffer })`; percorre os filhos de topo do HTML (`node-html-parser`): `h1`…`h6` mudam a pilha de caminho; `p` vira parágrafo; `ul/ol` vira um parágrafo com `- item` por linha; `table` vira um parágrafo com uma linha por `tr` e células separadas por ` | `. **pdf** — `getDocumentProxy` do `unpdf`; texto de cada página por `getTextContent()` (itens unidos com espaço, `hasEOL` vira `\n`); páginas juntadas com `' '` quando a anterior não termina em `.!?…:`, senão `'\n\n'`, registrando `paginas: [{ offset, pagina }]`; se `getOutline()` traz itens cujo destino resolve para página (`getDestination` para destino nomeado, `getPageIndex` para a referência), cada item vira uma seção com o caminho do contorno cobrindo das páginas dele até a anterior à do próximo item; sem contorno, uma seção caminho `[]`. Menos de 200 caracteres não-brancos no total → `ErroDeExtracao('O arquivo não tem texto selecionável (parece ser só imagem). Envie uma versão com texto.')`.

- [ ] **Step 1: Testes**

```ts
it('docx: estilos de título viram caminho e tabela vira texto tabular', async () => {
  const s = await extrairDocx(docxMinimo([{ estilo: 'Heading1', texto: 'Ogum' }, { texto: 'Senhor dos caminhos.' }, { tabela: [['Comida','Bebida'],['feijoada','cerveja']] }]))
  expect(s.find((x) => x.texto.includes('feijoada'))).toMatchObject({ caminho: ['Ogum'] })
  expect(s.map((x) => x.texto).join('\n')).toContain('feijoada | cerveja')
})
it('pdf: guarda a página e não corta frase na quebra', async () => {
  const s = await extrairPdf(pdfMinimo(['Ogum gosta de', 'feijoada com cerveja. ' + 'x '.repeat(150)]))
  expect(s[0].texto).toContain('Ogum gosta de feijoada')
  expect(s[0].paginas?.map((p) => p.pagina)).toEqual([1, 2])
})
it('pdf: contorno vira caminho', async () => {
  const s = await extrairPdf(pdfMinimo(['Intro '.repeat(60), 'Ogum '.repeat(60)], { contorno: [{ titulo: 'Introdução', pagina: 1 }, { titulo: 'Ogum', pagina: 2 }] }))
  expect(s.map((x) => x.caminho)).toEqual([['Introdução'], ['Ogum']])
})
it('pdf só com imagem dá erro claro', async () => {
  await expect(extrairPdf(pdfMinimo(['', '']))).rejects.toThrow('não tem texto selecionável')
})
```

- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar e ligar no `extrairSecoes`. **Step 4:** Rodar → PASS; `pnpm build` verde (o `unpdf` não pode entrar em bundle de cliente: só é importado de `src/lib/base-documentos/extrair/pdf.ts`, que só o worker usa).
- [ ] **Step 5: Commit** — `git add src/lib/base-documentos/extrair tests/base-documentos package.json pnpm-lock.yaml && git commit -m "feat(base): extração de docx e pdf"`

---

### Task 6: Worker de extração com teto de memória e tempo

**Files:**
- Create: `src/server/base-documentos/extrator.worker.ts` (ou a forma `.mjs` que o spike da Task 1 aprovou)
- Create: `src/server/base-documentos/extrair-no-worker.ts`
- Test: `tests/base-documentos/extrair-no-worker.spec.ts`

**Interfaces:**
- Consumes: `extrairSecoes`, `conferirConteudo`, `ErroDeExtracao` (Tasks 4–5), `cortarEmTrechos` (Task 3).
- Produces:
  ```ts
  export const TEMPO_MAX_EXTRACAO_MS = 10 * 60_000
  export const MEMORIA_WORKER_MB = 768
  export const LOTE_DE_TRECHOS = 500
  export type ResultadoDaExtracao = { ok: true; total: number; hash: string } | { ok: false; motivo: string } | { ok: false; parou: true }
  export async function extrairNoWorker(
    dados: Uint8Array, ext: Extensao,
    ganchos: { aoHash(hash: string): Promise<boolean>; aoLote(trechos: Trecho[]): Promise<boolean> },  // false = parar
  ): Promise<ResultadoDaExtracao>
  ```
  Mensagens do worker: `{ tipo: 'hash', hash }` (SHA-256 hex, antes de extrair) → espera `{ tipo: 'seguir' }` ou é encerrado; `{ tipo: 'lote', trechos }` a cada `LOTE_DE_TRECHOS`; `{ tipo: 'fim', total }`; `{ tipo: 'erro', motivo }` (`ErroDeExtracao` → a mensagem dela; outro erro → `'Não consegui ler este arquivo. Confira se ele abre normalmente no computador.'`). O worker nasce com `resourceLimits: { maxOldGenerationSizeMb: MEMORIA_WORKER_MB }` e recebe o buffer transferido. Estouro de memória (`ERR_WORKER_OUT_OF_MEMORY`) → `{ ok: false, motivo: 'O arquivo é grande demais para ser lido de uma vez neste servidor.' }`. Tempo → `worker.terminate()` e `{ ok: false, motivo: 'A leitura do arquivo passou de 10 minutos e foi interrompida.' }`. Gancho devolvendo `false` → `terminate()` e `{ ok: false, parou: true }`.

- [ ] **Step 1: Testes** (rodam o worker de verdade sob Vitest)

```ts
it('md pequeno: hash, lotes e total', async () => {
  const lotes: Trecho[][] = []
  const r = await extrairNoWorker(new TextEncoder().encode('# A\num.\n# B\ndois.'), 'md', { aoHash: async () => true, aoLote: async (t) => (lotes.push(t), true) })
  expect(r).toMatchObject({ ok: true, total: 2 }); expect((r as { hash: string }).hash).toMatch(/^[0-9a-f]{64}$/)
  expect(lotes.flat().map((t) => t.caminho)).toEqual([['A'], ['B']])
})
it('aoHash false para antes de extrair', async () => {
  const aoLote = vi.fn(async () => true)
  expect(await extrairNoWorker(new TextEncoder().encode('x'), 'txt', { aoHash: async () => false, aoLote })).toEqual({ ok: false, parou: true })
  expect(aoLote).not.toHaveBeenCalled()
})
it('erro de extração chega com o motivo', async () => {
  expect(await extrairNoWorker(new TextEncoder().encode('oi'), 'pdf', { aoHash: async () => true, aoLote: async () => true })).toEqual({ ok: false, motivo: expect.stringContaining('não parece um arquivo .pdf') })
})
```

- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar → PASS; `pnpm build` verde **e** `node .next/standalone/server.js` sobe (o worker precisa ser encontrado no standalone — mesma checagem do spike).
- [ ] **Step 5: Commit** — `git add src/server/base-documentos tests/base-documentos/extrair-no-worker.spec.ts next.config.ts && git commit -m "feat(base): extração em worker com teto de memória e tempo"`

---

### Task 7: Frase de contexto, vetores em lote e custo estimado

**Files:**
- Create: `src/lib/base-documentos/contexto.ts` (puro)
- Create: `src/server/base-documentos/frase-contexto.ts`
- Modify: `src/server/agente/embed.ts` (acrescentar `embedarLote`)
- Test: `tests/base-documentos/contexto.spec.ts`

**Interfaces:**
- Produces (puro):
  ```ts
  export const MODELO_CONTEXTO = 'gpt-5-mini'
  export function mensagensDoContexto(p: { documento: string; caminho: string[]; texto: string }): Array<{ role: 'system' | 'user'; content: string }>
  export function textoParaBusca(p: { caminho: string[]; contexto: string | null; texto: string }): string  // `${caminho.join(' › ')}\n${contexto ?? ''}\n${texto}`, cortado em 8000
  export function estimarCustoUsd(trechos: Array<{ texto: string }>): number
  ```
- Produces (servidor):
  ```ts
  export async function gerarFraseDeContexto(p: { ws: string; documento: string; caminho: string[]; texto: string }): Promise<string | 'falhou' | 'sem_chave'>
  export async function embedarLote(textos: string[], opts: { ws: string }): Promise<{ vetores: number[][]; versao: string } | 'sem_chave' | null>  // em embed.ts; até 64 textos; um registrarCusto por chamada
  ```

`mensagensDoContexto` — system (copiar):
`Voce recebe um trecho de um documento. Escreva UMA ou DUAS frases curtas, em portugues, que situem o trecho dentro do documento: de que assunto ele trata e onde ele se encaixa. Nao repita o trecho, nao invente nada que nao esteja nele ou nos titulos, nao use introducoes como "Este trecho".`
user: `Documento: <documento>\nTitulos: <caminho com ' › ' ou '(sem titulo)'>\n\nTrecho:\n<texto>`.

`gerarFraseDeContexto`: `fetch('https://api.openai.com/v1/chat/completions')` no molde de `embedar` (chave por `getSecret(CHAVE_OPENAI)`, ausente → `'sem_chave'`), `model: MODELO_CONTEXTO`, `reasoning_effort: 'minimal'`, `max_completion_tokens: 200`, `AbortSignal.timeout(15_000)`; registra custo com `usage.prompt_tokens`/`completion_tokens` e `conversaId: null`; resposta vazia ou HTTP != 200 → `'falhou'`; frase cortada em 400 caracteres.

`estimarCustoUsd`: por trecho, entrada = `ceil((texto.length + 600) / 3)` tokens e saída = 80 tokens, a preço de `gpt-5-mini` via `custoUsd` de [custo.ts](../../../src/server/agente/custo.ts) (mover a conta para `src/lib` só se o import de `server-only` impedir; senão usar a tabela `PRECOS` por parâmetro), mais vetor `ceil(texto.length / 3)` tokens a `text-embedding-3-small`.

- [ ] **Step 1: Testes**

```ts
it('mensagens levam documento, títulos e trecho', () => {
  const [sys, user] = mensagensDoContexto({ documento: 'Almanaque das Ervas', caminho: ['Ervas','Arruda'], texto: 'Quente.' })
  expect(sys.content).toContain('UMA ou DUAS frases')
  expect(user.content).toBe('Documento: Almanaque das Ervas\nTitulos: Ervas › Arruda\n\nTrecho:\nQuente.')
})
it('sem título diz (sem titulo)', () => expect(mensagensDoContexto({ documento: 'Aula 3', caminho: [], texto: 'x' })[1].content).toContain('Titulos: (sem titulo)'))
it('texto para busca junta caminho, contexto e texto', () => expect(textoParaBusca({ caminho: ['A','B'], contexto: 'Sobre B.', texto: 't' })).toBe('A › B\nSobre B.\nt'))
it('custo estimado de 2000 trechos de 1200 caracteres fica abaixo de 1 dólar', () => {
  const v = estimarCustoUsd(Array.from({ length: 2000 }, () => ({ texto: 'x'.repeat(1200) })))
  expect(v).toBeGreaterThan(0.1); expect(v).toBeLessThan(1)
})
```

- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS + `pnpm build`.
- [ ] **Step 5: Commit** — `git add src/lib/base-documentos/contexto.ts src/server/base-documentos/frase-contexto.ts src/server/agente/embed.ts tests/base-documentos/contexto.spec.ts && git commit -m "feat(base): frase de contexto, vetores em lote e custo estimado"`

---

### Task 8: Processador em segundo plano e braço do tick

**Files:**
- Create: `src/server/base-documentos/processar.ts` (máquina de etapas, sem Supabase direto)
- Create: `src/server/base-documentos/repo.ts` (implementação Supabase do repositório)
- Create: `src/server/base-documentos/tick.ts`
- Modify: `src/lib/orcamento-tick.ts` (braço `documentos`), `src/app/api/interno/tick/route.ts` (chamar por último, depois de `expurgar`)
- Test: `tests/base-documentos/processar.spec.ts` (repositório falso em memória)

**Interfaces:**
- Consumes: `extrairNoWorker` (Task 6), `gerarFraseDeContexto`, `embedarLote`, `textoParaBusca`, `estimarCustoUsd` (Task 7), funções SQL da Task 2.
- Produces:
  ```ts
  export const RESERVA_MS = 120_000
  export const TETO_TRECHOS_POR_VERSAO = 20_000
  export const CONCORRENCIA_CONTEXTO = 4
  export type VersaoReivindicada = { id: string; workspaceId: string; documentoId: string; nomeExibicao: string; caminho: string; extensao: Extensao; origem: 'envio' | 'reprocesso'; etapa: Etapa | null }
  export interface RepoDocumentos {
    reivindicar(reservaMs: number): Promise<VersaoReivindicada | null>
    renovar(v: VersaoReivindicada, reservaMs: number): Promise<boolean>          // false = versão sumiu
    baixar(caminho: string): Promise<Uint8Array>
    acharDuplicata(v: VersaoReivindicada, hash: string): Promise<string | null>  // nome_exibicao de outra versão do ws com o mesmo hash e status != 'erro'
    gravarHash(v: VersaoReivindicada, hash: string): Promise<void>
    apagarTrechos(v: VersaoReivindicada): Promise<void>
    inserirTrechos(v: VersaoReivindicada, trechos: Trecho[]): Promise<boolean>   // false = FK violada (documento sumiu)
    marcarEtapa(v: VersaoReivindicada, etapa: Etapa, totais?: { trechosTotal: number; custoEstimadoUsd: number }): Promise<void>
    semContexto(v: VersaoReivindicada, limite: number): Promise<Array<{ id: string; caminho: string[]; texto: string }>>
    gravarContexto(v: VersaoReivindicada, id: string, contexto: string): Promise<void> // '' = falhou
    semVetor(v: VersaoReivindicada, limite: number): Promise<Array<{ id: string; caminho: string[]; contexto: string | null; texto: string }>>
    gravarVetores(v: VersaoReivindicada, itens: Array<{ id: string; vetor: number[]; versao: string }>): Promise<void>
    promover(v: VersaoReivindicada): Promise<string | null>                       // caminho antigo, '' sem antigo, null = versão sumiu
    falhar(v: VersaoReivindicada, motivo: string): Promise<void>                  // status 'erro', reserva limpa
    removerObjeto(caminho: string): Promise<void>
    faxina(): Promise<string[]>                                                   // caminhos a apagar
  }
  export type Deps = { repo: RepoDocumentos; extrair: typeof extrairNoWorker; frase: typeof gerarFraseDeContexto; vetores: typeof embedarLote }
  export async function processarVersao(v: VersaoReivindicada, d: Deps): Promise<'pronto' | 'erro' | 'sumiu'>
  export async function drenarDocumentos(orcamento: Orcamento, d?: Deps): Promise<{ iniciou: boolean; emAndamento: boolean; limpos: number }>
  ```

Etapas de `processarVersao`:
1. `etapa` nula ou `extraindo`: `marcarEtapa('extraindo')`, `apagarTrechos`, `baixar`, `extrair` com `aoHash` (origem `envio` e `acharDuplicata` achou → `falhar('Este arquivo é igual a «<nome>», que já está na base.')`, `removerObjeto(v.caminho)`, `false`; senão `gravarHash`, `true`) e `aoLote` (`inserirTrechos` false → para com `'sumiu'`; acumulado passou de `TETO_TRECHOS_POR_VERSAO` → `falhar('O arquivo geraria mais de 20.000 trechos. Divida-o em partes menores.')`). `total === 0` → `falhar('Não encontrei texto neste arquivo.')`. Depois `marcarEtapa('contextualizando', { trechosTotal, custoEstimadoUsd })`.
2. `contextualizando`: laço `semContexto(50)` → `CONCORRENCIA_CONTEXTO` chamadas de `frase` por vez; `'sem_chave'` → `falhar('Falta a chave da OpenAI. Cadastre-a em Configurações para processar documentos.')`; `'falhou'` → `gravarContexto(id, '')`; `renovar` a cada volta (false → `'sumiu'`). Vazio → `marcarEtapa('vetorizando')`.
3. `vetorizando`: laço `semVetor(64)` → `vetores(textos.map(textoParaBusca))`; `'sem_chave'` → mesma falha acima; `null` três vezes seguidas → `falhar('Não consegui gerar a busca por significado agora. Tente reprocessar mais tarde.')`; `renovar` a cada volta.
4. `promover`: `null` → `'sumiu'`; caminho não vazio → `removerObjeto` (erro só no log). Devolve `'pronto'`.

`drenarDocumentos`: se `!orcamento.cabe('documentos')` não faz nada; chama `faxina()` e remove os objetos devolvidos; se não há processamento em andamento neste processo (variável de módulo), `reivindicar(RESERVA_MS)` e dispara `processarVersao` **sem aguardar** (`.catch` loga com `detalheSeguro` e limpa a variável no `finally`). Em `orcamento-tick.ts`: `documentos: 2_000` em `PIORES_CASOS` e em `PORTOES`.

Também nesta task, na `repo.ts`: `semContexto` = `contexto is null`; `semVetor` = `contexto is not null and embed_versao is null`; `inserirTrechos` grava `titulo` = último elemento do caminho ou `nomeExibicao`, cortado em 120; `conteudo` = texto; `tipo 'fato'`; `origem 'operador'`; `caminho_titulos` = caminho unido por ` › `. Todas as consultas com `.eq('workspace_id', v.workspaceId)`.

- [ ] **Step 1: Testes com repositório falso**

```ts
it('caminho feliz: extrai, contextualiza, vetoriza e promove', async () => {
  const f = repoFalso({ arquivo: '# A\num.\n# B\ndois.', ext: 'md' })
  expect(await processarVersao(f.versao, deps(f))).toBe('pronto')
  expect(f.etapas).toEqual(['extraindo', 'contextualizando', 'vetorizando']); expect(f.promovida).toBe(true)
  expect(f.trechos.every((t) => t.contexto && t.vetor)).toBe(true)
})
it('arquivo repetido termina em erro e apaga o objeto', async () => {
  const f = repoFalso({ duplicataDe: 'Almanaque das Ervas' })
  expect(await processarVersao(f.versao, deps(f))).toBe('erro')
  expect(f.motivo).toBe('Este arquivo é igual a «Almanaque das Ervas», que já está na base.'); expect(f.removidos).toContain(f.versao.caminho)
})
it('reprocesso não confere duplicata', async () => { /* origem 'reprocesso' + duplicataDe → 'pronto' */ })
it('documento excluído no meio para com sumiu (Review Focus 3)', async () => {
  const f = repoFalso({ someNaEtapa: 'contextualizando' })
  expect(await processarVersao(f.versao, deps(f))).toBe('sumiu'); expect(f.promovida).toBe(false); expect(f.motivo).toBeNull()
})
it('retoma etapa: versão reivindicada em vetorizando não reextrai (Review Focus 4)', async () => {
  const f = repoFalso({ etapa: 'vetorizando', trechosProntosSemVetor: 3 })
  await processarVersao(f.versao, deps(f)); expect(f.baixou).toBe(false); expect(f.promovida).toBe(true)
})
it('falha da frase não trava: trecho fica com contexto vazio', async () => { /* frase → 'falhou' sempre → 'pronto', contexto '' */ })
it('sem chave da OpenAI vira erro com motivo', async () => { /* frase → 'sem_chave' → motivo 'Falta a chave da OpenAI…' */ })
it('passar de 20.000 trechos vira erro', async () => { /* extrair falso entrega 20.001 → motivo 'mais de 20.000 trechos' */ })
it('drenarDocumentos não começa segundo processamento enquanto o primeiro roda', async () => { /* duas chamadas seguidas → reivindicar chamado 1 vez */ })
it('faxina: objetos de envios abandonados são apagados', async () => { /* faxina devolve ['w/d/v.pdf'] → removerObjeto chamado com ele */ })
it('promover com outra versão ativa remove o objeto antigo', async () => { /* promover devolve 'w/d/velha.md' → removerObjeto chamado com ele */ })
```

- [ ] **Step 2:** FAIL. **Step 3:** Implementar `processar.ts`, `repo.ts`, `tick.ts`, o braço no orçamento e na rota. **Step 4:** PASS + `pnpm run test` + `pnpm build`.
- [ ] **Step 5: Commit** — `git add src/server/base-documentos src/lib/orcamento-tick.ts src/app/api/interno/tick/route.ts tests/base-documentos/processar.spec.ts && git commit -m "feat(base): processador de documentos em segundo plano e braço do tick"`

---

### Task 9: Ferramentas do agente, citação e prompt

**Files:**
- Modify: `src/server/agente/busca-base.ts`, `src/lib/canais/bloco-conhecimento.ts`, `src/server/agente/ferramentas.ts:265-308`, `src/server/agente/runtime.ts:361-387`, `src/lib/canais/prompt-agente.ts`
- Create: `src/lib/canais/refs-da-rodada.ts`
- Test: `tests/agente/bloco-conhecimento.spec.ts`, `tests/agente/refs-da-rodada.spec.ts`

**Interfaces:**
- Consumes: SQL `base_conhecimento_buscar` (retorno novo), `base_secoes_por_termos`, `base_secao_do_trecho` (Task 2).
- Produces:
  ```ts
  // bloco-conhecimento.ts
  export type FonteDoAchado = { documento: string; caminho: string; pagina: number | null }
  export type AchadoDaBase = { id: string; titulo: string; conteudo: string; tipo: 'fato' | 'playbook'; fonte: FonteDoAchado | null }
  export type ItemDaLista = { id: string; titulo: string; fonte: FonteDoAchado | null; recorte: string }
  export const POR_PAGINA_LISTA = 25, POR_PAGINA_LISTA_COM_TEMA = 18, TETO_SECAO = 8_000
  // item da lista = uma SEÇÃO (um verbete inteiro), nunca um trecho solto; as duas paginações cabem no TETO_BLOCO_CONHECIMENTO
  export function montarBlocoConhecimento(estado: { achados: AchadoDaBase[] } | 'indisponivel', refs?: RefsDaRodada): string
  export function montarBlocoLista(rotulo: string, estado: { total: number; pagina: number; itens: ItemDaLista[] } | 'indisponivel', refs: RefsDaRodada): string
  export function montarBlocoSecao(estado: { fonte: FonteDoAchado | null; texto: string; cortado: boolean } | 'nao_encontrado' | 'indisponivel'): string
  // refs-da-rodada.ts
  export type RefsDaRodada = { ref(id: string): string; id(ref: string): string | null }
  export function criarRefs(): RefsDaRodada   // 'r1', 'r2', …; mesmo id → mesma ref
  // busca-base.ts
  export async function buscarNaBase(ws, consulta, opts: { conversaId: string | null; tipos: TiposDaBusca; assistenteId: string | null; limite?: number }): Promise<AchadoDaBase[] | 'indisponivel'>  // limite padrão 5 (bloco automático); ferramenta passa 8
  export async function buscarVarias(ws: string, consultas: string[], opts: { conversaId: string | null; assistenteId: string | null }): Promise<AchadoDaBase[] | 'indisponivel'>
  // 1 a 3 consultas em paralelo (Promise.all, cada uma com limite 8, todas sob o mesmo ORCAMENTO_BUSCA_MS);
  // junta sem repetir id, intercalando os resultados (1º de cada consulta, depois 2º de cada…) e corta em 16.
  // 'indisponivel' só se TODAS falharem; se só algumas falharem, devolve o que veio.
  export async function listarPorTermos(ws: string, termos: string[], opts: { assistenteId: string | null; pagina: number; tema?: string; conversaId: string | null }): Promise<{ total: number; itens: ItemDaLista[] } | 'indisponivel'>
  // chama base_secoes_por_termos; com `tema`, embeda o tema (embedar) e passa p_embedding/p_versao, e pagina com POR_PAGINA_LISTA_COM_TEMA;
  // se o embedding falhar, segue sem tema (lista completa, só sem a ordem por relevância)
  export async function lerSecao(ws: string, trechoId: string, modo: 'secao' | 'vizinhos', opts: { assistenteId: string | null }): Promise<{ fonte: FonteDoAchado | null; texto: string; cortado: boolean } | 'nao_encontrado' | 'indisponivel'>
  ```
  `listarPorTermos` e `lerSecao` usam `AbortSignal.timeout(ORCAMENTO_BUSCA_MS)` como `buscarNaBase`. `lerSecao` junta os trechos na ordem, começando pelo `alvo` e acrescentando alternadamente anterior/seguinte até `TETO_SECAO`; `cortado = true` se sobrou algum (a sobreposição entre trechos vizinhos é removida ao juntar).

Formato das linhas (contrato do teste):
- achado: `[conhecimento r1] Fonte: Almanaque das Ervas › Ervas › Arruda (p. 12) | Arruda: <conteúdo>`; card sem fonte: `[conhecimento r1] <titulo>: <conteúdo>`; sem `refs`, a ref some (`[conhecimento] …`).
- lista: `rotulo` = termos unidos por ` + ` (e ` | tema: <tema>` quando houver); cabeçalho `[lista] "<rotulo>": <total> secoes; mostrando <de>–<ate>.` + ` Faltam <n>: peca pagina <p+1>.` quando sobra; itens `r5 | Almanaque das Ervas › Ervas › Arruda (p. 3): <recorte>`; total 0 → `[lista] "<rotulo>": nada encontrado na base.`
- seção: `[secao] Fonte: … \n<texto>` + `\n[secao continua: use lerSecao modo vizinhos]` quando `cortado`.

Ferramentas (em `montarFerramentas`, com `const refs = criarRefs()` por rodada):
- `buscarBase` — input `{ consultas: z.array(z.string().min(1).max(TETO_CONSULTA)).min(1).max(3) }`, chama `buscarVarias`; descrição: `'Procura na base de conhecimento (cards e documentos enviados) o que responde uma duvida. Aceita ate 3 consultas de uma vez: quando a pergunta junta assuntos diferentes, mande uma consulta para cada assunto na mesma chamada. Devolve trechos com a fonte e uma referencia (r1, r2…). Use para perguntas pontuais, de conceito e por tema.'`; passa `refs`. Entrada antiga `{ consulta: string }` (modelo que ainda mande o formato velho) é aceita e vira `[consulta]`.
- `listarNaBase` — input `{ termos: z.array(z.string().min(1).max(200)).min(1).max(3), tema?: string(1..300), pagina?: int ≥1 }`; descrição: `'Lista TODAS as secoes da base (cada verbete, capitulo ou topico com titulo proprio) que citam os termos. Cada item e uma secao inteira, mesmo que o termo apareca so numa parte dela; em texto sem titulos, cada item e um ponto do texto onde o termo aparece. Com varios termos, so entram secoes que citam TODOS. Use "tema" para o que nao e uma palavra exata: os itens vem ordenados pelo tema, com o trecho mais ligado a ele. Para grafias diferentes da mesma palavra, use OR dentro do termo: "palavra1 OR palavra2". Informa o total e quantos faltam; peca a proxima pagina se precisar. Para confirmar um item duvidoso, use lerSecao com a referencia dele.'`
- `lerSecao` — input `{ ref: string, modo: 'secao' | 'vizinhos' }`; ref desconhecida → `'[secao] Referencia desconhecida. Use uma referencia devolvida por buscarBase ou listarNaBase.'`; descrição: `'Le a secao inteira (ou os trechos vizinhos) de onde veio um trecho, pela referencia (r1, r2…). Use quando a resposta parece continuar alem do trecho, por exemplo num verbete longo.'`

Prompt: acrescentar às regras de [prompt-agente.ts](../../../src/lib/canais/prompt-agente.ts), perto da linha 105 (copiar):
- `'Quando a resposta vier de um documento da base, diga de onde tirou: o nome do documento e, se houver, a pagina ou a secao (ex.: "Segundo o <nome do documento>, p. 12, ..."). Nunca mostre as referencias r1, r2, nem nomes de arquivo ou links.'`
- `'Para pergunta que pede uma lista, use listarNaBase com as palavras exatas como termos e o resto da pergunta como tema. Se ela disser que faltam itens e voce nao pedir as outras paginas, avise que a lista pode nao estar completa. No WhatsApp, agrupe ou resuma listas longas em vez de despejar tudo.'`
- `'Se a resposta parecer continuar alem do trecho encontrado, use lerSecao antes de responder.'`
- `'Pergunta que junta assuntos ou documentos diferentes: faca as buscas de uma vez so (buscarBase aceita ate 3 consultas), junte as respostas e cite cada fonte usada.'`

- [ ] **Step 1: Testes**

```ts
it('achado de documento leva fonte, página e ref', () => {
  const refs = criarRefs()
  expect(montarBlocoConhecimento({ achados: [{ id: 'u1', titulo: 'Arruda', conteudo: 'Quente.', tipo: 'fato', fonte: { documento: 'Almanaque das Ervas', caminho: 'Ervas › Arruda', pagina: 12 } }] }, refs))
    .toBe('[conhecimento r1] Fonte: Almanaque das Ervas › Ervas › Arruda (p. 12) | Arruda: Quente.')
})
it('card manual sem refs fica como hoje', () => expect(montarBlocoConhecimento({ achados: [{ id: 'c', titulo: 'Prazo', conteudo: '3 dias', tipo: 'fato', fonte: null }] })).toBe('[conhecimento] Prazo: 3 dias'))
it('lista conta seções e avisa quantas faltam', () => {
  const itens = Array.from({ length: 25 }, (_, i) => ({ id: `u${i}`, titulo: `E${i}`, fonte: { documento: 'Almanaque das Ervas', caminho: `Ervas › E${i}`, pagina: null }, recorte: 'Oxum' }))
  const b = montarBlocoLista('Oxum', { total: 34, pagina: 1, itens }, criarRefs())
  expect(b.split('\n')[0]).toBe('[lista] "Oxum": 34 secoes; mostrando 1–25. Faltam 9: peca pagina 2.')
  expect(b).not.toContain('u0')
})
it('página cheia de lista cabe no teto do bloco', () => {
  const item = (i: number) => ({ id: `u${i}`, titulo: 'x'.repeat(40), fonte: { documento: 'Almanaque das Ervas', caminho: 'Ervas › ' + 'y'.repeat(60), pagina: 999 }, recorte: 'z'.repeat(300) })
  expect(montarBlocoLista('a + b | tema: c', { total: 99, pagina: 1, itens: Array.from({ length: POR_PAGINA_LISTA_COM_TEMA }, (_, i) => item(i)) }, criarRefs()).length).toBeLessThanOrEqual(TETO_BLOCO_CONHECIMENTO)
})
it('lista vazia diz que não achou', () => expect(montarBlocoLista('Zzz', { total: 0, pagina: 1, itens: [] }, criarRefs())).toBe('[lista] "Zzz": nada encontrado na base.'))
it('refs: mesmo id, mesma ref; ref desconhecida é null', () => { const r = criarRefs(); expect(r.ref('a')).toBe('r1'); expect(r.ref('b')).toBe('r2'); expect(r.ref('a')).toBe('r1'); expect(r.id('r2')).toBe('b'); expect(r.id('r9')).toBeNull() })
it('juntarConsultas intercala, não repete e corta em 16', () => {
  // extrair a junção de buscarVarias como função pura exportada: juntarConsultas(listas: AchadoDaBase[][]): AchadoDaBase[]
  const a = (id: string) => ({ id, titulo: id, conteudo: '', tipo: 'fato' as const, fonte: null })
  expect(juntarConsultas([[a('x'), a('y')], [a('y'), a('z')]]).map((r) => r.id)).toEqual(['x', 'y', 'z'])
  expect(juntarConsultas([Array.from({ length: 8 }, (_, i) => a(`p${i}`)), Array.from({ length: 8 }, (_, i) => a(`q${i}`)), [a('r0')]])).toHaveLength(16)
})
it('rótulo da lista com vários termos e tema', () => {
  expect(montarBlocoLista('fria + Oxum | tema: harmonizar o corpo', { total: 0, pagina: 1, itens: [] }, criarRefs())).toBe('[lista] "fria + Oxum | tema: harmonizar o corpo": nada encontrado na base.')
})
it('descrições das ferramentas e prompt não citam assunto de projeto', () => {
  const ferr = montarFerramentas({ workspaceId: 'w', conversaId: 'c', contatoId: null, assistenteId: null }) as Record<string, { description: string }>
  const textos = [montarPrompt(personaDeTeste()), ...Object.values(ferr).map((f) => f.description)].join('\n')
  expect(textos).not.toMatch(/orix|erva|oxum|almanaque|aruanda|gps da pena|indulto/i)
})
it('nenhum bloco deixa vazar uuid', () => { /* montar os três blocos com ids uuid e conferir que nenhum /[0-9a-f]{8}-[0-9a-f]{4}-/ aparece */ })
it('o prompt manda citar a fonte e avisar lista incompleta', () => {
  const p = montarPrompt(personaDeTeste())
  expect(p).toContain('diga de onde tirou'); expect(p).toContain('a lista pode nao estar completa')
})
```

- [ ] **Step 2:** FAIL. **Step 3:** Implementar; ajustar o mapeamento de `buscarNaBase` às colunas novas e o bloco automático de `runtime.ts` (sem refs). **Step 4:** PASS + `pnpm build`.
- [ ] **Step 5: Commit** — `git add src/server/agente src/lib/canais tests/agente && git commit -m "feat(agente): busca em documentos, lista por termo, leitura de seção e citação da fonte"`

---

### Task 10: Ações do servidor para documentos

**Files:**
- Create: `src/app/(app)/base-conhecimento/acoes-documentos.ts`
- Create: `src/server/base-documentos/config.ts`
- Create: `src/lib/base-documentos/regras-de-envio.ts` (decisões puras)
- Test: `tests/base-documentos/regras-de-envio.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  // config.ts
  export function limiteBytesArquivo(): number    // Number(process.env.BASE_ARQUIVO_MAX_MB) válido e > 0, senão 100; × 1024 × 1024
  // regras-de-envio.ts
  export function validarPedidoDeEnvio(p: { nomeArquivo: string; tamanho: number }, limiteBytes: number): { ok: true; ext: Extensao } | { ok: false; erro: string }
  export function nomeDeExibicaoInicial(nomeArquivo: string): string    // sem extensão, '_'/'-' viram espaço, cortado em 120
  export function versaoParaCancelar(versoes: Array<{ id: string; status: StatusVersao }>, ativaId: string | null): string | null
  // a versão pendente (enviando/na_fila/processando) que não é a ativa; null se não há
  // acoes-documentos.ts ('use server')
  export type DadosDoEnvio = { versaoId: string; documentoId: string; endpoint: string; token: string; chaveAnonima: string; bucket: string; caminho: string; contentType: string }
  export async function iniciarEnvio(p: { nomeArquivo: string; tamanho: number; documentoId?: string; retomarVersaoId?: string }): Promise<({ ok: true } & DadosDoEnvio) | { erro: string }>  // retomarVersaoId: ver Task 11
  export async function confirmarEnvio(versaoId: string): Promise<ResultadoSimples>
  export async function cancelarEnvio(versaoId: string): Promise<ResultadoSimples>
  export async function renomearDocumento(id: string, nome: string): Promise<ResultadoSimples>
  export async function alternarDocumento(id: string, ligado: boolean): Promise<ResultadoSimples>
  export async function reprocessarDocumento(id: string): Promise<ResultadoSimples>
  export async function excluirDocumento(id: string): Promise<ResultadoSimples>
  export async function trocarAssistentesDoDocumento(id: string, assistentes: string[]): Promise<ResultadoSimples>
  export async function listarDocumentos(): Promise<DocumentoNaTela[] | { erro: string }>
  export async function trechosDoDocumento(id: string, pagina: number): Promise<{ total: number; itens: Array<{ caminho: string; pagina: number | null; contexto: string | null; texto: string }> } | { erro: string }>
  export type DocumentoNaTela = { id: string; nome: string; nomeArquivo: string; extensao: Extensao; tamanho: number; ligado: boolean; trechos: number; atualizadoEm: string; assistentes: string[]; ativa: ResumoVersao | null; pendente: ResumoVersao | null }
  export type ResumoVersao = { id: string; status: StatusVersao; etapa: Etapa | null; motivo: string | null; trechosTotal: number; feitos: number; custoEstimadoUsd: number | null; criadoEm: string }
  ```

Regras:
- `iniciarEnvio`: valida (mensagens: `'Esse tipo de arquivo não é aceito. Envie pdf, docx, md, txt, json ou csv.'`, `'O arquivo passa do limite de <N> MB.'`, `'O arquivo está vazio.'`). Documento-alvo: `documentoId` informado, ou documento do ws com o mesmo `nome_arquivo`; senão cria um com `nomeDeExibicaoInicial`. Se o documento-alvo já tem versão pendente (`enviando`/`na_fila`/`processando`), apaga essa versão e o objeto dela antes (Review Focus 2). Cria a versão (`origem 'envio'`, `status 'enviando'`), caminho por `caminhoDoObjeto`, `admin().storage.from(BUCKET_ARQUIVOS).createSignedUploadUrl(caminho)` → token. `endpoint = urlSupabase() + '/storage/v1/upload/resumable/sign'`, `chaveAnonima = chaveParaONavegador(process.env.SUPABASE_ANON_KEY ?? '')` (cabeçalhos conforme o spike).
- `confirmarEnvio`: confere que o objeto existe e mede o tamanho (`storage.from(...).list(pasta, { search })`); maior que o limite → apaga objeto e versão, erro com a mesma frase do limite; ok → `status 'na_fila'`.
- `reprocessarDocumento`: copia o objeto da versão ativa (`storage.copy`) para um caminho novo e cria versão `origem 'reprocesso'`, `status 'na_fila'`, cancelando pendente como acima. Sem versão ativa → reprocessa a última versão em erro do mesmo jeito.
- `excluirDocumento`: lê os caminhos de todas as versões, apaga o documento (versões e trechos saem pelo cascade), depois remove os objetos (falha só no log).
- `trocarAssistentesDoDocumento`: chama `trocar_recorte_do_documento`; códigos 0 e 2 com as mesmas mensagens de `acoes.ts`.
- `feitos` em `ResumoVersao`: na etapa `contextualizando`, trechos com `contexto is not null`; em `vetorizando`, com `embed_versao is not null`.
- Toda ação chama `revalidarTela()` como as de `acoes.ts`.

- [ ] **Step 1: Testes das regras puras**

```ts
it('aceita os seis tipos', () => { for (const n of ['a.pdf','a.docx','a.md','a.txt','a.json','a.csv']) expect(validarPedidoDeEnvio({ nomeArquivo: n, tamanho: 10 }, 100)).toMatchObject({ ok: true }) })
it('recusa .doc com a frase da tela', () => expect(validarPedidoDeEnvio({ nomeArquivo: 'a.doc', tamanho: 10 }, 100)).toEqual({ ok: false, erro: 'Esse tipo de arquivo não é aceito. Envie pdf, docx, md, txt, json ou csv.' }))
it('recusa acima do limite dizendo o limite em MB', () => expect(validarPedidoDeEnvio({ nomeArquivo: 'a.pdf', tamanho: 101 * 1024 * 1024 }, 100 * 1024 * 1024)).toEqual({ ok: false, erro: 'O arquivo passa do limite de 100 MB.' }))
it('recusa vazio', () => expect(validarPedidoDeEnvio({ nomeArquivo: 'a.md', tamanho: 0 }, 100)).toMatchObject({ ok: false, erro: 'O arquivo está vazio.' }))
it('nome de exibição inicial', () => expect(nomeDeExibicaoInicial('almanaque_das-ervas.md')).toBe('almanaque das ervas'))
it('versaoParaCancelar acha a pendente e nunca a ativa (Review Focus 2)', () => {
  expect(versaoParaCancelar([{ id: 'a', status: 'pronto' }, { id: 'p', status: 'processando' }], 'a')).toBe('p')
  expect(versaoParaCancelar([{ id: 'a', status: 'pronto' }, { id: 'e', status: 'erro' }], 'a')).toBeNull()
  expect(versaoParaCancelar([{ id: 'n', status: 'enviando' }], null)).toBe('n')
})
it('limiteBytesArquivo lê o env e cai em 100', () => { vi.stubEnv('BASE_ARQUIVO_MAX_MB', '250'); expect(limiteBytesArquivo()).toBe(250 * 1024 * 1024); vi.stubEnv('BASE_ARQUIVO_MAX_MB', 'x'); expect(limiteBytesArquivo()).toBe(100 * 1024 * 1024) })
```

- [ ] **Step 2:** FAIL. **Step 3:** Implementar regras, config e ações. **Step 4:** PASS + `pnpm build`.
- [ ] **Step 5: Commit** — `git add "src/app/(app)/base-conhecimento/acoes-documentos.ts" src/server/base-documentos/config.ts src/lib/base-documentos/regras-de-envio.ts tests/base-documentos/regras-de-envio.spec.ts && git commit -m "feat(base): ações de envio e gestão de documentos"`

---

### Task 11: Tela de documentos com envio retomável

**Files:**
- Create: `src/app/(app)/base-conhecimento/Documentos.tsx` (cliente), `src/app/(app)/base-conhecimento/envio-tus.ts` (cliente), `src/app/(app)/base-conhecimento/documentos.module.css`
- Modify: `src/app/(app)/base-conhecimento/page.tsx` (carregar `listarDocumentos` e o limite; renderizar `<Documentos>` acima dos cards; ajustar o `SUBTITULO` para mencionar documentos)
- Test: `tests/base-documentos/envio-tus.spec.ts`

**Interfaces:**
- Consumes: ações da Task 10.
- Produces:
  ```ts
  export function chaveDeRetomada(a: { name: string; size: number; lastModified: number }, documentoId: string | null): string  // `base:${documentoId ?? 'novo'}:${name}:${size}:${lastModified}`
  export function enviarArquivo(arquivo: File, dados: DadosDoEnvio, aoProgresso: (enviados: number, total: number) => void): { promessa: Promise<void>; cancelar: () => void }
  ```
- Dependência: `pnpm add tus-js-client`.

`enviarArquivo`: `new tus.Upload(arquivo, { endpoint, headers: { 'x-signature': token, apikey: chaveAnonima }, chunkSize: 6 * 1024 * 1024, retryDelays: [0, 3000, 5000, 10000, 20000], uploadDataDuringCreation: true, removeFingerprintOnSuccess: true, fingerprint: async (f) => chaveDeRetomada(f, documentoId), metadata: { bucketName, objectName: caminho, contentType, cacheControl: '3600' } })`; antes de `start()`, `findPreviousUploads()` e `resumeFromPreviousUpload(anterior[0])` se houver. Para a retomada funcionar depois de recarregar a página, `iniciarEnvio` precisa devolver **o mesmo** `versaoId`/`caminho` para um envio `enviando` do mesmo documento e mesmo arquivo: guardar `{ versaoId }` em `localStorage` sob `chaveDeRetomada` (com try/catch) e mandar como `retomarVersaoId` em `iniciarEnvio` — se essa versão ainda está `enviando`, é do mesmo espaço e o tamanho bate, reusar e emitir token novo para o mesmo caminho; senão seguir o fluxo normal (a implementação desse ramo fica nesta task).

Tela (a aparência segue `base.module.css` e `config.module.css`):
- Zona de soltar/escolher (vários arquivos; um envio por vez em fila), barra de progresso com MB enviados/total, botão cancelar (chama `cancelarEnvio`).
- Lista: nome (editável inline → `renomearDocumento`), tipo, tamanho, status da ativa e da pendente em português (`Enviando`, `Na fila`, `Lendo o arquivo`, `Gerando contexto (feitos/total)`, `Gerando busca (feitos/total)`, `Pronto`, `Erro: <motivo>`), custo estimado (`≈ US$ 0,54`) enquanto processa, quantidade de trechos, data.
- Ações: ligar/desligar, substituir (abre o seletor e passa `documentoId`), reprocessar, excluir (confirmação na própria tela, sem `window.confirm`), assistentes (mesmo seletor usado pelos cards), ver trechos (lista paginada de `trechosDoDocumento` com caminho, página, contexto e texto).
- Enquanto existir versão não final, recarrega `listarDocumentos()` a cada 5 s.
- Sem chave da OpenAI (`temChave` já existe na página): aviso de que documentos não serão processados até a chave ser cadastrada.
- Não-dono (`!ehOwner`): só leitura, como os cards.

- [ ] **Step 1: Teste da chave de retomada**

```ts
it('mesmo arquivo e mesmo documento, mesma chave', () => {
  const a = { name: 'Almanaque.md', size: 10, lastModified: 5 }
  expect(chaveDeRetomada(a, 'd1')).toBe('base:d1:Almanaque.md:10:5'); expect(chaveDeRetomada(a, null)).toBe('base:novo:Almanaque.md:10:5')
})
it('arquivo editado (outra data) não retoma o envio antigo', () => expect(chaveDeRetomada({ name: 'a', size: 1, lastModified: 1 }, null)).not.toBe(chaveDeRetomada({ name: 'a', size: 1, lastModified: 2 }, null)))
```

- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS + `pnpm build` + `tests/fronteira-rsc.spec.ts` verde (nada de servidor no bundle de cliente).
- [ ] **Step 5: Ver a tela** com a skill `browser-automation` (ou `run`) contra o servidor local: enviar um `.md` pequeno, ver o status andar até `Pronto` (precisa do tick local: `node heartbeat-tick.mjs` ou chamar `/api/interno/tick` com `TICK_SECRET`), abrir "ver trechos", excluir.
- [ ] **Step 6: Commit** — `git add "src/app/(app)/base-conhecimento" tests/base-documentos/envio-tus.spec.ts package.json pnpm-lock.yaml && git commit -m "feat(base): tela de documentos com envio retomável"`

---

### Task 12: Prova com os almanaques e a pergunta fora do material

Sem código novo, salvo ajustes que a prova exigir (cada ajuste com teste na task dona e commit próprio).

- [ ] **Step 1:** Pedir ao usuário os dois almanaques (Markdown) e a instalação onde testar (Trilhas de Aruanda). Lembrar: deploy é pelo `main` → só com o "pode" dele; alternativa é rodar local apontando para o Supabase do Aruanda.
- [ ] **Step 2:** Enviar os dois, esperar `Pronto`, conferir em "ver trechos" que cada verbete (erva ou orixá) foi recortado em poucos trechos com o caminho certo, e que "Quais ervas são de Oxum?" conta ervas, não trechos.
- [ ] **Step 3:** No simulador `/agentes/testar`, as seis perguntas da tabela da spec + "Qual o preço da consulta?" (resposta: não sabe). Esperado: respostas corretas citando o almanaque; "Quais ervas são de Oxum?" traz todas ou avisa que pode estar incompleta; nenhuma invenção.
- [ ] **Step 4:** Substituir um almanaque por uma versão editada e, durante o processamento, perguntar algo que só a versão antiga responde (responde pela antiga) e, depois de `Pronto`, algo só da nova (responde pela nova).
- [ ] **Step 5:** Registrar o resultado (perguntas, respostas, ajustes) em `docs/superpowers/ESTADO-base-conhecimento-arquivos.md` e commitar.

---

### Task 13: Documentação de deploy e verificação final

**Files:**
- Modify: `docs/DEPLOY.md`, `.env.example`

- [ ] **Step 1:** Em `docs/DEPLOY.md`, seção nova "Base de conhecimento com arquivos": plano gratuito do Supabase limita a 50 MB por arquivo; para 100 MB, plano Pro e Storage → Settings → limite global ≥ 100 MB; `BASE_ARQUIVO_MAX_MB` (opcional, padrão 100); precisa da chave da OpenAI; custo típico (≈ US$ 0,27 por mil trechos, um livro de 300 páginas ≈ 500 trechos); o processamento roda em segundo plano e usa até ~768 MB de memória a mais durante a leitura de um arquivo grande — conferir o limite do container no EasyPanel.
- [ ] **Step 2:** Em `.env.example`, `BASE_ARQUIVO_MAX_MB=` comentada com uma linha de explicação.
- [ ] **Step 3:** `pnpm run test` e `pnpm build` → verdes. Migration aplicada duas vezes seguidas num banco de teste (`node migrate.mjs` duas vezes, ou aplicar a 0076 à mão duas vezes) → sem erro.
- [ ] **Step 4: Commit** — `git add docs/DEPLOY.md .env.example && git commit -m "docs: deploy da base de conhecimento com arquivos"`
- [ ] **Step 5:** Usar `superpowers:finishing-a-development-branch`. Não fazer push no `main` sem pedido explícito.
