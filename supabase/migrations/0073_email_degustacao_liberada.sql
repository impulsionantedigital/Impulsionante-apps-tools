-- 0073_email_degustacao_liberada.sql — o modelo `degustacao_liberada` entra no catálogo.
--
-- O brinde de uma oferta mista (calculadora anual vendida, 2024 de brinde por 7 dias) precisa de um
-- e-mail PRÓPRIO. Ele não pode reusar o `entrega_produto`: aquele manda um único `EXPIRES_AT`, o
-- vencimento mais TARDIO da venda, e o brinde de 7 dias morreria anunciado com a data da assinatura.
--
-- 🔴 Quem limita os tipos é `public.modelos_email.tipo`, cujo CHECK foi fixado na 0063 — e o
-- alargamento é ADITIVO: acrescenta `degustacao_liberada` sem tirar nenhum tipo existente, que
-- ainda está gravado nas linhas da tabela. Estreitar o domínio aqui quebraria instalações que já
-- têm modelos salvos.
do $$
begin
  -- Só age se a restrição existir E ainda não citar o tipo novo — a segunda passada é inofensiva.
  if exists (
    select 1 from pg_constraint
    where conname = 'modelos_email_tipo_dominio_check'
      and conrelid = 'public.modelos_email'::regclass
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'modelos_email_tipo_dominio_check'
      and conrelid = 'public.modelos_email'::regclass
      and pg_get_constraintdef(oid) ilike '%degustacao_liberada%'
  ) then
    alter table public.modelos_email drop constraint modelos_email_tipo_dominio_check;
    alter table public.modelos_email
      add constraint modelos_email_tipo_dominio_check
      check (tipo in ('boas_vindas','recuperacao_senha','entrega_produto','pagamento_recebido','degustacao_liberada'));
  end if;
end $$;
