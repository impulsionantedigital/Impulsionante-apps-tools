# Cursos e aulas no admin — design

## 1. Objetivo e público

Este documento é o Sub-projeto A de uma iniciativa maior: transformar este repositório (hoje
uma instância do motor Awave CRM, usada para o produto "GPS da Pena") na área **administrativa**
do produto **Trilhas de Aruanda** — uma plataforma de cursos. A área admin continua só para
donos de workspace; o **membro/aluno** vai acessar o conteúdo por um app novo (Capacitor + Vite +
Capgo self-hosted), que é o Sub-projeto C. O contrato de API que esse app consome é o
Sub-projeto B.

**Este spec cobre só o Sub-projeto A**: o modelo de dados de cursos/módulos/aulas e as telas de
admin para geri-los. Não cobre a API pública nem o app do membro — ver §13 (Fora de escopo).

Escrito para quem vai implementar o Sub-projeto A: precisa entender o modelo de dados existente
de vendas (§9.2 de `2026-09-13-vendas-hotmart-design.md`) e o padrão de telas de `config/funis`.

## 2. Premissas

- **Este repositório é um fork dedicado ao Trilhas de Aruanda.** Não precisa preservar a
  fronteira `custom/` do `AGENTS.md` (essa fronteira é para compradores do motor genérico Awave
  CRM) — o trabalho edita `src/`, `supabase/migrations/` e `src/server/` diretamente, como o time
  interno do motor faria.
- **A área admin mantém todos os módulos de CRM que já existem** (contatos, negócios, conversas,
  automações, agentes, base de conhecimento). Cursos entra como mais um módulo, ao lado dos
  outros — nada é removido.
- **Curso é produto.** Reaproveita inteiramente `ofertas` → `vendas` → `vendas_periodos` →
  `estadoDeAcesso()`, que já processam compras da Hotmart e calculam janela de acesso. Nenhuma
  tabela nova de "acesso a curso" — o `produto_id` do curso é o mesmo id usado no array
  `ofertas.produtos`.
- **Categoria do curso é uma lista fixa em código** (`curso`, `formação`, e futuras), não uma
  tabela que o admin edita pela tela — no mesmo espírito do domínio fechado de `duracao` em
  `ofertas`.
- **Vídeo hospedado no YouTube (não listado).** A aula guarda só o ID do vídeo; o player é
  responsabilidade de quem consome (a tela de preview no admin, e futuramente o app do membro).
  Sem upload de arquivo, sem transcodificação, sem CDN de vídeo próprio.
- **`progresso_aulas` nasce aqui, mas não é escrito por ninguém ainda.** É o Sub-projeto B (API
  do app do membro) quem vai gravar nela. Criar a tabela e a RLS agora evita uma segunda migration
  só para isso, e mantém "cursos e aulas" como uma unidade fechada.
- **Sem quizzes, certificados, comentários ou categorias dinâmicas nesta v1** — ver §13.

## 3. O fluxo, de ponta a ponta (visão do dono do workspace)

1. Dono cria um curso em `/cursos`: título, categoria (Curso ou Formação), define o `produto_id`
   (slug, ex. `formacao-medium-2026`).
2. Dono entra no curso (`/cursos/[cursoId]`) e cria módulos, ordenando por arraste.
3. Dono entra num módulo (`/cursos/[cursoId]/[moduloId]`) e cadastra aulas: título, descrição, ID
   do vídeo do YouTube. Ordena por arraste.
4. Dono publica o curso e as aulas quando o conteúdo estiver pronto (`publicado = true`) — só
   conteúdo publicado é lido pelo app do membro (§7).
5. Em **Configurações → Comercial → Ofertas**, o dono cria/edita uma oferta da Hotmart e marca o
   curso na lista de produtos que ela libera — a mesma tela que já libera a calculadora, agora
   somando cursos aos produtos disponíveis (§6).
6. Uma compra aprovada pela Hotmart segue o fluxo que já existe (§7 de
   `2026-09-13-vendas-hotmart-design.md`): vira venda, vira período de acesso por `produto_id` —
   sem nenhuma mudança nesse caminho.

## 4. Modelo de dados

Nova migration `supabase/migrations/0066_cursos.sql` — aditiva e idempotente, no padrão das
demais (guardas `if not exists` / `do $$ ... end $$` conforme a regra 3 do `AGENTS.md`).

### 4.1 `cursos`

```sql
create table if not exists public.cursos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  produto_id    text not null,
  categoria     text not null,
  titulo        text not null,
  descricao     text,
  capa_url      text,
  publicado     boolean not null default false,
  ordem         integer not null default 0,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint cursos_categoria_dominio_check check (categoria in ('curso','formacao')),
  constraint cursos_titulo_preenchido_check check (length(trim(titulo)) > 0)
);

create unique index if not exists cursos_workspace_produto_key on public.cursos (workspace_id, produto_id);
-- Alvo da FK composta de `modulos`.
create unique index if not exists cursos_workspace_id_key on public.cursos (workspace_id, id);
```

`categoria` espelha, em código, `src/lib/cursos/categorias.ts`:

```ts
export const CATEGORIAS_CURSO = [
  { id: 'curso', rotulo: 'Curso' },
  { id: 'formacao', rotulo: 'Formação' },
] as const

export type CategoriaCurso = (typeof CATEGORIAS_CURSO)[number]['id']

export function ehCategoriaConhecida(id: unknown): id is CategoriaCurso {
  return typeof id === 'string' && CATEGORIAS_CURSO.some((c) => c.id === id)
}
```

Adicionar uma categoria nova = uma migration trocando o `check` (mesma técnica da regra 4.6 do
`AGENTS.md` para domínios do produto) + uma linha em `CATEGORIAS_CURSO`.

### 4.2 `modulos`

```sql
create table if not exists public.modulos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  curso_id      uuid not null,
  titulo        text not null,
  ordem         integer not null default 0,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint modulos_titulo_preenchido_check check (length(trim(titulo)) > 0)
);

create unique index if not exists modulos_workspace_id_key on public.modulos (workspace_id, id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'modulos_curso_fk' and conrelid = 'public.modulos'::regclass
  ) then
    alter table public.modulos add constraint modulos_curso_fk
      foreign key (workspace_id, curso_id) references public.cursos (workspace_id, id) on delete cascade;
  end if;
end $$;
```

### 4.3 `aulas`

```sql
create table if not exists public.aulas (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  modulo_id         uuid not null,
  titulo            text not null,
  descricao         text,
  video_youtube_id  text,
  publicado         boolean not null default false,
  ordem             integer not null default 0,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  constraint aulas_titulo_preenchido_check check (length(trim(titulo)) > 0)
);

create unique index if not exists aulas_workspace_id_key on public.aulas (workspace_id, id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'aulas_modulo_fk' and conrelid = 'public.aulas'::regclass
  ) then
    alter table public.aulas add constraint aulas_modulo_fk
      foreign key (workspace_id, modulo_id) references public.modulos (workspace_id, id) on delete cascade;
  end if;
end $$;
```

### 4.4 `progresso_aulas`

```sql
create table if not exists public.progresso_aulas (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  membro_id     uuid not null,
  aula_id       uuid not null,
  concluida_em  timestamptz not null default now(),
  primary key (membro_id, aula_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'progresso_aulas_membro_fk' and conrelid = 'public.progresso_aulas'::regclass
  ) then
    alter table public.progresso_aulas add constraint progresso_aulas_membro_fk
      foreign key (workspace_id, membro_id) references public.membros (workspace_id, id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'progresso_aulas_aula_fk' and conrelid = 'public.progresso_aulas'::regclass
  ) then
    alter table public.progresso_aulas add constraint progresso_aulas_aula_fk
      foreign key (workspace_id, aula_id) references public.aulas (workspace_id, id) on delete cascade;
  end if;
end $$;
```

### 4.5 Gatilhos de `atualizado_em`

Mesmo padrão da `0064`: um `do $$ ... end $$` por tabela, criando o trigger
`<tabela>_set_atualizado` com `public.set_atualizado_em()` se ainda não existir. Vale para
`cursos`, `modulos` e `aulas` (`progresso_aulas` não tem `atualizado_em` — é só um carimbo de
quando concluiu).

## 5. RLS e grants

Diferente de `ofertas`/`vendas` (só `service_role`, porque só o admin mexe e o dado é comercial),
`cursos`/`modulos`/`aulas` precisam de leitura direta por `authenticated`, porque é assim que o
app do membro (Sub-projeto B/C) vai consultar — com o JWT do próprio membro, sem passar por
server action.

```sql
alter table public.cursos enable row level security;
alter table public.modulos enable row level security;
alter table public.aulas enable row level security;
alter table public.progresso_aulas enable row level security;

grant all on table public.cursos, public.modulos, public.aulas, public.progresso_aulas
  to anon, authenticated, service_role;
```

**Escrita** (criar/editar/reordenar/publicar) só por `service_role`, via server action — a policy
de `service_role` de sempre, `using (true) with check (true)`, uma por tabela.

**Leitura por `authenticated`** — só o que o membro tem direito de ver: curso publicado, com
período de acesso ativo para aquele `produto_id`:

```sql
create policy cursos_membro_select on public.cursos for select to authenticated using (
  publicado = true
  and exists (
    select 1
    from public.membros m
    join public.vendas_periodos vp on vp.workspace_id = m.workspace_id and vp.membro_id = m.id
    join public.vendas v on v.id = vp.venda_id
    where m.user_id = auth.uid()
      and vp.workspace_id = cursos.workspace_id
      and vp.produto_id = cursos.produto_id
      and v.status = 'ativa'
      and vp.inicia_em <= now()
      and (vp.expira_em is null or vp.expira_em > now())
  )
);
```

`modulos`/`aulas` seguem a mesma ideia, subindo até `cursos` para achar o `produto_id` e exigindo
`publicado = true` na própria linha e no curso. `progresso_aulas` ganha uma policy onde o membro
só mexe na própria linha:

```sql
create policy progresso_aulas_membro_rw on public.progresso_aulas for all to authenticated using (
  exists (select 1 from public.membros m where m.id = progresso_aulas.membro_id and m.user_id = auth.uid())
) with check (
  exists (select 1 from public.membros m where m.id = progresso_aulas.membro_id and m.user_id = auth.uid())
);
```

As expressões exatas das policies de `modulos`/`aulas` (join até `cursos`) ficam para o plano de
implementação — o formato acima já define o contrato.

## 6. Integração com Ofertas (Comercial)

`ComercialCard.tsx` → `OfertasBloco` hoje monta a lista de produtos marcáveis a partir só de
`PRODUTOS` (o catálogo fixo de motores de calculadora). `acoes-comercial.ts` (`VistaComercial`)
passa a somar, na lista de produtos disponíveis para uma oferta:

- os itens de `PRODUTOS` (ferramentas, como hoje);
- os cursos do workspace (`id = produto_id`, rótulo = `titulo`), lidos direto de `cursos` — sem
  exigir que estejam publicados (o dono pode montar a oferta antes de publicar o conteúdo).

Nenhuma mudança no formato de `ofertas.produtos` (continua `text[]`) nem no processamento do
webhook — o `produto_id` de um curso é só mais um texto nesse array, do jeito que já funciona
para a calculadora.

## 7. Telas de admin

Rotas dentro de `(app)`, no padrão de `ferramentas/indulto-comutacao/[id]`:

- **`/cursos`** — lista de cursos do workspace: criar, editar título/categoria, alternar
  publicado, ordenar por arraste (`@dnd-kit`, mesmo padrão de `EditorEtapas.tsx`), excluir.
- **`/cursos/[cursoId]`** — cabeçalho do curso (editar campos) + lista de módulos, mesmo CRUD e
  ordenação.
- **`/cursos/[cursoId]/[moduloId]`** — cabeçalho do módulo + lista de aulas: título, descrição,
  ID do vídeo do YouTube (com preview embutido), publicado, ordenação.

Reordenar segue o padrão de `reordenarEtapas`: o cliente calcula a lista reordenada
(`arrayMove`) e manda os ids na nova ordem para a server action, que reescreve `ordem` como o
índice de cada id na lista recebida.

## 8. Guarda de acesso

Hoje, fora de `/ferramentas`, o "só dono do workspace" desta instalação depende de um proxy
configurado fora do repositório (comentário em `sessaoEws()`, `src/server/crm/acoes.ts`) — o que
funciona para a instalação atual, mas não é algo que este repositório vai necessariamente ter
configurado. Como cursos é conteúdo comercial sensível (o mesmo padrão de `ComercialCard`), a
melhoria pontual deste trabalho é um guard **no próprio código**, sem depender de proxy:

`src/app/(app)/cursos/layout.tsx` chama `souDonoDeAlgumWorkspace()` (já existe, `src/server/auth/comprador.ts`) e redireciona para `/painel` quem não é dono. Cobre as três rotas de uma vez, por
herança do layout. Não mexe em nenhuma outra rota existente.

## 9. Servidor e lógica pura

- **`src/server/cursos/acoes.ts`** — server actions finas: `criarCurso`, `salvarCurso`,
  `excluirCurso`, `reordenarCursos`, `criarModulo`, `salvarModulo`, `excluirModulo`,
  `reordenarModulos`, `criarAula`, `salvarAula`, `excluirAula`, `reordenarAulas`. Cada uma
  confere `souDonoDeAlgumWorkspace()` + resolve o workspace ativo, e delega ao cliente
  `service_role` (`src/server/supabase.ts`, `admin`) — mesmo formato de retorno
  `{ ok: true } | { ok: true; id: string } | { erro: string }` usado em `acoes-comercial.ts` e
  `funis.ts`.
- **`src/lib/cursos/categorias.ts`** — `CATEGORIAS_CURSO` e `ehCategoriaConhecida` (§4.1).
- **`src/lib/cursos/ordenar.ts`** — função pura que recebe a lista atual de ids e a nova ordem
  recebida do arraste, e devolve os pares `{ id, ordem }` a gravar. Testável sem banco.

Segue a separação que o repositório já usa: `src/server/` fino e sem teste direto, `src/lib/`
testável.

## 10. Navegação

Item **"Cursos"** novo em `src/components/shell/Rail.tsx`, ao lado dos módulos existentes
(Contatos, Negócios, Conversas, …). Visível só para quem passa pela guarda do layout (§8) — não
precisa de lógica extra de visibilidade no menu além do que a rota já impõe.

## 11. Testes

- **`tests/cursos/categorias.spec.ts`** — `ehCategoriaConhecida` aceita as duas categorias e
  rejeita qualquer outra string.
- **`tests/cursos/ordenar.spec.ts`** — reordenar move um item para o meio, para o início, para o
  fim; ids desconhecidos não quebram; lista vazia não quebra.
- **`tests/migracoes/idempotencia.spec.ts`** já varre migrations por número crescente — a `0066`
  entra na varredura sem nenhuma mudança nesse arquivo.
- Sem teste de integração contra Postgres real para as policies de RLS (o repositório não testa
  banco — nota em `ESTADO-vendas-hotmart.md`, "Não há banco nem SMTP sob teste"); a verificação
  de RLS é manual, em produção ou staging, no roteiro do plano de implementação.

## 12. Dado pessoal e segurança

Nenhum dado pessoal novo — `cursos`/`modulos`/`aulas` são conteúdo do produto, não dado de
membro. `progresso_aulas` guarda só `membro_id` + `aula_id` + timestamp, sem conteúdo sensível.
A policy de leitura por `authenticated` (§5) é a superfície nova de exposição a auditar: um
membro só vê curso/módulo/aula publicados e cobertos por período de acesso ativo — mesma régua
de `estadoDeAcesso()`, aplicada agora dentro de uma policy SQL em vez de uma função TypeScript.

## 13. Fora de escopo (deste sub-projeto)

- **API pública para o app do membro** (Sub-projeto B) — como o app vai listar "meus cursos",
  buscar detalhe de curso/módulo/aula e gravar progresso. Este spec só garante que a leitura via
  RLS (§5) já dá suporte a isso; o contrato fica para o próximo spec.
- **App do membro e infra Capgo self-hosted** (Sub-projeto C).
- Upload de vídeo próprio, streaming adaptativo, DRM.
- Quizzes, certificados de conclusão, comentários/dúvidas por aula.
- Categorias de curso editáveis pela tela (decisão tomada: fixas em código, §2).
- Qualquer mudança em `/ferramentas`, no fluxo de comprador da calculadora, ou na guarda de
  acesso de outras rotas fora de `/cursos`.

## 14. Ordem de entrega sugerida

1. Migration `0066` (schema + RLS + grants).
2. `src/lib/cursos/` (categorias, ordenar) + testes.
3. `src/server/cursos/acoes.ts`.
4. Telas `/cursos`, `/cursos/[cursoId]`, `/cursos/[cursoId]/[moduloId]` + guarda de acesso (§8) +
   item de menu.
5. Integração com `OfertasBloco`/`acoes-comercial.ts` (§6).
6. Verificação manual: criar curso → módulo → aula → publicar → marcar produto numa oferta →
   confirmar que uma venda de teste (via `curl` no webhook, como no roteiro de
   `ESTADO-vendas-hotmart.md`) gera um período que a policy de `authenticated` já enxergaria.
