-- 0071_produtos_da_oferta.sql — cada produto da oferta é venda ou degustação.
--
-- A tabela normalizada passa a ser a fonte da configuração da oferta. `ofertas.produtos` é mantida
-- por compatibilidade com dados e código legado durante a transição; o código novo consulta esta
-- tabela para saber o tipo de cada produto.
create table if not exists public.ofertas_produtos (
  oferta_id uuid not null references public.ofertas(id) on delete cascade,
  produto_id text not null,
  tipo text not null,
  criado_em timestamptz not null default now(),
  primary key (oferta_id, produto_id),
  constraint ofertas_produtos_tipo_check check (tipo in ('venda', 'degustacao'))
);

create index if not exists ofertas_produtos_oferta_idx on public.ofertas_produtos (oferta_id);
create index if not exists ofertas_produtos_produto_idx on public.ofertas_produtos (produto_id);
alter table public.ofertas_produtos enable row level security;
grant all on table public.ofertas_produtos to anon, authenticated, service_role;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ofertas_produtos' and policyname = 'ofertas_produtos_service_role'
  ) then
    create policy ofertas_produtos_service_role on public.ofertas_produtos
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- Ofertas existentes: o comportamento anterior era liberar todos os itens de `produtos` como venda.
insert into public.ofertas_produtos (oferta_id, produto_id, tipo)
select o.id, p, 'venda'
from public.ofertas o
cross join lateral unnest(o.produtos) as p
on conflict (oferta_id, produto_id) do nothing;

-- Ofertas antigas criadas como degustação pelo modelo anterior: seus produtos eram todos trial.
-- Elas não podem ser vendas diretas e continuam identificadas pelos dias preenchidos.
update public.ofertas_produtos op
set tipo = 'degustacao'
from public.ofertas o
where o.id = op.oferta_id
  and o.dias_degustacao in (7, 15)
  and not exists (
    select 1 from public.ofertas_filhas f where f.oferta_filha_id = o.id
  );

-- Relações pai/filha existentes são incorporadas à principal. A tabela antiga fica preservada como
-- legado, mas deixa de ser necessária para o código novo. Só usamos os dias válidos do modelo atual.
insert into public.ofertas_produtos (oferta_id, produto_id, tipo)
select f.oferta_pai_id, p, 'degustacao'
from public.ofertas_filhas f
join public.ofertas filha on filha.id = f.oferta_filha_id
cross join lateral unnest(filha.produtos) as p
where filha.dias_degustacao in (7, 15)
on conflict (oferta_id, produto_id) do nothing;

update public.ofertas pai
set dias_degustacao = filha.dias_degustacao
from public.ofertas_filhas f
join public.ofertas filha on filha.id = f.oferta_filha_id
where pai.id = f.oferta_pai_id
  and filha.dias_degustacao in (7, 15)
  and not exists (
    select 1 from public.ofertas_filhas f2
    join public.ofertas filha2 on filha2.id = f2.oferta_filha_id
    where f2.oferta_pai_id = pai.id
      and filha2.dias_degustacao in (7, 15)
      and filha2.dias_degustacao <> filha.dias_degustacao
  );
