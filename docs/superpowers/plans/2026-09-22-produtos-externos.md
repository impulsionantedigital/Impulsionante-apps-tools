# Produtos externos — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Modo de execução — decidido, não opcional

**Por subagentes, com revisão do supervisor entre uma task e a seguinte.** Mesmo ciclo do plano da
vitrine: um subagente novo, com contexto limpo, por task; relatório com a saída dos comandos;
revisão do supervisor antes de despachar a próxima.

**Onde parar e chamar o humano**, em vez de decidir sozinho:

- Qualquer mudança em **RLS ou grants** além do que a Task 1 descreve.
- Qualquer coluna nova em tabela do produto — este plano **não** altera nenhuma coluna existente.
- Teste existente falhando fora dos casos que este plano manda revisar de propósito.

**Ao fim das tasks:** atualizar `docs/superpowers/ESTADO-vitrine-e-produtos-externos.md` e só então
a fusão no `main` — que é o que publica em produção.

**Goal:** O CRM passa a aceitar produtos que ele não entrega (curso de outra área de membros,
produto físico), para vender um curso com calculadora de brinde numa oferta só e concentrar todo o
histórico financeiro num lugar.

**Architecture:** O produto externo é `{ nome, ativo }` numa tabela nova (`produtos_externos`), e se
identifica por UUID nas colunas `text` que já existem (`ofertas_produtos.produto_id`,
`vendas.produtos`, `vendas_periodos.produto_id`). O núcleo do trabalho é **separar os dois
significados que `ehProdutoConhecido` acumula**: o nome passa a `ehProdutoInterno`, e o compilador
aponta cada um dos ~12 usos para reclassificação. Na maioria deles, o filtro simplesmente sai.

**Tech Stack:** Next.js 16 (App Router, server components), React 19, TypeScript, Vitest, Supabase
(Postgres + RLS), CSS Modules, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-22-produtos-externos-design.md`

**Branch:** `produtos-externos` (já existe, só com a spec). Este trabalho vai no `main`, atrás da
vitrine que já está fundida.

## Global Constraints

- **`pnpm`, nunca `npm`.** Misturar os dois gera um lockfile que o build não entende (AGENTS.md, regra 2).
- **`pnpm build` e `pnpm run test` verdes antes de qualquer commit de código.**
- **CSS só com token** — nada de hexadecimal, nada de `opacity` para texto secundário.
- **Código e comentários em português**, como o resto do repositório.
- 🔴 **A migration `0072` é aditiva, idempotente e não toca coluna de produto nenhuma.** `create
  table if not exists`, índice com `if not exists`, `enable row level security`, `grant` aos três
  papéis, policy dentro de bloco `do $$`, e gatilho também dentro de bloco `do $$`. A guarda
  `tests/migracoes/idempotencia.spec.ts` cobra cada uma dessas coisas.
- 🔴 **Não há FK de `ofertas_produtos.produto_id` / `vendas.produtos` / `vendas_periodos.produto_id`
  para `produtos_externos`,** porque a mesma coluna guarda id de código e id de banco. Acrescentar
  a FK quebra toda venda de produto interno. A migration leva este comentário.
- 🔴 **Externo é sempre venda, nunca degustação.** O CRM não entrega o acesso, então não pode
  concedê-lo nem revogá-lo.

---

### Task 1: A tabela `produtos_externos` (migration 0072)

**Files:**
- Create: `supabase/migrations/0072_produtos_externos.sql`

**Interfaces:**
- Produces: `public.produtos_externos (id uuid pk, workspace_id uuid, nome text, ativo boolean,
  criado_em, atualizado_em)`, índice único em `(workspace_id, lower(nome))`, RLS ligado, policy de
  `service_role`.

- [ ] **Step 1: Escrever a migration**

```sql
-- 0072_produtos_externos.sql — produtos que este CRM NÃO entrega.
--
-- Um curso que mora na área de membros da Hotmart, um produto físico: coisas vendidas que não
-- cabem no catálogo de código (`src/lib/produtos/catalogo.ts`), mas que precisam existir numa
-- oferta (para vender o curso e dar calculadora de brinde) e no histórico financeiro.
--
-- O produto externo é só `{ nome, ativo }`. Preço e código continuam sendo fato da OFERTA e da
-- VENDA — a Hotmart já manda o valor, e duplicá-lo aqui criaria duas verdades.
--
-- 🔴 A identidade é um UUID gravado nas colunas de TEXTO que já existem
-- (`ofertas_produtos.produto_id`, `vendas.produtos`, `vendas_periodos.produto_id`). Produto interno
-- se identifica por `indulto-comutacao-2025`; externo, por um UUID. Nunca colidem.
--
-- 🔴 NÃO acrescente FK dessas colunas para esta tabela. A mesma coluna guarda id de código E id de
-- banco, e nenhuma FK aponta para os dois — acrescentá-la quebra toda venda de produto interno. A
-- integridade vem da origem do dado: esses ids nascem das nossas tabelas, nunca do usuário.
create table if not exists public.produtos_externos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  nome          text not null,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Dois "Curso de Execução Penal" no mesmo espaço de trabalho não se distinguem na hora de montar a
-- oferta. A unicidade é por nome sem distinção de maiúsculas.
create unique index if not exists produtos_externos_ws_nome_idx
  on public.produtos_externos (workspace_id, lower(nome));

create index if not exists produtos_externos_workspace_idx
  on public.produtos_externos (workspace_id);

alter table public.produtos_externos enable row level security;
grant all on table public.produtos_externos to anon, authenticated, service_role;

-- Dado comercial: passa só por server action com service-role, como `ofertas` e `ofertas_produtos`.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'produtos_externos' and policyname = 'produtos_externos_service_role'
  ) then
    create policy produtos_externos_service_role on public.produtos_externos
      for all to service_role using (true) with check (true);
  end if;
end $$;
```

> **Antes de escrever o gatilho**, confira na `0064_vendas_e_ofertas.sql` se já existe uma função de
> `atualizado_em` reaproveitável. Se existir, **use-a** com `create trigger ... execute function
> <a existente>` dentro de um bloco `do $$` — a migration não deve duplicar o que já está lá. Se não
> existir, crie a função e o gatilho, ambos idempotentes (`create or replace function` para a função;
> bloco `do $$` que consulta `pg_trigger` para o gatilho).

- [ ] **Step 2: Rodar a guarda de migrations**

Run: `pnpm vitest run tests/migracoes/idempotencia.spec.ts`
Expected: PASS. A `0072` entra sozinha na varredura (número ≥ 63). Se falhar, o motivo é uma das
regras acima — leia a mensagem do teste, que diz qual.

- [ ] **Step 3: Suíte inteira**

Run: `pnpm run test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0072_produtos_externos.sql
git commit -m "feat(produtos-externos): tabela de produtos que o CRM nao entrega

Aditiva e idempotente. Produto externo e { nome, ativo }, identificado por
UUID nas colunas de texto que ja existem. Sem FK para o catalogo: a mesma
coluna guarda id de codigo e id de banco, e a FK quebraria venda interna."
```

---

### Task 2: `ehProdutoInterno` — separar os dois significados

**Files:**
- Modify: `src/lib/produtos/catalogo.ts`
- Modify: todos os arquivos que importam `ehProdutoConhecido` ou `produtoDoMotor` (o compilador aponta)
- Test: `tests/vendas/catalogo.spec.ts`

**Interfaces:**
- Produces: `export function ehProdutoInterno(id: unknown): id is ProdutoId` — o novo nome.
- Remove: `ehProdutoConhecido` e `produtoDoMotor` (o segundo só existia para duas linhas e some com o filtro).

- [ ] **Step 1: Renomear na origem**

Em `src/lib/produtos/catalogo.ts`, troque `ehProdutoConhecido` por `ehProdutoInterno` e apague
`produtoDoMotor`:

```ts
/**
 * O id é de um produto que ESTE CRM entrega?
 *
 * 🔴 O nome diz o que a função responde, e isso é o ponto. Antes ela se chamava `ehProdutoConhecido`
 * e acumulava dois significados: "este id é válido?" e "este produto é entregue por este CRM?". Com
 * produto externo (spec de 2026-09-22) as duas respostas se separam — id válido, entrega nenhuma —,
 * e é esta função que responde só a segunda.
 */
export function ehProdutoInterno(id: unknown): id is ProdutoId {
  return typeof id === 'string' && PRODUTOS.some((p) => p.id === id)
}
```

- [ ] **Step 2: Deixar o compilador apontar os usos**

Run: `pnpm exec tsc --noEmit 2>&1 | grep -i "ehProduto\|produtoDoMotor" | head -40`

Isso lista cada arquivo a reclassificar. **A lista completa está na tabela da Task 3** — leia-a
antes de reclassificar ponto a ponto, porque cada ponto tem um veredito diferente (filtro sai, vira
`ehProdutoInterno`, ou muda de forma). Não faça uma substituição cega.

- [ ] **Step 3: Ajustar o teste do catálogo**

Em `tests/vendas/catalogo.spec.ts`, troque o import e o nome usado:

```ts
import { PRODUTOS, ehProdutoInterno, rotuloDoProduto } from '@/lib/produtos/catalogo'
```

E o caso, com o comentário que fixa a separação:

```ts
  it('reconhece só ids do catálogo — e um UUID de produto externo é FALSE', () => {
    expect(ehProdutoInterno('indulto-comutacao-2025')).toBe(true)
    expect(ehProdutoInterno('indulto-comutacao-2024')).toBe(true)
    expect(ehProdutoInterno('indulto-comutacao-1988')).toBe(false)
    expect(ehProdutoInterno(42)).toBe(false)
    // 🔴 O teste que fixa a separação dos dois significados: id de produto EXTERNO é válido, e
    // mesmo assim `ehProdutoInterno` tem de dizer false — o CRM não entrega esse produto.
    expect(ehProdutoInterno('8c4d2f1e-4b2a-4f6e-9d3c-1a2b3c4d5e6f')).toBe(false)
  })
```

Remova o bloco que testava `produtoDoMotor`, se existir.

- [ ] **Step 4: Suíte**

Run: `pnpm run test`
Expected: PASS (o `tsc` ainda vai acusar os usos não reclassificados — eles são a Task 3).

- [ ] **Step 5: Não commitar ainda**

Esta task e a Task 3 formam uma unidade: o `tsc` não fecha sem as duas. **Commit só no fim da
Task 3.**

---

### Task 3: Reclassificação ponto a ponto em `processar.ts`

**Files:**
- Modify: `src/server/vendas/processar.ts`
- Modify: `src/app/(app)/config/acoes-comercial.ts`

**Interfaces:**
- Consumes: `ehProdutoInterno` (Task 2).
- Produces: `processar.ts` e `acoes-comercial.ts` sem nenhuma referência ao nome antigo.

A tabela é a da spec (§"A reclassificação, ponto a ponto"). Cada linha tem **um veredito**, e
nenhum é "trocar o nome": em três pontos o filtro **sai**, em três vira `ehProdutoInterno`, e nos
e-mails muda de forma (Task 6).

- [ ] **Step 1: Em `processar.ts`, `aprovar`**

Substitua as duas linhas (hoje `:157`–`:158`):

```ts
  // 🔴 SEM filtro nos produtos de VENDA: o id veio de `ofertas_produtos`, tabela nossa, e produto
  // externo também é venda. Filtrar aqui era o que impedia a oferta 100% externa de existir.
  const produtos = linhas.filter((p) => p.tipo === 'venda').map((p) => p.produto_id)
  // 🔴 COM filtro na DEGUSTAÇÃO: só se concede o que este CRM entrega. O externo não tem o que
  // liberar, e um brinde dele viraria um período que ninguém consulta.
  const produtosDegustacao = linhas.filter((p) => p.tipo === 'degustacao').map((p) => p.produto_id).filter(ehProdutoInterno)
```

E a guarda de entrada, cujo texto `'conhecido'` deixa de significar "interno":

```ts
  if (produtos.length === 0 || prazo === null || typeof prazo === 'number') {
    return { resultado: 'oferta_invalida', detalhe: 'sem produto de venda, ou duração inválida', workspaceId: ws }
  }
```

- [ ] **Step 2: Em `garantirPeriodos`, os períodos que faltam**

```ts
  // 🔴 SEM filtro: produto externo TAMBÉM tem período — é ele que responde "esta venda está
  // vigente?" e é dele que sai o vencimento na lista de vendas.
  const produtosEsperados = venda.produtos
```

E a degustação logo abaixo (hoje `:369`):

```ts
  const degustacao = ((configurados ?? []) as Array<{ produto_id: string; tipo: string }>)
    .filter((p) => p.tipo === 'degustacao')
    .map((p) => p.produto_id)
    .filter(ehProdutoInterno)
```

- [ ] **Step 3: Em `bonificarVendasDaOferta`, o bônus retroativo**

```ts
  // 🔴 SEM filtro: o bônus vale para produto externo igual — ele é "o que a oferta ganhou".
  const produtosDaOferta = (oferta?.produtos ?? []) as string[]
```

```ts
      const produtosDaVenda = venda.produtos
```

E a degustação do bônus (hoje `:552`):

```ts
        .filter(ehProdutoInterno)
```

- [ ] **Step 4: Em `acoes-comercial.ts`, a leitura e o Zod**

Em `lerComercial`, a montagem do rótulo da venda (hoje `:231`–`:238`): **esta é a Task 4**, que
introduz `rotulosDosProdutos`. Por ora, para o `tsc` fechar, troque só o nome nesta task e deixe a
forma como está:

```ts
        const conhecidos = v.produtos.filter(ehProdutoInterno)
```

E no `OfertaSchema`, troque os dois `ehProdutoConhecido` por `ehProdutoInterno` — a validação
completa (aceitar UUID de produto externo, recusar externo em degustação) é a **Task 8**. Aqui só o
nome, para compilar.

- [ ] **Step 5: `tsc` limpo e suíte**

Run: `pnpm exec tsc --noEmit && pnpm run test`
Expected: tipos limpos, suíte PASS. Se sobrar algum `ehProdutoConhecido`, o `tsc` acusa — reclassifique.

- [ ] **Step 6: Commit**

```bash
git add src/lib/produtos/catalogo.ts tests/vendas/catalogo.spec.ts src/server/vendas/processar.ts "src/app/(app)/config/acoes-comercial.ts"
git commit -m "refactor(produtos): ehProdutoConhecido vira ehProdutoInterno

A funcao acumulava dois significados: 'este id e valido?' e 'este produto e
entregue aqui?'. Com produto externo as duas se separam, e o nome passa a
dizer so a segunda.

Na reclassificacao, o filtro SAI nos pontos onde o id vem de tabela nossa
(ofertas_produtos, vendas.produtos) — era ele que impedia o produto externo
de existir. Fica so na degustacao, que so concede o que este CRM entrega."
```

---

### Task 4: `rotulosDosProdutos` — exibir o nome do produto externo

**Files:**
- Create: `src/lib/produtos/rotulos.ts` (parte pura)
- Create: `src/server/produtos/rotulos.ts` (parte que consulta o banco)
- Modify: `src/app/(app)/config/acoes-comercial.ts`
- Test: `tests/vendas/rotulos-produtos.spec.ts`

**Interfaces:**
- Produces: `export async function rotulosDosProdutos(ws: string, ids: readonly string[]): Promise<Map<string, string>>`
- Produces (pura, testável sem banco): `export function rotuloDeId(id: string, nomesExternos: ReadonlyMap<string, string>): string`

- [ ] **Step 1: A parte pura, com teste**

Crie `src/lib/produtos/rotulos.ts`:

```ts
import { ehProdutoInterno, rotuloDoProduto } from './catalogo'

/**
 * O nome de um produto, seja ele interno (catálogo de código) ou externo (tabela do workspace).
 *
 * 🔴 O último recurso é o PRÓPRIO ID, e não uma string vazia: um produto externo excluído de um
 * histórico antigo não pode quebrar a lista de vendas — ela mostra o id cru, que ainda identifica a
 * venda, e a venda continua legível.
 */
export function rotuloDeId(id: string, nomesExternos: ReadonlyMap<string, string>): string {
  if (ehProdutoInterno(id)) return rotuloDoProduto(id)
  return nomesExternos.get(id) ?? id
}
```

E `tests/vendas/rotulos-produtos.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { rotuloDeId } from '@/lib/produtos/rotulos'

describe('rotuloDeId', () => {
  const externos = new Map([['8c4d2f1e-4b2a-4f6e-9d3c-1a2b3c4d5e6f', 'Curso de Execução Penal']])

  it('id do catálogo: o rótulo do catálogo', () => {
    expect(rotuloDeId('indulto-comutacao-2025', externos)).toContain('12.970/2025')
  })

  it('UUID de produto externo: o nome da tabela', () => {
    expect(rotuloDeId('8c4d2f1e-4b2a-4f6e-9d3c-1a2b3c4d5e6f', externos)).toBe('Curso de Execução Penal')
  })

  it('id órfão (externo excluído): o próprio id, sem quebrar a lista', () => {
    expect(rotuloDeId('9f8e7d6c-0000-0000-0000-000000000000', externos)).toBe('9f8e7d6c-0000-0000-0000-000000000000')
  })

  it('id desconhecido que não é interno nem externo: o próprio id', () => {
    expect(rotuloDeId('produto-fantasma', new Map())).toBe('produto-fantasma')
  })
})
```

- [ ] **Step 2: Rodar e confirmar que passa**

Run: `pnpm vitest run tests/vendas/rotulos-produtos.spec.ts`
Expected: PASS.

- [ ] **Step 3: A parte que consulta o banco**

Crie `src/server/produtos/rotulos.ts`:

```ts
import 'server-only'
import { admin } from '@/server/supabase'
import { ehProdutoInterno } from '@/lib/produtos/catalogo'
import { rotuloDeId } from '@/lib/produtos/rotulos'

/**
 * Traduz uma lista de ids de produto em nomes, numa consulta só.
 *
 * Só vai ao banco pelos ids que NÃO são internos — os do catálogo já têm o rótulo em código. Uma
 * lista 100% interna não faz consulta nenhuma.
 */
export async function rotulosDosProdutos(ws: string, ids: readonly string[]): Promise<Map<string, string>> {
  const externos = [...new Set(ids)].filter((id) => !ehProdutoInterno(id))
  if (externos.length === 0) return new Map()
  const { data, error } = await admin()
    .from('produtos_externos')
    .select('id, nome')
    .eq('workspace_id', ws)
    .in('id', externos)
  if (error) throw error
  return new Map(((data ?? []) as Array<{ id: string; nome: string }>).map((p) => [p.id, p.nome]))
}

/** A lista já traduzida, na ordem de entrada — é o que as telas exibem. */
export async function nomesDosProdutos(ws: string, ids: readonly string[]): Promise<string[]> {
  const mapa = await rotulosDosProdutos(ws, ids)
  return ids.map((id) => rotuloDeId(id, mapa))
}
```

- [ ] **Step 4: Usar na lista de vendas do Comercial**

Em `src/app/(app)/config/acoes-comercial.ts`, troque a montagem do rótulo (hoje `:231`–`:238`).
Antes do `return`, calcule os nomes de todas as vendas de uma vez:

```ts
    // 🔴 Uma consulta para todas as vendas, não uma por venda: o rótulo do produto externo vive no
    // banco, e a lista mostra 50 vendas.
    const todosOsIds = [...new Set(listaVendas.flatMap((v) => v.produtos ?? []))]
    const nomesProdutos = await rotulosDosProdutos(ws, todosOsIds)
```

E, dentro do `.map` das vendas:

```ts
          produtos:
            v.produtos.length > 0
              ? v.produtos.map((p) => rotuloDeId(p, nomesProdutos)).join(', ')
              : '—',
```

Importe `rotuloDeId` de `@/lib/produtos/rotulos` e `rotulosDosProdutos` de
`@/server/produtos/rotulos`. Troque o que resta de `ehProdutoInterno`/`rotuloDoProduto` nesta
função, se ficar sem uso.

- [ ] **Step 5: Suíte e build**

Run: `pnpm run test && pnpm build`
Expected: PASS nos dois.

- [ ] **Step 6: Commit**

```bash
git add src/lib/produtos/rotulos.ts src/server/produtos/rotulos.ts tests/vendas/rotulos-produtos.spec.ts "src/app/(app)/config/acoes-comercial.ts"
git commit -m "feat(produtos-externos): exibir o nome do produto externo no historico

rotulosDosProdutos traduz id em nome — rotulo do catalogo quando interno,
nome da tabela quando externo, e o proprio id como ultimo recurso, para um
produto externo excluido nao quebrar a lista de vendas.

Uma consulta para todas as vendas, nao uma por venda."
```

---

### Task 5: O modelo de e-mail `degustacao_liberada` (migration + tipos + padrão)

**Files:**
- Create: `supabase/migrations/0073_email_degustacao_liberada.sql`
- Modify: `src/lib/email/tipos.ts`
- Modify: `src/lib/email/padroes.ts`
- Modify: `src/app/(app)/config/ModelosEmailCard.tsx` (só o texto "quatro e-mails")
- Test: `tests/email/tipos.spec.ts` (se existir; senão, o teste do catálogo de modelos)

**Interfaces:**
- Produces: `TipoModelo` ganha `'degustacao_liberada'`, com campos
  `['MEMBER_NAME', 'PRODUCT_NAME', 'OFFER_NAME', 'EXPIRES_AT', 'TOOL_URL', 'LOGIN_URL']`.

- [ ] **Step 1: A migration que alarga o CHECK de `emails_fila.tipo`**

Primeiro confira como a `0063` fixa o CHECK:

Run: `grep -n "tipo" supabase/migrations/0063_email_transacional.sql | head -20`

A migration nova só pode **largar** o domínio, nunca trocá-lo por outro mais estreito (o produto
grava outros tipos). Use o bloco que pergunta ao catálogo, no padrão das migrations do produto:

```sql
-- 0073_email_degustacao_liberada.sql — o modelo `degustacao_liberada` entra na fila.
--
-- O CHECK de `emails_fila.tipo` foi fixado na 0063 com os tipos daquele dia. Um tipo novo exige
-- alargar a restrição — e o alargamento é ADITIVO: só acrescenta `degustacao_liberada` ao domínio,
-- sem tirar nenhum tipo existente, que ainda está em linhas antigas da fila.
do $$
declare
  c record;
begin
  -- Descobre o CHECK da coluna pelo NOME canônico que o Postgres usa, e só age se ele existir e
  -- ainda não citar o tipo novo — assim a segunda passada é inofensiva.
  select conname, pg_get_constraintdef(oid) as definicao
  into c
  from pg_constraint
  where conrelid = 'public.emails_fila'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%tipo%';

  if c.conname is not null and c.definicao not ilike '%degustacao_liberada%' then
    execute format('alter table public.emails_fila drop constraint %I', c.conname);
    alter table public.emails_fila
      add constraint emails_fila_tipo_check
      check (tipo in ('boas_vindas', 'recuperacao_senha', 'entrega_produto', 'pagamento_recebido', 'degustacao_liberada'));
  end if;
end $$;
```

> 🔴 **Confira o domínio real da `0063`** antes de escrever o `check (...)` — a lista acima precisa
> conter **todos** os tipos que a 0063 já aceitava, senão a migration estreita o domínio e quebra
> linhas existentes. Copie a lista de lá, e acrescente só `degustacao_liberada`.

- [ ] **Step 2: Rodar a guarda de migrations**

Run: `pnpm vitest run tests/migracoes/idempotencia.spec.ts`
Expected: PASS.

- [ ] **Step 3: `tipos.ts`**

```ts
export type TipoModelo =
  | 'boas_vindas'
  | 'recuperacao_senha'
  | 'entrega_produto'
  | 'pagamento_recebido'
  | 'degustacao_liberada'

export const TIPOS = [
  'boas_vindas',
  'recuperacao_senha',
  'entrega_produto',
  'pagamento_recebido',
  'degustacao_liberada',
] as const satisfies readonly TipoModelo[]

export const CAMPOS: Record<TipoModelo, readonly string[]> = {
  boas_vindas: ['MEMBER_NAME', 'MEMBER_EMAIL', 'TEMP_PASSWORD', 'LOGIN_URL'],
  recuperacao_senha: ['MEMBER_NAME', 'TEMP_PASSWORD', 'LOGIN_URL'],
  entrega_produto: ['MEMBER_NAME', 'PRODUCT_NAME', 'OFFER_NAME', 'EXPIRES_AT', 'TOOL_URL', 'LOGIN_URL'],
  pagamento_recebido: ['MEMBER_NAME', 'OFFER_NAME', 'PRODUCT_NAME', 'EXPIRES_AT', 'VALUE', 'TRANSACTION', 'LOGIN_URL'],
  // 🔴 Prazo PRÓPRIO do brinde. Não pode ser o `entrega_produto`: aquele manda um único
  // `EXPIRES_AT`, o vencimento mais TARDIO, e numa oferta mista — anual vendido, 7 dias de brinde —
  // o brinde morreria anunciado com a data da assinatura.
  degustacao_liberada: ['MEMBER_NAME', 'PRODUCT_NAME', 'OFFER_NAME', 'EXPIRES_AT', 'TOOL_URL', 'LOGIN_URL'],
}
```

- [ ] **Step 4: `padroes.ts`**

```ts
  degustacao_liberada: {
    assunto: 'Você ganhou [PRODUCT_NAME] de bônus',
    html: moldura(
      '<p>Olá [MEMBER_NAME],</p>' +
        '<p>Sua compra de <strong>[OFFER_NAME]</strong> liberou <strong>[PRODUCT_NAME]</strong> como bônus na sua conta.</p>' +
        '<p>Este acesso de degustação vale até <strong>[EXPIRES_AT]</strong>, e é independente dos outros produtos que você tenha.</p>' +
        botao('[TOOL_URL]', 'Abrir a ferramenta'),
    ),
  },
```

- [ ] **Step 5: O texto da tela**

Em `ModelosEmailCard.tsx`, onde diz "Personalize o assunto e o corpo dos quatro e-mails", troque
"quatro" por "cinco". **Não** deixe número escrito à mão se a tela puder contar `TIPOS.length` — se
houver um jeito óbvio no arquivo, use-o; senão, ajuste o numeral.

- [ ] **Step 6: Suíte e build**

Run: `pnpm run test && pnpm build`
Expected: PASS. O `Record<TipoModelo, Modelo>` do `padroes.ts` é exaustivo: o `tsc` cobra o modelo
novo se ele faltar.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0073_email_degustacao_liberada.sql src/lib/email/tipos.ts src/lib/email/padroes.ts "src/app/(app)/config/ModelosEmailCard.tsx"
git commit -m "feat(email): modelo degustacao_liberada, com prazo proprio do brinde

O brinde nao pode reusar o entrega_produto: aquele manda um unico
EXPIRES_AT, o vencimento mais tardio, e numa oferta mista o brinde de 7
dias morreria anunciado com a data da assinatura anual.

Migration alarga o CHECK de emails_fila.tipo sem estreitar o dominio."
```

---

### Task 6: `decidirEmails` ganha a degustação, e o envio usa os rótulos

**Files:**
- Modify: `src/lib/vendas/emails.ts`
- Modify: `src/server/vendas/processar.ts` (a função `notificar`)
- Test: `tests/vendas/emails.spec.ts`

**Interfaces:**
- Produces: `DecisaoEmails` ganha `degustacao: string[]`.
- Consumes: `nomesDosProdutos` (Task 4).

- [ ] **Step 1: O teste que falha**

Em `tests/vendas/emails.spec.ts`, acrescente (reaproveitando os helpers que já existirem no arquivo):

```ts
  it('venda 100% externa: sem entrega, e pagamento recebido', () => {
    const d = decidirEmails({
      vendaAtiva: true,
      nuncaEntrou: false,
      produtosOferta: ['8c4d2f1e-4b2a-4f6e-9d3c-1a2b3c4d5e6f'],
      produtosJaTidos: [],
    })
    // 🔴 Externo nunca entra em `entrega`: não há o que liberar, e o TOOL_URL apontaria para rota
    // inexistente. A venda 100% externa só diz "pagamento recebido".
    expect(d.entrega).toEqual([])
    expect(d.pagamentoRecebido).toBe(true)
  })

  it('venda mista: só os INTERNOS novos na entrega', () => {
    const d = decidirEmails({
      vendaAtiva: true,
      nuncaEntrou: false,
      produtosOferta: ['indulto-comutacao-2025', '8c4d2f1e-4b2a-4f6e-9d3c-1a2b3c4d5e6f'],
      produtosJaTidos: [],
    })
    expect(d.entrega).toEqual(['indulto-comutacao-2025'])
  })
```

> **Antes de escrever**, veja como `decidirEmails` decide o que é interno hoje: ele **não** filtra —
> recebe já filtrado por quem chama. A separação novo/interno passa a ser responsabilidade da
> função, então os dois casos acima mudam o contrato. Adapte os testes existentes que passavam a
> lista crua, se houver.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run tests/vendas/emails.spec.ts`
Expected: FAIL nos dois casos novos (`entrega` devolve o UUID, e `pagamentoRecebido` é false na
venda 100% externa).

- [ ] **Step 3: Implementar**

```ts
import { ehProdutoInterno } from '@/lib/produtos/catalogo'

export interface DecisaoEmails {
  boasVindas: boolean
  /** Produtos INTERNOS que o membro nunca teve — são os que o e-mail de entrega anuncia. */
  entrega: string[]
  /** Produtos internos concedidos como brinde por ESTA venda. */
  degustacao: string[]
  pagamentoRecebido: boolean
}
```

E no corpo:

```ts
export function decidirEmails(args: {
  vendaAtiva: boolean
  nuncaEntrou: boolean
  produtosOferta: readonly string[]
  produtosJaTidos: Iterable<string>
  produtosDegustacao?: readonly string[]
}): DecisaoEmails {
  const vazio = { boasVindas: false, entrega: [], degustacao: [], pagamentoRecebido: false }
  if (!args.vendaAtiva) return vazio
  const tidos = new Set(args.produtosJaTidos)
  // 🔴 Só produto INTERNO entra em `entrega` e em `degustacao`: o externo não tem o que liberar, e
  // o TOOL_URL apontaria para rota inexistente. É aqui que os dois significados se separam.
  const novos = [...new Set(args.produtosOferta)].filter((p) => !tidos.has(p) && ehProdutoInterno(p))
  const degustacao = [...new Set(args.produtosDegustacao ?? [])].filter(ehProdutoInterno)
  return { boasVindas: args.nuncaEntrou, entrega: novos, degustacao, pagamentoRecebido: novos.length === 0 }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm vitest run tests/vendas/emails.spec.ts`
Expected: PASS.

- [ ] **Step 5: `notificar` usa `nomesDosProdutos` e dispara o brinde**

Em `processar.ts`, na função `notificar`:

Troque os dois filtros (hoje `:649`–`:650`) por chamadas ao tradutor:

```ts
  // 🔴 Sem filtro: a lista pode ter id de produto externo, e ele PRECISA aparecer no
  // "pagamento recebido" com o nome do curso, não com um UUID.
  const produtos = venda.produtos
  const novos = (venda.produtos_novos ?? []) as string[]
  const nomesProdutos = await nomesDosProdutos(venda.workspace_id, [...produtos, ...novos])
```

Passe `produtosDegustacao` para a decisão (a lista vem do banco, dos períodos de origem degustação
desta venda):

```ts
  const periodos = (periodosR.data ?? []) as Array<{ produto_id: string; expira_em: string | null }>
  const decisao = decidirEmails({
    vendaAtiva: true,
    nuncaEntrou: !usuario.last_sign_in_at,
    produtosOferta: produtos,
    produtosJaTidos: produtos.filter((p) => !novos.includes(p)),
    produtosDegustacao: periodos.filter((p) => /* origem degustacao */).map((p) => p.produto_id),
  })
```

> Ajuste a consulta de `periodosR` para trazer também `origem`, se ela já não vier.

Acrescente o envio do brinde, com o **vencimento só dos períodos de degustação**:

```ts
  if (decisao.degustacao.length > 0) {
    const ferramenta = PRODUTOS.find((p) => p.id === decisao.degustacao[0])
    const r = await enfileirar({
      workspaceId: venda.workspace_id,
      tipo: 'degustacao_liberada',
      para: email,
      chave: `venda:${venda.id}:degustacao${sufixo}`,
      valores: {
        ...base,
        PRODUCT_NAME: decisao.degustacao.map((p) => rotuloDeId(p, nomesProdutos)).join(', '),
        // 🔴 Só os períodos de BRINDE desta venda — nunca o vencimento mais tardio, que é o da
        // assinatura anual e anunciaria um brinde de 7 dias com a data errada.
        EXPIRES_AT: vencimentoDe(decisao.degustacao),
        TOOL_URL: ferramenta ? new URL(caminhoDoProduto(ferramenta.slug), origem).href : login,
      },
    })
    if ('erro' in r) return { erro: 'falha_enfileirar' }
  }
```

E nos dois envios que já existem, troque `ids.map(rotuloDoProduto)` e `produtos.map(rotuloDoProduto)`
por `nomesProdutos` via `rotuloDeId`.

- [ ] **Step 6: `tsc`, suíte e build**

Run: `pnpm exec tsc --noEmit && pnpm run test && pnpm build`
Expected: tudo verde.

- [ ] **Step 7: Commit**

```bash
git add src/lib/vendas/emails.ts src/server/vendas/processar.ts tests/vendas/emails.spec.ts
git commit -m "feat(email): entrega so anuncia produto interno, e o brinde tem e-mail proprio

decidirEmails separa interno de externo: venda 100% externa nao dispara
entrega (nao ha o que liberar), e o pagamento recebido diz o nome do curso
em vez de um UUID.

O e-mail do brinde usa o vencimento SO dos periodos de degustacao, e nao o
mais tardio da venda."
```

---

### Task 7: O cadastro de produtos externos na aba Comercial

**Files:**
- Create: `src/app/(app)/config/acoes-produtos-externos.ts`
- Create: `src/app/(app)/config/ProdutosExternosCard.tsx`
- Modify: `src/app/(app)/config/ComercialCard.tsx`
- Modify: `src/app/(app)/config/acoes-comercial.ts` (`VistaComercial` ganha `produtosExternos`)

**Interfaces:**
- Produces: `VistaComercial.produtosExternos: ProdutoExternoItem[]`
- Produces: ações `lerProdutosExternos`, `salvarProdutoExterno`, `alternarProdutoExterno`,
  `excluirProdutoExterno`.

- [ ] **Step 1: As ações**

Crie `src/app/(app)/config/acoes-produtos-externos.ts`, **espelhando a autorização do resto do
comercial** (`workspaceDoOwner`: só o dono do servidor, no workspace de que é owner — copie o
padrão de `acoes-comercial.ts`, que já tem o porquê comentado):

```ts
export interface ProdutoExternoItem {
  id: string
  nome: string
  ativo: boolean
  /** Quantas ofertas o referenciam. Decisivo: a FK decide a exclusão, o número só a explica. */
  ofertas: number
}
```

As quatro ações:

- `lerProdutosExternos(ws)` — a lista com a contagem de ofertas (consulta própria, sem `limit`, pelo
  mesmo motivo que a contagem de vendas da oferta já documenta).
- `salvarProdutoExterno(entrada)` — cria ou renomeia; valida `nome` (1..200, trim) com Zod; o índice
  único `(workspace_id, lower(nome))` devolve `23505`, que vira
  `'Já existe um produto externo com este nome.'`.
- `alternarProdutoExterno(id, ativo)` — o interruptor. 🔴 **Desativar não recusa venda** (spec): é
  arquivamento do catálogo. Não há aqui nenhuma guarda contra venda — o freio é desativar a oferta.
- `excluirProdutoExterno(id)` — só sai quem **nenhuma oferta** referencia; a contagem local dá a
  mensagem própria, e a checagem em `ofertas_produtos.produto_id` e em `vendas.produtos` decide de
  verdade (não há FK a que recorrer — Task 1 não a criou, de propósito). Igual ao padrão de
  `excluirOferta`.

- [ ] **Step 2: `VistaComercial` ganha a lista**

Em `acoes-comercial.ts`, acrescente `produtosExternos: ProdutoExternoItem[]` à interface e à leitura
(chame `lerProdutosExternos(ws)` dentro do `try` de `lerComercial`).

- [ ] **Step 3: O card**

Crie `ProdutosExternosCard.tsx` como client component, no mesmo desenho dos outros blocos
(`blocoCab`/`lista`/`item`, `Entrada`, `Botao`), com: campo de nome + botão "Adicionar"; cada linha
com nome, interruptor ativo/inativo e botão de excluir (com a contagem de ofertas ao lado, e
desabilitado quando maior que zero, com explicação — igual à receita do `TiposAtividade`).

- [ ] **Step 4: Encaixar no `ComercialCard`**

Renderize `<ProdutosExternosBloco {...props} />` **acima** de `<OfertasBloco>` (o produto é cadastrado
antes de ser ofertado). Passe `produtosExternos` no `props`.

- [ ] **Step 5: Suíte e build**

Run: `pnpm run test && pnpm build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/config/acoes-produtos-externos.ts" "src/app/(app)/config/ProdutosExternosCard.tsx" "src/app/(app)/config/ComercialCard.tsx" "src/app/(app)/config/acoes-comercial.ts"
git commit -m "feat(produtos-externos): cadastro na aba Comercial

Acoes proprias, nao dentro de acoes-comercial.ts (que ja tem 516 linhas).
Desativar nao recusa venda: e arquivamento do catalogo, e o freio de verdade
e desativar a oferta. Excluir so sai quem nenhuma oferta referencia."
```

---

### Task 8: A oferta aceita produto externo, e recusa externo em degustação

**Files:**
- Modify: `src/app/(app)/config/acoes-comercial.ts` (`OfertaSchema` + validação pós-parse)
- Modify: `src/app/(app)/config/ComercialCard.tsx` (o formulário)
- Test: `tests/vendas/oferta-produtos.spec.ts` (novo — validação pura)

**Interfaces:**
- Produces: `export function ehIdDeProdutoAceito(id: string, externosValidos: ReadonlySet<string>): boolean`
  (pura, testável sem banco).

- [ ] **Step 1: A parte pura, com teste**

Extraia a regra para uma função pura (num módulo ao lado, se ficar mais limpo), e teste-a em
`tests/vendas/oferta-produtos.spec.ts`:

```ts
describe('validação de produto da oferta', () => {
  const externos = new Set(['8c4d2f1e-4b2a-4f6e-9d3c-1a2b3c4d5e6f'])

  it('id do catálogo é aceito', () => {
    expect(ehIdDeProdutoAceito('indulto-comutacao-2025', externos)).toBe(true)
  })

  it('UUID de produto externo do workspace é aceito', () => {
    expect(ehIdDeProdutoAceito('8c4d2f1e-4b2a-4f6e-9d3c-1a2b3c4d5e6f', externos)).toBe(true)
  })

  it('UUID de OUTRO workspace é recusado', () => {
    expect(ehIdDeProdutoAceito('9f8e7d6c-0000-0000-0000-000000000000', externos)).toBe(false)
  })

  it('id desconhecido é recusado', () => {
    expect(ehIdDeProdutoAceito('produto-fantasma', externos)).toBe(false)
  })

  it('produto externo NÃO pode ser degustação', () => {
    expect(ehDegustacaoValida(['8c4d2f1e-4b2a-4f6e-9d3c-1a2b3c4d5e6f'])).toBe(false)
    expect(ehDegustacaoValida(['indulto-comutacao-2025'])).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run tests/vendas/oferta-produtos.spec.ts`
Expected: FAIL — as funções ainda não existem.

- [ ] **Step 3: Implementar**

`ehIdDeProdutoAceito(id, externos)` = `ehProdutoInterno(id) || externos.has(id)`.
`ehDegustacaoValida(ids)` = todos os ids são `ehProdutoInterno`.

- [ ] **Step 4: Zod e a validação pós-parse**

No `OfertaSchema`, `produtos` passa a aceitar string (a validação fina é depois do parse, porque o
Zod sozinho não alcança o banco) e `produtosDegustacao` recusa externo com mensagem própria:

```ts
    produtosDegustacao: z
      .array(z.string())
      .max(50)
      .optional()
      .default([])
      .refine((ids) => ehDegustacaoValida(ids), {
        message: 'Produto externo não pode ser degustação: este CRM não entrega o acesso dele.',
      }),
```

E, **depois** do `safeParse`, a consulta aos externos do workspace:

```ts
  const { data: externosDoWs, error: erroExternos } = await db
    .from('produtos_externos')
    .select('id')
    .eq('workspace_id', ws)
  if (erroExternos) { /* erro genérico, logado */ }
  const externosValidos = new Set((externosDoWs ?? []).map((p) => p.id as string))
  const invalidos = [...r.data.produtos, ...r.data.produtosDegustacao].filter((p) => !ehIdDeProdutoAceito(p, externosValidos))
  if (invalidos.length > 0) return { erro: 'Um dos produtos da oferta não existe neste espaço de trabalho.' }
```

- [ ] **Step 5: O formulário da oferta**

No `ComercialCard.tsx` (bloco de ofertas), a lista de produtos passa a trazer os externos **ativos
mais os que esta oferta já usa** — 🔴 sem isso, abrir e salvar uma oferta que usa um produto externo
desativado apagaria aquele produto em silêncio. Separe em dois grupos na tela: *"Ferramentas deste
CRM"* e *"Produtos externos"*. O externo aparece **sem** a coluna de degustação.

> A vista precisa, portanto, trazer os externos com marca de origem e o `ativo`. Ajuste
> `VistaComercial.produtos` para incluir um campo de origem (`'interno' | 'externo'`), ou acrescente
> uma segunda lista — decida e registre no commit.

- [ ] **Step 6: Suíte e build**

Run: `pnpm run test && pnpm build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/config/acoes-comercial.ts" "src/app/(app)/config/ComercialCard.tsx" tests/vendas/oferta-produtos.spec.ts
git commit -m "feat(produtos-externos): a oferta vende produto externo

Oferta aceita id do catalogo ou UUID de produto externo do workspace, com a
conferencia feita contra o banco depois do parse — o Zod sozinho nao alcanca
isso. Externo em degustacao e recusado com mensagem propria: este CRM nao
entrega o acesso dele.

O formulario traz os externos ativos MAIS os que a oferta ja usa: sem isso,
abrir e salvar apagaria em silencio um produto desativado."
```

---

### Task 9: Verificação manual e fechamento

**Files:**
- Modify: `docs/superpowers/ESTADO-vitrine-e-produtos-externos.md`

- [ ] **Step 1: Suíte e build completos, do zero**

Run: `pnpm run test && pnpm build`
Expected: PASS nos dois. Cole a saída no relatório.

- [ ] **Step 2: Verificação manual do processamento (o que a suíte NÃO cobre)**

🔴 **`processar.ts` não tem teste unitário** — a suíte mocka o processamento. Esta é a verificação
que fecha o trabalho, e ela precisa de banco e de um webhook real (ou reprocessado pelo card
Comercial). Os cinco passos estão no fim da spec (§Testes → "Não automatizado"):

1. Criar um produto externo e uma oferta que o venda, com uma calculadora de brinde.
2. Disparar (ou reprocessar) uma compra daquele código de oferta.
3. Conferir: venda com valor e transação; período do produto externo **e** da calculadora; a
   calculadora abre para o comprador; os e-mails na fila com ("pagamento recebido"
   com o nome do curso, e o brinde com os 7 dias).
4. 🔴 **Reprocessar o mesmo evento e confirmar que nada duplica** — nem venda, nem período, nem
   e-mail. É o passo mais importante: é onde um erro na reclassificação apareceria.
5. Cancelar/estornar e confirmar que a venda encerra e o acesso da calculadora fecha.

Se o ambiente não tiver credenciais para esta verificação, **diga isso abertamente no relatório** —
não afirme que passou.

- [ ] **Step 3: Atualizar o documento de estado**

Reescreva `docs/superpowers/ESTADO-vitrine-e-produtos-externos.md` para refletir que os dois
trabalhos estão implementados, com o que ficou de fora (a pendência de teste do `processar.ts`, que
continua).

- [ ] **Step 4: Commit final**

```bash
git add docs/superpowers/ESTADO-vitrine-e-produtos-externos.md
git commit -m "docs(produtos-externos): estado dos dois trabalhos implementados"
```

---

## Fora deste plano

**Teste unitário do `processar.ts`.** Continua sendo pendência própria, e agora mais afiada: a
reclassificação removeu a rede de segurança grosseira do `.filter(...)` em cinco pontos, e um erro
ali aparece só em produção, numa venda. O que uma spec própria precisaria decidir está em
`ESTADO-vitrine-e-produtos-externos.md`.

**Dashboard de vendas, churn e renovação.** É a motivação de longo prazo; este trabalho dá a ele o
dado completo.
