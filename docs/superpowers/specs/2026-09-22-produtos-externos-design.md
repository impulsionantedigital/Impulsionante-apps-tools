# Produtos externos — design

**Data:** 2026-09-22
**Estado:** aprovado, aguardando plano de implementação
**Depende de:** `2026-09-22-vitrine-produtos-bloqueados-design.md` (a vitrine é o que dá o que ver
ao comprador de produto só externo quando ele entra)

## O problema

Os produtos são fixos em código (`src/lib/produtos/catalogo.ts`), e toda oferta só pode vender o
que este CRM entrega: as calculadoras. Mas há coisas vendidas que o CRM não entrega — um curso que
mora na área de membros da Hotmart, um produto físico. Hoje elas não cabem no sistema.

Duas consequências:

1. **Não dá para vender um produto externo com brinde interno.** O caso concreto: vender um curso
   e dar 7 dias de degustação nas calculadoras. Hoje a compra cairia em `oferta_invalida`, porque
   a guarda do `aprovar` exige pelo menos um produto de venda que esteja no catálogo de código.
2. **O histórico financeiro fica partido.** Vendas aprovadas, canceladas e estornadas de tudo o
   que se vende deveriam caber num lugar só, que é de onde sai o dashboard futuro de vendas, churn
   e renovação.

## Decisões tomadas no brainstorm

- **O produto externo é `{ nome, ativo }`.** Preço e código continuam sendo fato da oferta e da
  venda — a Hotmart já manda o valor, e duplicá-lo no cadastro criaria duas verdades.
- **Externo é sempre venda, nunca degustação.** O CRM não entrega o curso, então não pode
  "conceder 7 dias" de nada: o acesso é dado por outra plataforma, e o CRM estaria gravando uma
  concessão que ele não faz e não pode revogar.
- **Desativar não trava venda.** Compra de oferta que inclui produto externo desativado é
  registrada normalmente. Quando o webhook chega, a Hotmart já cobrou a pessoa: recusar aqui não
  estorna nada, só perde o registro de um dinheiro que entrou — e, se a oferta tiver brinde, a
  pessoa pagaria sem receber. Desativar é arquivamento do catálogo ("não ofereça mais este produto
  quando eu montar uma oferta nova"). O freio de verdade é desativar a **oferta**, que já existe e
  já é respeitado no `aprovar`.
- **O produto externo gera período**, pela duração da oferta, mesmo sem ninguém consultar acesso:
  é o período que responde "esta venda está vigente?" (`vendaVigente`) e é dele que sai o
  vencimento na lista de vendas e o dashboard futuro.
- **Todo comprador continua recebendo conta e senha**, mesmo comprando só produto externo — e é a
  vitrine (spec irmã) que lhe dá o que ver ao entrar.
- **Produto interno fora de linha não ganha interruptor.** Para parar de anunciar a Calculadora
  2024, apaga-se `CHECKOUT_URL_CIC_2024` do painel: a regra "sem endereço, sem botão" já existe e
  já é testada. O produto continua funcionando para quem o tem.

## O achado que organiza o trabalho

`ehProdutoConhecido` faz **dois trabalhos diferentes** com o mesmo nome. Nos ~12 pontos onde
aparece, às vezes a pergunta é *"este id é válido?"* e às vezes é *"este produto é entregue por
este CRM?"*. Enquanto só existiam produtos internos, as duas respostas coincidiam. O produto
externo é o caso em que elas se separam: id válido, entrega nenhuma.

Ele é renomeado para **`ehProdutoInterno`** — o nome passa a dizer o que a função responde, e o
compilador aponta todos os usos para reclassificação.

**E na maioria dos pontos o filtro simplesmente sai.** Os ids ali não vêm do usuário: vêm de
`ofertas_produtos` e de `vendas.produtos`, tabelas nossas, preenchidas por nós. O filtro validava
dado que já era confiável, e o efeito colateral era justamente o que impede o produto externo de
existir — ele descartava em silêncio todo id fora do catálogo de código.

## Arquitetura

### A tabela

```sql
create table if not exists public.produtos_externos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  nome          text not null,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
```

Migration `0072`, aditiva e idempotente, com `enable row level security`, grants aos três papéis e
policy de `service_role` — o mesmo padrão da `ofertas`: dado comercial não passa por
`authenticated`, só por server action com service-role. Índice único em `(workspace_id,
lower(nome))`, para não nascerem dois "Curso de Execução Penal" que ninguém distingue na hora de
montar a oferta. Gatilho de `atualizado_em`, como as outras.

### A identidade

O UUID entra nas colunas de texto que já existem: `ofertas_produtos.produto_id`,
`vendas.produtos` e `vendas_periodos.produto_id` são todas `text`. Nenhuma coluna nova, nenhuma
tabela paralela de venda. Produto interno se identifica por `indulto-comutacao-2025`; externo, por
um UUID. Nunca colidem.

🔴 **Não há FK dessas colunas para `produtos_externos`, e é de propósito:** a mesma coluna guarda
id de código e id de banco, e nenhuma FK aponta para os dois. O que garante a integridade é a
origem do dado — esses ids nascem das nossas próprias tabelas, nunca de entrada do usuário no
momento da venda. A migration leva este comentário, senão alguém "conserta" acrescentando a FK e
quebra toda venda de produto interno.

**Exclusão** segue a regra da oferta: só sai quem nenhuma oferta e nenhuma venda referenciam; o
resto se desativa.

**Renomear muda o nome em todo o histórico**, inclusive nas vendas antigas — decidido assim de
propósito: corrigir um erro de digitação deve corrigir em todo lugar. A fotografia da venda
(§7.4) guarda ids, não nomes, e continua assim.

### A reclassificação, ponto a ponto

Em `src/server/vendas/processar.ts`:

| Onde | Hoje | Passa a ser | Por quê |
|---|---|---|---|
| `:157` produtos de venda da oferta | filtra | **sem filtro** | o id veio de `ofertas_produtos`; externo é venda |
| `:158` produtos de degustação | filtra | **`ehProdutoInterno`** | só se concede o que este CRM entrega |
| `:346` períodos que faltam | filtra | **sem filtro** | externo também tem período |
| `:369` degustação no reenvio | filtra | **`ehProdutoInterno`** | idem `:158` |
| `:493`, `:536` bônus retroativo | filtra | **sem filtro** | o bônus vale para externo igual |
| `:552` degustação no bônus | filtra | **`ehProdutoInterno`** | idem |
| `:649`–`:650` e-mails | filtra | **muda de forma** | ver "Os e-mails" |

E a guarda de entrada do `aprovar`:

```ts
if (produtos.length === 0 || prazo === null || typeof prazo === 'number') {
  return { resultado: 'oferta_invalida', detalhe: 'sem produto de venda conhecido, ou duração inválida' }
}
```

Ela hoje recusa a oferta cujos produtos de venda não estejam no catálogo de código — que é
exatamente a oferta 100% externa que passamos a aceitar. A condição continua exigindo ao menos um
produto de venda e uma duração válida; "conhecido" deixa de significar "interno".

### Exibir nome

Nasce `rotulosDosProdutos(ws, ids)`, assíncrona: rótulo do catálogo quando o id é interno, nome da
tabela quando é externo, e o próprio id como último recurso — um produto externo excluído de um
histórico antigo não deve quebrar a lista de vendas. É ela que substitui `.map(rotuloDoProduto)`
na lista de vendas do card Comercial, que hoje cairia no `v.produtos.join(', ')` e mostraria UUID.

### O que não muda

`estadoDeAcesso`, `detalheDeAcesso`, a vitrine, o menu e as páginas de produto continuam iterando
o catálogo de código. O período de um produto externo existe em `vendas_periodos`, mas nenhum
`produtoId` do catálogo casa com ele: nunca aparece, nunca libera tela, nunca precisa de guarda.
**É o teste de que a abordagem é a certa** — o produto externo é invisível para todo o lado de
entrega sem uma linha de código para escondê-lo.

## Os e-mails

`decidirEmails` continua pura e ganha um quarto campo:

```ts
export interface DecisaoEmails {
  boasVindas: boolean
  /** Produtos INTERNOS que o membro nunca teve — são os que o e-mail de entrega anuncia. */
  entrega: string[]
  /** Produtos internos concedidos como brinde por ESTA venda. */
  degustacao: string[]
  pagamentoRecebido: boolean
}
```

- **`boas_vindas`** — para quem nunca entrou. Sem mudança.
- **`entrega_produto`** — só produtos **internos** novos. Externo nunca entra: não há o que
  liberar, e o `TOOL_URL` apontaria para rota inexistente. Venda 100% externa não dispara este.
- **`degustacao_liberada`** — **novo**, editável no card de Modelos de e-mail. Campos:
  `MEMBER_NAME`, `PRODUCT_NAME`, `OFFER_NAME`, `EXPIRES_AT`, `TOOL_URL`, `LOGIN_URL`.
- **`pagamento_recebido`** — como hoje, e o `PRODUCT_NAME` passa pelo `rotulosDosProdutos`, para a
  venda do curso dizer o nome do curso em vez de um UUID.

🔴 **Por que o brinde não pode reusar o `entrega_produto`:** aquele modelo manda um único
`EXPIRES_AT`, calculado pelo vencimento **mais tardio** (`vencimentoMaisTardio`). Numa oferta
mista — calculadora 2025 vendida por um ano, 2024 de brinde por 7 dias — o brinde seria anunciado
com a data da assinatura, e morreria em 7 dias sem aviso. O modelo novo calcula o vencimento **só
dos períodos de brinde daquela venda**.

**Idempotência** no padrão existente: chave `venda:<id>:degustacao`, e a fila recusa a repetida. O
reenvio da Hotmart cai em `retomar`, que completa sem duplicar.

**Custo em migration:** uma linha alargando o CHECK de `emails_fila.tipo` (fixado na `0063`), mais
as entradas em `tipos.ts`, `padroes.ts` e `ModelosEmailCard.tsx`.

**Aceito de propósito:** quem compra só o curso, ganha brinde e nunca entrou recebe **três**
e-mails — boas-vindas, pagamento recebido e degustação liberada. Cada um diz uma coisa diferente.

## As telas

**Cadastro.** `ProdutosExternosCard`, na aba **Comercial**, acima do card de ofertas, com ações
próprias em `acoes-produtos-externos.ts` — e não dentro de `acoes-comercial.ts`, que já tem 516
linhas (o `ComercialCard` tem 505). Mesma autorização do resto do comercial: só o dono do
servidor, no workspace de que é owner. A lista mostra nome, interruptor ativo/inativo e botão de
excluir apenas quando nada referencia o produto, com a contagem de ofertas ao lado — do jeito que
a lista de ofertas já mostra a contagem de vendas.

**Formulário da oferta.** A lista de produtos passa a trazer os externos ativos junto dos
internos, cada um com marca de origem, separados em dois grupos na tela: *"Ferramentas deste CRM"*
e *"Produtos externos"*. Produto externo aparece **sem** a opção de degustação, e o Zod recusa se
vier assim mesmo.

🔴 **Editando uma oferta que usa produto externo desativado, ele tem de continuar aparecendo
marcado.** Se a lista trouxesse só os ativos, abrir e salvar a oferta apagaria aquele produto em
silêncio. A regra é: "ativos, mais os que esta oferta já usa".

**Validação no servidor**, em `OfertaSchema`:
- `produtos` — id do catálogo **ou** UUID existente em `produtos_externos` daquele workspace. A
  conferência é uma consulta feita depois do parse: o Zod sozinho não alcança o banco.
- `produtosDegustacao` — só interno, com mensagem própria: *"Produto externo não pode ser
  degustação: este CRM não entrega o acesso dele."*

**Nenhuma tela nova para o produto externo em si:** ele não entra na vitrine, no menu, em rota nem
em página. Não é regra a implementar — é consequência de a vitrine e o menu iterarem o catálogo de
código.

## Testes

**Automatizados** (as partes puras, onde a regra mora):

- `ehProdutoInterno`: id do catálogo → `true`; UUID → `false`. É o teste que fixa a separação dos
  dois significados.
- `decidirEmails`: venda 100% externa → `entrega` vazia e `pagamentoRecebido: true`; venda mista →
  só os internos novos na `entrega`; venda com brinde → `degustacao` preenchida; venda encerrada →
  nada (já existe, continua valendo).
- `rotulosDosProdutos`: interno → rótulo do catálogo; externo → nome da tabela; id órfão → o
  próprio id, sem quebrar a lista.
- Validação da oferta: produto externo marcado como degustação é recusado, com a mensagem própria.
- A migration `0072` entra sozinha na guarda de `tests/migracoes/idempotencia.spec.ts`, que varre
  toda migration de número ≥ 63 e cobra `if not exists`, esquema qualificado, RLS e grants.

**Não automatizado, e dito abertamente:** `processar.ts` não tem teste unitário — a suíte cobre a
rota do webhook com o processamento mockado, não o processamento. As mudanças da tabela de
reclassificação são verificadas à mão, com a ferramenta que o próprio sistema oferece (todo
webhook fica em `webhook_compras_recebidas`, e o card Comercial tem **reprocessar evento**):

1. Criar um produto externo e uma oferta que o venda, com uma calculadora de brinde.
2. Disparar (ou reprocessar) uma compra daquele código de oferta.
3. Conferir: venda com valor e transação; período do produto externo e da calculadora; a
   calculadora abre para o comprador; os três e-mails na fila com o conteúdo certo.
4. **Reprocessar o mesmo evento e confirmar que nada duplica** — nem venda, nem período, nem
   e-mail. É o passo mais importante dos cinco: é onde um erro na reclassificação apareceria.
5. Cancelar/estornar e confirmar que a venda encerra e o acesso da calculadora fecha.

## Fora desta spec

**Dashboard de vendas, churn e renovação.** É a motivação de longo prazo, e esta spec existe para
lhe dar o dado completo: com produto externo virando venda e período, todo o faturamento passa a
caber numa consulta só. O desenho do painel é trabalho próprio.
