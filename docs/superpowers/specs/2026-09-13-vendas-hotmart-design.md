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
                     │      └─ criou? ─▶ senha temporária + e-mail de boas-vindas
                     ├─ 5. cria venda (fotografia da oferta) ──▶ vendas
                     │      ├─ expira_em empilha sobre a venda vigente
                     │      └─ produto novo? entrega : pagamento recebido
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
| `senha_temporaria_hash` | `text null` | `scrypt` da senha temporária, com sal |
| `senha_temporaria_expira_em` | `timestamptz null` | validade de 7 dias da senha temporária |

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

#### 6.3.1 Renovação empilha

O intervalo não conta sempre da aprovação. A base é:

```
base = maior( aprovada_em , maior expira_em entre as vendas do membro que
                            partilham produto com esta oferta,
                            com status = 'ativa' e expira_em > now() )

expira_em = base + intervalo(duracao)
```

Quem renova **antes** de vencer não perde os dias que já tinha; quem renova **depois** começa
na data do pagamento.

🔴 **A base é o `expira_em` anterior, não `expira_em + 1 dia`.** `expira_em` é fronteira
**exclusiva** — o acesso vale enquanto `agora < expira_em`. Uma mensal aprovada a 01/01 vence
a 01/02, o último dia de uso é 31/01, e a renovação a começar em 01/02 é o dia seguinte, sem
buraco e sem sobreposição. Somar mais um dia abriria uma lacuna de 24 h a cada renovação.

Duas restrições:

- **Só venda `ativa` e ainda vigente serve de base.** Uma venda reembolsada ou com chargeback
  não pode doar o tempo dela à seguinte.
- **Vitalício vigente não empilha** — não há vencimento a bater. A venda nova conta de si
  mesma e o e-mail é `pagamento_recebido` (§7.5.2).

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
   - linha em `membros` com `papel = 'membro'`, `cpf_cnpj` e `nome`;
   - emite a senha temporária (§8.5).
3. **Calcula `novos` antes de gravar a venda** (§7.5.2).
4. Cria a venda, com a fotografia da oferta e o `expira_em` empilhado (§6.3.1).
5. Enfileira os e-mails que a árvore de §7.5.2 mandar.

`data.purchase.approved_date` vem em **milissegundos de época** e é convertido; o valor sai de
`data.purchase.price.value` e `.currency_value`.

#### 7.5.2 Que e-mail cada aprovação dispara

Cada cobrança de uma assinatura chega como um `PURCHASE_APPROVED` **novo**, com transação
nova — a Hotmart não emite atualização de assinatura. É por isso que a decisão não pode ser
"é a primeira compra?", e sim:

```
novos = produtos(oferta) − produtos que o membro JÁ TEVE
                           (qualquer venda anterior, ativa OU não)

membro acabou de ser criado  →  boas_vindas + entrega_produto(novos)
novos não está vazio         →  entrega_produto(novos)
novos está vazio             →  pagamento_recebido
```

O cálculo é feito **antes** do `insert`, senão a venda que está a ser criada entraria na
própria conta e `novos` seria sempre vazio.

**A subtração é o que acerta o combo**: se uma oferta libertar 2024+2025 e o membro já tiver
2025, ele recebe a liberação só do 2024 — em vez de um "produto liberado" a anunciar o que ele
já usava, ou de um recibo a esconder um produto novo.

Membro que já existe **nunca** recebe `boas_vindas`: ele já tem acesso, e mandar dados de
acesso a cada mensalidade seria ruído — e, pior, sugeriria que a senha dele mudou.

#### 7.5.3 Encerramento

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

Ausentes → o envio não acontece e a aba comercial mostra o motivo. O recurso nasce **desligado**,
nunca quebrado.

🔴 **Mas enfileirar acontece na mesma, mesmo sem SMTP** — corrigido face à redação anterior desta
secção, que dizia o contrário. A §8.4 promete que a fila não perde a credencial de acesso de quem
comprou, e é esse o compromisso que vale: uma venda que entre por webhook enquanto o SMTP ainda não
está configurado não pode perder o e-mail de boas-vindas, senão o comprador paga e nunca entra.
`drenarEmail` sai cedo quando falta configuração, então as linhas esperam em segurança até alguém
configurar — e envelhecem por `IDADE_MAX_MS`, para não despejarem credenciais expiradas meses
depois.

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

`tipo` ∈ `boas_vindas` · `recuperacao_senha` · `entrega_produto` · `pagamento_recebido`, com
`check` nomeada.

Os quatro nascem **semeados com HTML padrão funcional**, para o recurso funcionar antes de
você escrever qualquer coisa. O HTML definitivo de cada um fica para depois.

### 8.3 Campos de merge

Declarados em código, por tipo, em `src/lib/email/campos.ts`:

| tipo | campos |
|---|---|
| `boas_vindas` | `[MEMBER_NAME]` `[MEMBER_EMAIL]` `[TEMP_PASSWORD]` `[LOGIN_URL]` |
| `recuperacao_senha` | `[MEMBER_NAME]` `[TEMP_PASSWORD]` `[LOGIN_URL]` |
| `entrega_produto` | `[MEMBER_NAME]` `[PRODUCT_NAME]` `[OFFER_NAME]` `[EXPIRES_AT]` `[TOOL_URL]` `[LOGIN_URL]` |
| `pagamento_recebido` | `[MEMBER_NAME]` `[OFFER_NAME]` `[PRODUCT_NAME]` `[EXPIRES_AT]` `[VALUE]` `[TRANSACTION]` `[LOGIN_URL]` |

Em `entrega_produto`, `[PRODUCT_NAME]` rende a lista de `novos`, não a lista inteira da oferta.

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

**A senha temporária é uma credencial PARALELA, não uma substituição.** Emitir uma não toca na
senha principal: quem a lembrar continua a entrar com ela.

Emitir consiste em gerar texto claro aleatório, guardar `scrypt(texto, sal)` em
`senha_temporaria_hash`, marcar `senha_temporaria_expira_em = now() + 7 days` e enfileirar o
e-mail com o texto claro. **O texto claro existe só no e-mail**; o banco nunca o vê. O `scrypt`
vem de `node:crypto` — sem dependência nova, e é KDF de verdade, não um digest.

**O login ganha um segundo caminho.** `entrar()` (`src/server/auth/sessao.ts`) tenta o
`signInWithPassword` de sempre; se falhar, confere a senha oferecida contra o hash, em
comparação de tempo constante. Batendo e dentro do prazo, a sessão nasce **sem tocar na senha
principal**: `auth.admin.generateLink({ type: 'magiclink' })` no servidor, seguido de
`verifyOtp` com o `hashed_token` devolvido — que é como se emite sessão no Supabase sem
conhecer a senha do utilizador. Mudar a senha principal aqui destruiria exatamente o que este
desenho protege.

**O que acontece depois de entrar**, e é onde os dois caminhos divergem:

| entrou com | efeito |
|---|---|
| senha **temporária** | fica preso em `/trocar-senha` até definir a senha dele; definir apaga o hash |
| senha **principal** | o hash é apagado e **não** se força troca nenhuma |

O segundo caso é decisão de desenho: ele provou que sabe a senha, e a temporária pendente
deixa de ter função. Forçar a troca ali seria punir quem lembrou.

**Validade de 7 dias.** Hash expirado não autentica — a tela manda usar "recuperar senha".
Uma credencial que abre a conta e fica para sempre numa caixa de entrada é o ponto fraco que
sobraria.

**Recuperação** é a mesma máquina: emite nova senha temporária e enfileira `recuperacao_senha`.
Não há tabela de tokens, e a senha principal do membro continua válida durante todo o processo.

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
o seed dos quatro modelos de e-mail.

## 11. Testes

| alvo | o que se prova |
|---|---|
| `src/lib/documento.ts` | dígito verificador de CPF e CNPJ, repetidos rejeitados, normalização e formatação |
| catálogo × `REGISTRO` | todo `decretoId` do catálogo existe no registo de decretos, e vice-versa |
| duração → `expira_em` | os sete valores, incluindo `31/01 + 1 mês` e `vitalicio` → nulo |
| empilhamento | renova antes de vencer (base = `expira_em` anterior, **sem** +1 dia); renova depois (base = aprovação); venda reembolsada não serve de base; vitalício vigente não empilha |
| senha temporária | emitir não altera a senha principal; entrar com a principal apaga o hash e não força troca; entrar com a temporária força; hash expirado não autentica |
| merge de e-mail | substituição por tipo, campo desconhecido intacto, **escape de HTML no valor** |
| webhook: aprovação, comprador novo | cria membro, cria venda, fotografa a oferta, enfileira boas-vindas **e** entrega |
| webhook: aprovação, produto que ele **não** tinha | não cria membro, enfileira **só** `entrega_produto` |
| webhook: renovação do mesmo produto | enfileira **só** `pagamento_recebido`; nada de boas-vindas |
| webhook: combo parcial | `entrega_produto` cita **só** os produtos novos |
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
2. **A senha temporária viaja em texto no e-mail**, e só ali: no banco vive como `scrypt` com
   sal. O risco fica confinado à caixa de entrada do próprio membro, mitigado pela troca
   obrigatória e pela validade de 7 dias. A senha principal nunca é alterada por este fluxo,
   então uma temporária interceptada não expulsa o dono da conta.
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

- **Expurgo do payload** (§12.1).
- **Reembolso parcial e compra em garantia** — não tratados; entram como encerramento manual.

## 15. Fora de escopo

Segunda plataforma de vendas (a rota é parametrizada, mas só Hotmart é implementada);
tela de vitrine ou de checkout dentro do CRM; renovação automática iniciada pelo CRM;
relatórios de faturação; e-mail transacional fora dos quatro modelos.

## 16. Correções feitas ao planear o Plano 2

Encontradas ao ler o código antes de escrever o plano de vendas. Onde contradizem as secções
acima, **valem estas**.

1. **O produto é o id do motor.** O motor de 2025 já se chama `indulto-comutacao-2025`
   (`src/lib/indulto-comutacao/motores/2025/index.ts`), que é exatamente o `ProdutoId` que a §5
   previa. O catálogo deixa de ter `decretoId: '2025'`; cada produto aponta para o `id` de um motor
   do `REGISTRO`, e o teste de contrato exige a correspondência nos dois sentidos.
2. **Não há "gerar documento" para bloquear.** A calculadora não tem ação de servidor de
   documento nem botão de imprimir. O ponto 3 da §9.4 reduz-se a `salvarCalculo` e
   `atualizarCalculo`.
3. **Não existe página de perfil do membro.** "O próprio membro vê o CPF no perfil" (§4.5) fica
   fora do Plano 2. Owner vê e corrige na aba Pessoas.
4. **Boas-vindas vão para quem nunca entrou, não só para quem acabou de ser criado.** Com a regra da
   §7.5.2 ("membro acabou de ser criado"), um reenvio da Hotmart depois de uma falha a meio — membro
   criado, venda não gravada — encontraria o membro já existente, e o comprador nunca receberia a
   senha. A condição passa a ser `auth.users.last_sign_in_at` nulo: enquanto o comprador nunca
   entrou, cada aprovação emite uma senha temporária nova e reenvia as boas-vindas.
5. **`expira_em` é calculado em TypeScript, não pelo banco** (§6.3). Continua a haver uma única
   regra, num único lugar — só que num lugar testável, já que não há Postgres sob teste. Meses de
   calendário com fecho no último dia do mês: 31/01 + 1 mês = 28/02 (ou 29 em ano bissexto).

### 16.1 Melhorias incorporadas da revisão do trabalho do Codex

Adotadas depois de analisar o que outro agente escreveu sobre este tema. O resto foi descartado.

6. **CNPJ alfanumérico.** A normalização mantém letras (em maiúscula) e retira só pontuação; a
   `check` aceita `^([0-9]{11}|[0-9A-Z]{12}[0-9]{2})$`. Dígito verificador pelo código ASCII menos
   48, como define a Receita. Validado contra o exemplo oficial `12.ABC.345/01DE-35`.
7. **O hash da senha temporária fica fora das leituras de `authenticated`.** A policy
   `membros_sel` deixa qualquer membro ler as linhas dos outros membros do mesmo workspace; sem
   isto, o hash de todos seria legível pelo console do navegador. A `0064` troca o `select` de
   tabela por `select` coluna a coluna, deixando de fora `senha_temporaria_hash` e
   `senha_temporaria_expira_em`. Nenhuma leitura existente do sistema usa essas colunas.
8. **Período por produto.** Nova tabela `vendas_periodos (venda_id, produto_id, inicia_em,
   expira_em)`, e `vendas.expira_em` deixa de existir. O empilhamento da §6.3.1 passa a ser
   calculado **por produto**: com a regra anterior, um combo que trouxesse um produto novo
   herdaria o vencimento de outro produto e só liberaria o novo no futuro.
9. **Eventos fora de ordem.** Um encerramento que chega antes da aprovação fica na auditoria; a
   aprovação posterior grava a venda **já encerrada**, sem liberar acesso nem enviar e-mail.
10. **Idempotência de entrega.** `webhook_compras_recebidas.event_id` (o `id` do envelope da
    Hotmart) é único por plataforma, e `emails_fila.chave_evento` é único. A venda grava
    `produtos_novos` e `notificacao_pendente`, para os e-mails poderem ser reenfileirados sem
    duplicar se o processamento cair entre gravar a venda e enfileirar.
11. **Senha temporária não é trocada enquanto houver uma válida pendente.** Substitui a regra da
    §16.4: a primeira emissão fica, e reenvios da Hotmart não invalidam a senha que já foi por
    e-mail. **A recuperação de senha força uma credencial nova.**
12. **`PURCHASE_REFUNDED` também encerra como `reembolsada`**, além de `PURCHASE_PROTEST`.
13. **URL dos links nos e-mails:** vem da configuração que o produto já tem
    (`url_publica_do_crm`), sem variável de ambiente nova. Sem ela, a senha temporária não é
    emitida e o motivo fica registado.
14. **Senha mínima de 6 caracteres**, como no cadastro do produto (máximo de 72 bytes, limite do
    Supabase).
15. **A lógica de venda fica em TypeScript**, não em funções SQL, para ser testável. A
    idempotência é garantida pela chave única da transação. Risco residual aceite: duas compras
    do mesmo produto, do mesmo membro, processadas no mesmo instante podem sobrepor dias.
16. **Cancelamento revoga só a venda indicada**, sem recalcular os períodos de vendas posteriores.
