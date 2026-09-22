# Repositório único, filtro por projeto e estrutura de cursos — design

## 1. Objetivo e público

Este documento existe para quem vai **continuar o desenvolvimento no `gpsdapena-tools`** depois da
unificação dos dois repositórios. Ele assume que você conhece o código do motor (Awave CRM) mas
**não** acompanhou o desenvolvimento do `trilhasdearuanda-app` — então descreve o que foi
construído lá, o que vem junto na unificação, e o que falta decidir/fazer.

Ele cobre três coisas:

1. **O filtro por projeto** — como um único código-base serve GPS da Pena e Trilhas de Aruanda,
   mostrando em cada deploy só os produtos daquele projeto (§4).
2. **A estrutura de cursos** — o que já existe, pronto e revisado, e o que falta (§5).
3. **As pendências e armadilhas** que não são óbvias e já custaram bug em produção ou quase (§8, §10).

## 2. Decisões já tomadas

Estas não estão em aberto; são o ponto de partida.

- **Um repositório só.** O `trilhasdearuanda-app` era uma cópia achatada do `gpsdapena-tools`
  (commit `243463c`, 14/09/2026), sem ancestralidade de git. Isso foi corrigido: o histórico do
  trilhasdearuanda foi rebaseado sobre `243463c`, e o `gpsdapena/main` foi mergeado por completo.
  O motivo da unificação não foi estética — foi custo demonstrado: um único merge produziu três
  reintroduções silenciosas de um bug de pagamento e uma colisão de numeração de migration que
  derruba o boot do container (§8.1, §8.2).
- **Um deploy por projeto, mesma imagem.** Unificar o repositório não unifica os deploys: cada
  projeto continua com seu container, seu Supabase e sua marca (nome/logo/cor vivem no banco, em
  Configurações → Servidor → Marca — não em código). É o modelo self-host que o `README.md` já
  descreve.
- **O produto declara onde aparece**, e não a variável de ambiente listando produtos. Um id
  errado no catálogo é erro de compilação; numa variável de ambiente seria silencioso. É o mesmo
  princípio que o comentário de `src/lib/produtos/catalogo.ts` já defende ("É código, não dado, de
  propósito").
- **Curso é dado, não catálogo.** Calculadora e (provavelmente) almanaque são produtos em
  **código** — motor, telas, rotas. Curso é uma **linha na tabela `cursos`** do banco daquele
  deploy. Isso tem consequência direta no filtro (§6).

## 3. Onde as coisas estão hoje

O que veio do `trilhasdearuanda-app` para o código unificado:

| O que | Onde |
|---|---|
| Schema de cursos | `supabase/migrations/0071_cursos.sql` |
| Ações de admin (cursos/módulos/aulas) | `src/server/cursos/acoes.ts` |
| Telas de admin | `src/app/(app)/cursos/**` (9 arquivos) |
| Lógica pura testável | `src/lib/cursos/{categorias,youtube,ordenar}.ts` + `tests/cursos/*` |
| Resolvedor de produtos vendáveis | `src/server/produtos/vendaveis.ts` |
| Spec e plano originais | `docs/superpowers/specs/2026-09-14-cursos-e-aulas-design.md`, `docs/superpowers/plans/2026-09-14-cursos-e-aulas.md` |

O que mudou no motor por causa de cursos (arquivos que já existiam):

- `src/server/vendas/processar.ts` e `src/app/(app)/config/acoes-comercial.ts`: todo filtro de
  produto deixou de usar `ehProdutoConhecido` (catálogo fixo) e passou a usar
  `idsDeProdutoValidos(ws)` (catálogo + cursos daquele workspace). **Esta é a mudança mais
  importante de entender antes de mexer em vendas** — ver §8.1.
- `src/app/(app)/config/ComercialCard.tsx`: `formularioDe(o, idsConhecidos)` filtra produto órfão.
- `src/components/shell/Rail.tsx`: item fixo "Cursos" no menu.

## 4. O filtro por projeto

### 4.1 A variável de ambiente

```bash
PROJETO=gpsdapena          # no deploy do GPS da Pena
PROJETO=trilhasdearuanda   # no deploy do Trilhas de Aruanda
```

Regras:

- **Sem prefixo `NEXT_PUBLIC_`.** O comentário de `checkoutDoProduto` em `catalogo.ts` já
  documenta o motivo: `NEXT_PUBLIC_` é inlinado no bundle em tempo de *build*, e o CRM roda em
  Docker — a variável do painel só chegaria ao bundle se estivesse presente durante o
  `pnpm build` dentro da imagem. O filtro é aplicado no servidor; ler sem prefixo basta, e trocar
  o valor no painel passa a valer com um restart, sem reconstruir a imagem.
- **Obrigatória.** Sem ela, o boot falha (§4.6). Não existe padrão: "mostrar tudo" vazaria produto
  de um projeto no outro, e "mostrar nada" daria um app vazio sem explicação.
- Ela identifica o **projeto**, não a marca. Nome, logo e cor continuam no banco.

### 4.2 O tipo

```ts
// src/lib/produtos/projeto.ts
export const PROJETOS = ['gpsdapena', 'trilhasdearuanda'] as const
export type Projeto = (typeof PROJETOS)[number]

export function ehProjeto(valor: unknown): valor is Projeto {
  return typeof valor === 'string' && (PROJETOS as readonly string[]).includes(valor)
}

/** 🔴 Lança se a variável estiver ausente ou com valor fora da lista — ver §4.6. */
export function projetoAtual(env: Record<string, string | undefined> = process.env): Projeto {
  const valor = (env.PROJETO ?? '').trim()
  if (!ehProjeto(valor)) {
    throw new Error(
      `PROJETO inválido ou ausente: "${valor}". Valores aceitos: ${PROJETOS.join(', ')}.`,
    )
  }
  return valor
}
```

Acrescentar um projeto novo é acrescentar uma string em `PROJETOS` — e o TypeScript passa a exigir
que todo produto declare se aparece nele ou não.

### 4.3 O catálogo: duas exportações, não uma

Esta é a parte que decide se o filtro é seguro ou tem furo. `src/lib/produtos/catalogo.ts` passa a
exportar **duas** listas:

```ts
/** TODOS os produtos que existem no código, independentemente de projeto. Use isto só em
 *  testes de contrato e em ferramentas de manutenção — nunca para montar tela. */
export const CATALOGO = [
  {
    id: 'indulto-comutacao-2025',
    slug: 'cic-2025',
    familia: 'indulto-comutacao',
    projetos: ['gpsdapena'],
    rotulo: 'Calculadora de Indulto e Comutação — Decreto 12.970/2025',
    menuTitulo: 'GPS CIC - Calculadora 2025',
    menuDescricao: 'Decreto 12.970/2025',
  },
  // … os demais, cada um com `projetos: readonly Projeto[]`
] as const

/** O recorte DESTE deploy. É isto que monta menu, vitrine, rota e lista de produtos da oferta. */
export const PRODUTOS = CATALOGO.filter((p) =>
  (p.projetos as readonly string[]).includes(projetoAtual()),
)
```

Por que filtrar **no catálogo**, e não em cada tela: tudo que hoje consome `PRODUTOS` herda o
filtro sem que ninguém precise lembrar de nada. A alternativa (filtrar na exibição) esconde o
produto do menu mas deixa a rota, a oferta e o webhook funcionando — é "esconder", não "não
existir".

`ehProdutoConhecido`, `rotuloDoProduto`, `produtoPorSlug`, `caminhoDoProduto` e `slugDoMotor`
continuam derivando de `PRODUTOS` (o recorte). Isso é deliberado: é o que faz o webhook recusar a
compra de um produto de outro projeto.

### 4.4 O que herda o filtro (verificado no código)

| Camada | Arquivo | Como herda |
|---|---|---|
| Menu lateral | `src/components/shell/Rail.tsx` | Já itera `PRODUTOS` e agrupa por `familia` |
| Vitrine de ferramentas | `src/app/(app)/ferramentas/page.tsx` | Itera `PRODUTOS` |
| **Rota da calculadora** | `src/app/(app)/ferramentas/[calculadora]/page.tsx` | Resolve por `produtoPorSlug()` e chama `notFound()` → **404 de verdade**, não link escondido |
| Lista de produtos da oferta | `src/server/produtos/vendaveis.ts` → `acoes-comercial.ts` | `produtosVendaveis()` concatena `PRODUTOS` com os cursos do workspace |
| Webhook de compra | `src/server/vendas/processar.ts` | `idsDeProdutoValidos(ws)` deriva de `produtosVendaveis()`; produto de outro projeto cai em `oferta_invalida`, que já é caminho tratado e auditado |

### 4.5 O que NÃO herda, e por que não é furo

`src/server/vendas/acesso.ts` (o gate: `estadoDoProduto`, `exigirEscrita`, `detalheDoProduto`) lê
**do banco** (`vendas` + `vendas_periodos`), não do catálogo. Um período de um produto de outro
projeto continuaria respondendo "ativo" se alguém perguntasse.

Não é furo porque **não existe tela para perguntar**: a rota daquele produto dá 404 antes (§4.4).
O gate é consultado *pelas telas do produto*, que deixam de existir naquele deploy.

Mesmo assim, não amplie essa superfície: se algum dia houver um endpoint genérico que receba um
`produto_id` do cliente e responda sobre acesso, ele precisa validar contra `PRODUTOS` primeiro.

### 4.6 Validação no boot

Ponha a checagem em `preflight.mjs` (é o lugar onde as variáveis obrigatórias já são conferidas) e
registre a mensagem na tabela de erros de boot do `docs/DEPLOY.md`, no mesmo formato dos demais:

```text
[preflight] PROJETO ausente ou inválido: "<valor>". Aceitos: gpsdapena, trilhasdearuanda.
```

Falhar no boot é intencional e segue a doutrina do repositório (migration que falha impede o
container de subir, e é assim de propósito). Um deploy sem `PROJETO` definido é um deploy que não
sabe o que é — melhor não subir do que subir mostrando o produto errado.

### 4.7 🔴 O filtro quebra a suíte de testes — e como resolver

`tests/vendas/catalogo.spec.ts` afirma coisas sobre o **conteúdo** de `PRODUTOS`:

```ts
expect(PRODUTOS.map((p) => p.id)).toContain('indulto-comutacao-2025')
expect(ehProdutoConhecido('indulto-comutacao-2025')).toBe(true)
// e o contrato: todo produto da família indulto-comutacao é um motor do REGISTRO
```

Com `PRODUTOS` filtrado por `PROJETO`, esses testes passam ou falham conforme a variável do
ambiente onde a suíte roda — e **falham** com `PROJETO=trilhasdearuanda`.

Resolução: **o teste de contrato passa a rodar sobre `CATALOGO`**, não sobre `PRODUTOS`. O
contrato "todo motor é vendável, todo produto de indulto é um motor" é uma afirmação sobre o
código inteiro, não sobre o recorte de um deploy — então `CATALOGO` é o alvo semanticamente
correto.

Acrescente, no mesmo arquivo, os testes que o filtro torna necessários:

1. Todo item de `CATALOGO` declara `projetos` com ao menos um valor, e todos os valores são de
   `PROJETOS` (pega typo em projeto novo).
2. `PRODUTOS` com `PROJETO=gpsdapena` contém as calculadoras e **não** contém o almanaque.
3. `PRODUTOS` com `PROJETO=trilhasdearuanda` contém o almanaque e **não** contém as calculadoras.
4. `projetoAtual()` lança com valor ausente, vazio, com espaços e desconhecido.

Para (2) e (3), teste a função de filtro injetando o env (`projetoAtual(env)` recebe o objeto),
em vez de depender de `process.env` no momento do import — com ESM, mexer em `process.env` depois
do import não reavalia a constante.

### 4.8 🔴 `PRODUTOS` filtrado no import exige a variável em TODO teste

Consequência de `PRODUTOS` ser uma constante de módulo (`CATALOGO.filter(…)` avaliado no import):
`projetoAtual()` roda no momento em que **qualquer** arquivo importa `catalogo.ts`, direta ou
indiretamente. Sem `PROJETO` no ambiente, isso lança — e derruba não só os testes de catálogo, mas
toda a cadeia que passa por vendas, ofertas e menu.

Resolva declarando a variável para a suíte, em `vitest.config.ts`:

```ts
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    passWithNoTests: true,
    env: { PROJETO: 'gpsdapena' },   // 🔴 sem isto, `projetoAtual()` lança no import
  },
  resolve: { /* … aliases, inalterados … */ },
})
```

`gpsdapena` como valor da suíte é deliberado: é o projeto que tem os produtos-código com teste de
contrato (as calculadoras e o `REGISTRO` de motores). Os testes que precisam do **outro** recorte
chamam a função com env injetado (§4.7), sem depender do valor global.

Duas alternativas que **não** recomendo, para você não perder tempo com elas:

- **Fallback silencioso** em `projetoAtual()` (assumir um projeto quando a variável falta): volta
  o vazamento que a §4.1 evita, e um deploy mal configurado passaria a mostrar produto do outro
  projeto em vez de falhar.
- **Trocar a constante por função** (`produtosDoProjeto()`): obriga a mexer em todos os
  consumidores atuais (`Rail.tsx`, vitrine, `vendaveis.ts`, `catalogo.ts` internamente) e torna
  cada chamada assíncrona-dependente de ambiente sem ganho real.

## 5. A estrutura de cursos (o que já existe)

Tudo nesta seção está implementado, revisado (seis revisões por task + uma revisão final de
branch) e com testes e build verdes. O que **não** está feito está em §5.6.

### 5.1 Tabelas — `supabase/migrations/0071_cursos.sql`

```sql
public.cursos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  produto_id    text not null,          -- o id usado no array `ofertas.produtos`
  categoria     text not null,          -- 'curso' | 'formacao' (check constraint)
  titulo        text not null,
  descricao     text,
  capa_url      text,
  publicado     boolean not null default false,
  ordem         integer not null default 0,
  criado_em, atualizado_em timestamptz
)
public.modulos (id, workspace_id, curso_id, titulo, ordem, criado_em, atualizado_em)
public.aulas   (id, workspace_id, modulo_id, titulo, descricao, video_youtube_id,
                publicado, ordem, criado_em, atualizado_em)
public.progresso_aulas (workspace_id, membro_id, aula_id, concluida_em,
                        primary key (membro_id, aula_id))
```

Detalhes que importam:

- **Unicidade:** `cursos_workspace_produto_key` em `(workspace_id, produto_id)`. Dois cursos do
  mesmo workspace não podem compartilhar `produto_id` — mas **nada impede um curso de usar um
  `produto_id` igual a um id do catálogo fixo** (§8.5).
- **FKs compostas** carregando `workspace_id` (`modulos_curso_fk`, `aulas_modulo_fk`,
  `progresso_aulas_membro_fk`, `progresso_aulas_aula_fk`), seguindo a doutrina das migrations
  `0025`/`0051`: um filho nunca aponta para pai de outro workspace, por construção.
- **`categoria` é domínio fechado em código + `check` no banco**: `src/lib/cursos/categorias.ts`
  tem `CATEGORIAS_CURSO` (`curso`, `formacao`) e o `check` espelha. Acrescentar categoria = uma
  migration que troca o `check` + uma linha no registro. Mesmo padrão de `duracao` em `ofertas`.
- **`aulas` guarda só o id do vídeo do YouTube** (`video_youtube_id`), não arquivo. Sem upload,
  sem transcodificação. `src/lib/cursos/youtube.ts` extrai o id de link completo (`watch?v=`,
  `youtu.be`, `/embed/`) ou aceita o id puro de 11 caracteres.
- **`modulos` não tem `publicado`** — a visibilidade do módulo vem do curso.

### 5.2 RLS — escrita por service_role, leitura por compra ativa

Quatro policies `*_service_role` (acesso total, é por onde o admin escreve) e três policies de
leitura para `authenticated`, mais uma de leitura/escrita para o progresso.

A leitura do membro depende de uma função **`security definer`**:

```sql
public.tem_acesso_ao_produto(ws uuid, produto text) returns boolean
  language sql security definer set search_path = '' stable
```

🔴 **Não troque essa função por um join inline na policy.** Foi exatamente o bug que a revisão
final pegou: `vendas` e `vendas_periodos` têm RLS ligada com policy **só para `service_role`**
(migration `0064`). Uma policy que referencia essas tabelas diretamente tem a subquery avaliada
sob a RLS de quem chama — para `authenticated` ela volta vazia, e o `exists(...)` é sempre falso.
Resultado: nenhum comprador jamais veria o curso que pagou, sem erro em lugar nenhum. A função
`security definer` é o mesmo padrão de `e_membro()`/`e_owner()` na migration `0005`, que existe
por esse motivo.

### 5.3 Server actions — `src/server/cursos/acoes.ts`

```ts
// cursos
listarCursos(): Promise<CursoResumo[]>
criarCurso({ titulo, categoria, produtoId }): Promise<ResId>
salvarCurso({ id, titulo, categoria, produtoId, descricao, capaUrl, publicado }): Promise<Res>
alternarPublicadoCurso({ id, publicado }): Promise<Res>   // mutação estreita, ver nota abaixo
excluirCurso({ id }): Promise<Res>
reordenarCursos({ ordemIds }): Promise<Res>

// módulos
carregarCursoComModulos(cursoId): Promise<(CursoDetalhe & { modulos: ModuloResumo[] }) | null>
criarModulo({ cursoId, titulo }): Promise<ResId>
renomearModulo({ id, titulo }): Promise<Res>
excluirModulo({ id }): Promise<Res>                       // bloqueia se houver aulas
reordenarModulos({ cursoId, ordemIds }): Promise<Res>

// aulas
carregarModuloComAulas(moduloId): Promise<ModuloComAulas | null>
criarAula({ moduloId, titulo }): Promise<ResId>
salvarAula({ id, titulo, descricao, videoYoutubeId, publicado }): Promise<Res>
excluirAula({ id }): Promise<Res>
reordenarAulas({ moduloId, ordemIds }): Promise<Res>
```

Três invariantes deste arquivo, todas resultado de revisão — não as desfaça sem ler o motivo:

1. **`sessaoAdminCursos()` devolve só `{ ws }`, nunca o cliente da sessão.** Toda leitura e
   escrita de conteúdo vai por `admin()` (service_role). Motivo: a RLS de
   `cursos`/`modulos`/`aulas` só libera `authenticated` para conteúdo **publicado com compra
   ativa** — o dono gerenciando rascunhos não se enxerga por essa policy, e a lista dele voltaria
   vazia. Mesmo padrão de `lerComercial()` em `acoes-comercial.ts` para `ofertas`/`vendas`.
2. **A checagem de dono é feita dentro de cada action**, não só no `layout.tsx`. Server Action
   neste código é chamável diretamente pelo id, por cima de qualquer layout — é um bypass real,
   documentado em `src/server/crm/acoes.ts`. Cada action resolve o workspace **ativo** e exige
   `ehOwnerDoWorkspace(ws)` dele (não "dono de algum workspace", que qualquer usuário consegue ser
   criando o próprio).
3. **`alternarPublicadoCurso` existe em vez de reusar `salvarCurso`** porque a listagem
   (`CursoResumo`) não carrega `descricao`/`capa_url` — chamar o save completo a partir da lista
   zerava esses campos em silêncio.

### 5.4 Telas — `src/app/(app)/cursos/**`

| Rota | Arquivos | O que faz |
|---|---|---|
| `/cursos` | `page.tsx`, `GestorCursos.tsx` | Lista, cria, publica, reordena (arraste), exclui |
| `/cursos/[cursoId]` | `page.tsx`, `EditorCurso.tsx`, `EditorModulos.tsx` | Edita o curso; CRUD e ordem dos módulos |
| `/cursos/[cursoId]/[moduloId]` | `page.tsx`, `EditorAulas.tsx` | CRUD e ordem das aulas, com preview do vídeo |
| (guarda) | `layout.tsx` | Redireciona para `/painel` quem não é dono do workspace ativo |

Convenções dos componentes (também resultado de revisão):

- **Nenhum componente fabrica id no cliente.** Criar → `router.refresh()` e a lista volta do
  servidor com o id real. Um `crypto.randomUUID()` otimista fazia arraste/publicar/excluir logo
  após a criação virar no-op silencioso no servidor.
- **Ressincronização por referência de prop** (`if (xDoServidor !== prop) { … }`), a mesma técnica
  de `src/app/(app)/config/funis/EditorEtapas.tsx`.
- **`generateMetadata` usa título estático** (`'Curso'`, `'Módulo'`), sem buscar a entidade de
  novo: as funções de carga não são memoizadas, e buscar ali dobrava a ida ao banco por
  carregamento. Mesmo padrão de `contatos/[id]` e `empresas/[id]`.
- Reordenar usa `@dnd-kit` + `reordenarLista` (`src/lib/cursos/ordenar.ts`), que é puro e testado.

### 5.5 Como um curso é vendido

Nenhuma máquina de acesso nova: reaproveita inteiramente o fluxo que já existia.

1. Admin cria o curso e define seu `produto_id` (ex.: `formacao-medium-2026`).
2. Em Configurações → Comercial, cria/edita a oferta da Hotmart e marca o curso na lista de
   produtos. A lista vem de `produtosVendaveis(ws)` = `PRODUTOS` (do projeto) + cursos daquele
   workspace.
3. Compra aprovada → `processar.ts` → `vendas` + `vendas_periodos` com aquele `produto_id`.
4. O membro passa a ver o curso porque `tem_acesso_ao_produto(ws, produto_id)` responde verdadeiro
   — a mesma régua de `estadoDeAcesso()` (ativo / encerrado / nunca), agora também dentro da RLS.

### 5.6 O que **não** existe ainda

- **`progresso_aulas` não tem escritor.** A tabela e a policy existem; nada grava nela. Quem vai
  gravar é o app do membro.
- **O app do membro não existe.** O plano original (`docs/superpowers/plans/2026-09-14-cursos-e-aulas.md`)
  previa três sub-projetos: A (admin de cursos — **feito**), B (API/contrato que o app consome) e
  C (app em Capacitor + Vite com OTA self-hosted via Capgo). B e C não foram iniciados. A RLS de
  leitura da §5.2 foi desenhada justamente para o app ler direto do Supabase com o JWT do membro.
- **Nenhum checkout por curso.** As calculadoras têm `CHECKOUT_URL_<SLUG>` (§8.6); curso não tem
  slug nem variável equivalente.

## 6. Produto-código vs produto-dado: onde cada coisa mora

| | Produto-código | Produto-dado |
|---|---|---|
| Exemplos | calculadoras, almanaque (se tiver tela própria) | cursos, formações |
| Onde é declarado | `CATALOGO` em `src/lib/produtos/catalogo.ts` | linha na tabela `cursos` |
| Como é isolado por projeto | campo `projetos: readonly Projeto[]` (§4.3) | **já é isolado**: vive no banco daquele deploy |
| Tem rota própria | sim (`/ferramentas/<slug>`) | não (o app do membro consome via API) |
| Precisa de deploy para nascer | sim | não |

Consequência prática: **a família "cursos" não entra no esquema da variável de ambiente.** Se um
dia o GPS da Pena vender cursos, ele terá os cursos dele no banco dele, sem mudar uma linha de
código.

**Decisão pendente sobre o almanaque dos orixás:** se ele tiver tela, navegação e lógica próprias,
é produto-código e entra no `CATALOGO` com `projetos: ['trilhasdearuanda']`. Se for conteúdo
(capítulos, texto, mídia, talvez ordenável), ele provavelmente **já é um curso** com outra
roupagem — e aí não entra no catálogo nem exige código novo, só cadastro. Decida isso antes de
escrever qualquer coisa: muda completamente o esforço.

## 7. Famílias e menu

O menu (`Rail.tsx`) agrupa produtos-código por `familia`, com a ordem definida em código:

```ts
const familiaOrder = ['indulto-comutacao', 'detracao'] as const
const familiaLabels: Record<string, string> = { … }
```

Ao acrescentar família (ex.: `almanaque`), **acrescente nos dois lugares** — uma família fora de
`familiaOrder` simplesmente não aparece no menu, sem erro. Vale considerar derivar a ordem do
próprio `CATALOGO` (um campo `ordemDaFamilia`) para acabar com essa lista paralela.

A seção **"Cursos" é um item fixo** no menu, fora do agrupamento por família. Duas melhorias
possíveis: ocultá-la quando não houver curso cadastrado no workspace (mais natural), ou tratá-la
como família com um `projetos` próprio.

## 8. Pendências herdadas — leia antes de mexer em vendas

Em ordem de risco.

### 8.1 🔴 `ehProdutoConhecido` volta a aparecer, e reintroduz um bug de pagamento em silêncio

`ehProdutoConhecido` só conhece o catálogo fixo. Todo filtro de produto no caminho de vendas tem
de usar `idsDeProdutoValidos(ws)` (catálogo + cursos). Se não usar, **um curso vendido não gera
venda, período nem e-mail** — o comprador paga e não recebe nada, e o único rastro é uma linha de
auditoria com `oferta_invalida`.

Isto não é hipótese: no merge de unificação, o código novo do lado do GPS da Pena trouxe **três
usos novos** de `ehProdutoConhecido` (brindes de oferta filha e os dois pontos do bônus
retroativo) em trechos que **não deram conflito**. O git avisa de conflito; disto ele não avisa.

**Guarda recomendada** (não existe ainda): um teste que falhe se `ehProdutoConhecido` ou
`rotuloDoProduto` aparecerem em `src/server/vendas/processar.ts` ou
`src/app/(app)/config/acoes-comercial.ts`. O repositório já usa esse tipo de guarda por varredura
de texto em `tests/fronteira-rsc.spec.ts` e em `tests/migracoes/idempotencia.spec.ts` — é
precedente, não invenção.

### 8.2 🔴 Colisão de numeração de migration derruba o boot

`migrate.mjs` recusa versão duplicada (`duplicate_version`, e `version` é primary key na tabela de
controle): o container **não sobe**. Aconteceu na unificação — `0066_cursos.sql` (cursos) colidiu
com `0066_ferramentas_detracao.sql`. Resolvido renumerando cursos para `0071`, o que só foi seguro
porque aquela migration **nunca tinha sido aplicada em banco nenhum**. Se já estivesse aplicada, o
registro em `awave_migrations` precisaria de ajuste junto.

Com repositório único a colisão deixa de acontecer por construção (a numeração volta a ser
serializada). Enquanto houver trabalho paralelo em dois lugares, considere numeração por timestamp.

**Guarda recomendada:** um teste que falhe com duas migrations de mesmo número. A suíte atual
**passou** com as duas `0066` — a idempotência confere padrões de texto, não numeração.

### 8.3 🔴 A verificação ao vivo nunca rodou

Nem uma vez, em nenhum ambiente: criar curso → cadastrar oferta → disparar webhook real da Hotmart
→ conferir no SQL Editor que as policies admitem o comprador. O ambiente onde cursos foi
desenvolvido não tinha credenciais do Supabase. Tudo foi verificado por leitura de código, tipos,
build e suíte.

O roteiro está no plano original, Task 7, passo 3. **Rode isso antes de vender o primeiro curso.**
Em especial o passo do SQL Editor: é ele que distingue "a policy está escrita certo" de "a policy
admite o comprador".

### 8.4 `produto_id` de curso é mutável, sem nenhuma referência

`salvarCurso` deixa reescrever `produto_id`, e `excluirCurso` só bloqueia se houver módulos.
Nenhum dos dois consulta `ofertas.produtos` nem `vendas_periodos`. Consequências:

- Renomear um curso já vendido **orfana o acesso de quem pagou** (o casamento é por string).
- O id antigo continua dentro de `ofertas.produtos`, apontando para nada.

Mitigação parcial já aplicada: `formularioDe()` em `ComercialCard.tsx` descarta id desconhecido ao
abrir a oferta para edição, senão a oferta ficava impossível de salvar. **A guarda de verdade
falta:** bloquear a troca/exclusão quando houver oferta ou período referenciando aquele
`produto_id`, do mesmo jeito que `excluirCurso` já bloqueia por módulos.

### 8.5 Namespace de ids compartilhado, sem guarda

`produtosVendaveis()` junta `PRODUTOS` e `cursos.produto_id` num só espaço de ids. Nada impede um
curso de usar `produto_id: 'indulto-comutacao-2025'`. Se acontecer: chaves duplicadas na lista de
checkboxes da oferta, rótulo do catálogo vencendo o do curso, e — pior — o comprador do curso
ganhando acesso à calculadora pelo gate. Só o dono do deploy consegue causar isso contra si mesmo,
mas é uma validação de uma linha em `criarCurso`/`salvarCurso`.

### 8.6 Curso não tem checkout, calculadora tem

O motor ganhou `checkoutDoProduto(slug)` lendo `CHECKOUT_URL_<SLUG>` do ambiente — é como o aviso
de acesso mostra o botão de compra. Curso não tem `slug` nem variável, então um curso sem acesso
não tem para onde mandar o membro comprar. Ao resolver, prefira **dado** a variável de ambiente
(uma coluna `checkout_url` em `cursos`), já que curso nasce sem deploy — misturar as duas fontes
para a mesma finalidade é a divergência que o comentário de `catalogo.ts` alerta.

### 8.7 `estadoDoProduto`/`exigirEscrita` são tipados ao catálogo fixo

```ts
estadoDoProduto(produto: ProdutoId)   // ProdutoId = union dos ids do catálogo
```

O corpo é agnóstico (compara strings vindas do banco), mas a assinatura não aceita o `produto_id`
de um curso. Hoje não é bug — nada lê acesso de curso por esse caminho. Quando o sub-projeto B
(API do app do membro) precisar consultar acesso a curso, **alargue para `string`**, em vez de
fazer cast no chamador.

### 8.8 Migrations de todos os produtos rodam em todo deploy

O banco do Trilhas de Aruanda terá as tabelas de detração, vazias, e vice-versa. Isso é consciente,
não esquecimento: é o mesmo que já acontece com as tabelas de CRM em instalação que não usa CRM
(documentado em `docs/superpowers/ESTADO-vendas-hotmart.md` como risco aceito). Se algum dia
incomodar, o caminho é migration condicional por projeto — o que traz de volta o problema de
"bancos em estados diferentes", provavelmente pior que tabelas vazias.

## 9. Ordem de execução sugerida

1. **Guardas antes de qualquer coisa** (§8.1 e §8.2): a varredura de `ehProdutoConhecido` no
   caminho de vendas e o teste de numeração duplicada de migration. São pequenos e protegem todo o
   resto do trabalho.
2. **Decidir o que é o almanaque** (§6): produto-código ou curso. Isso desbloqueia ou elimina
   trabalho.
3. **Filtro por projeto** (§4): `projeto.ts`, `CATALOGO`/`PRODUTOS`, preflight, `docs/DEPLOY.md`, e
   os testes da §4.7. Nada de tela muda — só o que cada deploy conhece.
4. **Verificação ao vivo de cursos** (§8.3), com credenciais reais. Até aqui, cursos é código
   revisado mas nunca exercitado.
5. **Guardas de integridade de `produto_id`** (§8.4 e §8.5).
6. **Checkout de curso** (§8.6) — só quando houver curso para vender de fato.
7. **Sub-projetos B e C** (§5.6): a API do app do membro e o app em si. São projetos próprios, cada
   um com sua spec.

## 10. Armadilhas deste código

Coisas que já custaram bug e não são óbvias na leitura.

- **Server Action é chamável direto, por cima de qualquer `layout.tsx`.** Autorização vai dentro
  de cada action. Precedente e explicação em `src/server/crm/acoes.ts`.
- **Policy que referencia tabela com RLS restritiva sempre volta vazia.** Use função
  `security definer` (§5.2). Vale para qualquer policy futura que precise olhar `vendas`.
- **`admin()` (service_role) para ler conteúdo de admin; nunca o cliente da sessão** em tabelas
  cujo `authenticated` só enxerga o que foi comprado (§5.3, invariante 1).
- **`pnpm`, nunca `npm`** (misturar gera lockfile que o build do servidor não entende).
- **`pnpm build` reescreve `next-env.d.ts`**, que é versionado: `git checkout -- next-env.d.ts`
  antes de commitar.
- **Esta máquina recria arquivo apagado como duplicado `nome 2.ext`.** Antes de commitar:
  `find . -path ./node_modules -prune -o -path ./.next -prune -o -path ./.git -prune -o -name "* [0-9].*" -print`.
  Já apareceu duas vezes, uma delas um plano inteiro desatualizado ressuscitado.
- **Push no `main` publica em produção** (deploy do EasyPanel). Não é um push qualquer.
- **Não há banco nem SMTP sob teste.** A lógica testável vive em `src/lib/`; `src/server/` é fino e
  verificado por tipos, build e roteiro manual.
