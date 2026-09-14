-- 0064_vendas_e_ofertas.sql — identidade do comprador, ofertas, vendas por período e auditoria
-- dos webhooks de compra.
--
-- ⚠️ ADITIVA E IDEMPOTENTE. Migration que falha = container que NÃO SOBE, em toda instalação.
-- Nada apaga dado. A guarda em tests/migracoes/idempotencia.spec.ts confere as regras.

-- == membros: identidade do comprador =========================================================
alter table public.membros add column if not exists cpf_cnpj text;
alter table public.membros add column if not exists nome text;
alter table public.membros add column if not exists senha_temporaria_hash text;
alter table public.membros add column if not exists senha_temporaria_expira_em timestamptz;

-- Único POR workspace, e só entre quem tem documento: vários membros sem documento convivem.
create unique index if not exists membros_cpf_cnpj_key
  on public.membros (workspace_id, cpf_cnpj) where cpf_cnpj is not null;

-- Só dígitos (CPF) ou o CNPJ alfanumérico da Receita: 12 alfanuméricos + 2 dígitos.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'membros_cpf_cnpj_formato_check' and conrelid = 'public.membros'::regclass
  ) then
    alter table public.membros add constraint membros_cpf_cnpj_formato_check
      check (cpf_cnpj is null or cpf_cnpj ~ '^([0-9]{11}|[0-9A-Z]{12}[0-9]{2})$');
  end if;
end $$;

-- 🔴 O HASH DA SENHA TEMPORÁRIA NÃO PODE SER LEGÍVEL PELO NAVEGADOR. A policy membros_sel (0005)
-- deixa qualquer membro ler as linhas dos outros membros do workspace. Com `select` de tabela,
-- o hash de todos sairia pelo console. Troca-se por `select` coluna a coluna.
-- ⚠️ Coluna nova que o navegador precise ler tem de entrar nesta lista.
revoke select on table public.membros from anon, authenticated;
grant select (id, workspace_id, user_id, papel, criado_em, nome, cpf_cnpj)
  on table public.membros to authenticated;

-- == fila de e-mail: chave de idempotência ====================================================
-- Índice NÃO parcial: NULL continua repetível no Postgres, e o índice serve a ON CONFLICT.
alter table public.emails_fila add column if not exists chave_evento text;
create unique index if not exists emails_fila_chave_evento_key on public.emails_fila (chave_evento);

-- == ofertas ==================================================================================
create table if not exists public.ofertas (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  plataforma    text not null default 'hotmart',
  codigo        text not null,
  nome          text not null,
  produtos      text[] not null,
  duracao       text not null,
  ativa         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint ofertas_plataforma_dominio_check check (plataforma in ('hotmart')),
  constraint ofertas_duracao_dominio_check
    check (duracao in ('semanal','quinzenal','mensal','trimestral','semestral','anual','vitalicio')),
  constraint ofertas_produtos_preenchidos_check check (cardinality(produtos) > 0)
);

-- 🔴 Global, não por workspace: é a oferta que diz ao webhook de que workspace é a compra.
create unique index if not exists ofertas_plataforma_codigo_key on public.ofertas (plataforma, codigo);

-- == vendas ===================================================================================
-- `produtos` e `duracao` são a FOTOGRAFIA da oferta no dia da compra (§7.4).
create table if not exists public.vendas (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references public.workspaces(id) on delete cascade,
  membro_id            uuid not null,
  oferta_id            uuid not null references public.ofertas(id) on delete restrict,
  plataforma           text not null,
  transacao            text not null,
  status               text not null default 'ativa',
  produtos             text[] not null,
  produtos_novos       text[] not null default '{}',
  duracao              text not null,
  aprovada_em          timestamptz not null,
  valor                numeric(12,2),
  moeda                text,
  encerrada_em         timestamptz,
  notificacao_pendente boolean not null default true,
  observacao           text,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  constraint vendas_status_dominio_check
    check (status in ('ativa','cancelada','reembolsada','chargeback')),
  constraint vendas_duracao_dominio_check
    check (duracao in ('semanal','quinzenal','mensal','trimestral','semestral','anual','vitalicio')),
  constraint vendas_produtos_preenchidos_check check (cardinality(produtos) > 0)
);

-- 🔴 A peça central: o reenvio da Hotmart vira no-op em vez de uma segunda venda.
create unique index if not exists vendas_plataforma_transacao_key on public.vendas (plataforma, transacao);
-- Alvo da FK composta de vendas_periodos.
create unique index if not exists vendas_workspace_membro_id_key on public.vendas (workspace_id, membro_id, id);

-- FK composta: a venda não pode apontar para membro de outro workspace.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vendas_membro_fk' and conrelid = 'public.vendas'::regclass
  ) then
    alter table public.vendas add constraint vendas_membro_fk
      foreign key (workspace_id, membro_id) references public.membros (workspace_id, id) on delete cascade;
  end if;
end $$;

-- == períodos de acesso, um por produto de cada venda =========================================
create table if not exists public.vendas_periodos (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  membro_id    uuid not null,
  venda_id     uuid not null,
  produto_id   text not null,
  inicia_em    timestamptz not null,
  expira_em    timestamptz,
  constraint vendas_periodos_intervalo_check check (expira_em is null or expira_em > inicia_em)
);

create unique index if not exists vendas_periodos_venda_produto_key on public.vendas_periodos (venda_id, produto_id);
create index if not exists vendas_periodos_acesso_idx on public.vendas_periodos (workspace_id, membro_id, produto_id);

-- O período pertence ao mesmo membro e workspace da venda de que nasceu.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vendas_periodos_venda_fk' and conrelid = 'public.vendas_periodos'::regclass
  ) then
    alter table public.vendas_periodos add constraint vendas_periodos_venda_fk
      foreign key (workspace_id, membro_id, venda_id)
      references public.vendas (workspace_id, membro_id, id) on delete cascade;
  end if;
end $$;

-- == auditoria dos webhooks de compra =========================================================
-- Gravado ANTES de processar. workspace_id nasce nulo: antes de a oferta resolver, não se sabe
-- de quem é a compra.
create table if not exists public.webhook_compras_recebidas (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid references public.workspaces(id) on delete cascade,
  plataforma    text not null,
  event_id      text,
  evento        text,
  transacao     text,
  payload       jsonb not null,
  recebido_em   timestamptz not null default now(),
  processado_em timestamptz,
  resultado     text,
  detalhe       text
);

-- Não parcial, pelo mesmo motivo de emails_fila_chave_evento_key.
create unique index if not exists webhook_compras_evento_key on public.webhook_compras_recebidas (plataforma, event_id);
create index if not exists webhook_compras_transacao_idx on public.webhook_compras_recebidas (plataforma, transacao);

-- == gatilhos de atualizado_em ================================================================
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'ofertas_set_atualizado' and tgrelid = 'public.ofertas'::regclass) then
    create trigger ofertas_set_atualizado before update on public.ofertas
      for each row execute function public.set_atualizado_em();
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'vendas_set_atualizado' and tgrelid = 'public.vendas'::regclass) then
    create trigger vendas_set_atualizado before update on public.vendas
      for each row execute function public.set_atualizado_em();
  end if;
end $$;

-- == RLS, grants e policies ===================================================================
-- Mesmo padrão da 0061: grant aos três papéis, e quem isola é a RLS. NENHUMA policy para
-- authenticated — dado comercial só passa por server action com service-role.
alter table public.ofertas enable row level security;
alter table public.vendas enable row level security;
alter table public.vendas_periodos enable row level security;
alter table public.webhook_compras_recebidas enable row level security;

grant all on table public.ofertas to anon, authenticated, service_role;
grant all on table public.vendas to anon, authenticated, service_role;
grant all on table public.vendas_periodos to anon, authenticated, service_role;
grant all on table public.webhook_compras_recebidas to anon, authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ofertas' and policyname = 'ofertas_service_role') then
    create policy ofertas_service_role on public.ofertas for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vendas' and policyname = 'vendas_service_role') then
    create policy vendas_service_role on public.vendas for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vendas_periodos' and policyname = 'vendas_periodos_service_role') then
    create policy vendas_periodos_service_role on public.vendas_periodos for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'webhook_compras_recebidas' and policyname = 'webhook_compras_recebidas_service_role') then
    create policy webhook_compras_recebidas_service_role on public.webhook_compras_recebidas for all to service_role using (true) with check (true);
  end if;
end $$;

-- == busca de usuário por e-mail ==============================================================
-- A API de admin do Supabase não busca por e-mail (só lista paginado). Só o servidor executa.
create or replace function public.buscar_usuario_por_email(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;

revoke all on function public.buscar_usuario_por_email(text) from public, anon, authenticated;
grant execute on function public.buscar_usuario_por_email(text) to service_role;
