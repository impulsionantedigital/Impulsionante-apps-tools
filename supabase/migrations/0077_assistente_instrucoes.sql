-- Personalidade, tom e instruções de comportamento de cada assistente, escritas pelo dono.
-- Diferente de `sobre_o_negocio` (contexto sobre a empresa), este texto É instrução: o prompt
-- o trata como tal, sempre abaixo das regras fixas (não inventar, não executar ações, etc.).
--
-- Idempotente: roda duas vezes sem erro. A coluna usa `if not exists`; a `check`, que não tem
-- essa forma, pergunta ao catálogo antes.
alter table public.assistentes
  add column if not exists instrucoes text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'assistentes_instrucoes_tamanho'
       and conrelid = 'public.assistentes'::regclass
  ) then
    alter table public.assistentes
      add constraint assistentes_instrucoes_tamanho check (length(instrucoes) <= 12000);
  end if;
end $$;
