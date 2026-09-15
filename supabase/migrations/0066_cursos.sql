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

-- 🔴 SECURITY DEFINER: uma policy que faz join com vendas/vendas_periodos sem isto nunca bate,
-- porque authenticated não tem policy de leitura ampla nessas duas tabelas (só service_role,
-- migration 0064) — a subquery dentro da policy também roda sob a RLS de quem chama. Mesmo padrão
-- de e_membro()/e_owner() em 0005_rls_rpcs.sql.
create or replace function public.tem_acesso_ao_produto(ws uuid, produto text)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1
    from public.membros m
    join public.vendas_periodos vp on vp.workspace_id = m.workspace_id and vp.membro_id = m.id
    join public.vendas v on v.id = vp.venda_id
    where m.user_id = auth.uid()
      and vp.workspace_id = ws
      and vp.produto_id = produto
      and v.status = 'ativa'
      and vp.inicia_em <= now()
      and (vp.expira_em is null or vp.expira_em > now())
  );
$$;
revoke all on function public.tem_acesso_ao_produto(uuid, text) from public, anon;
grant execute on function public.tem_acesso_ao_produto(uuid, text) to authenticated, service_role;

-- Leitura por authenticated: só o que o membro tem direito de ver — curso/aula publicados, com
-- período de acesso ativo para aquele produto_id. Mesma régua de estadoDeAcesso()
-- (src/lib/vendas/acesso.ts), só que como policy SQL — é o que o app do membro (Sub-projeto B/C)
-- vai usar para ler direto do Supabase.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cursos' and policyname = 'cursos_membro_select') then
    create policy cursos_membro_select on public.cursos for select to authenticated using (
      publicado = true and public.tem_acesso_ao_produto(workspace_id, produto_id)
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'modulos' and policyname = 'modulos_membro_select') then
    create policy modulos_membro_select on public.modulos for select to authenticated using (
      exists (
        select 1 from public.cursos c
        where c.id = modulos.curso_id
          and c.workspace_id = modulos.workspace_id
          and c.publicado = true
          and public.tem_acesso_ao_produto(c.workspace_id, c.produto_id)
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
        select 1 from public.modulos mo
        join public.cursos c on c.id = mo.curso_id and c.workspace_id = mo.workspace_id
        where mo.id = aulas.modulo_id
          and mo.workspace_id = aulas.workspace_id
          and c.publicado = true
          and public.tem_acesso_ao_produto(c.workspace_id, c.produto_id)
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
