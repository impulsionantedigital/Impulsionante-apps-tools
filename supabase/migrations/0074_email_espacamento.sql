-- 0074_email_espacamento.sql — e-mails do MESMO evento saem espaçados, e não em rajada.
--
-- MOTIVO REAL, observado em produção: uma compra que concede brinde enfileirava TRÊS e-mails no
-- mesmo segundo, do mesmo remetente, para o mesmo endereço. O Gmail classificou os dois últimos
-- como rajada e os mandou para o SPAM — inclusive o do brinde, que é justamente o recado novo.
-- "Aceito pelo servidor SMTP" não quer dizer "entregue na caixa de entrada".
--
-- 🔴 POR QUE UMA COLUNA NOVA, e não `proxima_tentativa`: aquele campo é usado pela RPC de reserva
-- (`reservar_emails` o empurra para o futuro a cada reserva) e pelo backoff de falha. Escrever o
-- agendamento lá faria os dois se sobrescreverem — o e-mail espaçado seria disparado na hora pelo
-- primeiro tick, que é exatamente o que se quer evitar. `agendado_para` é SEPARADO: uma linha só é
-- elegível quando as DUAS condições valem.
--
-- Aditiva e idempotente. O default `now()` mantém toda linha existente elegível, como era antes.
alter table public.emails_fila
  add column if not exists agendado_para timestamptz not null default now();

-- O índice de pendentes passa a considerar o agendamento: a varredura do tick pede as linhas
-- prontas, e sem isto ela leria linhas futuras para descartá-las em memória.
drop index if exists public.emails_fila_pendentes_idx;
create index if not exists emails_fila_pendentes_idx
  on public.emails_fila (agendado_para, proxima_tentativa)
  where enviado_em is null and desistido_em is null;

-- A reserva é recriada para respeitar o agendamento. Mesma forma da 0063, com a condição a mais.
create or replace function public.reservar_emails(p_limite int, p_reserva interval default interval '2 minutes')
returns setof public.emails_fila language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.emails_fila e
    set proxima_tentativa = now() + p_reserva
  where e.id in (
    select id from public.emails_fila
    where enviado_em is null
      and desistido_em is null
      and proxima_tentativa <= now()
      -- 🔴 A condição nova: o espaçamento. Sem ela, os três e-mails de uma compra sairiam no
      -- mesmo tick e a rajada continuaria — que é a causa do spam.
      and agendado_para <= now()
    order by agendado_para, criado_em
    limit p_limite
    for update skip locked
  )
  returning e.*;
end $$;

revoke all on function public.reservar_emails(int, interval) from public, anon, authenticated;
grant execute on function public.reservar_emails(int, interval) to service_role;
