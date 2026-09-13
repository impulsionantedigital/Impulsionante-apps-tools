-- 0062_ferramentas_indulto_comutacao.sql — os cálculos de indulto e comutação
-- que cada membro guarda para si.
--
-- ⚠️ ADITIVA E IDEMPOTENTE. Migration que falha = container que NÃO SOBE: o CRM
-- reaplica no boot qualquer migration que não encontre registrada, então toda
-- instrução aqui aguenta rodar duas vezes. Nada apaga dado e nada exige
-- ownership de objeto do Supabase.

create table if not exists public.indulto_comutacao_calculos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- Qual motor gerou este resultado. Guardados juntos, permitem avisar o membro
  -- quando uma correção de fórmula muda um número que ele já usou em petição.
  decreto_id    text not null,
  motor_versao  text not null,
  titulo        text not null,
  entrada       jsonb not null,
  resultado     jsonb not null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists indulto_comutacao_calculos_dono_idx
  on public.indulto_comutacao_calculos (workspace_id, user_id, atualizado_em desc);

alter table public.indulto_comutacao_calculos enable row level security;

-- Privilégio de tabela, explícito. Numa instalação normal ele já viria herdado: a `0061` faz
-- `alter default privileges`, e toda tabela criada depois dela nasce com grant. Concedemos
-- mesmo assim pelo motivo da própria `0061` — o produto não depende de privilégio que não
-- concedeu. E concedemos o MESMO que ela (`all` aos três papéis), não o mínimo: grant
-- diferente criaria dois mundos de instalação.
--
-- 🔴 O grant NÃO é o que protege esta tabela. Quem isola é a RLS abaixo (leitura só do próprio
-- membro) e a AUSÊNCIA de policy de escrita — sem policy, `authenticated` não escreve nada,
-- tenha o grant que tiver. Idempotente: conceder o que já está concedido é no-op.
grant all on table public.indulto_comutacao_calculos to anon, authenticated, service_role;

-- 🔴 SÓ LEITURA, e só do próprio dono.
--
-- `e_membro(workspace_id)` sozinho deixaria um membro ler o caso de outro dentro
-- do mesmo workspace — é o `user_id = auth.uid()` que separa os dois.
--
-- 🔴 E NENHUMA POLICY DE ESCRITA para `authenticated`. O CRM entrega um cliente
-- Supabase ao NAVEGADOR na tela de Conversas, e o Postgres não distingue "o
-- servidor agindo em nome do usuário" de "o usuário agindo pelo console do
-- navegador": é o mesmo JWT. Uma policy de escrita autorizaria o segundo, que
-- pularia a rota, a validação e qualquer regra escrita em código. As escritas
-- vão por server action, com service-role, que não passa por RLS.
--
-- `create policy` não aceita `if not exists`, daí o bloco que pergunta antes.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'indulto_comutacao_calculos'
      and policyname = 'indulto_comutacao_calculos_sel'
  ) then
    create policy indulto_comutacao_calculos_sel on public.indulto_comutacao_calculos
      for select to authenticated
      using (public.e_membro(workspace_id) and user_id = auth.uid());
  end if;
end $$;
