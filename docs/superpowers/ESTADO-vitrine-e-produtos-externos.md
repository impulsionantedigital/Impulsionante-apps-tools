# Estado do trabalho — vitrine e produtos externos

Documento de retoma, no padrão do `ESTADO-vendas-hotmart.md`. Com ele e o `git log` dá para
continuar sem a sessão que o escreveu.

**Data:** 2026-09-23 (implementação) — o desenho é de 2026-09-22.
**Os dois trabalhos estão IMPLEMENTADOS.** Plano da vitrine executado (7 tasks) e plano de produtos
externos executado (9 tasks). Suíte: **1999 testes verdes**, `pnpm build` verde, `tsc` limpo.

## O que foi entregue

| Trabalho | Commits | Estado |
|---|---|---|
| Vitrine de produtos bloqueados | 7 tasks + guarda estática | implementado |
| Produtos externos | 9 tasks (migration `0072` + `0073`) | implementado |

🔴 **Uma verificação NÃO foi feita, e é preciso dizê-lo:** a checagem MANUAL do processamento (os
cinco passos do fim da spec de produtos externos) exige banco e um webhook real — esta máquina não
tem as credenciais, e o `docs/DEPLOY.md` avisa que a `SUPABASE_ANON_KEY` não pode ser adivinhada nem
colhida do site. **Ela continua pendente e precisa ser feita no ambiente que tiver as credenciais.**
É a verificação mais importante do trabalho: é onde um erro na reclassificação apareceria.

## Como os dois se relacionam

Nasceram do mesmo brainstorm. O pedido original era o dos **produtos externos**; a **vitrine**
apareceu no meio, quando se descobriu que o comprador de um produto externo entraria num CRM que
lhe mostra uma tela vazia — a regra §9.2 escondia todo produto que o membro não tivesse.

Decidiu-se fazer **duas specs, vitrine primeiro**: ela é menor, entrega valor sozinha e não
depende dos produtos externos, enquanto o inverso não é verdade.

## Trabalho 1 — Vitrine de produtos bloqueados: CONCLUÍDO

Todo produto interno passa a aparecer sempre, na vitrine e no menu, com cadeado e convite de
compra para quem não tem acesso; a página do produto abre em leitura em vez de redirecionar.

- **Spec:** `docs/superpowers/specs/2026-09-22-vitrine-produtos-bloqueados-design.md`
- **Plano:** `docs/superpowers/plans/2026-09-22-vitrine-produtos-bloqueados.md` — sete tasks, em TDD
- **Modo de execução:** por subagentes, com revisão do supervisor entre uma task e a seguinte, e
  contexto limpo por task — como o plano fixou.

**Pendente:** nada do plano. As sete tasks foram executadas, e uma **guarda estática** foi
acrescida em `tests/vendas/vitrine-guarda.spec.ts`: nenhum teste de unidade pegaria quem revertesse
o filtro por engano, porque as telas são server components que dependem de banco. Ela fixa que a
vitrine e o menu não filtram por acesso, que a página do produto não redireciona quem nunca teve
acesso, e que os gates de ESCRITA continuam de pé. **Provada por inversão** — reintroduzir o filtro
antigo faz o teste falhar.

**Não precisou de migration**, como o plano previa.

## Trabalho 2 — Produtos externos: CONCLUÍDO

Cadastro de produtos que o CRM não entrega (curso na área de membros da Hotmart, produto físico),
para poder vender um curso e dar calculadora de brinde na mesma oferta, e para concentrar todo o
histórico financeiro num lugar só.

- **Spec:** `docs/superpowers/specs/2026-09-22-produtos-externos-design.md`
- **Plano:** `docs/superpowers/plans/2026-09-22-produtos-externos.md` — nove tasks

**A tabela `produtos_externos` nasceu na migration `0072`**, aditiva e idempotente, com índice único
em `(workspace_id, lower(nome))`, RLS e policy de `service_role`. E a `0073` alargou o CHECK de
`modelos_email.tipo`. 🔴 **A `0072` NÃO cria FK para o catálogo** — a mesma coluna guarda id de
código e id de banco, e a FK quebraria toda venda de produto interno. O comentário está na migration.

**Nota de execução:** o desenho dizia que o CHECK a alargar era o de `emails_fila.tipo`; ao
executar, verificou-se que `emails_fila` **não tem** coluna `tipo` — quem limita os tipos é
`public.modelos_email.tipo`, e é lá que a `0073` age. A `spec` fica como está (registro), mas quem
for retomar deve saber disto.

**Pendente:** nada do plano. E o que o plano dizia "não precisa de migration" era sobre a vitrine;
este precisou de duas, e ambas entraram.

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
id desconhecido sumia. **O Trabalho 2 remove essa rede em cinco pontos** (a função hoje é
`ehProdutoInterno`), de propósito, porque era ela que impedia o produto externo de existir. Depois
disso, um erro de classificação não é mais descartado em silêncio: ele vira um período errado, um
e-mail errado ou uma venda sem acesso.

🔴 **E AGORA ISTO É ESTADO ATUAL, NÃO PLANO.** A rede já foi removida e está no código. As partes
puras estão cobertas por teste (`ehProdutoInterno`, `decidirEmails`, `rotulosDosProdutos`, a
validação da oferta), mas o `processar.ts` em si continua sem teste unitário — e as mudanças na
tabela de reclassificação só se verificam à mão.

**Como está coberto hoje:** roteiro de verificação manual, no fim da spec dos produtos externos,
usando o que o próprio sistema oferece — todo webhook fica em `webhook_compras_recebidas` e o card
Comercial tem **reprocessar evento**. O passo mais importante é reprocessar o mesmo evento e
confirmar que nada duplica.

⚠️ **ESTA VERIFICAÇÃO AINDA NÃO FOI FEITA.** A implementação foi concluída sem acesso ao banco nem
à Hotmart — a máquina não tem as credenciais. **É a pendência mais urgente do trabalho**, e não se
pode afirmar que o produto externo funciona ponta a ponta antes dela.

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
