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

-- O carimbo de `atualizado_em`, reaproveitando `public.set_atualizado_em()` (0002) — a mesma função
-- que `ofertas` e `vendas` usam. Não crie uma segunda.
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'produtos_externos_set_atualizado' and tgrelid = 'public.produtos_externos'::regclass) then
    create trigger produtos_externos_set_atualizado before update on public.produtos_externos
      for each row execute function public.set_atualizado_em();
  end if;
end $$;
