-- supabase/migrations/0063_email_transacional.sql — modelos de e-mail e a fila de envio.
--
-- ⚠️ ADITIVA E IDEMPOTENTE. Migration que falha = container que NÃO SOBE, em toda instalação:
-- o CRM reaplica no boot qualquer migration que não encontre registrada.
--
-- 🔴 SEM SEED. Os quatro modelos padrão vivem em src/lib/email/padroes.ts e a linha aqui só
-- nasce quando o dono edita. Assim nenhum workspace precisa ser semeado — nem os que já
-- existem, nem os que nascerem depois.

-- == modelos ================================================================
create table if not exists public.modelos_email (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  tipo          text not null,
  assunto       text not null,
  html          text not null,
  ativo         boolean not null default true,
  atualizado_em timestamptz not null default now(),
  primary key (workspace_id, tipo)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'modelos_email_tipo_dominio_check'
      and conrelid = 'public.modelos_email'::regclass
  ) then
    alter table public.modelos_email
      add constraint modelos_email_tipo_dominio_check
      check (tipo in ('boas_vindas','recuperacao_senha','entrega_produto','pagamento_recebido'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'modelos_email_set_atualizado'
      and tgrelid = 'public.modelos_email'::regclass
  ) then
    create trigger modelos_email_set_atualizado before update on public.modelos_email
      for each row execute function public.set_atualizado_em();
  end if;
end $$;

alter table public.modelos_email enable row level security;
grant all on table public.modelos_email to anon, authenticated, service_role;

-- 🔴 NENHUMA policy para `authenticated`: o navegador não lê nem escreve esta tabela. Tudo
-- passa por server action com service-role, depois de conferir quem pede.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'modelos_email'
      and policyname = 'modelos_email_service_role'
  ) then
    create policy modelos_email_service_role on public.modelos_email
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- == fila ===================================================================
-- Forma copiada de eventos_webhook (0007), incluindo o índice parcial: sem ele a fila varre a
-- tabela inteira a cada batida do relógio, e o sintoma só aparece na instalação com volume.
--
-- 🔴 O assunto e o HTML vão RENDERIZADOS para a fila. O e-mail enviado é o que o modelo dizia
-- no momento em que o evento aconteceu, e editar um modelo não reescreve o que está por enviar.
create table if not exists public.emails_fila (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  destinatario      text not null,
  assunto           text not null,
  html              text not null,
  criado_em         timestamptz not null default now(),
  enviado_em        timestamptz,
  tentativas        int not null default 0,
  proxima_tentativa timestamptz not null default now(),
  ultimo_erro       text,
  desistido_em      timestamptz
);

create index if not exists emails_fila_pendentes_idx
  on public.emails_fila (proxima_tentativa)
  where enviado_em is null and desistido_em is null;

alter table public.emails_fila enable row level security;
grant all on table public.emails_fila to anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'emails_fila'
      and policyname = 'emails_fila_service_role'
  ) then
    create policy emails_fila_service_role on public.emails_fila
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- == reserva ================================================================
-- `for update skip locked` é o que impede duas batidas concorrentes de enviarem o mesmo
-- e-mail duas vezes. Mesma forma de public.reservar_eventos (0007:105).
create or replace function public.reservar_emails(p_limite int, p_reserva interval default interval '2 minutes')
returns setof public.emails_fila language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.emails_fila e
    set proxima_tentativa = now() + p_reserva
  where e.id in (
    select id from public.emails_fila
    where enviado_em is null and desistido_em is null and proxima_tentativa <= now()
    order by criado_em
    limit p_limite
    for update skip locked
  )
  returning e.*;
end $$;

revoke all on function public.reservar_emails(int, interval) from public, anon, authenticated;
grant execute on function public.reservar_emails(int, interval) to service_role;
