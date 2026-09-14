-- 0065_membros_e_workspaces_so_para_quem_pode.sql — esta instalação é só de ferramentas: quem
-- compra entra como `membro`, e um comprador não pode ver os outros nem criar espaço de trabalho.
--
-- ⚠️ ADITIVA E IDEMPOTENTE. Migration que falha = container que NÃO SOBE, em toda instalação.

-- == quem vê quem em `membros` ================================================================
-- A `membros_sel` da 0005 deixava qualquer membro ler as linhas de todo o workspace — com os
-- compradores em `membros`, cada comprador veria nome, e-mail e CPF/CNPJ de todos os outros.
-- Agora: a própria linha sempre; as do workspace inteiro, só o owner.
-- 🔴 Uma migration futura que recrie `membros_sel` com a definição antiga reabre isto sem aviso —
-- tests/migracoes/membros-hash.spec.ts barra isso.
drop policy if exists membros_sel on public.membros;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'membros' and policyname = 'membros_sel'
  ) then
    create policy membros_sel on public.membros for select to authenticated
      using (user_id = auth.uid() or public.e_owner(workspace_id));
  end if;
end $$;

-- == quem cria espaço de trabalho =============================================================
-- A 0060 devolveu `criar_workspace` a `authenticated`. Um comprador logado criaria o seu, viraria
-- owner e usaria os recursos que valem para o servidor inteiro (a chave de IA dos agentes, os
-- canais). O produto só a chama pelo servidor (cadastro e /sem-workspace), com service-role.
revoke execute on function public.criar_workspace(text, uuid) from authenticated;
