-- 0076_base_documentos.sql — a base de conhecimento passa a receber ARQUIVOS (pdf, docx, md,
-- txt, json, csv). O dono envia o arquivo; um processador em segundo plano corta o texto em
-- trechos, e cada trecho vira uma linha de `public.base_conhecimento` — a mesma tabela dos cards,
-- para a busca do agente achar os dois com uma consulta so.
--
-- ⚠️ ADITIVA: tres tabelas novas, colunas novas (todas anulaveis) em `base_conhecimento`, um
-- bucket privado e funcoes. Nenhuma coluna existente sai (a `fts` e refeita com o mesmo nome),
-- nenhum card muda de valor. Card = linha com `documento_id is null`; o codigo da tela de cards
-- filtra por isso.
--
-- Tudo aqui aguenta rodar DUAS vezes: `if not exists` onde a linguagem aceita, e bloco
-- `do $$ … end $$` perguntando ao catalogo (com o nome E a relacao) onde nao aceita.

-- O search_path desta SESSAO, para o tipo e o operador da busca resolverem durante a aplicacao.
set local search_path = public, extensions;

-- ── 1. documentos: o que a pessoa ve na tela ─────────────────────────────────────────────
create table if not exists public.base_documentos (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  nome_exibicao   text not null,
  nome_arquivo    text not null,
  ligado          boolean not null default true,
  -- A versao cujos trechos o agente enxerga. A chave estrangeira vem no bloco 3, depois que a
  -- tabela de versoes existe.
  versao_ativa_id uuid,
  criado_por      uuid references auth.users(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint base_documentos_nome_exibicao_tamanho
    check (length(trim(nome_exibicao)) between 1 and 120),
  constraint base_documentos_ws_id_key unique (workspace_id, id)
);

-- ── 2. versoes: cada arquivo enviado ──────────────────────────────────────────────────────
--
-- Reprocessar ou reenviar cria uma versao NOVA; a ativa continua respondendo ate a nova ficar
-- pronta (`base_versao_promover`). Assim o agente nunca fica sem a versao antiga no meio.
create table if not exists public.base_documento_versoes (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  documento_id       uuid not null,
  nome_arquivo       text not null,
  extensao           text not null,
  tamanho            bigint not null,
  caminho            text not null,
  hash               text,
  origem             text not null default 'envio',
  status             text not null default 'enviando',
  etapa              text,
  motivo_erro        text,
  trechos_total      int not null default 0,
  custo_estimado_usd numeric,
  tentativas         int not null default 0,
  trabalhando_ate    timestamptz,
  enviado_por        uuid references auth.users(id) on delete set null,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  constraint base_documento_versoes_extensao_valida
    check (extensao in ('pdf','docx','md','txt','json','csv')),
  constraint base_documento_versoes_origem_valida
    check (origem in ('envio','reprocesso')),
  constraint base_documento_versoes_status_valido
    check (status in ('enviando','na_fila','processando','pronto','erro')),
  constraint base_documento_versoes_etapa_valida
    check (etapa is null or etapa in ('extraindo','contextualizando','vetorizando')),
  constraint base_documento_versoes_caminho_key unique (caminho),
  constraint base_documento_versoes_ws_id_key unique (workspace_id, id)
);

-- A fila do processador: `base_versao_reivindicar` e `base_versoes_faxina` filtram por status e
-- reserva.
create index if not exists base_documento_versoes_fila_idx
  on public.base_documento_versoes (status, trabalhando_ate);
create index if not exists base_documento_versoes_documento_idx
  on public.base_documento_versoes (workspace_id, documento_id);

-- ── 3. as chaves estrangeiras compostas entre documento e versao ──────────────────────────
--
-- 🔴 COMPOSTAS (workspace_id, …): a escrita sai toda pelo service-role, que nao avalia policy,
-- entao a constraint e a unica barreira contra amarrar a versao de um inquilino ao documento
-- de outro.
--
-- ⚠️ `on delete set null (versao_ativa_id)` COM a lista de coluna: um `set null` sem lista numa
-- FK composta anularia tambem `workspace_id`, que e `not null` — apagar a versao ativa
-- falharia. A lista existe desde o Postgres 15.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'base_documento_versoes_documento_fk'
       and conrelid = 'public.base_documento_versoes'::regclass
  ) then
    alter table public.base_documento_versoes add constraint base_documento_versoes_documento_fk
      foreign key (workspace_id, documento_id)
      references public.base_documentos (workspace_id, id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'base_documentos_versao_ativa_fk'
       and conrelid = 'public.base_documentos'::regclass
  ) then
    alter table public.base_documentos add constraint base_documentos_versao_ativa_fk
      foreign key (workspace_id, versao_ativa_id)
      references public.base_documento_versoes (workspace_id, id) on delete set null (versao_ativa_id);
  end if;
end $$;

-- ── 4. recorte por assistente, igual ao dos blocos (0041) ─────────────────────────────────
--
-- Sem linha para um documento = vale para TODOS os assistentes. Uma ou mais linhas restringem.
create table if not exists public.assistente_documentos (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  assistente_id uuid not null,
  documento_id  uuid not null,
  criado_em     timestamptz not null default now(),
  primary key (workspace_id, assistente_id, documento_id),
  foreign key (workspace_id, assistente_id)
    references public.assistentes (workspace_id, id) on delete cascade,
  foreign key (workspace_id, documento_id)
    references public.base_documentos (workspace_id, id) on delete cascade
);

create index if not exists assistente_documentos_documento_idx
  on public.assistente_documentos (workspace_id, documento_id);

-- ── 5. os trechos moram em base_conhecimento ──────────────────────────────────────────────
--
-- `contexto`: null = ainda nao tentou gerar; '' = tentou e falhou (nao tenta de novo).
alter table public.base_conhecimento add column if not exists documento_id    uuid;
alter table public.base_conhecimento add column if not exists versao_id       uuid;
alter table public.base_conhecimento add column if not exists caminho_titulos text;
alter table public.base_conhecimento add column if not exists pagina          int;
alter table public.base_conhecimento add column if not exists secao           int;
alter table public.base_conhecimento add column if not exists posicao         int;
alter table public.base_conhecimento add column if not exists contexto        text;

-- Apagar a versao leva os trechos dela; apagar o documento leva tudo. Colunas NOVAS desta
-- migration, compostas com `workspace_id` — nenhuma FK de coluna unica sobre coluna antiga.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'base_conhecimento_versao_fk'
       and conrelid = 'public.base_conhecimento'::regclass
  ) then
    alter table public.base_conhecimento add constraint base_conhecimento_versao_fk
      foreign key (workspace_id, versao_id)
      references public.base_documento_versoes (workspace_id, id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'base_conhecimento_documento_fk'
       and conrelid = 'public.base_conhecimento'::regclass
  ) then
    alter table public.base_conhecimento add constraint base_conhecimento_documento_fk
      foreign key (workspace_id, documento_id)
      references public.base_documentos (workspace_id, id) on delete cascade;
  end if;
end $$;

create index if not exists base_conhecimento_trecho_idx
  on public.base_conhecimento (workspace_id, versao_id, secao, posicao);

-- ── 6. a fts passa a enxergar o caminho de titulos e o contexto ──────────────────────────
--
-- Coluna gerada nao se altera: so `drop` + `add`. A guarda pergunta a expressao ATUAL — se ela
-- ja menciona `contexto`, a segunda passada nao refaz a coluna (que reescreveria a tabela
-- inteira a cada boot). O `drop` leva o indice junto; ele volta logo abaixo, fora do bloco.
do $$
begin
  if not exists (
    select 1
      from pg_attrdef d
      join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
     where d.adrelid = 'public.base_conhecimento'::regclass
       and a.attname = 'fts'
       and pg_get_expr(d.adbin, d.adrelid) like '%contexto%'
  ) then
    alter table public.base_conhecimento drop column if exists fts;
    alter table public.base_conhecimento add column if not exists fts tsvector generated always as
      (to_tsvector('portuguese', coalesce(titulo,'') || ' ' || coalesce(caminho_titulos,'') || ' ' || coalesce(contexto,'') || ' ' || coalesce(conteudo,''))) stored;
  end if;
end $$;

create index if not exists base_conhecimento_fts_idx
  on public.base_conhecimento using gin (fts);

-- ── 7. gatilhos de atualizado_em ──────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'base_documentos_set_atualizado'
       and tgrelid = 'public.base_documentos'::regclass
  ) then
    create trigger base_documentos_set_atualizado before update on public.base_documentos
      for each row execute function public.set_atualizado_em();
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgname = 'base_documento_versoes_set_atualizado'
       and tgrelid = 'public.base_documento_versoes'::regclass
  ) then
    create trigger base_documento_versoes_set_atualizado before update on public.base_documento_versoes
      for each row execute function public.set_atualizado_em();
  end if;
end $$;

-- ── 8. RLS, grants e policies ────────────────────────────────────────────────────────────
--
-- Escrita sai toda pelo service-role; membro do espaco so le. `to authenticated` explicito:
-- omitir o `TO` e `TO PUBLIC`, que inclui `anon`.
alter table public.base_documentos enable row level security;
alter table public.base_documento_versoes enable row level security;
alter table public.assistente_documentos enable row level security;

grant all on table public.base_documentos to anon, authenticated, service_role;
grant all on table public.base_documento_versoes to anon, authenticated, service_role;
grant all on table public.assistente_documentos to anon, authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'base_documentos'
                   and policyname = 'base_documentos_service') then
    create policy base_documentos_service on public.base_documentos
      for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'base_documentos'
                   and policyname = 'base_documentos_membro') then
    create policy base_documentos_membro on public.base_documentos
      for select to authenticated using (public.e_membro(workspace_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'base_documento_versoes'
                   and policyname = 'base_documento_versoes_service') then
    create policy base_documento_versoes_service on public.base_documento_versoes
      for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'base_documento_versoes'
                   and policyname = 'base_documento_versoes_membro') then
    create policy base_documento_versoes_membro on public.base_documento_versoes
      for select to authenticated using (public.e_membro(workspace_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'assistente_documentos'
                   and policyname = 'assistente_documentos_service') then
    create policy assistente_documentos_service on public.assistente_documentos
      for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'assistente_documentos'
                   and policyname = 'assistente_documentos_membro') then
    create policy assistente_documentos_membro on public.assistente_documentos
      for select to authenticated using (public.e_membro(workspace_id));
  end if;
end $$;

-- ── 9. o bucket ─────────────────────────────────────────────────────────────────────────
--
-- PRIVADO: quem le e o servidor (o processador), nunca o navegador. Sem policy em
-- storage.objects (ver AGENTS.md). `file_size_limit null`: o teto fica no codigo (env
-- BASE_ARQUIVO_MAX_MB) e no limite global do projeto.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('base-arquivos', 'base-arquivos', false, null, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/markdown',
  'text/plain',
  'application/json',
  'text/csv'
])
on conflict (id) do nothing;

-- ── 10. a busca hibrida passa a enxergar trechos (so da versao ativa) ────────────────────
--
-- 🔴 `drop` + `create`: o RETORNO ganha colunas, e `create or replace` nao muda tipo de
-- retorno. A assinatura de entrada e a mesma da 0041/0049, entao toda chamada existente
-- continua resolvendo. `drop` + `create` NAO preserva permissoes — o revoke/grant abaixo e
-- obrigatorio.
--
-- O predicado de visibilidade (repetido nas tres funcoes de leitura, de proposito, para cada
-- uma se ler sozinha): card segue o recorte de `assistente_blocos`; trecho so aparece se o
-- documento esta ligado, se a versao do trecho e a ATIVA, e se o recorte de
-- `assistente_documentos` permite. `p_assistente` nulo = sem recorte.
drop function if exists public.base_conhecimento_buscar(
  uuid, text, extensions.vector, text, int, text[], uuid
);

create function public.base_conhecimento_buscar(
  p_ws uuid,
  p_query text,
  p_embedding extensions.vector(1536),
  p_versao text,
  p_limite int,
  p_tipos text[],
  p_assistente uuid default null
) returns table (
  id uuid, titulo text, conteudo text, tipo text, score float,
  documento text, caminho_titulos text, pagina int
)
language sql stable security definer set search_path = extensions as $$
with textual as (
  select b.id, row_number() over (
           order by ts_rank_cd(b.fts, websearch_to_tsquery('portuguese', p_query)) desc) as posicao
    from public.base_conhecimento b
   where b.workspace_id = p_ws and b.habilitado and (
           (b.documento_id is null and coalesce(
              (select bool_or(ab.assistente_id = p_assistente) from public.assistente_blocos ab
                where ab.bloco_id = b.id and ab.workspace_id = b.workspace_id), true))
           or
           (b.documento_id is not null and exists (
              select 1 from public.base_documentos d
               where d.workspace_id = b.workspace_id and d.id = b.documento_id
                 and d.ligado and d.versao_ativa_id = b.versao_id
                 and coalesce((select bool_or(ad.assistente_id = p_assistente) from public.assistente_documentos ad
                                where ad.documento_id = d.id and ad.workspace_id = d.workspace_id), true)))
         )
     and (p_tipos is null or b.tipo = any(p_tipos))
     and b.fts @@ websearch_to_tsquery('portuguese', p_query)
   order by posicao
   limit p_limite * 2
), semantico as (
  select b.id, row_number() over (order by b.embedding <=> p_embedding) as posicao
    from public.base_conhecimento b
   where b.workspace_id = p_ws and b.habilitado and (
           (b.documento_id is null and coalesce(
              (select bool_or(ab.assistente_id = p_assistente) from public.assistente_blocos ab
                where ab.bloco_id = b.id and ab.workspace_id = b.workspace_id), true))
           or
           (b.documento_id is not null and exists (
              select 1 from public.base_documentos d
               where d.workspace_id = b.workspace_id and d.id = b.documento_id
                 and d.ligado and d.versao_ativa_id = b.versao_id
                 and coalesce((select bool_or(ad.assistente_id = p_assistente) from public.assistente_documentos ad
                                where ad.documento_id = d.id and ad.workspace_id = d.workspace_id), true)))
         )
     and (p_tipos is null or b.tipo = any(p_tipos))
     and p_embedding is not null
     and b.embedding is not null
     and b.embed_versao = p_versao
   order by b.embedding <=> p_embedding
   limit p_limite * 2
), alvo as (
  select textual.id from textual
  union
  select semantico.id from semantico
)
select b.id, b.titulo, b.conteudo, b.tipo,
       (coalesce(1.0 / (60 + textual.posicao), 0.0)
      + coalesce(1.0 / (60 + semantico.posicao), 0.0))::float as score,
       doc.nome_exibicao, b.caminho_titulos, b.pagina
  from alvo
  join public.base_conhecimento b on b.id = alvo.id and b.workspace_id = p_ws
  left join public.base_documentos doc on doc.workspace_id = b.workspace_id and doc.id = b.documento_id
  left join textual on textual.id = b.id
  left join semantico on semantico.id = b.id
 order by score desc
 limit p_limite;
$$;

revoke all on function public.base_conhecimento_buscar(uuid, text, extensions.vector, text, int, text[], uuid)
  from public, anon, authenticated;
grant execute on function public.base_conhecimento_buscar(uuid, text, extensions.vector, text, int, text[], uuid)
  to service_role;

-- ── 11. a lista por termos devolve SECOES, nao trechos ───────────────────────────────────
--
-- Um verbete longo vira 3–4 trechos; a lista conta e mostra verbetes. Secao = (versao, secao)
-- para trecho de documento COM titulo; trecho sem titulo (transcricao, pdf sem sumario, txt) e
-- card manual sao, cada um, a propria secao — senao uma aula inteira viraria um item so.
--
-- Uma secao entra quando CADA termo casa com ALGUM trecho visivel dela (nao precisa ser o
-- mesmo). Representante: com `p_embedding`, o trecho da secao mais parecido; sem, o primeiro
-- (por posicao) que casa com o primeiro termo. `total` conta secoes.
--
-- ⚠️ CUSTO: os trechos que casam saem do indice gin da `fts` (a uniao OR dos termos, que vira
-- parametro de InitPlan e entra no indice); so DEPOIS de saber quais secoes casam com todos os
-- termos e que a funcao volta a `base_conhecimento` para os candidatos a representante — e so
-- ali le `embedding`. Um CTE com todas as linhas visiveis do espaco seria materializado inteiro
-- (vetor e texto de cada trecho) a cada pagina da lista.
--
-- Entradas saneadas aqui dentro: 1 a 3 termos nao vazios (mais que 3 → os 3 primeiros; nenhum
-- → nenhuma linha), `p_limite` entre 1 e 50, `p_deslocamento` >= 0.
create or replace function public.base_secoes_por_termos(
  p_ws uuid,
  p_termos text[],
  p_assistente uuid,
  p_limite int,
  p_deslocamento int,
  p_embedding extensions.vector(1536) default null,
  p_versao text default null
) returns table (
  id uuid, documento text, titulo text, caminho_titulos text, pagina int, recorte text, total bigint
)
language sql stable security definer set search_path = extensions as $$
with termos as (
  select row_number() over (order by u.ordem) as ordem,
         websearch_to_tsquery('portuguese', u.termo) as q
    from (
      select x.termo, x.ordem
        from unnest(coalesce(p_termos, '{}'::text[])) with ordinality as x(termo, ordem)
       where coalesce(trim(x.termo), '') <> ''
       order by x.ordem
       limit 3
    ) u
), consulta as (
  -- Uniao OR dos termos (nulo quando nao ha termo → nenhuma linha casa).
  select q1 || coalesce(q2, q1) || coalesce(q3, q1) as qualquer, q1 as primeiro
    from (select (select t.q from termos t where t.ordem = 1) as q1,
                 (select t.q from termos t where t.ordem = 2) as q2,
                 (select t.q from termos t where t.ordem = 3) as q3) s
), casados as (
  select case when b.documento_id is not null and coalesce(b.caminho_titulos, '') <> '' and b.secao is not null
              then b.versao_id else b.id end as secao_dono,
         case when b.documento_id is not null and coalesce(b.caminho_titulos, '') <> '' and b.secao is not null
              then b.secao end as secao_num,
         t.ordem
    from public.base_conhecimento b
    join termos t on b.fts @@ t.q
   where b.fts @@ (select c.qualquer from consulta c)
     and b.workspace_id = p_ws and b.habilitado and b.tipo <> 'playbook' and (
           (b.documento_id is null and coalesce(
              (select bool_or(ab.assistente_id = p_assistente) from public.assistente_blocos ab
                where ab.bloco_id = b.id and ab.workspace_id = b.workspace_id), true))
           or
           (b.documento_id is not null and exists (
              select 1 from public.base_documentos d
               where d.workspace_id = b.workspace_id and d.id = b.documento_id
                 and d.ligado and d.versao_ativa_id = b.versao_id
                 and coalesce((select bool_or(ad.assistente_id = p_assistente) from public.assistente_documentos ad
                                where ad.documento_id = d.id and ad.workspace_id = d.workspace_id), true)))
         )
), secoes as (
  select m.secao_dono, m.secao_num
    from casados m
   group by m.secao_dono, m.secao_num
  having count(distinct m.ordem) = (select count(*) from termos)
), representantes as (
  select distinct on (s.secao_dono, s.secao_num)
         b.id, b.titulo, b.conteudo, b.caminho_titulos, b.pagina, b.posicao,
         doc.nome_exibicao as documento,
         case when p_embedding is not null and b.embedding is not null and b.embed_versao = p_versao
              then b.embedding <=> p_embedding end as distancia
    from secoes s
    join public.base_conhecimento b
      on b.workspace_id = p_ws
     and (
           (s.secao_num is null and b.id = s.secao_dono)
           or (s.secao_num is not null and b.versao_id = s.secao_dono and b.secao = s.secao_num
               and b.documento_id is not null and coalesce(b.caminho_titulos, '') <> '')
         )
    left join public.base_documentos doc on doc.workspace_id = b.workspace_id and doc.id = b.documento_id
   where b.habilitado and b.tipo <> 'playbook' and (
           (b.documento_id is null and coalesce(
              (select bool_or(ab.assistente_id = p_assistente) from public.assistente_blocos ab
                where ab.bloco_id = b.id and ab.workspace_id = b.workspace_id), true))
           or
           (b.documento_id is not null and exists (
              select 1 from public.base_documentos d
               where d.workspace_id = b.workspace_id and d.id = b.documento_id
                 and d.ligado and d.versao_ativa_id = b.versao_id
                 and coalesce((select bool_or(ad.assistente_id = p_assistente) from public.assistente_documentos ad
                                where ad.documento_id = d.id and ad.workspace_id = d.workspace_id), true)))
         )
     -- sem embedding, so concorre quem casa com o primeiro termo
     and (p_embedding is not null or b.fts @@ (select c.primeiro from consulta c))
   order by s.secao_dono, s.secao_num,
            distancia nulls last,
            (b.fts @@ (select c.primeiro from consulta c)) desc,
            b.posicao nulls last
)
select r.id, r.documento, r.titulo, r.caminho_titulos, r.pagina,
       case when p_embedding is null
            then ts_headline('portuguese', r.conteudo, (select c.primeiro from consulta c),
                             'MaxWords=30, MinWords=10, StartSel="", StopSel=""')
            else left(r.conteudo, 300) end as recorte,
       count(*) over () as total
  from representantes r
 order by case when p_embedding is not null then r.distancia end nulls last,
          r.documento, r.posicao, r.id
 limit least(greatest(coalesce(p_limite, 50), 1), 50)
offset greatest(coalesce(p_deslocamento, 0), 0);
$$;

revoke all on function public.base_secoes_por_termos(uuid, text[], uuid, int, int, extensions.vector, text)
  from public, anon, authenticated;
grant execute on function public.base_secoes_por_termos(uuid, text[], uuid, int, int, extensions.vector, text)
  to service_role;

-- ── 12. ler a secao (ou os vizinhos) de um trecho ────────────────────────────────────────
--
-- Trecho que nao passa no predicado → zero linhas (nem o proprio). Card manual → so ele.
create or replace function public.base_secao_do_trecho(
  p_ws uuid,
  p_trecho uuid,
  p_assistente uuid,
  p_modo text
) returns table (
  id uuid, documento text, caminho_titulos text, pagina int, posicao int, conteudo text, alvo boolean
)
language sql stable security definer set search_path = extensions as $$
with ponto as (
  select b.id, b.documento_id, b.versao_id, b.secao, b.posicao
    from public.base_conhecimento b
   where b.id = p_trecho
     and b.workspace_id = p_ws and b.habilitado and b.tipo <> 'playbook' and (
           (b.documento_id is null and coalesce(
              (select bool_or(ab.assistente_id = p_assistente) from public.assistente_blocos ab
                where ab.bloco_id = b.id and ab.workspace_id = b.workspace_id), true))
           or
           (b.documento_id is not null and exists (
              select 1 from public.base_documentos d
               where d.workspace_id = b.workspace_id and d.id = b.documento_id
                 and d.ligado and d.versao_ativa_id = b.versao_id
                 and coalesce((select bool_or(ad.assistente_id = p_assistente) from public.assistente_documentos ad
                                where ad.documento_id = d.id and ad.workspace_id = d.workspace_id), true)))
         )
)
select b.id, doc.nome_exibicao, b.caminho_titulos, b.pagina, b.posicao, b.conteudo, b.id = p.id
  from ponto p
  join public.base_conhecimento b
    on b.workspace_id = p_ws
   and (
         (p.documento_id is null and b.id = p.id)
         or (p.documento_id is not null and b.versao_id = p.versao_id and (
               b.id = p.id
               or (p_modo = 'secao' and b.secao = p.secao)
               or (p_modo = 'vizinhos' and b.posicao between p.posicao - 1 and p.posicao + 1)))
       )
  left join public.base_documentos doc on doc.workspace_id = b.workspace_id and doc.id = b.documento_id
 where b.habilitado and b.tipo <> 'playbook' and (
         (b.documento_id is null and coalesce(
            (select bool_or(ab.assistente_id = p_assistente) from public.assistente_blocos ab
              where ab.bloco_id = b.id and ab.workspace_id = b.workspace_id), true))
         or
         (b.documento_id is not null and exists (
            select 1 from public.base_documentos d
             where d.workspace_id = b.workspace_id and d.id = b.documento_id
               and d.ligado and d.versao_ativa_id = b.versao_id
               and coalesce((select bool_or(ad.assistente_id = p_assistente) from public.assistente_documentos ad
                              where ad.documento_id = d.id and ad.workspace_id = d.workspace_id), true)))
       )
 order by b.posicao nulls first, b.id;
$$;

revoke all on function public.base_secao_do_trecho(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.base_secao_do_trecho(uuid, uuid, uuid, text) to service_role;

-- ── 13. a fila do processador ───────────────────────────────────────────────────────────
--
-- Reivindica UMA versao: na fila, ou processando com a reserva vencida (o servidor caiu no
-- meio) — desde que nao tenha esgotado as cinco tentativas. `skip locked`: dois processadores
-- nunca pegam a mesma. A etapa NAO e zerada: quem retoma continua de onde parou.
create or replace function public.base_versao_reivindicar(p_reserva_s int)
returns setof public.base_documento_versoes
language sql volatile security definer set search_path = '' as $$
update public.base_documento_versoes v
   set status = 'processando',
       trabalhando_ate = now() + p_reserva_s * interval '1 second',
       tentativas = v.tentativas + 1
 where v.id = (
         select x.id
           from public.base_documento_versoes x
          where x.status in ('na_fila', 'processando')
            and coalesce(x.trabalhando_ate, '-infinity'::timestamptz) < now()
            and x.tentativas < 5
          order by x.criado_em
          limit 1
          for update skip locked
       )
returning v.*;
$$;

revoke all on function public.base_versao_reivindicar(int) from public, anon, authenticated;
grant execute on function public.base_versao_reivindicar(int) to service_role;

-- Promove a versao a ativa numa transacao so: troca o ponteiro, marca pronta e apaga a antiga
-- (os trechos dela saem pelo cascade). Devolve o caminho do objeto antigo para o app apagar do
-- bucket — '' quando nao havia ativa, null quando a versao sumiu (documento excluido no meio).
create or replace function public.base_versao_promover(p_ws uuid, p_versao uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  doc uuid;
  antiga uuid;
  caminho_antigo text;
begin
  select v.documento_id into doc
    from public.base_documento_versoes v
   where v.workspace_id = p_ws and v.id = p_versao;
  if not found then return null; end if;

  select d.versao_ativa_id into antiga
    from public.base_documentos d
   where d.workspace_id = p_ws and d.id = doc
   for update;
  if not found then return null; end if;

  -- Depois da trava do documento: a versao pode ter saido entre a primeira leitura e a trava.
  perform 1 from public.base_documento_versoes v
   where v.workspace_id = p_ws and v.id = p_versao
   for update;
  if not found then return null; end if;

  if antiga is not null and antiga <> p_versao then
    select v.caminho into caminho_antigo
      from public.base_documento_versoes v
     where v.workspace_id = p_ws and v.id = antiga;
  end if;

  update public.base_documentos d
     set versao_ativa_id = p_versao
   where d.workspace_id = p_ws and d.id = doc;

  update public.base_documento_versoes v
     set status = 'pronto', etapa = null, trabalhando_ate = null
   where v.workspace_id = p_ws and v.id = p_versao;

  if antiga is not null and antiga <> p_versao then
    delete from public.base_documento_versoes v
     where v.workspace_id = p_ws and v.id = antiga;
  end if;

  return coalesce(caminho_antigo, '');
end $$;

revoke all on function public.base_versao_promover(uuid, uuid) from public, anon, authenticated;
grant execute on function public.base_versao_promover(uuid, uuid) to service_role;

-- Faxina periodica: (1) versao que esgotou as cinco tentativas e cuja reserva venceu vira
-- `erro` com motivo — nunca "processando" para sempre; (2) envio abandonado ha mais de 24 h e
-- apagado, e o caminho volta para o app apagar o objeto. Documento que fica sem nenhuma versao
-- sai junto.
create or replace function public.base_versoes_faxina()
returns table (caminho text) language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  wss uuid[];
  docs uuid[];
  caminhos text[];
begin
  update public.base_documento_versoes v
     set status = 'erro',
         motivo_erro = 'O processamento falhou cinco vezes seguidas. Tente reprocessar; se continuar, fale com quem instalou o CRM.',
         trabalhando_ate = null
   where v.status in ('na_fila', 'processando')
     and coalesce(v.trabalhando_ate, '-infinity'::timestamptz) < now()
     and v.tentativas >= 5;

  with apagadas as (
    delete from public.base_documento_versoes v
     where v.status = 'enviando'
       and v.criado_em < now() - interval '24 hours'
    returning v.workspace_id, v.documento_id, v.caminho
  )
  select array_agg(a.workspace_id), array_agg(a.documento_id), array_agg(a.caminho)
    into wss, docs, caminhos
    from apagadas a;

  if caminhos is null then return; end if;

  delete from public.base_documentos d
   using unnest(wss, docs) as x(ws, doc)
   where d.workspace_id = x.ws and d.id = x.doc
     and not exists (
       select 1 from public.base_documento_versoes v
        where v.workspace_id = d.workspace_id and v.documento_id = d.id
     );

  return query select c from unnest(caminhos) as c;
end $$;

revoke all on function public.base_versoes_faxina() from public, anon, authenticated;
grant execute on function public.base_versoes_faxina() to service_role;

-- ── 14. o recorte de um documento, numa transacao so ────────────────────────────────────
--
-- Copia de `trocar_recorte_do_bloco` (0044): o `delete` sozinho alargaria o alcance (documento
-- sem linha vale para todos). 1 = trocou · 0 = documento de outro espaco · 2 = assistente de
-- outro espaco.
create or replace function public.trocar_recorte_do_documento(
  p_ws uuid, p_documento uuid, p_assistentes uuid[]
) returns int language plpgsql security definer set search_path = '' as $$
declare
  ids uuid[];
  qtd int;
  validos int;
begin
  perform 1 from public.base_documentos d
   where d.id = p_documento and d.workspace_id = p_ws
   for update;
  if not found then return 0; end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[]) into ids
    from unnest(coalesce(p_assistentes, '{}'::uuid[])) as x;
  qtd := coalesce(array_length(ids, 1), 0);

  if qtd > 0 then
    select count(*) into validos
      from public.assistentes a
     where a.workspace_id = p_ws and a.id = any(ids);
    if validos <> qtd then return 2; end if;
  end if;

  delete from public.assistente_documentos ad
   where ad.workspace_id = p_ws and ad.documento_id = p_documento;

  if qtd > 0 then
    insert into public.assistente_documentos (workspace_id, documento_id, assistente_id)
    select p_ws, p_documento, x from unnest(ids) as x;
  end if;

  return 1;
end $$;

revoke all on function public.trocar_recorte_do_documento(uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.trocar_recorte_do_documento(uuid, uuid, uuid[]) to service_role;
