-- Alarga o teto das instruções do assistente de 4000 para 12000 caracteres.
-- A 0077 já pode ter rodado com o teto antigo; a própria 0077 agora nasce com 12000, então
-- numa instalação nova este arquivo não encontra nada para trocar.
--
-- Idempotente: só troca a restrição quando ela ainda é a de 4000. Rodar de novo não faz nada.
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'assistentes_instrucoes_tamanho'
       and conrelid = 'public.assistentes'::regclass
       and pg_get_constraintdef(oid) like '%4000%'
  ) then
    alter table public.assistentes drop constraint assistentes_instrucoes_tamanho;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'assistentes_instrucoes_tamanho'
       and conrelid = 'public.assistentes'::regclass
  ) then
    alter table public.assistentes
      add constraint assistentes_instrucoes_tamanho check (length(instrucoes) <= 12000);
  end if;
end $$;
