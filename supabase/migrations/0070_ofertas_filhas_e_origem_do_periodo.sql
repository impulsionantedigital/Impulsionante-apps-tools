-- 0070_ofertas_filhas_e_origem_do_periodo.sql — vínculo de oferta principal com ofertas filhas de
-- brinde (degustação), e a origem de cada período de acesso.
--
-- ⚠️ ADITIVA E IDEMPOTENTE. Migration que falha = container que NÃO SOBE, em toda instalação.
-- Nada apaga dado. A guarda em tests/migracoes/idempotencia.spec.ts confere as regras.
--
-- == ofertas filhas ===========================================================================
-- A filha NÃO é um fato comercial: não gera venda, não tem valor, não tem transação. Ela é uma
-- REGRA DE CONCESSÃO — "quem comprar a oferta X ganha também estes produtos, por N dias".
--
-- 🔴 O código da filha NUNCA existe na Hotmart: ele é escolhido à mão e é o que garante que
-- nenhuma compra caia direto numa filha. E `duracao = 'degustacao'` é o que a identifica —
-- a guarda de processamento não precisa de coluna nova para isso.
--
-- A lista é TABELA, e não coluna array, por três motivos: o `unique` abaixo mata a filha repetida
-- por construção, o `on delete cascade` resolve a limpeza, e a integridade fica no banco em vez
-- de ficar na cabeça de quem escreve o código.
create table if not exists public.ofertas_filhas (
  oferta_pai_id uuid not null references public.ofertas(id) on delete cascade,
  oferta_filha_id uuid not null references public.ofertas(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (oferta_pai_id, oferta_filha_id),
  -- 🔴 N=1 e nada de ciclo: um nível só de profundidade, e uma oferta não é filha de si mesma.
  -- A profundidade 1 é a razão de existir esta restrição — sem ela, o processamento precisaria de
  -- recursão, e uma corrente de filhas nunca seria percorrida por inteiro em silêncio.
  constraint ofertas_filhas_sem_auto_vinculo_check check (oferta_pai_id <> oferta_filha_id)
);
-- Uma filha pertence a UMA principal. Sem isto, a mesma filha pendurada em duas principais
-- significaria dois processamentos para a mesma compra, e o segundo brigaria no
-- `vendas_periodos_venda_produto_key`.
create unique index if not exists ofertas_filhas_filha_key on public.ofertas_filhas (oferta_filha_id);
create index if not exists ofertas_filhas_pai_idx on public.ofertas_filhas (oferta_pai_id);
alter table public.ofertas_filhas enable row level security;
grant all on table public.ofertas_filhas to anon, authenticated, service_role;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ofertas_filhas' and policyname = 'ofertas_filhas_service_role') then
    create policy ofertas_filhas_service_role on public.ofertas_filhas for all to service_role using (true) with check (true);
  end if;
end $$;
-- == origem do período =======================================================================
-- De onde o acesso nasceu. É o que permite responder "este acesso é um trial?" na tela do membro
-- SEM perguntar à oferta: a resposta fica gravada no próprio período, e editar a oferta depois não
-- reescreve o que já foi concedido (§7.4).
--
-- 🔴 É também o que faz a regra "brinde não renova nem empilha" ter onde se apoiar: a concessão
-- pergunta ao histórico do membro se ele já tem período de origem `degustacao` daquele produto.
-- Sem esta coluna, a única alternativa seria um join com `ofertas`, e aí a resposta mudaria se o
-- dono editasse a oferta — exatamente o que a fotografia existe para impedir.
alter table public.vendas_periodos add column if not exists origem text not null default 'venda';
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vendas_periodos_origem_dominio_check' and conrelid = 'public.vendas_periodos'::regclass
  ) then
    alter table public.vendas_periodos add constraint vendas_periodos_origem_dominio_check
      check (origem in ('venda','degustacao'));
  end if;
end $$;
-- A pergunta da concessão é por (membro, produto, origem): "este membro já recebeu o brinde deste
-- produto?". Sem este índice, a resposta varre o histórico inteiro do membro a cada compra.
create index if not exists vendas_periodos_origem_idx on public.vendas_periodos (workspace_id, membro_id, produto_id, origem);
-- == backfill ================================================================================
-- Períodos anteriores a esta migration nasceram todos de venda — o `default 'venda'` acima já os
-- cobriu. O backfill explícito existe só para o caso de a coluna já ter sido criada por outra
-- tentativa, sem o default aplicado.
update public.vendas_periodos set origem = 'venda' where origem is null;
