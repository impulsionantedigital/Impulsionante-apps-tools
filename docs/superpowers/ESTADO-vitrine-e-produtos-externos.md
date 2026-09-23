# Estado do trabalho — vitrine e produtos externos

Documento de retoma, no padrão do `ESTADO-vendas-hotmart.md`. Com ele e o `git log` dá para
continuar sem a sessão que o escreveu.

**Data:** 2026-09-22
**Nada disto está implementado.** Os dois trabalhos existem só como documento. Nenhuma linha de
`src/` mudou, nenhuma migration nova foi escrita.

## Como os dois se relacionam

Nasceram do mesmo brainstorm. O pedido original era o dos **produtos externos**; a **vitrine**
apareceu no meio, quando se descobriu que o comprador de um produto externo entraria num CRM que
lhe mostra uma tela vazia — a regra §9.2 escondia todo produto que o membro não tivesse.

Decidiu-se fazer **duas specs, vitrine primeiro**: ela é menor, entrega valor sozinha e não
depende dos produtos externos, enquanto o inverso não é verdade.

## Trabalho 1 — Vitrine de produtos bloqueados: PLANEJADO, NÃO IMPLEMENTADO

Todo produto interno passa a aparecer sempre, na vitrine e no menu, com cadeado e convite de
compra para quem não tem acesso; a página do produto abre em leitura em vez de redirecionar.

- **Spec:** `docs/superpowers/specs/2026-09-22-vitrine-produtos-bloqueados-design.md`
- **Plano:** `docs/superpowers/plans/2026-09-22-vitrine-produtos-bloqueados.md` — sete tasks, em TDD
- **Branch:** `vitrine-produtos-bloqueados`, já fundida no `main` (merge `d396dcc`) — só documento
- **Modo de execução:** por subagentes, com revisão do supervisor entre uma task e a seguinte, e
  contexto limpo por task. Está fixado no topo do plano, e não é opcional.

**Pendente:** executar as sete tasks. O plano traz o código de cada passo; nenhuma decisão de
desenho ficou em aberto.

**Não precisa de migration.** Se alguma task parecer precisar de uma, o desenho está errado —
pare e chame o humano.

## Trabalho 2 — Produtos externos: DESENHADO, SEM PLANO

Cadastro de produtos que o CRM não entrega (curso na área de membros da Hotmart, produto físico),
para poder vender um curso e dar calculadora de brinde na mesma oferta, e para concentrar todo o
histórico financeiro num lugar só.

- **Spec:** `docs/superpowers/specs/2026-09-22-produtos-externos-design.md`
- **Plano:** ainda não existe
- **Branch:** `produtos-externos`

**Pendente, em ordem:**

1. **Escrever o plano de implementação** (skill `writing-plans`), a partir da spec.
2. **Executar**, no mesmo modo do Trabalho 1: subagentes, revisão entre tasks.

**Depende da vitrine estar em produção** — não por código, mas por produto: sem ela, o comprador
de um produto só externo entra num CRM sem nada para ver, e foi para resolver isso que a decisão
"todo comprador recebe conta e senha" foi tomada.

**O núcleo do trabalho** é separar os dois significados que `ehProdutoConhecido` acumula ("este id
é válido?" e "este produto é entregue aqui?"). A spec traz a tabela de reclassificação ponto a
ponto do `processar.ts`. Um erro ali aparece só em produção, numa venda.

## Pendência de testes — `processar.ts` não tem teste unitário

**Este é o risco conhecido dos dois trabalhos, e ele é do Trabalho 2.**

A suíte cobre a rota do webhook (`tests/vendas/webhook-rota.spec.ts`) com o **processamento
mockado** — `receberCompra` é substituído por um `vi.fn()`. O que o `processar.ts` faz de verdade
(resolver a oferta, gravar a venda, calcular e gravar períodos, conceder brindes, enfileirar
e-mails, tratar reenvio e encerramento) não tem teste automatizado nenhum.

Enquanto os produtos eram só os do catálogo de código, isso incomodava pouco: o
`.filter(ehProdutoConhecido)` espalhado pelo arquivo funcionava como rede de segurança grosseira —
id desconhecido sumia. **O Trabalho 2 remove essa rede em seis pontos**, de propósito, porque era
ela que impedia o produto externo de existir. Depois disso, um erro de classificação não é mais
descartado em silêncio: ele vira um período errado, um e-mail errado ou uma venda sem acesso.

**Como está coberto hoje:** roteiro de verificação manual, no fim da spec dos produtos externos,
usando o que o próprio sistema oferece — todo webhook fica em `webhook_compras_recebidas` e o card
Comercial tem **reprocessar evento**. O passo mais importante é reprocessar o mesmo evento e
confirmar que nada duplica.

**O que ficou decidido:** o plano do Trabalho 2 **não** vai incluir a criação de cobertura de
teste para o `processar.ts`. É trabalho considerável — o arquivo toca banco em quase toda linha, e
testá-lo exige um dublê de Supabase que o projeto ainda não tem — e misturá-lo faria a spec ter
dois assuntos.

**Fica como pendência própria, e vale abrir spec para ela** se a verificação manual começar a
doer. O que esse trabalho precisaria decidir: dublê de Supabase em memória ou banco de teste real;
quais caminhos cobrir primeiro (a ordem sugerida é reenvio, encerramento que chega antes da
aprovação, e concessão de brinde, que são os três onde já houve defeito documentado nos
comentários do arquivo).

## Decisões do brainstorm que não estão no código nem no git log

Estas só existem aqui e nas duas specs. Todas foram escolhas explícitas, não omissões:

- **A §9.2 foi invertida de propósito.** "Não existe vitrine do que o membro não tem" deixou de
  valer. Quem ler a regra antiga num comentário e "consertar" o filtro de volta desfaz a feature.
- **Produto externo é `{ nome, ativo }`** — sem preço e sem código de oferta. Preço e código
  continuam sendo fato da oferta e da venda.
- **Externo nunca é degustação:** o CRM não entrega o acesso dele, logo não pode concedê-lo nem
  revogá-lo.
- **Desativar produto externo não recusa compra.** Quando o webhook chega, a Hotmart já cobrou.
- **Produto interno fora de linha não ganha interruptor:** apaga-se `CHECKOUT_URL_<SLUG>` do painel.
- **Não há FK de `ofertas_produtos.produto_id` / `vendas.produtos` / `vendas_periodos.produto_id`
  para `produtos_externos`,** porque a mesma coluna guarda id de código e id de banco. Acrescentar
  a FK quebra toda venda de produto interno.
- **O brinde ganha modelo de e-mail próprio (`degustacao_liberada`)** em vez de reusar o
  `entrega_produto`, que manda um único `EXPIRES_AT` — o vencimento mais tardio — e anunciaria um
  brinde de 7 dias com a data da assinatura anual.
