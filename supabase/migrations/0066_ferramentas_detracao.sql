-- supabase/migrations/0066_ferramentas_detracao.sql — os cálculos de detração que cada membro
-- guarda para si. Mesmo padrão da 0062 (indulto_comutacao_calculos).
--
-- ⚠️ ADITIVA E IDEMPOTENTE. Migration que falha = container que NÃO SOBE: o CRM reaplica no boot
-- qualquer migration que não encontre registrada, então toda instrução aqui aguenta rodar duas
-- vezes. Nada apaga dado e nada exige ownership de objeto do Supabase.

create table if not exists public.detracao_calculos (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  -- Qual calculadora de detração gerou este resultado — hoje só 'recolhimento-noturno', mas o
  -- campo já separa por tipo se entrar um segundo produto de detração na mesma família.
  calculo_tipo      text not null,
  algoritmo_versao  text not null,
  titulo            text not null,
  entrada           jsonb not null,
  resultado         jsonb not null,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

create index if not exists detracao_calculos_dono_idx
  on public.detracao_calculos (workspace_id, user_id, atualizado_em desc);

alter table public.detracao_calculos enable row level security;

-- Privilégio de tabela, explícito — mesmo raciocínio da 0062 (herdaria da 0061, concedemos
-- mesmo assim pelo motivo dela: o produto não depende de privilégio que não concedeu).
grant all on table public.detracao_calculos to anon, authenticated, service_role;

-- 🔴 SÓ LEITURA, e só do próprio dono. NENHUMA policy de escrita para `authenticated`: as
-- escritas vão por server action, com service-role, que não passa por RLS — ver Task 6.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'detracao_calculos'
      and policyname = 'detracao_calculos_sel'
  ) then
    create policy detracao_calculos_sel on public.detracao_calculos
      for select to authenticated
      using (public.e_membro(workspace_id) and user_id = auth.uid());
  end if;
end $$;
