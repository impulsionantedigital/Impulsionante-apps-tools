-- 0069_oferta_degustacao.sql — oferta de degustação: o prazo de acesso vem de um número de DIAS,
-- escolhido no cadastro da oferta, em vez de um nome de duração.
--
-- ⚠️ ADITIVA E IDEMPOTENTE. Migration que falha = container que NÃO SOBE, em toda instalação.
-- Nada apaga dado. A guarda em tests/migracoes/idempotencia.spec.ts confere as regras.
--
-- 🔴 `duracao` NÃO muda de domínio, e é de propósito: `DURACOES` (sete nomes) continua sendo o
-- domínio do que VENCE por nome, e o alargamento para aceitar 'degustacao' é assunto de release
-- futura — enquanto isso, o CHECK do produto recusa o valor novo, e é isso que o log do servidor
-- avisa. A coluna abaixo guarda os DIAS, e é ela que a compra lê; `duracao` segue guardando o
-- prazo normal da oferta (é a ele que a venda volta quando a degustação for desligada).
-- == ofertas ==================================================================================
alter table public.ofertas add column if not exists dias_degustacao integer;
-- O teto de 3650 dias é o mesmo do formulário e do `somarDuracao`: três lugares, um número só.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ofertas_dias_degustacao_faixa_check' and conrelid = 'public.ofertas'::regclass
  ) then
    alter table public.ofertas add constraint ofertas_dias_degustacao_faixa_check
      check (dias_degustacao is null or dias_degustacao between 1 and 3650);
  end if;
end $$;
-- == vendas ==================================================================================
-- 🔴 FOTOGRAFIA no dia da compra, igual a `produtos` e `duracao` (§7.4): o dono pode editar a
-- oferta depois, e o prazo que o membro comprou não pode mudar por causa disso. `duracao` segue
-- descrevendo o prazo por nome; esta coluna diz se ESTA compra foi de degustação, e por quantos dias.
alter table public.vendas add column if not exists dias_degustacao integer;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vendas_dias_degustacao_faixa_check' and conrelid = 'public.vendas'::regclass
  ) then
    alter table public.vendas add constraint vendas_dias_degustacao_faixa_check
      check (dias_degustacao is null or dias_degustacao between 1 and 3650);
  end if;
end $$;
