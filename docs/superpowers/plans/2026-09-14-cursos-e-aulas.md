# Cursos e Aulas no Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a workspace owner create courses (Cursos/Formações), organize them into modules and lessons, and sell them through the existing Hotmart offer flow — with no new access-control machinery.

**Architecture:** Three new tables (`cursos` → `modulos` → `aulas`, plus `progresso_aulas`) reuse the existing `ofertas`/`vendas`/`vendas_periodos` purchase-and-access pipeline: a course's `produto_id` is just another id in an offer's `produtos` array. Admin CRUD lives in `src/app/(app)/cursos/` (Next.js Server Actions + client components with `@dnd-kit` drag reordering), gated by workspace ownership both in a route layout and inside every server action (direct-call bypass is a real risk in this codebase — see `src/server/crm/acoes.ts`).

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres + RLS), `@dnd-kit/core` + `@dnd-kit/sortable`, Vitest, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-14-cursos-e-aulas-design.md`

## Global Constraints

- Use `pnpm`, never `npm`, for every install/build/test command (`AGENTS.md` regra 7).
- Every new table gets `workspace_id`, `enable row level security`, and matching policies (`AGENTS.md` regra 4).
- Every `check (...)` in the migration must be a named `constraint <nome> check (...)` — an anonymous `check (` fails `tests/migracoes/idempotencia.spec.ts`.
- Every `create policy`, `create trigger`, and `add constraint` must sit inside a `do $$ ... end $$` block guarded by a `pg_policies`/`pg_trigger`/`pg_constraint` existence check — same test enforces this by position.
- Every table this migration creates needs its own standalone `grant all on table public.<tabela> to anon, authenticated, service_role;` statement — a single statement listing multiple tables passes the "creates" check but fails the per-table "grants" and "RLS enabled" checks in the idempotency test, because the test looks for the literal substring `grant all on table public.<tabela>`.
- Categoria do curso is the fixed list `curso`/`formacao` (`src/lib/cursos/categorias.ts` + a DB `check`) — not admin-editable in this version.
- Video is YouTube-only (store an id, not a file) — no upload path in this version.
- Before every commit, run `find . -path ./node_modules -prune -o -path ./.next -prune -o -path ./.git -prune -o -name "* [0-9].*" -print` — this repo's dev machine has recreated deleted files as `nome 2.ext` duplicates before (`docs/superpowers/ESTADO-vendas-hotmart.md`). Delete anything it lists under `src/` or `tests/` before staging.
- If `git status` shows `next-env.d.ts` modified after a `pnpm build`, run `git checkout -- next-env.d.ts` before committing — it's generated and versioned, and should not carry build noise into a commit.

---

### Task 1: Migration — `cursos`, `modulos`, `aulas`, `progresso_aulas`

**Files:**
- Create: `supabase/migrations/0066_cursos.sql`
- Test: `tests/migracoes/idempotencia.spec.ts` (already exists — no changes; it auto-discovers every `.sql` file numbered ≥ 63)

**Interfaces:**
- Produces (DB schema every later task depends on):
  - `public.cursos(id, workspace_id, produto_id, categoria, titulo, descricao, capa_url, publicado, ordem, criado_em, atualizado_em)` — unique on `(workspace_id, produto_id)` and on `(workspace_id, id)`.
  - `public.modulos(id, workspace_id, curso_id, titulo, ordem, criado_em, atualizado_em)` — unique on `(workspace_id, id)`.
  - `public.aulas(id, workspace_id, modulo_id, titulo, descricao, video_youtube_id, publicado, ordem, criado_em, atualizado_em)` — unique on `(workspace_id, id)`.
  - `public.progresso_aulas(workspace_id, membro_id, aula_id, concluida_em)` — PK `(membro_id, aula_id)`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0066_cursos.sql`:

```sql
-- 0066_cursos.sql — cursos, módulos, aulas e progresso de leitura do membro.
--
-- ⚠️ ADITIVA E IDEMPOTENTE. Migration que falha = container que NÃO SOBE, em toda instalação.
-- Nada apaga dado. A guarda em tests/migracoes/idempotencia.spec.ts confere as regras.

-- == cursos ====================================================================================
create table if not exists public.cursos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  produto_id    text not null,
  categoria     text not null,
  titulo        text not null,
  descricao     text,
  capa_url      text,
  publicado     boolean not null default false,
  ordem         integer not null default 0,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint cursos_categoria_dominio_check check (categoria in ('curso','formacao')),
  constraint cursos_titulo_preenchido_check check (length(trim(titulo)) > 0)
);

create unique index if not exists cursos_workspace_produto_key on public.cursos (workspace_id, produto_id);
-- Alvo da FK composta de `modulos`.
create unique index if not exists cursos_workspace_id_key on public.cursos (workspace_id, id);

-- == módulos ===================================================================================
create table if not exists public.modulos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  curso_id      uuid not null,
  titulo        text not null,
  ordem         integer not null default 0,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint modulos_titulo_preenchido_check check (length(trim(titulo)) > 0)
);

-- Alvo da FK composta de `aulas`.
create unique index if not exists modulos_workspace_id_key on public.modulos (workspace_id, id);
create index if not exists modulos_curso_idx on public.modulos (workspace_id, curso_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'modulos_curso_fk' and conrelid = 'public.modulos'::regclass
  ) then
    alter table public.modulos add constraint modulos_curso_fk
      foreign key (workspace_id, curso_id) references public.cursos (workspace_id, id) on delete cascade;
  end if;
end $$;

-- == aulas =====================================================================================
create table if not exists public.aulas (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  modulo_id         uuid not null,
  titulo            text not null,
  descricao         text,
  video_youtube_id  text,
  publicado         boolean not null default false,
  ordem             integer not null default 0,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  constraint aulas_titulo_preenchido_check check (length(trim(titulo)) > 0)
);

-- Alvo da FK composta de `progresso_aulas`.
create unique index if not exists aulas_workspace_id_key on public.aulas (workspace_id, id);
create index if not exists aulas_modulo_idx on public.aulas (workspace_id, modulo_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'aulas_modulo_fk' and conrelid = 'public.aulas'::regclass
  ) then
    alter table public.aulas add constraint aulas_modulo_fk
      foreign key (workspace_id, modulo_id) references public.modulos (workspace_id, id) on delete cascade;
  end if;
end $$;

-- == progresso do membro por aula (escrito pelo Sub-projeto B — schema só, sem escritor ainda) ==
create table if not exists public.progresso_aulas (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  membro_id     uuid not null,
  aula_id       uuid not null,
  concluida_em  timestamptz not null default now(),
  primary key (membro_id, aula_id)
);

create index if not exists progresso_aulas_membro_idx on public.progresso_aulas (workspace_id, membro_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'progresso_aulas_membro_fk' and conrelid = 'public.progresso_aulas'::regclass
  ) then
    alter table public.progresso_aulas add constraint progresso_aulas_membro_fk
      foreign key (workspace_id, membro_id) references public.membros (workspace_id, id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'progresso_aulas_aula_fk' and conrelid = 'public.progresso_aulas'::regclass
  ) then
    alter table public.progresso_aulas add constraint progresso_aulas_aula_fk
      foreign key (workspace_id, aula_id) references public.aulas (workspace_id, id) on delete cascade;
  end if;
end $$;

-- == gatilhos de atualizado_em =================================================================
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'cursos_set_atualizado' and tgrelid = 'public.cursos'::regclass) then
    create trigger cursos_set_atualizado before update on public.cursos
      for each row execute function public.set_atualizado_em();
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'modulos_set_atualizado' and tgrelid = 'public.modulos'::regclass) then
    create trigger modulos_set_atualizado before update on public.modulos
      for each row execute function public.set_atualizado_em();
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'aulas_set_atualizado' and tgrelid = 'public.aulas'::regclass) then
    create trigger aulas_set_atualizado before update on public.aulas
      for each row execute function public.set_atualizado_em();
  end if;
end $$;

-- == RLS, grants e policies ====================================================================
alter table public.cursos enable row level security;
alter table public.modulos enable row level security;
alter table public.aulas enable row level security;
alter table public.progresso_aulas enable row level security;

-- 🔴 Uma linha `grant` por tabela: a guarda de idempotência procura o texto literal
-- "grant all on table public.<tabela>" para CADA tabela criada nesta migration.
grant all on table public.cursos to anon, authenticated, service_role;
grant all on table public.modulos to anon, authenticated, service_role;
grant all on table public.aulas to anon, authenticated, service_role;
grant all on table public.progresso_aulas to anon, authenticated, service_role;

-- Escrita (criar/editar/reordenar/publicar) só por service_role, via server action — mesmo
-- padrão de `ofertas`/`vendas` na 0064: nenhuma policy de escrita para authenticated.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cursos' and policyname = 'cursos_service_role') then
    create policy cursos_service_role on public.cursos for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'modulos' and policyname = 'modulos_service_role') then
    create policy modulos_service_role on public.modulos for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'aulas' and policyname = 'aulas_service_role') then
    create policy aulas_service_role on public.aulas for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'progresso_aulas' and policyname = 'progresso_aulas_service_role') then
    create policy progresso_aulas_service_role on public.progresso_aulas for all to service_role using (true) with check (true);
  end if;
end $$;

-- Leitura por authenticated: só o que o membro tem direito de ver — curso/aula publicados, com
-- período de acesso ativo para aquele produto_id. Mesma régua de estadoDeAcesso()
-- (src/lib/vendas/acesso.ts), só que como policy SQL — é o que o app do membro (Sub-projeto B/C)
-- vai usar para ler direto do Supabase.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cursos' and policyname = 'cursos_membro_select') then
    create policy cursos_membro_select on public.cursos for select to authenticated using (
      publicado = true
      and exists (
        select 1
        from public.membros m
        join public.vendas_periodos vp on vp.workspace_id = m.workspace_id and vp.membro_id = m.id
        join public.vendas v on v.id = vp.venda_id
        where m.user_id = auth.uid()
          and vp.workspace_id = cursos.workspace_id
          and vp.produto_id = cursos.produto_id
          and v.status = 'ativa'
          and vp.inicia_em <= now()
          and (vp.expira_em is null or vp.expira_em > now())
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'modulos' and policyname = 'modulos_membro_select') then
    create policy modulos_membro_select on public.modulos for select to authenticated using (
      exists (
        select 1
        from public.cursos c
        join public.membros m on m.workspace_id = c.workspace_id
        join public.vendas_periodos vp on vp.workspace_id = m.workspace_id and vp.membro_id = m.id and vp.produto_id = c.produto_id
        join public.vendas v on v.id = vp.venda_id
        where c.id = modulos.curso_id
          and c.workspace_id = modulos.workspace_id
          and c.publicado = true
          and m.user_id = auth.uid()
          and v.status = 'ativa'
          and vp.inicia_em <= now()
          and (vp.expira_em is null or vp.expira_em > now())
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'aulas' and policyname = 'aulas_membro_select') then
    create policy aulas_membro_select on public.aulas for select to authenticated using (
      publicado = true
      and exists (
        select 1
        from public.modulos mo
        join public.cursos c on c.id = mo.curso_id and c.workspace_id = mo.workspace_id
        join public.membros m on m.workspace_id = c.workspace_id
        join public.vendas_periodos vp on vp.workspace_id = m.workspace_id and vp.membro_id = m.id and vp.produto_id = c.produto_id
        join public.vendas v on v.id = vp.venda_id
        where mo.id = aulas.modulo_id
          and mo.workspace_id = aulas.workspace_id
          and c.publicado = true
          and m.user_id = auth.uid()
          and v.status = 'ativa'
          and vp.inicia_em <= now()
          and (vp.expira_em is null or vp.expira_em > now())
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'progresso_aulas' and policyname = 'progresso_aulas_membro_rw') then
    create policy progresso_aulas_membro_rw on public.progresso_aulas for all to authenticated using (
      exists (select 1 from public.membros m where m.id = progresso_aulas.membro_id and m.user_id = auth.uid())
    ) with check (
      exists (select 1 from public.membros m where m.id = progresso_aulas.membro_id and m.user_id = auth.uid())
    );
  end if;
end $$;
```

- [ ] **Step 2: Run the idempotency guard**

Run: `pnpm test -- tests/migracoes/idempotencia.spec.ts`
Expected: PASS, and the `describe.each` list now includes `0066_cursos.sql`.

If any assertion fails, it will name the exact regex it expected (e.g. "toda `create table` usa schema qualificado" or "nomeia toda restrição check") — fix the SQL above, not the test.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0066_cursos.sql
git commit -m "$(cat <<'EOF'
Adiciona schema de cursos, módulos, aulas e progresso

Reaproveita ofertas/vendas/vendas_periodos: o produto_id de um curso é
só mais um id no array de produtos de uma oferta, sem nenhuma tabela
nova de controle de acesso. Leitura por authenticated fica pronta para
o app do membro (Sub-projeto B); escrita fica só com service_role.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `src/lib/cursos/` — categoria fixa, extrair id do YouTube, reordenar lista

**Files:**
- Create: `src/lib/cursos/categorias.ts`
- Create: `src/lib/cursos/youtube.ts`
- Create: `src/lib/cursos/ordenar.ts`
- Test: `tests/cursos/categorias.spec.ts`
- Test: `tests/cursos/youtube.spec.ts`
- Test: `tests/cursos/ordenar.spec.ts`

**Interfaces:**
- Produces:
  - `CATEGORIAS_CURSO: { id: 'curso' | 'formacao'; rotulo: string }[]`
  - `type CategoriaCurso = 'curso' | 'formacao'`
  - `ehCategoriaConhecida(id: unknown): id is CategoriaCurso`
  - `rotuloDaCategoria(id: CategoriaCurso): string`
  - `extrairIdYoutube(entrada: string): string | null`
  - `reordenarLista<T>(itens: readonly T[], deIndice: number, paraIndice: number): T[]` — consumido pelos três editores de arraste (Tasks 3–5), que hoje repetiriam a mesma lógica de `splice` três vezes.

- [ ] **Step 1: Write the failing tests**

Create `tests/cursos/categorias.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { CATEGORIAS_CURSO, ehCategoriaConhecida, rotuloDaCategoria } from '@/lib/cursos/categorias'

describe('categorias de curso', () => {
  it('conhece exatamente curso e formação', () => {
    expect(CATEGORIAS_CURSO.map((c) => c.id)).toEqual(['curso', 'formacao'])
  })

  it('reconhece só categorias do registro', () => {
    expect(ehCategoriaConhecida('curso')).toBe(true)
    expect(ehCategoriaConhecida('formacao')).toBe(true)
    expect(ehCategoriaConhecida('workshop')).toBe(false)
    expect(ehCategoriaConhecida(null)).toBe(false)
    expect(ehCategoriaConhecida(42)).toBe(false)
  })

  it('não repete id', () => {
    expect(new Set(CATEGORIAS_CURSO.map((c) => c.id)).size).toBe(CATEGORIAS_CURSO.length)
  })

  it('traduz para o rótulo', () => {
    expect(rotuloDaCategoria('curso')).toBe('Curso')
    expect(rotuloDaCategoria('formacao')).toBe('Formação')
  })
})
```

Create `tests/cursos/youtube.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { extrairIdYoutube } from '@/lib/cursos/youtube'

describe('extrairIdYoutube', () => {
  it('aceita o id puro', () => {
    expect(extrairIdYoutube('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('extrai de watch?v=, com ou sem parâmetros extra', () => {
    expect(extrairIdYoutube('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extrairIdYoutube('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s')).toBe('dQw4w9WgXcQ')
  })

  it('extrai de youtu.be', () => {
    expect(extrairIdYoutube('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('extrai de /embed/', () => {
    expect(extrairIdYoutube('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('ignora espaço em volta', () => {
    expect(extrairIdYoutube('  dQw4w9WgXcQ  ')).toBe('dQw4w9WgXcQ')
  })

  it('rejeita entrada vazia, texto solto e outros domínios', () => {
    expect(extrairIdYoutube('')).toBeNull()
    expect(extrairIdYoutube('   ')).toBeNull()
    expect(extrairIdYoutube('não é url')).toBeNull()
    expect(extrairIdYoutube('https://vimeo.com/12345')).toBeNull()
    expect(extrairIdYoutube('https://www.youtube.com/watch?v=curto')).toBeNull()
  })
})
```

Create `tests/cursos/ordenar.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { reordenarLista } from '@/lib/cursos/ordenar'

describe('reordenarLista', () => {
  it('move um item para o meio', () => {
    expect(reordenarLista(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('move um item para o início', () => {
    expect(reordenarLista(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('move um item para o fim', () => {
    expect(reordenarLista(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
  })

  it('índice fora do alcance não quebra e devolve a lista original', () => {
    expect(reordenarLista(['a', 'b'], -1, 1)).toEqual(['a', 'b'])
    expect(reordenarLista(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
  })

  it('lista vazia não quebra', () => {
    expect(reordenarLista([], 0, 0)).toEqual([])
  })

  it('não modifica a lista recebida (imutável)', () => {
    const original = ['a', 'b', 'c']
    reordenarLista(original, 0, 2)
    expect(original).toEqual(['a', 'b', 'c'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/cursos`
Expected: FAIL — `Cannot find module '@/lib/cursos/categorias'`, `'@/lib/cursos/youtube'` and `'@/lib/cursos/ordenar'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/cursos/categorias.ts`:

```ts
export const CATEGORIAS_CURSO = [
  { id: 'curso', rotulo: 'Curso' },
  { id: 'formacao', rotulo: 'Formação' },
] as const

export type CategoriaCurso = (typeof CATEGORIAS_CURSO)[number]['id']

export function ehCategoriaConhecida(id: unknown): id is CategoriaCurso {
  return typeof id === 'string' && CATEGORIAS_CURSO.some((c) => c.id === id)
}

export function rotuloDaCategoria(id: CategoriaCurso): string {
  return CATEGORIAS_CURSO.find((c) => c.id === id)?.rotulo ?? id
}
```

Create `src/lib/cursos/youtube.ts`:

```ts
const PADRAO_ID = /^[A-Za-z0-9_-]{11}$/

export function extrairIdYoutube(entrada: string): string | null {
  const valor = entrada.trim()
  if (!valor) return null
  if (PADRAO_ID.test(valor)) return valor

  let url: URL
  try {
    url = new URL(valor)
  } catch {
    return null
  }

  if (url.hostname === 'youtu.be') {
    const id = url.pathname.slice(1)
    return PADRAO_ID.test(id) ? id : null
  }

  if (url.hostname.endsWith('youtube.com')) {
    const v = url.searchParams.get('v')
    if (v && PADRAO_ID.test(v)) return v
    const partes = url.pathname.split('/').filter(Boolean)
    const embedIdx = partes.indexOf('embed')
    if (embedIdx >= 0 && PADRAO_ID.test(partes[embedIdx + 1] ?? '')) return partes[embedIdx + 1]
  }

  return null
}
```

Create `src/lib/cursos/ordenar.ts`:

```ts
export function reordenarLista<T>(itens: readonly T[], deIndice: number, paraIndice: number): T[] {
  if (deIndice < 0 || deIndice >= itens.length || paraIndice < 0 || paraIndice >= itens.length) {
    return [...itens]
  }
  const copia = [...itens]
  const [movido] = copia.splice(deIndice, 1)
  copia.splice(paraIndice, 0, movido)
  return copia
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/cursos`
Expected: PASS (16 tests across the three files).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cursos/categorias.ts src/lib/cursos/youtube.ts src/lib/cursos/ordenar.ts tests/cursos/
git commit -m "$(cat <<'EOF'
Adiciona categorias de curso, extrator de id do YouTube e reordenar de lista

reordenarLista fica pronta para os três editores de arraste (cursos,
módulos, aulas) reaproveitarem em vez de repetir a mesma lógica de
splice três vezes.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Cursos — server actions, guarda de acesso e tela `/cursos`

**Files:**
- Create: `src/server/cursos/acoes.ts`
- Create: `src/app/(app)/cursos/layout.tsx`
- Create: `src/app/(app)/cursos/cursos.module.css`
- Create: `src/app/(app)/cursos/page.tsx`
- Create: `src/app/(app)/cursos/GestorCursos.tsx`
- Modify: `src/components/shell/Rail.tsx`

**Interfaces:**
- Consumes: `ehCategoriaConhecida`, `CATEGORIAS_CURSO`, `rotuloDaCategoria` from Task 2 (`@/lib/cursos/categorias`); `reordenarLista` from Task 2 (`@/lib/cursos/ordenar`); `criarClienteServidor` (`@/server/supabase-session`); `admin` (`@/server/supabase`); `resolverWorkspaceAtivo` (`@/server/auth/workspace-ativo`); `ehOwnerDoWorkspace` (`@/server/auth/owner-workspace`); `exigirEngineLiberado` (`@/server/license/exigir`); `detalheSeguro` (`@/lib/sanitizar-erro`); `souDonoDeAlgumWorkspace` (`@/server/auth/comprador`, used only in Rail.tsx, already imported there).
- Produces (for Tasks 4–6):
  - `type Res = { ok: true } | { erro: string }`
  - `type ResId = { ok: true; id: string } | { erro: string }`
  - `type CursoResumo = { id: string; produto_id: string; categoria: string; titulo: string; publicado: boolean; ordem: number }`
  - `type CursoDetalhe = CursoResumo & { descricao: string | null; capa_url: string | null }`
  - `listarCursos(): Promise<CursoResumo[]>`
  - `criarCurso(input: { titulo: string; categoria: string; produtoId: string }): Promise<ResId>`
  - `salvarCurso(input: { id: string; titulo: string; categoria: string; produtoId: string; descricao: string | null; capaUrl: string | null; publicado: boolean }): Promise<Res>`
  - `alternarPublicadoCurso(input: { id: string; publicado: boolean }): Promise<Res>` — mutação estreita (só a coluna `publicado`), para a lista poder alternar sem carregar `descricao`/`capa_url` e sem risco de zerá-los por engano.
  - `excluirCurso(input: { id: string }): Promise<Res>`
  - `reordenarCursos(input: { ordemIds: string[] }): Promise<Res>`
  - An internal (not exported) `sessaoAdminCursos(): Promise<{ ws: string | null }>` helper, called directly (same file, no import needed) by the módulo actions Task 4 appends and the aula actions Task 5 appends. It returns only `ws` — every content query in this file goes through `admin()`, never the request-scoped `cliente`, because `cursos`/`modulos`/`aulas` have no broad owner-facing `authenticated` read policy (see the comment on the function itself). Task 6 touches a different file (`acoes-comercial.ts`) and uses its own existing `workspaceDoOwner()` instead.

- [ ] **Step 1: Write `src/server/cursos/acoes.ts`**

```ts
'use server'

import { criarClienteServidor } from '@/server/supabase-session'
import { admin } from '@/server/supabase'
import { resolverWorkspaceAtivo } from '@/server/auth/workspace-ativo'
import { ehOwnerDoWorkspace } from '@/server/auth/owner-workspace'
import { exigirEngineLiberado } from '@/server/license/exigir'
import { ehCategoriaConhecida } from '@/lib/cursos/categorias'
import { detalheSeguro } from '@/lib/sanitizar-erro'

type Res = { ok: true } | { erro: string }
type ResId = { ok: true; id: string } | { erro: string }

export type CursoResumo = {
  id: string; produto_id: string; categoria: string; titulo: string; publicado: boolean; ordem: number
}
export type CursoDetalhe = CursoResumo & { descricao: string | null; capa_url: string | null }

/**
 * 🔴 A guarda de `/cursos/layout.tsx` não basta sozinha: uma chamada direta pelo id da server
 * action passa por cima de layouts (mesmo problema documentado em `src/server/crm/acoes.ts`).
 * Por isso toda ação aqui resolve o workspace ATIVO e confere que quem chama é dono DELE — não
 * "dono de algum workspace", que deixaria o owner de um workspace mexer no de outro.
 *
 * 🔴 Devolve só `ws`, nunca o `cliente` da sessão: a RLS de `cursos`/`modulos`/`aulas` (migration
 * 0066) só libera `authenticated` para conteúdo PUBLICADO com compra ativa — o dono gerenciando
 * rascunhos não se enxerga por essa policy. Toda leitura/escrita de conteúdo aqui é por
 * `admin()`, no mesmo padrão de `lerComercial()` em `acoes-comercial.ts` para `ofertas`/`vendas`
 * (mesma forma de RLS: só `service_role`). Não reintroduza `cliente` para consultar estas
 * tabelas — é exatamente o bug que a Task 3 corrigiu na revisão.
 */
async function sessaoAdminCursos(): Promise<{ ws: string | null }> {
  const cliente = await criarClienteServidor()
  const ws = await resolverWorkspaceAtivo({ cliente })
  if (!ws || !(await ehOwnerDoWorkspace(ws))) return { ws: null }
  return { ws }
}

export async function listarCursos(): Promise<CursoResumo[]> {
  const { ws } = await sessaoAdminCursos()
  if (!ws) return []
  // 🔴 admin(), não `cliente`: a RLS de `cursos` só libera `authenticated` para conteúdo
  // publicado com compra ativa (política `cursos_membro_select`, migration 0066) — não existe
  // policy de leitura ampla para o dono gerenciar rascunhos. Mesmo padrão de `lerComercial()`
  // em `src/app/(app)/config/acoes-comercial.ts` para `ofertas`/`vendas`, que têm a mesma forma
  // de RLS (só service_role).
  const { data, error } = await admin()
    .from('cursos')
    .select('id, produto_id, categoria, titulo, publicado, ordem')
    .eq('workspace_id', ws)
    .order('ordem')
  if (error) throw error
  return (data as CursoResumo[] | null) ?? []
}

export async function criarCurso({ titulo, categoria, produtoId }: {
  titulo: string; categoria: string; produtoId: string
}): Promise<ResId> {
  await exigirEngineLiberado()
  const tituloLimpo = titulo.trim()
  const produtoLimpo = produtoId.trim()
  if (!tituloLimpo) return { erro: 'titulo_vazio' }
  if (!produtoLimpo) return { erro: 'produto_vazio' }
  if (!ehCategoriaConhecida(categoria)) return { erro: 'categoria_invalida' }
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    // admin(), pelo mesmo motivo de listarCursos(): `cliente` não enxerga rascunhos.
    const { data: existentes, error: erroOrdem } = await admin().from('cursos').select('ordem').eq('workspace_id', ws)
    if (erroOrdem) throw erroOrdem
    const ordem = ((existentes as { ordem: number }[] | null) ?? []).reduce((m, l) => Math.max(m, l.ordem), -1) + 1
    const { data, error } = await admin()
      .from('cursos')
      .insert({ workspace_id: ws, titulo: tituloLimpo, categoria, produto_id: produtoLimpo, ordem })
      .select('id')
      .single()
    if (error) throw error
    return { ok: true, id: (data as { id: string }).id }
  } catch (err) {
    console.error('[cursos] criar', detalheSeguro(err))
    const codigo = (err as { code?: string } | null)?.code
    return { erro: codigo === '23505' ? 'produto_duplicado' : 'falha_criar' }
  }
}

export async function salvarCurso({ id, titulo, categoria, produtoId, descricao, capaUrl, publicado }: {
  id: string; titulo: string; categoria: string; produtoId: string
  descricao: string | null; capaUrl: string | null; publicado: boolean
}): Promise<Res> {
  await exigirEngineLiberado()
  const tituloLimpo = titulo.trim()
  const produtoLimpo = produtoId.trim()
  if (!tituloLimpo) return { erro: 'titulo_vazio' }
  if (!produtoLimpo) return { erro: 'produto_vazio' }
  if (!ehCategoriaConhecida(categoria)) return { erro: 'categoria_invalida' }
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    const { error } = await admin()
      .from('cursos')
      .update({ titulo: tituloLimpo, categoria, produto_id: produtoLimpo, descricao, capa_url: capaUrl, publicado })
      .eq('workspace_id', ws)
      .eq('id', id)
    if (error) throw error
    return { ok: true }
  } catch (err) {
    console.error('[cursos] salvar', detalheSeguro(err))
    const codigo = (err as { code?: string } | null)?.code
    return { erro: codigo === '23505' ? 'produto_duplicado' : 'falha_salvar' }
  }
}

export async function alternarPublicadoCurso({ id, publicado }: { id: string; publicado: boolean }): Promise<Res> {
  await exigirEngineLiberado()
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    const { error } = await admin().from('cursos').update({ publicado }).eq('workspace_id', ws).eq('id', id)
    if (error) throw error
    return { ok: true }
  } catch (err) {
    console.error('[cursos] alternarPublicado', detalheSeguro(err))
    return { erro: 'falha_salvar' }
  }
}

export async function excluirCurso({ id }: { id: string }): Promise<Res> {
  await exigirEngineLiberado()
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    // admin(), pelo mesmo motivo de listarCursos(): `cliente` sob RLS não vê módulos de
    // cursos não publicados, e esta contagem decide se a exclusão é bloqueada.
    const { count } = await admin()
      .from('modulos')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', ws)
      .eq('curso_id', id)
    if ((count ?? 0) > 0) return { erro: 'em_uso' }
    const { error } = await admin().from('cursos').delete().eq('workspace_id', ws).eq('id', id)
    if (error) throw error
    return { ok: true }
  } catch (err) {
    console.error('[cursos] excluir', detalheSeguro(err))
    return { erro: 'falha_excluir' }
  }
}

export async function reordenarCursos({ ordemIds }: { ordemIds: string[] }): Promise<Res> {
  await exigirEngineLiberado()
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    for (let i = 0; i < ordemIds.length; i++) {
      const { error } = await admin().from('cursos').update({ ordem: i }).eq('workspace_id', ws).eq('id', ordemIds[i])
      if (error) throw error
    }
    return { ok: true }
  } catch (err) {
    console.error('[cursos] reordenar', detalheSeguro(err))
    return { erro: 'falha_reordenar' }
  }
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors from `src/server/cursos/acoes.ts` (unused-import or route errors from later, not-yet-created files are expected at this point only if referenced — they aren't yet).

- [ ] **Step 3: Create the access guard**

Create `src/app/(app)/cursos/layout.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { resolverWorkspaceAtivo } from '@/server/auth/workspace-ativo'
import { ehOwnerDoWorkspace } from '@/server/auth/owner-workspace'

export default async function CursosLayout({ children }: { children: React.ReactNode }) {
  const ws = await resolverWorkspaceAtivo()
  if (!ws || !(await ehOwnerDoWorkspace(ws))) redirect('/painel')
  return <>{children}</>
}
```

- [ ] **Step 4: Create the stylesheet**

Create `src/app/(app)/cursos/cursos.module.css`:

```css
.pagina {
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
}

.painel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: var(--s-3);
  background: var(--superficie);
  border: 1px solid var(--linha);
  border-radius: var(--r-painel);
  box-shadow: var(--elev-1);
  padding: var(--s-5);
}

.subtitulo {
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  font-weight: 600;
  letter-spacing: -0.005em;
  color: var(--tinta);
}

.ajuda { color: var(--tinta-3); font-size: var(--fs-body); line-height: var(--lh-body); margin: 0; }

.erro {
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  font-weight: 500;
  color: var(--erro);
  background: var(--erro-wash);
  border-radius: var(--r-controle);
  padding: var(--s-3) var(--s-4);
}

.voltar {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  font-size: var(--fs-body);
  color: var(--tinta-3);
  text-decoration: none;
}
.voltar:hover { color: var(--tinta); }

.campo { display: flex; flex-direction: column; gap: var(--s-1); }
.rotulo { font-size: var(--fs-body); font-weight: 500; color: var(--tinta-2); }
.linhaForm { display: flex; gap: var(--s-3); align-items: center; flex-wrap: wrap; }
.novoRow { display: flex; gap: var(--s-3); margin-block-start: var(--s-3); flex-wrap: wrap; }

.checkboxLinha {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--fs-body);
  color: var(--tinta-2);
}

.lista { list-style: none; margin: var(--s-4) 0 0; padding: 0; display: flex; flex-direction: column; }
.item { border-bottom: 1px solid var(--linha); }
.itemLinha { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-3) 0; flex-wrap: wrap; }

.grip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  padding: var(--s-1);
  color: var(--tinta-3);
  cursor: grab;
  touch-action: none;
}
.grip:active { cursor: grabbing; }

.itemNome {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--s-3);
  font-size: var(--fs-body);
  font-weight: 500;
  color: var(--tinta);
}
.itemNome a { color: inherit; text-decoration: none; }
.itemNome a:hover { text-decoration: underline; }

.tag {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  font-size: var(--fs-micro);
  line-height: var(--lh-micro);
  letter-spacing: var(--ls-micro);
  text-transform: uppercase;
  font-weight: 600;
  color: var(--tinta-3);
  background: var(--trilho);
  padding: var(--s-1) var(--s-3);
  border-radius: var(--r-pill);
  white-space: nowrap;
}

.itemAcoes { display: flex; align-items: center; gap: var(--s-1); flex-shrink: 0; }

.videoPreview {
  width: 100%;
  max-width: 480px;
  aspect-ratio: 16 / 9;
  border: none;
  border-radius: var(--r-pequeno);
}

.itemNome:focus-visible,
.grip:focus-visible {
  outline: 2px solid var(--acento);
  outline-offset: 2px;
}
```

- [ ] **Step 5: Create `/cursos/page.tsx`**

```tsx
import { listarCursos } from '@/server/cursos/acoes'
import GestorCursos from './GestorCursos'
import estilos from './cursos.module.css'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import { tituloDaPagina } from '@/server/marca'

export async function generateMetadata() {
  return { title: await tituloDaPagina('Cursos') }
}

export default async function CursosPage() {
  const cursos = await listarCursos()

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina
        titulo="Cursos"
        subtitulo="Crie cursos e formações, organize em módulos e aulas, e libere pela oferta certa."
      />
      <GestorCursos cursos={cursos} />
    </div>
  )
}
```

- [ ] **Step 6: Create `GestorCursos.tsx`**

```tsx
'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors,
  closestCenter, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import Link from 'next/link'
import { GripVertical, Plus } from 'lucide-react'
import {
  criarCurso, alternarPublicadoCurso, excluirCurso, reordenarCursos, type CursoResumo,
} from '@/server/cursos/acoes'
import { CATEGORIAS_CURSO, rotuloDaCategoria, type CategoriaCurso } from '@/lib/cursos/categorias'
import { reordenarLista } from '@/lib/cursos/ordenar'
import { anunciosDeArraste, INSTRUCAO_DE_ARRASTE, PAPEL_ARRASTAVEL } from '@/lib/anuncios-de-arraste'
import Botao from '@/components/ui/Botao'
import { Entrada, Selecao } from '@/components/ui/Campo'
import estilos from './cursos.module.css'

const ERRO_PT: Record<string, string> = {
  titulo_vazio: 'Dê um título ao curso.',
  produto_vazio: 'Defina o identificador do produto.',
  produto_duplicado: 'Já existe um curso com esse identificador de produto.',
  categoria_invalida: 'Escolha uma categoria válida.',
  em_uso: 'Este curso tem módulos — exclua-os antes de excluir o curso.',
  sem_workspace: 'Não foi possível identificar seu espaço de trabalho.',
}
function traduz(e: string) { return ERRO_PT[e] ?? 'Não foi possível concluir. Tente novamente.' }

type Resposta = { ok: true } | { ok: true; id: string } | { erro: string }

export default function GestorCursos({ cursos: cursosIniciais }: { cursos: CursoResumo[] }) {
  const router = useRouter()
  const [cursos, setCursos] = useState(cursosIniciais)
  // Sincroniza com o servidor sempre que a página pai reexecuta (router.refresh() depois de
  // toda mutação) — mesma técnica de `EditorEtapas.tsx` (comparação de referência da prop).
  const [cursosDoServidor, setCursosDoServidor] = useState(cursosIniciais)
  if (cursosDoServidor !== cursosIniciais) { setCursosDoServidor(cursosIniciais); setCursos(cursosIniciais) }
  const [novoTitulo, setNovoTitulo] = useState('')
  const [novaCategoria, setNovaCategoria] = useState<CategoriaCurso>('curso')
  const [novoProduto, setNovoProduto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function roda(fn: () => Promise<Resposta>, aoSucesso?: () => void) {
    setErro(null)
    iniciar(async () => {
      const r = await fn()
      if ('erro' in r) setErro(traduz(r.erro))
      else { aoSucesso?.(); router.refresh() }
    })
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const de = cursos.findIndex((c) => c.id === active.id)
    const para = cursos.findIndex((c) => c.id === over.id)
    if (de < 0 || para < 0) return
    const antigo = cursos
    const reordenado = reordenarLista(cursos, de, para)
    setCursos(reordenado)
    const r = await reordenarCursos({ ordemIds: reordenado.map((c) => c.id) })
    if ('erro' in r) { setCursos(antigo); setErro(traduz(r.erro)) }
    else router.refresh()
  }

  function adicionar() {
    if (!novoTitulo.trim() || !novoProduto.trim()) return
    // 🔴 Sem inserção otimista com id fabricado: o id real só existe depois da resposta do
    // servidor. `router.refresh()` (dentro de `roda`) traz a lista com o id de verdade — um id
    // de `crypto.randomUUID()` aqui não bateria com nenhuma linha do banco, e arrastar/publicar/
    // excluir esse item antes do refresh terminar viraria um no-op silencioso no servidor.
    roda(
      () => criarCurso({ titulo: novoTitulo, categoria: novaCategoria, produtoId: novoProduto }),
      () => { setNovoTitulo(''); setNovoProduto('') },
    )
  }

  function alternarPublicado(curso: CursoResumo) {
    roda(
      () => alternarPublicadoCurso({ id: curso.id, publicado: !curso.publicado }),
      () => setCursos((cs) => cs.map((c) => (c.id === curso.id ? { ...c, publicado: !c.publicado } : c))),
    )
  }

  function excluir(id: string) {
    if (!window.confirm('Excluir este curso?')) return
    roda(() => excluirCurso({ id }), () => setCursos((cs) => cs.filter((c) => c.id !== id)))
  }

  return (
    <section className={estilos.painel}>
      <h2 className={estilos.subtitulo}>Seus cursos</h2>
      <p className={estilos.ajuda}>Arraste para reordenar. O identificador de produto é o que entra na lista de produtos de uma oferta.</p>
      {erro && <p className={estilos.erro}>{erro}</p>}

      {cursos.length === 0 ? (
        <p className={estilos.ajuda}>Nenhum curso ainda.</p>
      ) : (
        <DndContext
          id="cursos-lista"
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={{
            announcements: anunciosDeArraste((id) => cursos.find((c) => c.id === id)?.titulo ?? ''),
            screenReaderInstructions: { draggable: INSTRUCAO_DE_ARRASTE },
          }}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={cursos.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <ul className={estilos.lista}>
              {cursos.map((curso) => (
                <LinhaCurso key={curso.id} curso={curso} pendente={pendente}
                  onTogglePublicado={() => alternarPublicado(curso)} onExcluir={() => excluir(curso.id)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <div className={estilos.novoRow}>
        <Entrada value={novoTitulo} placeholder="Título (ex.: Formação de Médium)"
          onChange={(e) => setNovoTitulo(e.target.value)} disabled={pendente} />
        <Selecao value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value as CategoriaCurso)} disabled={pendente}>
          {CATEGORIAS_CURSO.map((c) => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
        </Selecao>
        <Entrada value={novoProduto} placeholder="Identificador do produto (ex.: formacao-medium-2026)"
          onChange={(e) => setNovoProduto(e.target.value)} disabled={pendente} />
        <Botao variante="primario" type="button" carregando={pendente}
          desabilitado={!novoTitulo.trim() || !novoProduto.trim()} onClick={adicionar}>
          <Plus size={15} /> Novo curso
        </Botao>
      </div>
    </section>
  )
}

function LinhaCurso({ curso, pendente, onTogglePublicado, onExcluir }: {
  curso: CursoResumo; pendente: boolean; onTogglePublicado: () => void; onExcluir: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: curso.id, attributes: { roleDescription: PAPEL_ARRASTAVEL } })
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <li ref={setNodeRef} style={style} className={estilos.item}>
      <div className={estilos.itemLinha}>
        <button type="button" className={estilos.grip} aria-label="Arrastar para reordenar" {...attributes} {...listeners}>
          <GripVertical size={16} />
        </button>
        <span className={estilos.itemNome}>
          <Link href={`/cursos/${curso.id}`}>{curso.titulo}</Link>
        </span>
        <span className={estilos.tag}>{rotuloDaCategoria(curso.categoria as 'curso' | 'formacao')}</span>
        <code className={estilos.tag}>{curso.produto_id}</code>
        <span className={estilos.itemAcoes}>
          <Botao variante="fantasma" tamanho="pequeno" carregando={pendente} onClick={onTogglePublicado}>
            {curso.publicado ? 'Despublicar' : 'Publicar'}
          </Botao>
          <Botao variante="fantasma" tamanho="pequeno" tom="erro" carregando={pendente} onClick={onExcluir}>
            Excluir
          </Botao>
        </span>
      </div>
    </li>
  )
}
```

- [ ] **Step 7: Add the "Cursos" nav item**

In `src/components/shell/Rail.tsx`, add `GraduationCap` to the `lucide-react` import on line 3-7:

```ts
import {
  LayoutGrid, LayoutDashboard, Target, CalendarClock, BarChart3,
  Contact, Building2, Settings, Zap, MessageSquare, BookOpen,
  Wallet, FileText, Package, Truck, Receipt, Users,
  Bot, Boxes, ClipboardList, Landmark, Sparkles, Puzzle, Scale, GraduationCap,
} from 'lucide-react'
```

Then, right after the "Cadastros" group's `base-conhecimento` item (so it reads naturally next to the other content-management links) and still inside the `{!soFerramentas && (...)}` block, add a "Conteúdo" section:

```tsx
        <div className={estilos.sec}>Cadastros</div>
        <ItemNav href="/contatos" rotulo="Contatos"><Contact size={16} strokeWidth={2} /></ItemNav>
        <ItemNav href="/empresas" rotulo="Empresas"><Building2 size={16} strokeWidth={2} /></ItemNav>
        {}
        <ItemNav href="/base-conhecimento" rotulo="Base de conhecimento"><BookOpen size={16} strokeWidth={2} /></ItemNav>

        <div className={estilos.sec}>Conteúdo</div>
        <ItemNav href="/cursos" rotulo="Cursos"><GraduationCap size={16} strokeWidth={2} /></ItemNav>

        {}
        <div className={estilos.sec}>Automação e análise</div>
```

(That replaces the existing three lines from `<ItemNav href="/base-conhecimento"...` through the `<div className={estilos.sec}>Automação e análise</div>` line — insert the two new lines between them.)

- [ ] **Step 8: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Manual verification**

Run: `pnpm dev`, sign in as a workspace owner, open `/cursos`.

- Create a course ("Formação de Médium" / Formação / `formacao-medium-2026`) → appears in the list.
- Drag it above/below another course you create → order persists after a page refresh.
- Click "Publicar" → label flips to "Despublicar".
- Click "Excluir" → row disappears (no módulos yet, so deletion is allowed).
- Sign in as a non-owner member (or a comprador, if one exists in this workspace) and hit `/cursos` directly → redirected to `/painel`.
- Confirm "Cursos" appears in the left rail between "Base de conhecimento" and "Automação e análise" for the owner, and is absent for `soFerramentas` users.

- [ ] **Step 10: Commit**

```bash
find . -path ./node_modules -prune -o -path ./.next -prune -o -path ./.git -prune -o -name "* [0-9].*" -print
git add src/server/cursos/acoes.ts src/app/\(app\)/cursos/ src/components/shell/Rail.tsx
git commit -m "$(cat <<'EOF'
Adiciona CRUD de cursos no admin

Lista, cria, edita, publica, reordena por arraste e exclui cursos —
protegido por uma guarda de dono do workspace tanto na rota quanto
dentro de cada server action, já que a ação pode ser chamada
diretamente sem passar pelo layout.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Módulos — server actions e tela `/cursos/[cursoId]`

**Files:**
- Modify: `src/server/cursos/acoes.ts`
- Create: `src/app/(app)/cursos/[cursoId]/page.tsx`
- Create: `src/app/(app)/cursos/[cursoId]/EditorCurso.tsx`
- Create: `src/app/(app)/cursos/[cursoId]/EditorModulos.tsx`

**Interfaces:**
- Consumes: `sessaoAdminCursos` (internal, same file), `CursoDetalhe`, `salvarCurso` (Task 3); `reordenarLista` from Task 2 (`@/lib/cursos/ordenar`).
- Produces (for Task 5):
  - `type ModuloResumo = { id: string; titulo: string; ordem: number; total_aulas: number }`
  - `carregarCursoComModulos(cursoId: string): Promise<(CursoDetalhe & { modulos: ModuloResumo[] }) | null>`
  - `criarModulo(input: { cursoId: string; titulo: string }): Promise<ResId>`
  - `renomearModulo(input: { id: string; titulo: string }): Promise<Res>`
  - `excluirModulo(input: { id: string }): Promise<Res>`
  - `reordenarModulos(input: { cursoId: string; ordemIds: string[] }): Promise<Res>`

- [ ] **Step 1: Append módulo actions to `src/server/cursos/acoes.ts`**

Add these exports at the end of the file (after `reordenarCursos`):

```ts
export type ModuloResumo = { id: string; titulo: string; ordem: number; total_aulas: number }

export async function carregarCursoComModulos(cursoId: string): Promise<(CursoDetalhe & { modulos: ModuloResumo[] }) | null> {
  const { ws } = await sessaoAdminCursos()
  if (!ws) return null
  // admin() em toda leitura de conteúdo: ver o comentário de sessaoAdminCursos().
  const { data: c, error } = await admin()
    .from('cursos')
    .select('id, produto_id, categoria, titulo, publicado, ordem, descricao, capa_url')
    .eq('workspace_id', ws)
    .eq('id', cursoId)
    .maybeSingle()
  if (error) throw error
  if (!c) return null

  const { data: mods } = await admin()
    .from('modulos')
    .select('id, titulo, ordem')
    .eq('workspace_id', ws)
    .eq('curso_id', cursoId)
    .order('ordem')
  const modulos = (mods as { id: string; titulo: string; ordem: number }[] | null) ?? []

  const idsModulo = modulos.map((m) => m.id)
  const cont = new Map<string, number>()
  if (idsModulo.length > 0) {
    const { data: aulas } = await admin().from('aulas').select('modulo_id').eq('workspace_id', ws).in('modulo_id', idsModulo)
    for (const a of (aulas as { modulo_id: string }[] | null) ?? []) cont.set(a.modulo_id, (cont.get(a.modulo_id) ?? 0) + 1)
  }

  return { ...(c as CursoDetalhe), modulos: modulos.map((m) => ({ ...m, total_aulas: cont.get(m.id) ?? 0 })) }
}

export async function criarModulo({ cursoId, titulo }: { cursoId: string; titulo: string }): Promise<ResId> {
  await exigirEngineLiberado()
  const limpo = titulo.trim()
  if (!limpo) return { erro: 'titulo_vazio' }
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    const { data: curso } = await admin().from('cursos').select('id').eq('workspace_id', ws).eq('id', cursoId).maybeSingle()
    if (!curso) return { erro: 'curso_nao_encontrado' }
    const { data: existentes, error: erroOrdem } = await admin().from('modulos').select('ordem').eq('workspace_id', ws).eq('curso_id', cursoId)
    if (erroOrdem) throw erroOrdem
    const ordem = ((existentes as { ordem: number }[] | null) ?? []).reduce((m, l) => Math.max(m, l.ordem), -1) + 1
    const { data, error } = await admin()
      .from('modulos')
      .insert({ workspace_id: ws, curso_id: cursoId, titulo: limpo, ordem })
      .select('id')
      .single()
    if (error) throw error
    return { ok: true, id: (data as { id: string }).id }
  } catch (err) {
    console.error('[cursos] criarModulo', detalheSeguro(err))
    return { erro: 'falha_criar' }
  }
}

export async function renomearModulo({ id, titulo }: { id: string; titulo: string }): Promise<Res> {
  await exigirEngineLiberado()
  const limpo = titulo.trim()
  if (!limpo) return { erro: 'titulo_vazio' }
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    const { error } = await admin().from('modulos').update({ titulo: limpo }).eq('workspace_id', ws).eq('id', id)
    if (error) throw error
    return { ok: true }
  } catch (err) {
    console.error('[cursos] renomearModulo', detalheSeguro(err))
    return { erro: 'falha_renomear' }
  }
}

export async function excluirModulo({ id }: { id: string }): Promise<Res> {
  await exigirEngineLiberado()
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    const { count } = await admin().from('aulas').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).eq('modulo_id', id)
    if ((count ?? 0) > 0) return { erro: 'em_uso' }
    const { error } = await admin().from('modulos').delete().eq('workspace_id', ws).eq('id', id)
    if (error) throw error
    return { ok: true }
  } catch (err) {
    console.error('[cursos] excluirModulo', detalheSeguro(err))
    return { erro: 'falha_excluir' }
  }
}

export async function reordenarModulos({ cursoId, ordemIds }: { cursoId: string; ordemIds: string[] }): Promise<Res> {
  await exigirEngineLiberado()
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    for (let i = 0; i < ordemIds.length; i++) {
      const { error } = await admin().from('modulos').update({ ordem: i })
        .eq('workspace_id', ws).eq('curso_id', cursoId).eq('id', ordemIds[i])
      if (error) throw error
    }
    return { ok: true }
  } catch (err) {
    console.error('[cursos] reordenarModulos', detalheSeguro(err))
    return { erro: 'falha_reordenar' }
  }
}
```

- [ ] **Step 2: Create `/cursos/[cursoId]/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { carregarCursoComModulos } from '@/server/cursos/acoes'
import { rotuloDaCategoria } from '@/lib/cursos/categorias'
import EditorCurso from './EditorCurso'
import EditorModulos from './EditorModulos'
import estilos from '../cursos.module.css'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import { tituloDaPagina } from '@/server/marca'

// 🔴 Título estático, sem chamar carregarCursoComModulos aqui: a mesma função já roda no corpo
// da página (abaixo), e não é cacheada — chamá-la duas vezes dobraria as idas ao banco por
// carregamento. Mesmo padrão de `src/app/(app)/contatos/[id]/page.tsx` e `empresas/[id]/page.tsx`
// (título genérico, sem buscar a entidade em generateMetadata).
export async function generateMetadata() {
  return { title: await tituloDaPagina('Curso') }
}

export default async function CursoPage({ params }: { params: Promise<{ cursoId: string }> }) {
  const { cursoId } = await params
  const curso = await carregarCursoComModulos(cursoId)
  if (!curso) notFound()

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina
        acima={<Link href="/cursos" className={estilos.voltar}><ChevronLeft size={16} strokeWidth={2} />Cursos</Link>}
        titulo={curso.titulo}
        subtitulo={`${rotuloDaCategoria(curso.categoria as 'curso' | 'formacao')} · produto ${curso.produto_id}`}
      />
      <EditorCurso curso={curso} />
      <EditorModulos curso={curso} />
    </div>
  )
}
```

- [ ] **Step 3: Create `EditorCurso.tsx`**

```tsx
'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { salvarCurso, type CursoDetalhe } from '@/server/cursos/acoes'
import { CATEGORIAS_CURSO, type CategoriaCurso } from '@/lib/cursos/categorias'
import Botao from '@/components/ui/Botao'
import { Entrada, Selecao, AreaTexto } from '@/components/ui/Campo'
import estilos from '../cursos.module.css'

const ERRO_PT: Record<string, string> = {
  titulo_vazio: 'Dê um título ao curso.',
  produto_vazio: 'Defina o identificador do produto.',
  produto_duplicado: 'Já existe um curso com esse identificador de produto.',
  categoria_invalida: 'Escolha uma categoria válida.',
  sem_workspace: 'Não foi possível identificar seu espaço de trabalho.',
}
function traduz(e: string) { return ERRO_PT[e] ?? 'Não foi possível concluir. Tente novamente.' }

export default function EditorCurso({ curso }: { curso: CursoDetalhe }) {
  const router = useRouter()
  const [titulo, setTitulo] = useState(curso.titulo)
  const [categoria, setCategoria] = useState<CategoriaCurso>(curso.categoria as CategoriaCurso)
  const [produtoId, setProdutoId] = useState(curso.produto_id)
  const [descricao, setDescricao] = useState(curso.descricao ?? '')
  const [capaUrl, setCapaUrl] = useState(curso.capa_url ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)
  const [pendente, iniciar] = useTransition()

  function salvar() {
    setErro(null)
    setSucesso(false)
    iniciar(async () => {
      const r = await salvarCurso({
        id: curso.id, titulo, categoria, produtoId,
        descricao: descricao.trim() || null, capaUrl: capaUrl.trim() || null, publicado: curso.publicado,
      })
      if ('erro' in r) setErro(traduz(r.erro))
      else { setSucesso(true); router.refresh() }
    })
  }

  return (
    <section className={estilos.painel}>
      <h2 className={estilos.subtitulo}>Detalhes do curso</h2>
      {erro && <p className={estilos.erro}>{erro}</p>}
      {sucesso && <p className={estilos.ajuda}>Salvo.</p>}

      <div className={estilos.campo}>
        <label className={estilos.rotulo} htmlFor="curso-titulo">Título</label>
        <Entrada id="curso-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} disabled={pendente} />
      </div>

      <div className={estilos.campo}>
        <label className={estilos.rotulo} htmlFor="curso-categoria">Categoria</label>
        <Selecao id="curso-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaCurso)} disabled={pendente}>
          {CATEGORIAS_CURSO.map((c) => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
        </Selecao>
      </div>

      <div className={estilos.campo}>
        <label className={estilos.rotulo} htmlFor="curso-produto">Identificador do produto</label>
        <Entrada id="curso-produto" value={produtoId} onChange={(e) => setProdutoId(e.target.value)} disabled={pendente} />
        <p className={estilos.ajuda}>É este id que aparece na lista de produtos de uma oferta, em Configurações → Comercial.</p>
      </div>

      <div className={estilos.campo}>
        <label className={estilos.rotulo} htmlFor="curso-descricao">Descrição</label>
        <AreaTexto id="curso-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={pendente} rows={3} />
      </div>

      <div className={estilos.campo}>
        <label className={estilos.rotulo} htmlFor="curso-capa">URL da capa</label>
        <Entrada id="curso-capa" value={capaUrl} onChange={(e) => setCapaUrl(e.target.value)} placeholder="https://..." disabled={pendente} />
      </div>

      <div className={estilos.linhaForm}>
        <Botao variante="primario" carregando={pendente} desabilitado={!titulo.trim() || !produtoId.trim()} onClick={salvar}>
          Salvar
        </Botao>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Create `EditorModulos.tsx`**

```tsx
'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors,
  closestCenter, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import Link from 'next/link'
import { GripVertical, Plus } from 'lucide-react'
import {
  criarModulo, renomearModulo, excluirModulo, reordenarModulos,
  type CursoDetalhe, type ModuloResumo,
} from '@/server/cursos/acoes'
import { reordenarLista } from '@/lib/cursos/ordenar'
import { anunciosDeArraste, INSTRUCAO_DE_ARRASTE, PAPEL_ARRASTAVEL } from '@/lib/anuncios-de-arraste'
import Botao from '@/components/ui/Botao'
import { Entrada } from '@/components/ui/Campo'
import estilos from '../cursos.module.css'

const ERRO_PT: Record<string, string> = {
  titulo_vazio: 'Dê um título ao módulo.',
  curso_nao_encontrado: 'Curso não encontrado.',
  em_uso: 'Este módulo tem aulas — exclua-as antes de excluir o módulo.',
  sem_workspace: 'Não foi possível identificar seu espaço de trabalho.',
}
function traduz(e: string) { return ERRO_PT[e] ?? 'Não foi possível concluir. Tente novamente.' }

type Resposta = { ok: true } | { ok: true; id: string } | { erro: string }
type CursoComModulos = CursoDetalhe & { modulos: ModuloResumo[] }

export default function EditorModulos({ curso }: { curso: CursoComModulos }) {
  const router = useRouter()
  const [modulos, setModulos] = useState(curso.modulos)
  const [modulosDoServidor, setModulosDoServidor] = useState(curso.modulos)
  if (modulosDoServidor !== curso.modulos) { setModulosDoServidor(curso.modulos); setModulos(curso.modulos) }
  const [novo, setNovo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const [editando, setEditando] = useState<string | null>(null)
  const [nomeEditado, setNomeEditado] = useState('')

  function roda(fn: () => Promise<Resposta>, aoSucesso?: () => void) {
    setErro(null)
    iniciar(async () => {
      const r = await fn()
      if ('erro' in r) setErro(traduz(r.erro))
      else { aoSucesso?.(); router.refresh() }
    })
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const de = modulos.findIndex((m) => m.id === active.id)
    const para = modulos.findIndex((m) => m.id === over.id)
    if (de < 0 || para < 0) return
    const antigo = modulos
    const reordenado = reordenarLista(modulos, de, para)
    setModulos(reordenado)
    const r = await reordenarModulos({ cursoId: curso.id, ordemIds: reordenado.map((m) => m.id) })
    if ('erro' in r) { setModulos(antigo); setErro(traduz(r.erro)) }
    else router.refresh()
  }

  function adicionar() {
    if (!novo.trim()) return
    // Sem id fabricado (mesmo motivo do GestorCursos.tsx da Task 3): router.refresh() dentro de
    // roda() traz a lista com o id real assim que o servidor responde.
    roda(() => criarModulo({ cursoId: curso.id, titulo: novo }), () => setNovo(''))
  }

  function salvarNome(id: string) {
    if (!nomeEditado.trim()) return
    roda(
      () => renomearModulo({ id, titulo: nomeEditado }),
      () => { setModulos((ms) => ms.map((m) => (m.id === id ? { ...m, titulo: nomeEditado } : m))); setEditando(null) },
    )
  }

  function excluir(id: string) {
    if (!window.confirm('Excluir este módulo?')) return
    roda(() => excluirModulo({ id }), () => setModulos((ms) => ms.filter((m) => m.id !== id)))
  }

  return (
    <section className={estilos.painel}>
      <h2 className={estilos.subtitulo}>Módulos</h2>
      <p className={estilos.ajuda}>Arraste para reordenar. Clique num módulo para editar as aulas dele.</p>
      {erro && <p className={estilos.erro}>{erro}</p>}

      {modulos.length === 0 ? (
        <p className={estilos.ajuda}>Nenhum módulo ainda.</p>
      ) : (
        <DndContext
          id="modulos-lista"
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={{
            announcements: anunciosDeArraste((id) => modulos.find((m) => m.id === id)?.titulo ?? ''),
            screenReaderInstructions: { draggable: INSTRUCAO_DE_ARRASTE },
          }}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={modulos.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            <ul className={estilos.lista}>
              {modulos.map((modulo) => (
                <LinhaModulo
                  key={modulo.id}
                  modulo={modulo}
                  cursoId={curso.id}
                  pendente={pendente}
                  editando={editando === modulo.id}
                  nomeEditado={nomeEditado}
                  onIniciarEdicao={() => { setNomeEditado(modulo.titulo); setEditando(modulo.id) }}
                  onMudarNome={setNomeEditado}
                  onSalvarNome={() => salvarNome(modulo.id)}
                  onCancelarEdicao={() => setEditando(null)}
                  onExcluir={() => excluir(modulo.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <div className={estilos.novoRow}>
        <Entrada value={novo} placeholder="Novo módulo (ex.: Fundamentos)"
          onChange={(e) => setNovo(e.target.value)} disabled={pendente}
          onKeyDown={(e) => { if (e.key === 'Enter') adicionar() }} />
        <Botao variante="primario" type="button" carregando={pendente} desabilitado={!novo.trim()} onClick={adicionar}>
          <Plus size={15} /> Adicionar módulo
        </Botao>
      </div>
    </section>
  )
}

function LinhaModulo({ modulo, cursoId, pendente, editando, nomeEditado, onIniciarEdicao, onMudarNome, onSalvarNome, onCancelarEdicao, onExcluir }: {
  modulo: ModuloResumo; cursoId: string; pendente: boolean; editando: boolean; nomeEditado: string
  onIniciarEdicao: () => void; onMudarNome: (v: string) => void; onSalvarNome: () => void
  onCancelarEdicao: () => void; onExcluir: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: modulo.id, attributes: { roleDescription: PAPEL_ARRASTAVEL } })
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <li ref={setNodeRef} style={style} className={estilos.item}>
      <div className={estilos.itemLinha}>
        <button type="button" className={estilos.grip} aria-label="Arrastar para reordenar" {...attributes} {...listeners}>
          <GripVertical size={16} />
        </button>
        {editando ? (
          <Entrada value={nomeEditado} autoFocus onChange={(e) => onMudarNome(e.target.value)} disabled={pendente}
            onKeyDown={(e) => { if (e.key === 'Enter') onSalvarNome(); if (e.key === 'Escape') onCancelarEdicao() }} />
        ) : (
          <span className={estilos.itemNome}>
            <Link href={`/cursos/${cursoId}/${modulo.id}`}>{modulo.titulo}</Link>
          </span>
        )}
        <span className={estilos.tag}>{modulo.total_aulas} aula(s)</span>
        <span className={estilos.itemAcoes}>
          {editando
            ? <Botao variante="fantasma" tamanho="pequeno" carregando={pendente} onClick={onSalvarNome}>Salvar</Botao>
            : <Botao variante="fantasma" tamanho="pequeno" carregando={pendente} onClick={onIniciarEdicao}>Renomear</Botao>}
          <Botao variante="fantasma" tamanho="pequeno" tom="erro" carregando={pendente} onClick={onExcluir}>Excluir</Botao>
        </span>
      </div>
    </li>
  )
}
```

- [ ] **Step 5: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

With `pnpm dev` running, open a course's detail page (`/cursos/<id>`, via the link created in Task 3):

- In "Detalhes do curso", change the título, add a descrição and a capa URL, save → "Salvo." appears; refresh the page and confirm the fields persisted.
- Change the identificador do produto to something already used by another course → rejected with "Já existe um curso com esse identificador de produto."
- Add a module ("Fundamentos") → appears with "0 aula(s)".
- Rename it inline (Enter to save, Escape to cancel) → persists after refresh.
- Create a second module and drag-reorder them → order survives a refresh.
- Try excluding the course from `/cursos` now that it has a module → blocked with "Este curso tem módulos…".
- Excluding an empty module works; excluding one (once Task 5 lets it have aulas) is blocked with "Este módulo tem aulas…".

- [ ] **Step 7: Commit**

```bash
find . -path ./node_modules -prune -o -path ./.next -prune -o -path ./.git -prune -o -name "* [0-9].*" -print
git add src/server/cursos/acoes.ts src/app/\(app\)/cursos/\[cursoId\]/
git commit -m "$(cat <<'EOF'
Adiciona edição do curso e CRUD de módulos dentro dele

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Aulas — server actions e tela `/cursos/[cursoId]/[moduloId]`

**Files:**
- Modify: `src/server/cursos/acoes.ts`
- Create: `src/app/(app)/cursos/[cursoId]/[moduloId]/page.tsx`
- Create: `src/app/(app)/cursos/[cursoId]/[moduloId]/EditorAulas.tsx`

**Interfaces:**
- Consumes: `sessaoAdminCursos` (internal), `extrairIdYoutube` (Task 2, `@/lib/cursos/youtube`), `reordenarLista` (Task 2, `@/lib/cursos/ordenar`).
- Produces:
  - `type AulaItem = { id: string; titulo: string; descricao: string | null; video_youtube_id: string | null; publicado: boolean; ordem: number }`
  - `type ModuloComAulas = { id: string; curso_id: string; curso_titulo: string; titulo: string; aulas: AulaItem[] }`
  - `carregarModuloComAulas(moduloId: string): Promise<ModuloComAulas | null>`
  - `criarAula(input: { moduloId: string; titulo: string }): Promise<ResId>`
  - `salvarAula(input: { id: string; titulo: string; descricao: string | null; videoYoutubeId: string | null; publicado: boolean }): Promise<Res>`
  - `excluirAula(input: { id: string }): Promise<Res>`
  - `reordenarAulas(input: { moduloId: string; ordemIds: string[] }): Promise<Res>`

- [ ] **Step 1: Append aula actions to `src/server/cursos/acoes.ts`**

```ts
export type AulaItem = {
  id: string; titulo: string; descricao: string | null; video_youtube_id: string | null; publicado: boolean; ordem: number
}
export type ModuloComAulas = { id: string; curso_id: string; curso_titulo: string; titulo: string; aulas: AulaItem[] }

export async function carregarModuloComAulas(moduloId: string): Promise<ModuloComAulas | null> {
  const { ws } = await sessaoAdminCursos()
  if (!ws) return null
  // admin() em toda leitura de conteúdo: ver o comentário de sessaoAdminCursos().
  const { data: mo, error } = await admin()
    .from('modulos')
    .select('id, curso_id, titulo, cursos(titulo)')
    .eq('workspace_id', ws)
    .eq('id', moduloId)
    .maybeSingle()
  if (error) throw error
  if (!mo) return null

  const linha = mo as { id: string; curso_id: string; titulo: string; cursos: { titulo: string } | { titulo: string }[] | null }
  const cursoTitulo = Array.isArray(linha.cursos) ? (linha.cursos[0]?.titulo ?? '') : (linha.cursos?.titulo ?? '')

  const { data: aulas } = await admin()
    .from('aulas')
    .select('id, titulo, descricao, video_youtube_id, publicado, ordem')
    .eq('workspace_id', ws)
    .eq('modulo_id', moduloId)
    .order('ordem')

  return {
    id: linha.id, curso_id: linha.curso_id, curso_titulo: cursoTitulo, titulo: linha.titulo,
    aulas: (aulas as AulaItem[] | null) ?? [],
  }
}

export async function criarAula({ moduloId, titulo }: { moduloId: string; titulo: string }): Promise<ResId> {
  await exigirEngineLiberado()
  const limpo = titulo.trim()
  if (!limpo) return { erro: 'titulo_vazio' }
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    const { data: modulo } = await admin().from('modulos').select('id').eq('workspace_id', ws).eq('id', moduloId).maybeSingle()
    if (!modulo) return { erro: 'modulo_nao_encontrado' }
    const { data: existentes, error: erroOrdem } = await admin().from('aulas').select('ordem').eq('workspace_id', ws).eq('modulo_id', moduloId)
    if (erroOrdem) throw erroOrdem
    const ordem = ((existentes as { ordem: number }[] | null) ?? []).reduce((m, l) => Math.max(m, l.ordem), -1) + 1
    const { data, error } = await admin()
      .from('aulas')
      .insert({ workspace_id: ws, modulo_id: moduloId, titulo: limpo, ordem })
      .select('id')
      .single()
    if (error) throw error
    return { ok: true, id: (data as { id: string }).id }
  } catch (err) {
    console.error('[cursos] criarAula', detalheSeguro(err))
    return { erro: 'falha_criar' }
  }
}

export async function salvarAula({ id, titulo, descricao, videoYoutubeId, publicado }: {
  id: string; titulo: string; descricao: string | null; videoYoutubeId: string | null; publicado: boolean
}): Promise<Res> {
  await exigirEngineLiberado()
  const limpo = titulo.trim()
  if (!limpo) return { erro: 'titulo_vazio' }
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    const { error } = await admin()
      .from('aulas')
      .update({ titulo: limpo, descricao, video_youtube_id: videoYoutubeId, publicado })
      .eq('workspace_id', ws)
      .eq('id', id)
    if (error) throw error
    return { ok: true }
  } catch (err) {
    console.error('[cursos] salvarAula', detalheSeguro(err))
    return { erro: 'falha_salvar' }
  }
}

export async function excluirAula({ id }: { id: string }): Promise<Res> {
  await exigirEngineLiberado()
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    const { error } = await admin().from('aulas').delete().eq('workspace_id', ws).eq('id', id)
    if (error) throw error
    return { ok: true }
  } catch (err) {
    console.error('[cursos] excluirAula', detalheSeguro(err))
    return { erro: 'falha_excluir' }
  }
}

export async function reordenarAulas({ moduloId, ordemIds }: { moduloId: string; ordemIds: string[] }): Promise<Res> {
  await exigirEngineLiberado()
  const { ws } = await sessaoAdminCursos()
  if (!ws) return { erro: 'sem_workspace' }
  try {
    for (let i = 0; i < ordemIds.length; i++) {
      const { error } = await admin().from('aulas').update({ ordem: i })
        .eq('workspace_id', ws).eq('modulo_id', moduloId).eq('id', ordemIds[i])
      if (error) throw error
    }
    return { ok: true }
  } catch (err) {
    console.error('[cursos] reordenarAulas', detalheSeguro(err))
    return { erro: 'falha_reordenar' }
  }
}
```

- [ ] **Step 2: Create `/cursos/[cursoId]/[moduloId]/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { carregarModuloComAulas } from '@/server/cursos/acoes'
import EditorAulas from './EditorAulas'
import estilos from '../../cursos.module.css'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import { tituloDaPagina } from '@/server/marca'

// 🔴 Título estático, mesmo motivo do page.tsx de Task 4: carregarModuloComAulas não é cacheada,
// e o corpo da página já a chama uma vez — chamar de novo aqui dobraria as idas ao banco.
export async function generateMetadata() {
  return { title: await tituloDaPagina('Módulo') }
}

export default async function ModuloPage({ params }: { params: Promise<{ cursoId: string; moduloId: string }> }) {
  const { cursoId, moduloId } = await params
  const modulo = await carregarModuloComAulas(moduloId)
  if (!modulo || modulo.curso_id !== cursoId) notFound()

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina
        acima={<Link href={`/cursos/${cursoId}`} className={estilos.voltar}><ChevronLeft size={16} strokeWidth={2} />{modulo.curso_titulo}</Link>}
        titulo={modulo.titulo}
        subtitulo="Aulas deste módulo"
      />
      <EditorAulas modulo={modulo} />
    </div>
  )
}
```

- [ ] **Step 3: Create `EditorAulas.tsx`**

```tsx
'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors,
  closestCenter, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { GripVertical, Plus } from 'lucide-react'
import {
  criarAula, salvarAula, excluirAula, reordenarAulas, type AulaItem, type ModuloComAulas,
} from '@/server/cursos/acoes'
import { extrairIdYoutube } from '@/lib/cursos/youtube'
import { reordenarLista } from '@/lib/cursos/ordenar'
import { anunciosDeArraste, INSTRUCAO_DE_ARRASTE, PAPEL_ARRASTAVEL } from '@/lib/anuncios-de-arraste'
import Botao from '@/components/ui/Botao'
import { Entrada, AreaTexto } from '@/components/ui/Campo'
import estilos from '../../cursos.module.css'

const ERRO_PT: Record<string, string> = {
  titulo_vazio: 'Dê um título à aula.',
  modulo_nao_encontrado: 'Módulo não encontrado.',
  sem_workspace: 'Não foi possível identificar seu espaço de trabalho.',
}
function traduz(e: string) { return ERRO_PT[e] ?? 'Não foi possível concluir. Tente novamente.' }

type Resposta = { ok: true } | { ok: true; id: string } | { erro: string }

export default function EditorAulas({ modulo }: { modulo: ModuloComAulas }) {
  const router = useRouter()
  const [aulas, setAulas] = useState(modulo.aulas)
  const [aulasDoServidor, setAulasDoServidor] = useState(modulo.aulas)
  if (aulasDoServidor !== modulo.aulas) { setAulasDoServidor(modulo.aulas); setAulas(modulo.aulas) }
  const [novo, setNovo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const [abertaId, setAbertaId] = useState<string | null>(null)

  function roda(fn: () => Promise<Resposta>, aoSucesso?: () => void) {
    setErro(null)
    iniciar(async () => {
      const r = await fn()
      if ('erro' in r) setErro(traduz(r.erro))
      else { aoSucesso?.(); router.refresh() }
    })
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const de = aulas.findIndex((a) => a.id === active.id)
    const para = aulas.findIndex((a) => a.id === over.id)
    if (de < 0 || para < 0) return
    const antigo = aulas
    const reordenado = reordenarLista(aulas, de, para)
    setAulas(reordenado)
    const r = await reordenarAulas({ moduloId: modulo.id, ordemIds: reordenado.map((a) => a.id) })
    if ('erro' in r) { setAulas(antigo); setErro(traduz(r.erro)) }
    else router.refresh()
  }

  function adicionar() {
    if (!novo.trim()) return
    // Sem id fabricado (mesmo motivo do GestorCursos.tsx da Task 3): router.refresh() dentro de
    // roda() traz a lista com o id real assim que o servidor responde.
    roda(() => criarAula({ moduloId: modulo.id, titulo: novo }), () => setNovo(''))
  }

  function excluir(id: string) {
    if (!window.confirm('Excluir esta aula?')) return
    roda(() => excluirAula({ id }), () => setAulas((as) => as.filter((a) => a.id !== id)))
  }

  function salvar(aula: AulaItem, campos: Partial<Pick<AulaItem, 'titulo' | 'descricao' | 'video_youtube_id' | 'publicado'>>) {
    const atualizada = { ...aula, ...campos }
    roda(
      () => salvarAula({
        id: aula.id, titulo: atualizada.titulo, descricao: atualizada.descricao,
        videoYoutubeId: atualizada.video_youtube_id, publicado: atualizada.publicado,
      }),
      () => setAulas((as) => as.map((a) => (a.id === aula.id ? atualizada : a))),
    )
  }

  return (
    <section className={estilos.painel}>
      <h2 className={estilos.subtitulo}>Aulas</h2>
      <p className={estilos.ajuda}>Arraste para reordenar. Cole o link do YouTube (ou só o id) em cada aula.</p>
      {erro && <p className={estilos.erro}>{erro}</p>}

      {aulas.length === 0 ? (
        <p className={estilos.ajuda}>Nenhuma aula ainda.</p>
      ) : (
        <DndContext
          id="aulas-lista"
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={{
            announcements: anunciosDeArraste((id) => aulas.find((a) => a.id === id)?.titulo ?? ''),
            screenReaderInstructions: { draggable: INSTRUCAO_DE_ARRASTE },
          }}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={aulas.map((a) => a.id)} strategy={verticalListSortingStrategy}>
            <ul className={estilos.lista}>
              {aulas.map((aula) => (
                <LinhaAula
                  key={aula.id}
                  aula={aula}
                  pendente={pendente}
                  aberta={abertaId === aula.id}
                  onAbrir={() => setAbertaId(abertaId === aula.id ? null : aula.id)}
                  onSalvar={(campos) => salvar(aula, campos)}
                  onExcluir={() => excluir(aula.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <div className={estilos.novoRow}>
        <Entrada value={novo} placeholder="Nova aula (ex.: Aula 1 — Introdução)"
          onChange={(e) => setNovo(e.target.value)} disabled={pendente}
          onKeyDown={(e) => { if (e.key === 'Enter') adicionar() }} />
        <Botao variante="primario" type="button" carregando={pendente} desabilitado={!novo.trim()} onClick={adicionar}>
          <Plus size={15} /> Adicionar aula
        </Botao>
      </div>
    </section>
  )
}

function LinhaAula({ aula, pendente, aberta, onAbrir, onSalvar, onExcluir }: {
  aula: AulaItem; pendente: boolean; aberta: boolean
  onSalvar: (campos: Partial<Pick<AulaItem, 'titulo' | 'descricao' | 'video_youtube_id' | 'publicado'>>) => void
  onAbrir: () => void; onExcluir: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: aula.id, attributes: { roleDescription: PAPEL_ARRASTAVEL } })
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const [titulo, setTitulo] = useState(aula.titulo)
  const [descricao, setDescricao] = useState(aula.descricao ?? '')
  const [linkVideo, setLinkVideo] = useState(aula.video_youtube_id ?? '')

  function salvarCampos() {
    onSalvar({ titulo, descricao: descricao.trim() || null, video_youtube_id: extrairIdYoutube(linkVideo) })
  }

  return (
    <li ref={setNodeRef} style={style} className={estilos.item}>
      <div className={estilos.itemLinha}>
        <button type="button" className={estilos.grip} aria-label="Arrastar para reordenar" {...attributes} {...listeners}>
          <GripVertical size={16} />
        </button>
        <span className={estilos.itemNome}>{aula.titulo}</span>
        {!aula.publicado && <span className={estilos.tag}>rascunho</span>}
        <span className={estilos.itemAcoes}>
          <Botao variante="fantasma" tamanho="pequeno" onClick={onAbrir}>{aberta ? 'Fechar' : 'Editar'}</Botao>
          <Botao variante="fantasma" tamanho="pequeno" carregando={pendente} onClick={() => onSalvar({ publicado: !aula.publicado })}>
            {aula.publicado ? 'Despublicar' : 'Publicar'}
          </Botao>
          <Botao variante="fantasma" tamanho="pequeno" tom="erro" carregando={pendente} onClick={onExcluir}>Excluir</Botao>
        </span>
      </div>

      {aberta && (
        <div className={estilos.campo} style={{ paddingBottom: 'var(--s-4)' }}>
          <label className={estilos.rotulo} htmlFor={`aula-titulo-${aula.id}`}>Título</label>
          <Entrada id={`aula-titulo-${aula.id}`} value={titulo} onChange={(e) => setTitulo(e.target.value)} disabled={pendente} />

          <label className={estilos.rotulo} htmlFor={`aula-descricao-${aula.id}`}>Descrição</label>
          <AreaTexto id={`aula-descricao-${aula.id}`} value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={pendente} rows={3} />

          <label className={estilos.rotulo} htmlFor={`aula-video-${aula.id}`}>Link ou id do vídeo no YouTube</label>
          <Entrada id={`aula-video-${aula.id}`} value={linkVideo} onChange={(e) => setLinkVideo(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..." disabled={pendente} />
          {extrairIdYoutube(linkVideo) && (
            <iframe
              className={estilos.videoPreview}
              src={`https://www.youtube.com/embed/${extrairIdYoutube(linkVideo)}`}
              title="Pré-visualização do vídeo"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          )}
          {linkVideo.trim() && !extrairIdYoutube(linkVideo) && <p className={estilos.erro}>Não reconheci um vídeo do YouTube nesse link.</p>}

          <div className={estilos.linhaForm}>
            <Botao variante="primario" carregando={pendente} desabilitado={!titulo.trim()} onClick={salvarCampos}>Salvar</Botao>
          </div>
        </div>
      )}
    </li>
  )
}
```

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

With `pnpm dev` running, open a module's page (`/cursos/<cursoId>/<moduloId>`):

- Add an aula ("Aula 1 — Introdução") → appears marked "rascunho".
- Click "Editar", paste `https://www.youtube.com/watch?v=dQw4w9WgXcQ` in the video field → the preview iframe appears; save.
- Reload the page → title, description, and video persisted.
- Paste `https://vimeo.com/12345` instead → the "Não reconheci um vídeo do YouTube" message shows and no preview appears.
- Click "Publicar" → label flips to "Despublicar" and the "rascunho" tag disappears.
- Drag-reorder two aulas → order survives a refresh.
- Go back to the module list (Task 4's page) → "aula(s)" count reflects the new aulas.
- Try excluding the module now → blocked with "Este módulo tem aulas…"; delete the aulas first, then excluding the module works.

- [ ] **Step 6: Commit**

```bash
find . -path ./node_modules -prune -o -path ./.next -prune -o -path ./.git -prune -o -name "* [0-9].*" -print
git add src/server/cursos/acoes.ts "src/app/(app)/cursos/[cursoId]/[moduloId]/"
git commit -m "$(cat <<'EOF'
Adiciona CRUD de aulas com vídeo do YouTube

Aceita link completo ou id puro (src/lib/cursos/youtube.ts), com
pré-visualização inline antes de salvar.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Integração com Ofertas — cursos aparecem como produto vendável

**Files:**
- Modify: `src/app/(app)/config/acoes-comercial.ts`

**Interfaces:**
- Consumes: `admin` (already imported); no new imports needed beyond what's already in the file.
- Produces: `VistaComercial.produtos` now includes cursos alongside `PRODUTOS`; `salvarOferta` accepts a course's `produto_id` as valid.

- [ ] **Step 1: Read the current `produtos` line and `OfertaSchema`**

Confirm the two spots to change (from the file already read in full during planning):
- `lerComercial()`'s return statement: `produtos: PRODUTOS.map((p) => ({ id: p.id, rotulo: p.rotulo })),`
- `OfertaSchema`: `produtos: z.array(z.string().refine(ehProdutoConhecido)).min(1).max(50),`

- [ ] **Step 2: Add a helper that resolves every valid product id for a workspace**

In `src/app/(app)/config/acoes-comercial.ts`, add this function right after `workspaceDoOwner()` (which already exists in the file):

```ts
async function idsDeProdutoValidos(ws: string): Promise<Set<string>> {
  const { data, error } = await admin().from('cursos').select('produto_id').eq('workspace_id', ws)
  if (error) throw error
  const idsCursos = ((data ?? []) as { produto_id: string }[]).map((c) => c.produto_id)
  return new Set([...PRODUTOS.map((p) => p.id), ...idsCursos])
}
```

- [ ] **Step 3: Extend `lerComercial()`'s product list**

Replace this line inside `lerComercial()`'s `return { ... }`:

```ts
      produtos: PRODUTOS.map((p) => ({ id: p.id, rotulo: p.rotulo })),
```

with:

```ts
      produtos: [
        ...PRODUTOS.map((p) => ({ id: p.id, rotulo: p.rotulo })),
        ...((cursosDoWorkspace ?? []) as { produto_id: string; titulo: string }[]).map((c) => ({ id: c.produto_id, rotulo: c.titulo })),
      ],
```

And, earlier in the same function, insert the query that fills `cursosDoWorkspace` right after the existing `eventos` query — i.e. change:

```ts
    const { data: eventos, error: erroEventos } = await consultaEventos
      .order('recebido_em', { ascending: false })
      .limit(50)
    if (erroEventos) throw erroEventos

    const listaVendas = (vendas ?? []) as LinhaVenda[]
```

to:

```ts
    const { data: eventos, error: erroEventos } = await consultaEventos
      .order('recebido_em', { ascending: false })
      .limit(50)
    if (erroEventos) throw erroEventos

    const { data: cursosDoWorkspace, error: erroCursos } = await db
      .from('cursos')
      .select('produto_id, titulo')
      .eq('workspace_id', ws)
    if (erroCursos) throw erroCursos

    const listaVendas = (vendas ?? []) as LinhaVenda[]
```

- [ ] **Step 4: Relax and re-validate the `produtos` field in `salvarOferta`**

Change `OfertaSchema` from:

```ts
const OfertaSchema = z.object({
  id: Uuid.optional(),
  codigo: z.string().trim().min(1).max(200),
  nome: z.string().trim().min(1).max(200),
  produtos: z.array(z.string().refine(ehProdutoConhecido)).min(1).max(50),
  duracao: z.enum(DURACOES),
  ativa: z.boolean(),
})
```

to:

```ts
const OfertaSchema = z.object({
  id: Uuid.optional(),
  codigo: z.string().trim().min(1).max(200),
  nome: z.string().trim().min(1).max(200),
  produtos: z.array(z.string().min(1)).min(1).max(50),
  duracao: z.enum(DURACOES),
  ativa: z.boolean(),
})
```

Then, inside `salvarOferta`, right after `const { id, ...campos } = r.data`, add the async check that replaces what `.refine(ehProdutoConhecido)` used to guarantee synchronously:

```ts
export async function salvarOferta(entrada: unknown): Promise<Resposta> {
  await exigirEngineLiberado()
  const ws = await workspaceDoOwner()
  if (!ws) return { erro: NAO_AUTORIZADO }
  const r = OfertaSchema.safeParse(entrada)
  if (!r.success) return { erro: 'Confira o código, o nome, os produtos e a duração da oferta.' }

  const { id, ...campos } = r.data
  const validos = await idsDeProdutoValidos(ws)
  if (!campos.produtos.every((p) => validos.has(p))) return { erro: 'Um dos produtos escolhidos não existe.' }
  const dados = { ...campos, produtos: [...new Set(campos.produtos)], plataforma: 'hotmart' }
  const db = admin()
  const { data, error } = id
    ? await db.from('ofertas').update(dados).eq('workspace_id', ws).eq('id', id).select('id')
    : await db.from('ofertas').insert({ ...dados, workspace_id: ws }).select('id')
  if (error) {
    return { erro: error.code === '23505' ? 'Este código de oferta já está cadastrado.' : 'Não foi possível salvar a oferta.' }
  }
  if (!data?.length) return { erro: 'Oferta não encontrada.' }
  return { ok: true }
}
```

(Only the two new lines — `const validos = ...` and the `if (!campos.produtos.every...)` — are added; the rest of the function is unchanged, shown here for placement clarity.)

- [ ] **Step 5: `ehProdutoConhecido` import is now only used in `lerComercial`'s `vendas` mapping — confirm it's still imported**

The existing line `import { PRODUTOS, ehProdutoConhecido, rotuloDoProduto } from '@/lib/produtos/catalogo'` stays as-is — `ehProdutoConhecido` is still used later in the file (`v.produtos.filter(ehProdutoConhecido)` inside the `vendas` mapping, to label known calculator-engine products by name). Do not remove the import.

- [ ] **Step 6: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual verification**

With `pnpm dev` running and at least one course created (Task 3):

- Open Configurações → Comercial → Ofertas → "Nova oferta".
- Confirm the "Produtos que esta oferta libera" checklist shows both the calculator product and your test course.
- Save an offer with the course checked → succeeds.
- Directly call `salvarOferta` with a made-up `produtos: ['inventado-123']` (e.g. via the browser devtools console on the page, or temporarily checking a nonexistent id) → rejected with "Um dos produtos escolhidos não existe." — confirms the async check actually runs (this replaces the compile-time-only guarantee `ehProdutoConhecido` used to give for the calculator).

- [ ] **Step 8: Commit**

```bash
find . -path ./node_modules -prune -o -path ./.next -prune -o -path ./.git -prune -o -name "* [0-9].*" -print
git add src/app/\(app\)/config/acoes-comercial.ts
git commit -m "$(cat <<'EOF'
Deixa cursos apareceram como produto vendável nas ofertas da Hotmart

produtos passa a listar PRODUTOS (motores) + cursos do workspace; a
validação de produto_id na oferta vira uma checagem contra o banco, já
que curso não é mais um id fechado em código como PRODUTOS.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Verificação manual de ponta a ponta

**Files:** nenhum (só verificação — sem código novo).

- [ ] **Step 1: Rodar a suíte inteira**

Run: `pnpm test`
Expected: todos os testes passam, incluindo `tests/cursos/*`, `tests/migracoes/idempotencia.spec.ts` com `0066_cursos.sql`, e nenhuma regressão em `tests/vendas/*`.

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: build limpo. Se `next-env.d.ts` aparecer modificado em `git status` depois, rode `git checkout -- next-env.d.ts` (não é para commitar).

- [ ] **Step 3: Roteiro manual — do curso à venda**

Com `pnpm dev` no ar e um usuário dono de workspace logado:

1. Em `/cursos`, crie um curso "Formação de Médium" (Formação, produto `formacao-medium-2026`), publique-o.
2. Nele, crie o módulo "Boas-vindas", e dentro dele a aula "Aula 1" com um vídeo do YouTube válido; publique a aula.
3. Em Configurações → Comercial, cadastre uma oferta de teste (código qualquer, ex. `teste-formacao-01`) marcando o produto `formacao-medium-2026`, duração mensal, ativa.
4. Simule uma compra aprovada pelo webhook, seguindo o roteiro de `docs/superpowers/ESTADO-vendas-hotmart.md` (`enviar PURCHASE_APPROVED ...` com `OFERTA=teste-formacao-01`) apontando para um e-mail de teste novo.
5. Confirme no banco (SQL editor do Supabase) que:
   - existe uma linha em `vendas` com `produtos` contendo `formacao-medium-2026` e `status = 'ativa'`;
   - existe uma linha em `vendas_periodos` para esse `produto_id`, com `inicia_em` no passado e `expira_em` no futuro (ou nulo).
6. Ainda no SQL editor, autentique como esse membro (ou use `set role authenticated; set request.jwt.claims = '...'` com o `user_id` dele) e confirme que `select * from cursos where produto_id = 'formacao-medium-2026'` devolve a linha — provando que a policy `cursos_membro_select` da Task 1 realmente libera o curso para quem comprou. Repita para `modulos` e `aulas`.
7. Limpe os dados de teste (curso, oferta, venda, membro) antes de considerar isso pronto para produção, do mesmo jeito que o roteiro de `ESTADO-vendas-hotmart.md` já recomenda para os testes da calculadora.

- [ ] **Step 4: Registrar o resultado**

Se tudo passou, não é necessário nenhum commit novo — esta tarefa é só a prova de que as Tasks 1–6, juntas, entregam o Sub-projeto A por completo. Se algo falhar, volte à task correspondente, corrija, e rode novamente os testes automatizados dela antes de repetir o roteiro manual.
