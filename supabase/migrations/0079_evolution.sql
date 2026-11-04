-- 0079 — canal WhatsApp pela Evolution API (provider `evolution`).
--
-- Só alarga o dominio de `canais.provider`. O bloco é o mesmo da 0037 (ver os comentários de lá):
-- derruba só a check que é do produto (nome E conjunto de valores), avisa no log quando reconhece
-- só metade e aguenta rodar duas vezes. O dominio NOVO também está em `dominios`: numa segunda
-- passada ele é reconhecido como nosso, derrubado e recriado igual, em vez de virar aviso falso.
do $$
declare
  alvo record;
  c    record;
  n    smallint;
  nome text;
  padrao text;
  valores text[];
  nossa boolean;
  nomeia boolean;
begin
  for alvo in
    select * from (values
      ('public.canais'::text, 'provider'::text,
       $novo$provider in ('uazapi', 'simulador', 'whatsapp_cloud', 'instagram', 'evolution')$novo$::text,
       array['uazapi',
             'uazapi,simulador',
             'uazapi,simulador,whatsapp_cloud',
             'uazapi,simulador,whatsapp_cloud,instagram',
             'uazapi,simulador,whatsapp_cloud,instagram,evolution']::text[])
    ) as t(tabela, coluna, novo_check, dominios)
  loop
    select a.attnum into n
      from pg_attribute a
     where a.attrelid = alvo.tabela::regclass
       and a.attname  = alvo.coluna
       and not a.attisdropped;
    if n is null then
      raise exception 'coluna %.% nao encontrada', alvo.tabela, alvo.coluna;
    end if;

    padrao := '^' || replace(alvo.tabela, 'public.', '') || '_' || alvo.coluna
                  || '_(check[0-9]*|dominio_check)$';

    for c in
      select conname, pg_get_constraintdef(oid) as def from pg_constraint
       where conrelid = alvo.tabela::regclass
         and contype  = 'c'
         and conkey   = array[n]::smallint[]
    loop
      select coalesce(array_agg(t.m[1]), '{}')
        into valores
        from regexp_matches(c.def, '''([^'']*)''', 'g') as t(m);

      select coalesce(bool_or(d <@ valores and valores <@ d), false)
        into nossa
        from (select string_to_array(x, ',') as d from unnest(alvo.dominios) as x) as u;

      nomeia := c.conname ~ padrao;

      if nomeia and nossa then
        execute format('alter table %s drop constraint %I', alvo.tabela, c.conname);
      elsif nomeia or nossa then
        raise warning '[0079] ATENCAO: check % de %.% reconhecida so pela metade (nome=%, definicao=%). Ela NAO foi derrubada e o dominio NAO foi alargado — o valor novo sera recusado ate alguem conferir. Definicao encontrada: %',
          c.conname, alvo.tabela, alvo.coluna, nomeia, nossa, c.def;
      else
        raise notice '[0079] check % de %.% PRESERVADA (nao e nossa): ela NAO foi alargada — confira se ainda aceita os valores novos',
          c.conname, alvo.tabela, alvo.coluna;
      end if;
    end loop;

    nome := replace(alvo.tabela, 'public.', '') || '_' || alvo.coluna || '_dominio_check';
    if not exists (
      select 1 from pg_constraint
       where conname = nome and conrelid = alvo.tabela::regclass
    ) then
      -- Nome escrito por extenso (é sempre `canais_provider_dominio_check`, o único alvo do laço):
      -- assim a checagem de "toda check tem nome" das migrations enxerga o nome.
      execute format('alter table %s add constraint canais_provider_dominio_check check (%s)',
                     alvo.tabela, alvo.novo_check);
    end if;
  end loop;
end $$;
