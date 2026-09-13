# Vendas, ofertas e liberação de acesso por compra — design

> Spec de implementação para o controlo de acesso às ferramentas do GPS da Pena a partir
> de compras feitas em plataforma externa, começando pela Hotmart.

## 1. Objetivo e público

Hoje toda ferramenta do CRM está disponível a qualquer membro do espaço de trabalho. Este
trabalho torna o acesso a cada ferramenta **consequência de uma compra**: uma venda aprovada
na Hotmart cria (ou encontra) o membro, liberta o produto que a oferta mapeia, e o acesso
caduca sozinho quando o prazo comprado termina.

O público é duplo. Para o **owner** (você), são duas telas de administração — ofertas e
vendas — e um webhook que trabalha sem supervisão. Para o **comprador**, é receber um e-mail
com a senha temporária minutos depois de pagar, entrar, e usar a ferramenta até o prazo
acabar.

## 2. Premissas

Estas foram decididas no brainstorming e não se reabrem durante a implementação.

1. **Instalação de um único espaço de trabalho.** `membros` é, de facto, a lista de clientes.
   O desenho continua correto se um dia houver dois workspaces, mas não se otimiza para isso.
2. **O webhook cria o membro** a partir do payload, sem intervenção humana.
3. **O catálogo de produtos é código**, não dado. Ferramenta nova exige deploy — o que já era
   verdade, porque a ferramenta é código.
4. **O produto é por decreto** (`indulto-comutacao-2025`), não por ferramenta. Uma oferta
   liberta uma **lista** de produtos, para que um combo não exija migration.
5. **Processamento síncrono** (abordagem 1 do brainstorming): o webhook grava o payload,
   processa na mesma requisição e devolve. Nada do acesso depende do relógio interno.
   O **envio de e-mail** é a única parte enfileirada, e por motivo próprio (§8.4).
6. **O CRM passa a enviar e-mail**, por SMTP configurado em variáveis de ambiente. Sem as
   variáveis, o recurso fica desligado e diz porquê — nunca falha em silêncio.
   `docs/DEPLOY.md` e `.env.example` mudam junto.
7. **Este é o repositório-fonte do produto.** A regra do `AGENTS.md` que confina edições a
   `custom/` é para o comprador; aqui o trabalho é em `src/` e `supabase/migrations/`.

## 3. O fluxo, de ponta a ponta

```
Hotmart  ──POST──▶  /api/webhook/hotmart
                     │
                     ├─ 1. confere X-HOTMART-HOTTOK (timing-safe)
                     ├─ 2. grava payload cru  ──▶ webhook_compras_recebidas
                     ├─ 3. acha oferta por (plataforma, codigo) ──▶ ofertas
                     │      └─ desconhecida ─▶ marca e devolve 200
                     ├─ 4. resolve membro: cpf_cnpj → email → cria
                     │      └─ criou? ─▶ enfileira e-mail de boas-vindas
                     ├─ 5. cria venda (fotografia da oferta) ──▶ vendas
                     │      └─ enfileira e-mail de entrega de produto
                     └─ 6. 200

relógio (30s) ─▶ drenarEmail ─▶ emails_fila ─▶ SMTP

membro ─▶ /ferramentas ─▶ acesso.ts ─▶ vendas (status ativa, prazo vigente)
```

## 4. Identidade: CPF/CNPJ no membro

### 4.1 Colunas novas em `public.membros`

| coluna | tipo | porquê |
|---|---|---|
| `cpf_cnpj` | `text null` | a chave pela qual a compra encontra a pessoa |
| `nome` | `text null` | o payload traz; uma lista de clientes só com e-mail é ilegível |
| `senha_provisoria` | `boolean not null default false` | força a troca no primeiro login |
| `senha_provisoria_expira_em` | `timestamptz null` | validade de 7 dias da senha temporária |

Todas nascem nulas ou falsas para os membros que já existem, o que lê como "não
se aplica a mim" — que é a verdade para quem entrou por convite.

### 4.2 Unicidade

```sql
create unique index if not exists membros_cpf_cnpj_key
  on public.membros (workspace_id, cpf_cnpj)
  where cpf_cnpj is not null;
```

O índice é **parcial**. Sem o `where`, o segundo membro sem documento seria recusado, porque
no Postgres um índice único comum permite muitos nulos mas este é composto e o comportamento
deixa de ser óbvio — o parcial torna a intenção explícita e inatacável.

Fica **por workspace** mesmo sendo hoje um só: é o recorte correto, e custa o mesmo.

### 4.3 Formato

Guardado **só com dígitos**, 11 (CPF) ou 14 (CNPJ). A formatação com pontos e traços é da
tela. É isso que torna a comparação do webhook confiável — a Hotmart manda `00048775193`, sem
pontuação, mas não há garantia de que sempre o faça.

```sql
alter table public.membros
  add constraint membros_cpf_cnpj_formato_check
  check (cpf_cnpj is null or cpf_cnpj ~ '^([0-9]{11}|[0-9]{14})$');
```

A `check` é **nomeada de propósito**. Uma `check` anónima recebe do Postgres o nome
`membros_cpf_cnpj_check`, que é exatamente o padrão que as migrations do produto procuram
quando precisam alargar o domínio de uma coluna. Nomear tira esta regra desse caminho.

Como `alter table ... add constraint` não aceita `if not exists`, vai num bloco
`do $$ ... end $$` que pergunta a `pg_constraint` antes.

### 4.4 Validação de verdade: `src/lib/documento.ts`

O dígito verificador **não** vai para o banco: em SQL fica ilegível e não se testa isolado.

```ts
export function normalizar(bruto: string): string          // remove tudo que não é dígito
export function ehValido(digitos: string): boolean         // CPF ou CNPJ, com dígito verificador
export function formatar(digitos: string): string          // 000.487.751-93 / 58.091.014/0001-48
export function tipo(digitos: string): 'cpf' | 'cnpj' | null
```

`ehValido` rejeita os repetidos (`00000000000`, `11111111111`, …), que passam na aritmética
ingénua do dígito verificador e são a fonte clássica de lixo em cadastro.

### 4.5 Quem preenche, quem edita

| quem | pode |
|---|---|
| webhook | preenche a partir de `data.buyer.document` |
| owner, na aba Pessoas do `/config` | preenche e **corrige** |
| o próprio membro, no perfil | **vê**, não edita |

O membro comum não edita porque, se editasse, trocaria o documento para reivindicar a compra
de outra pessoa.

### 4.6 Resolução de identidade (usada pelo webhook)

Ordem fixa:

1. Por `cpf_cnpj` normalizado. Achou → é ele.
2. Por e-mail. Necessário porque `auth.users` já é único por e-mail: tentar criar outro com o
   mesmo e-mail falharia, e a venda ficaria órfã sem motivo.
   - Achou **sem** documento → preenche o documento.
   - Achou **com** documento **diferente** → **não sobrescreve**. Liga a venda a esse membro e
     grava a divergência em `vendas.observacao`, para o owner olhar. Sobrescrever silenciosamente
     o documento de alguém a partir de um payload externo é como um cadastro é corrompido.
3. Não achou → cria (§7.5).

## 5. Catálogo de produtos: `src/lib/produtos/catalogo.ts`

```ts
export const PRODUTOS = [
  {
    id: 'indulto-comutacao-2025',
    rotulo: 'Calculadora de Indulto e Comutação — Decreto 12.970/2025',
    href: '/ferramentas/indulto-comutacao',
    decretoId: '2025',
  },
] as const

export type ProdutoId = (typeof PRODUTOS)[number]['id']
export function ehProdutoConhecido(id: string): id is ProdutoId
export function produtoDoDecreto(decretoId: string): ProdutoId | null
```

O gate importa `ProdutoId`, então um id mal escrito é erro de compilação e não uma oferta
silenciosamente morta.

**`decretoId` amarra o catálogo ao `REGISTRO`** de `src/lib/indulto-comutacao/registro.ts`.
Um teste de contrato exige que todo `decretoId` citado aqui exista lá, e vice-versa — é o que
impede um decreto novo de entrar no sistema sem produto, ou um produto de apontar para decreto
que não existe.

**Nota de nomenclatura**: já existe `src/server/agente/ferramentas.ts`, que é outra coisa
(ferramentas do assistente de IA). Por isso o nome aqui é **produtos**, não ferramentas.

## 6. Ofertas

### 6.1 Tabela

```sql
create table if not exists public.ofertas (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  plataforma    text not null default 'hotmart',
  codigo        text not null,
  nome          text not null,
  produtos      text[] not null,
  duracao       text not null,
  ativa         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index if not exists ofertas_plataforma_codigo_key
  on public.ofertas (plataforma, codigo);
```

Com `check` nomeadas para `plataforma` (`'hotmart'`), `duracao` (os sete valores) e
`cardinality(produtos) > 0`.

### 6.2 Por que a unique é global

`unique (plataforma, codigo)` **não** leva `workspace_id`, e é deliberado: é a oferta que diz
ao webhook a que workspace a venda pertence. Se dois workspaces registassem o mesmo código, a
resolução ficaria ambígua e o primeiro `select` a responder ganharia — um defeito que só
aparece em produção, com dinheiro envolvido.

### 6.3 Duração vira data uma vez só

O mapa vive em código, como `interval` do Postgres:

| `duracao` | intervalo |
|---|---|
| `semanal` | `7 days` |
| `quinzenal` | `15 days` |
| `mensal` | `1 month` |
| `trimestral` | `3 months` |
| `semestral` | `6 months` |
| `anual` | `1 year` |
| `vitalicio` | — (`expira_em` nulo) |

`mensal` é `1 month`, **não** `30 days`: 31 de janeiro + 1 mês segue a regra do calendário. O
cálculo é feito pelo banco no `insert` da venda, para existir **uma** regra em vez de uma por
call site.

### 6.4 `ativa` aposenta sem apagar

Oferta nunca é apagada: `ativa = false` faz o webhook parar de aceitar compras novas com aquele
código, e o histórico de vendas continua íntegro. A FK de `vendas.oferta_id` é
`on delete restrict` para tornar o apagamento impossível também no banco.

### 6.5 RLS

RLS ligada, `grant all` aos três papéis (como a `0061` estabeleceu), policy **só** para
`service_role`. **Nenhuma policy para `authenticated`**: o navegador não lê esta tabela de
todo. Tudo passa por server action com service-role, depois de conferir `papel = 'owner'`.
É mais fechado que a `0062` porque ali o dado é do próprio membro e aqui é comercial.

### 6.6 Tela

Aba nova em `src/lib/config-abas.ts` — a união passa a ser
`'espaco' | 'pessoas' | 'servidor' | 'comercial'` — ligada pela mesma flag `souOwner` que já
esconde a aba Pessoas. Dois cards: **Ofertas** (lista + formulário com código, nome,
multi-select de produtos alimentado por `PRODUTOS`, duração, ativa) e **Vendas** (§7.7).

## 7. Vendas e webhook

### 7.1 Endereço e autenticação

`src/app/api/webhook/[plataforma]/route.ts` → `/api/webhook/hotmart`. O segmento é
parametrizado para a segunda plataforma não exigir rota nova.

A Hotmart envia o cabeçalho `X-HOTMART-HOTTOK`. O segredo fica no cofre que já existe
(`getSecret`, tabela da `0001`), configurado na aba do owner, chave
`webhook_hottok:<plataforma>`.

| situação | resposta |
|---|---|
| corpo acima do teto (`readBodyCapped`) | `413` |
| plataforma desconhecida | `404` |
| segredo não configurado | `503` |
| hottok não confere (`iguaisTimingSafe`) | `401` |
| tudo o resto | `200` |

As três funções (`readBodyCapped`, `iguaisTimingSafe`, `getSecret`) já estão em uso na rota de
canais; nada novo se inventa aqui.

Rate limit por plataforma reaproveitando `consumir` de `src/lib/canais/rateLimit.ts`.

### 7.2 `webhook_compras_recebidas` — a auditoria

```sql
create table if not exists public.webhook_compras_recebidas (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid references public.workspaces(id) on delete cascade,
  plataforma    text not null,
  evento        text,
  transacao     text,
  payload       jsonb not null,
  recebido_em   timestamptz not null default now(),
  processado_em timestamptz,
  resultado     text,
  detalhe       text
);
```

O payload é gravado **antes de qualquer processamento**, e é isso que permite reprocessar à
mão quando algo corre mal. `workspace_id` nasce nulo — antes de a oferta resolver, ainda não se
sabe de quem é a compra.

`resultado` ∈ `venda_criada` · `venda_encerrada` · `oferta_desconhecida` · `evento_ignorado` ·
`transacao_desconhecida` · `falhou`.

### 7.3 `vendas`

```sql
create table if not exists public.vendas (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  membro_id     uuid not null,
  oferta_id     uuid not null references public.ofertas(id) on delete restrict,
  plataforma    text not null,
  transacao     text not null,
  status        text not null default 'ativa',
  produtos      text[] not null,          -- fotografia da oferta
  duracao       text not null,            -- fotografia da oferta
  aprovada_em   timestamptz not null,
  expira_em     timestamptz,              -- nulo = vitalício
  valor         numeric(12,2),
  moeda         text,
  encerrada_em  timestamptz,
  observacao    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index if not exists vendas_plataforma_transacao_key
  on public.vendas (plataforma, transacao);

alter table public.vendas
  add constraint vendas_membro_fk
  foreign key (workspace_id, membro_id)
  references public.membros (workspace_id, id) on delete cascade;
```

Com `check` nomeada para `status` ∈ `ativa` · `cancelada` · `reembolsada` · `chargeback`.

**`unique (plataforma, transacao)` é a peça central do desenho.** É ela que torna o reenvio da
Hotmart um no-op em vez de uma segunda venda, e é por existir que o §7.6 pode devolver `500`
com tranquilidade.

**A FK do membro é composta**, apontando para `membros (workspace_id, id)` — o mesmo padrão de
`negocios_responsavel_fk` da `0004`. Impede que uma venda aponte para membro de outro
workspace.

O `on delete cascade` é aceitável apesar de apagar histórico financeiro: o payload original
sobrevive em `webhook_compras_recebidas`, que não tem FK para `membros` e é a auditoria de
verdade. `restrict` aqui bloquearia a remoção de um membro para sempre.

### 7.4 A fotografia da oferta

`produtos` e `duracao` são **copiados** da oferta para a linha da venda no momento da criação.
`oferta_id` fica só para proveniência; o gate lê a venda.

Sem isto, editar uma oferta reescreveria retroativamente o que centenas de clientes
compraram. O sintoma seria "mexi numa oferta e o pessoal perdeu acesso", sem nada no log e sem
forma de reconstituir o que a oferta dizia no dia da compra.

### 7.5 O fluxo do POST

1. `readBodyCapped`, hottok, rate limit (§7.1).
2. Grava o payload cru.
3. Lê `event`:
   - `PURCHASE_APPROVED` → §7.5.1
   - `PURCHASE_CANCELED` → encerra com `cancelada`
   - `PURCHASE_PROTEST` → encerra com `reembolsada`
   - `PURCHASE_CHARGEBACK` → encerra com `chargeback`
   - qualquer outro → `evento_ignorado`, `200`
4. Marca `processado_em` e `resultado`. Devolve `200`.

#### 7.5.1 Aprovação

1. `data.purchase.offer.code` → `ofertas` por `(plataforma, codigo)` com `ativa = true`.
   **Não achou → `oferta_desconhecida` e `200`.** Isto não é erro: a mesma conta Hotmart vende
   coisas que não são deste sistema (o payload de exemplo é do "Almanaque dos Orixás"), e essas
   compras têm de passar sem ruído.
2. Resolve o membro (§4.6). Se criar:
   - `auth.admin.createUser` com o e-mail do payload, `email_confirm: true` e **senha forte
     aleatória** (32 bytes, base64url) — ninguém a conhece, e ela existe só para a conta não
     nascer aberta;
   - linha em `membros` com `papel = 'membro'`, `cpf_cnpj`, `nome`, `senha_provisoria = true` e
     `senha_provisoria_expira_em = now() + 7 days`;
   - enfileira o e-mail `boas_vindas` com a senha temporária.
3. Cria a venda, com a fotografia da oferta e
   `expira_em = aprovada_em + intervalo(duracao)` (nulo se `vitalicio`).
4. Enfileira o e-mail `entrega_produto`.

`data.purchase.approved_date` vem em **milissegundos de época** e é convertido; o valor sai de
`data.purchase.price.value` e `.currency_value`.

#### 7.5.2 Encerramento

Acha a venda por `(plataforma, transacao)`. Não achou → `transacao_desconhecida` e `200` (pode
ser compra de outro produto seu). Achou → grava o `status` do evento e `encerrada_em = now()`.
Encerrar venda já encerrada é no-op idempotente.

### 7.6 Erro inesperado devolve `500`, de propósito

Falha de banco, de rede, ou qualquer exceção não prevista → `500`. A Hotmart reenvia, e a
unique da transação torna o reenvio seguro. O payload já está gravado, então mesmo que ela
desista, nada se perde.

A alternativa — engolir e devolver `200` — trocaria uma retentativa automática por um cliente
que pagou e não recebeu acesso, descoberto só quando ele reclamar.

### 7.7 Tela de vendas

No card Vendas da aba comercial: lista com membro, produto(s), status, aprovada em, expira em,
transação. Filtro por status. Ações do owner: **encerrar à mão** (para o caso de reembolso
feito fora da plataforma) e **reenviar e-mail de entrega**. A transação fica visível porque é
o que você leva para o suporte da Hotmart.

## 8. Envio de e-mail

### 8.1 Configuração

Variáveis de ambiente, como o resto do produto:

```
SMTP_HOST=      SMTP_PORT=      SMTP_SECURE=
SMTP_USER=      SMTP_PASS=      SMTP_FROM=
```

Ausentes → nada é enfileirado, e a aba comercial mostra o motivo. O recurso nasce **desligado**,
nunca quebrado.

`.env.example` e `docs/DEPLOY.md` mudam: a frase "Nada é enviado por e-mail pelo CRM" passa a
"não envia, a menos que você configure SMTP".

**Dependência nova**: `nodemailer` (+ `@types/nodemailer`). É a primeira dependência de runtime
que este trabalho acrescenta.

### 8.2 `modelos_email`

```sql
create table if not exists public.modelos_email (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  tipo          text not null,
  assunto       text not null,
  html          text not null,
  ativo         boolean not null default true,
  atualizado_em timestamptz not null default now(),
  primary key (workspace_id, tipo)
);
```

`tipo` ∈ `boas_vindas` · `recuperacao_senha` · `entrega_produto`, com `check` nomeada.

Os três nascem **semeados com HTML padrão funcional**, para o recurso funcionar antes de
você escrever qualquer coisa. O HTML definitivo de cada um fica para depois.

### 8.3 Campos de merge

Declarados em código, por tipo, em `src/lib/email/campos.ts`:

| tipo | campos |
|---|---|
| `boas_vindas` | `[MEMBER_NAME]` `[MEMBER_EMAIL]` `[TEMP_PASSWORD]` `[LOGIN_URL]` |
| `recuperacao_senha` | `[MEMBER_NAME]` `[TEMP_PASSWORD]` `[LOGIN_URL]` |
| `entrega_produto` | `[MEMBER_NAME]` `[PRODUCT_NAME]` `[OFFER_NAME]` `[EXPIRES_AT]` `[TOOL_URL]` `[LOGIN_URL]` |

A tela lista os campos disponíveis ao lado do editor — um campo mal escrito sai como texto cru
no e-mail do cliente.

🔴 **Os valores são escapados para HTML na substituição.** `[MEMBER_NAME]` vem de
`data.buyer.name`, ou seja, de quem compra: é texto controlado por terceiro a entrar num
documento HTML. Sem escape, um nome com `<` quebra o e-mail no melhor caso e injeta marcação
no pior. O escape é do **valor**, nunca do modelo — o HTML que o owner escreve é para ser HTML.

### 8.4 A fila, e por que não envio inline

```sql
create table if not exists public.emails_fila (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  destinatario      text not null,
  assunto           text not null,
  html              text not null,
  criado_em         timestamptz not null default now(),
  enviado_em        timestamptz,
  tentativas        int not null default 0,
  proxima_tentativa timestamptz not null default now(),
  ultimo_erro       text,
  desistido_em      timestamptz
);

create index if not exists emails_fila_pendentes_idx
  on public.emails_fila (proxima_tentativa)
  where enviado_em is null and desistido_em is null;
```

Forma copiada de `eventos_webhook` (`0007`), incluindo o índice parcial.

Drenada por um braço novo `drenarEmail(orcamento)` em `src/app/api/interno/tick/route.ts`,
ao lado dos que já existem. Com batida de 30 s (`HEARTBEAT_INTERVAL_MS`), o comprador recebe
em segundos.

**O assunto e o HTML já vão renderizados para a fila.** Assim o e-mail enviado é o que o modelo
dizia no momento da compra, e editar um modelo não reescreve o que está por enviar.

Enviar dentro da requisição do webhook faria uma falha de SMTP custar a credencial do cliente,
sem retentativa e sem rasto. Recuo exponencial, e desistência registada depois de N tentativas.

### 8.5 Senha temporária e recuperação

A conta nasce com senha forte aleatória; o e-mail de boas-vindas leva a senha temporária;
`senha_provisoria = true` força a troca no primeiro login, via redirecionamento para
`/trocar-senha` enquanto a flag estiver ligada.

**Validade de 7 dias.** Depois do login bem-sucedido, se `senha_provisoria` e
`senha_provisoria_expira_em < now()`, a sessão é encerrada e a tela manda usar "recuperar
senha". Uma senha que abre a conta e fica para sempre numa caixa de entrada é o ponto fraco
que sobraria.

**Recuperação** reaproveita a mesma máquina: gera nova senha temporária, marca a flag, renova
o prazo e enfileira `recuperacao_senha`. Não há tabela de tokens.

A recuperação vive em `/recuperar`, rota pública ao lado de `/entrar`, e responde **sempre a
mesma coisa**, exista o e-mail ou não — senão vira um oráculo de quem é cliente.

## 9. O gate de acesso

### 9.1 A regra

Um membro tem acesso a um produto se existir ao menos uma venda sua com `status = 'ativa'` e
(`expira_em` nulo **ou** no futuro) cuja lista `produtos` contenha aquele id.

Como a venda carrega a fotografia da oferta, o gate **não faz join com `ofertas`**.

### 9.2 Três estados

| Estado | Comportamento |
|---|---|
| **Nunca comprou** (nenhuma venda para o produto) | A ferramenta não aparece no hub; a rota não abre. Não existe vitrine do que ele não tem. |
| **Venda ativa** | Cria, edita, gera documento. |
| **Venda encerrada** (prazo, cancelamento, reembolso, chargeback) | Vê a ferramenta e os cálculos que já produziu. Não cria, não edita, não gera documento. Faixa no topo explica e diz como renovar. |

Os quatro motivos de encerramento dão o **mesmo** resultado de propósito: uma regra explicável
em voz alta vale mais do que quatro variações que ninguém consegue auditar.

**Excluir continua permitido** no estado de leitura. Impedir alguém de remover os próprios
dados é hostil sem ganho.

**O owner passa por cima do gate**, sempre — senão você não usa o seu próprio sistema sem se
vender uma oferta.

### 9.3 `src/server/vendas/acesso.ts`

```ts
export const produtosDoMembro: () => Promise<Map<ProdutoId, EstadoAcesso>>  // React cache()
export function podeEscrever(produto: ProdutoId): Promise<boolean>
export function exigirEscrita(produto: ProdutoId): Promise<void>
```

`EstadoAcesso` ∈ `'ativo' | 'encerrado'`. Uma consulta por requisição, memoizada.

Índice `(workspace_id, membro_id) where status = 'ativa'`; a filtragem da lista de produtos sai
daí em memória, porque são poucas vendas por membro. Um índice GIN sobre `produtos` seria custo
sem ganho nesta escala.

### 9.4 Onde encaixa

1. **Hub `/ferramentas`** — lista só o que o membro comprou, marcando o que expirou.
2. **Rota da calculadora** — verifica no carregamento; quem nunca comprou é mandado embora.
3. **As duas ações de criação e edição** de
   `src/app/(app)/ferramentas/indulto-comutacao/acoes.ts` — `salvarCalculo` e
   `atualizarCalculo` — ganham `await exigirEscrita(produto)` logo abaixo do
   `exigirEngineLiberado()` que já têm. `excluirCalculo` **não** ganha (§9.2).
4. **O seletor de decreto** oferece só os decretos liberados: como o produto é por decreto, quem
   comprou 2025 não escolhe 2024.

**Gerar documento não é uma ação de servidor.** A calculadora imprime pelo navegador, então
o gate ali é a ocultação do botão, e só. Isto é suficiente e não é uma brecha: quem está em
leitura **pode ver** os resultados, e imprimir o que já se vê não escala privilégio nenhum. O
que ele não consegue é produzir cálculo novo — e isso é barrado no servidor.

🔴 **O ponto 3 é o gate de verdade; os outros são conforto.** A `0062` não criou policy de
escrita para `authenticated`, então toda escrita passa obrigatoriamente por server action com
service-role. Esconder botão não protege nada; a linha na ação, sim.

### 9.5 Os dois gates não se confundem

`exigirEngineLiberado()` é a licença do CRM inteiro e redireciona para `/licenca`.
`exigirEscrita()` é por produto e leva à explicação de acesso expirado. São ortogonais e
ambos correm.

## 10. Migrations

Uma só, `supabase/migrations/0063_vendas_e_ofertas.sql` (a `0062` é da calculadora).

**Aditiva e idempotente**, como todas: migration que falha impede o container de subir, e o CRM
reaplica no boot qualquer migration que não encontre registada. `create table`, `create index` e
`add column` levam `if not exists`; `create policy`, `create trigger` e `add constraint` vão em
blocos `do $$ ... end $$` que perguntam a `pg_policies`, `pg_trigger` e `pg_constraint` antes.

Cinco tabelas novas (`ofertas`, `vendas`, `webhook_compras_recebidas`, `modelos_email`,
`emails_fila`), quatro colunas em `membros`, `grant all` aos três papéis em cada tabela nova, e
o seed dos três modelos de e-mail.

## 11. Testes

| alvo | o que se prova |
|---|---|
| `src/lib/documento.ts` | dígito verificador de CPF e CNPJ, repetidos rejeitados, normalização e formatação |
| catálogo × `REGISTRO` | todo `decretoId` do catálogo existe no registo de decretos, e vice-versa |
| duração → `expira_em` | os sete valores, incluindo `31/01 + 1 mês` e `vitalicio` → nulo |
| merge de e-mail | substituição por tipo, campo desconhecido intacto, **escape de HTML no valor** |
| webhook: aprovação, comprador novo | cria membro, cria venda, fotografa a oferta, enfileira boas-vindas **e** entrega |
| webhook: aprovação, comprador conhecido | não cria membro, enfileira **só** a entrega |
| webhook: idempotência | o **mesmo** `PURCHASE_APPROVED` duas vezes cria **uma** venda |
| webhook: oferta desconhecida | devolve `200` e não cria nada |
| webhook: hottok | ausente → `503`; errado → `401`; certo → `200` |
| webhook: os três encerramentos | cada evento leva ao seu status; venda inexistente → `200` |
| resolução de identidade | por CPF; por e-mail sem documento (preenche); por e-mail com documento divergente (não sobrescreve, anota) |
| gate | os três estados × salvar/atualizar/excluir, e o bypass do owner |
| fila de e-mail | retentativa com recuo, desistência, e que o HTML renderizado não muda ao editar o modelo |

## 12. Dado pessoal e segurança

1. **O payload guardado contém dado pessoal** — CPF, endereço completo, telefone, e-mail. A
   tabela não tem policy para `authenticated`: só o servidor lê. Fica registado como ponto a
   decidir depois se `webhook_compras_recebidas` deve ter expurgo por idade, como a `0045` faz
   para canais.
2. **A senha temporária viaja em texto no e-mail.** É o preço do fluxo escolhido, mitigado pela
   troca obrigatória e pela validade de 7 dias.
3. **O hottok é o único guarda do endpoint.** Não há assinatura criptográfica no webhook da
   Hotmart: quem souber o token pode forjar uma compra. O token fica no cofre, nunca em código
   nem em log, e o corpo recebido nunca é ecoado na resposta.
4. **Nome vindo de terceiro entra em HTML** — resolvido pelo escape do §8.3.

## 13. Ordem de entrega

1. **E-mail** — SMTP, `modelos_email`, merge com escape, `emails_fila`, braço no tick. Testável
   sozinho, e é pré-requisito de tudo o resto.
2. **Identidade** — `src/lib/documento.ts`, colunas em `membros`, senha temporária com validade,
   troca obrigatória, recuperação de senha, CPF na aba Pessoas e no perfil.
3. **Catálogo e ofertas** — `catalogo.ts`, tabela, aba comercial, CRUD de ofertas.
4. **Webhook e vendas** — rota, hottok, auditoria, os quatro eventos, resolução de identidade,
   tela de vendas.
5. **O gate** — `acesso.ts` e os quatro pontos de encaixe.

Depois de 1 e 2 o CRM já ganha recuperação de senha, que hoje não existe. Depois de 4 as vendas
são registadas e auditáveis mesmo antes de o gate entrar. O gate é o último porque é o único
passo que **tira** acesso de alguém.

## 14. Pontos a validar

- **Reincidência de cobrança**: uma assinatura mensal da Hotmart emite `PURCHASE_APPROVED` a
  cada cobrança, e cada uma vira uma venda nova, com prazo próprio. O acesso é a união delas, o
  que funciona; falta confirmar que a Hotmart de facto reemite o evento em vez de um específico
  de recorrência.
- **Expurgo do payload** (§12.1).
- **Reembolso parcial e compra em garantia** — não tratados; entram como encerramento manual.

## 15. Fora de escopo

Segunda plataforma de vendas (a rota é parametrizada, mas só Hotmart é implementada);
tela de vitrine ou de checkout dentro do CRM; renovação automática iniciada pelo CRM;
relatórios de faturação; e-mail transacional fora dos três modelos.
