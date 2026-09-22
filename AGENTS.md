# Regras para agentes de código (Claude Code, Cursor, Codex, …)

> **Este repositório é 100% próprio.** Ele nasceu de uma cópia do Awave CRM, mas não recebe
> mais nada do produto original: **não existe atualização em um clique aqui, e a tela que a
> disparava não existe mais.** Não há versão nova para baixar, nada substitui arquivo nenhum,
> e nada é sobrescrito por cima do seu trabalho.

A consequência prática é simples: **edite qualquer parte do código.** `src/`, `supabase/`,
`tests/`, `docs/`, scripts, configuração — tudo é seu, e a mudança fica. Não existe mais
"zona protegida" nem arquivo que some na próxima atualização.

**Não há trava de pasta.** Se a tarefa pede para mexer em `src/`, mexa. Se pede uma tabela nova,
escreva a migration na faixa numérica que continuar a sequência. Se pede uma tela, crie uma
página de verdade — não force a coisa dentro de `custom/` só porque um dia essa regra existiu.

1. **Antes de começar, leia o que já está documentado.** `docs/` tem o histórico de decisões, as
   armadilhas conhecidas e os guias de deploy. `docs/superpowers/` guarda os planos e specs das
   features grandes. Isso costuma responder "por que isto está assim" antes de você reescrever.
2. **Rode `pnpm build` (nunca `npm`) antes de commitar.** O projeto usa pnpm; misturar os dois
   gera um lockfile que o build não entende. `pnpm run test` cobre a suíte — mantenha-a verde.
3. **`custom/` continua existindo e continua válido** — mas agora é só *uma* forma de organizar
   código, não a única. Use-o quando fizer sentido tratar algo como módulo plugável (uma tela
   em `/x/<nome>`, um webhook, uma tarefa de relógio, um bloco dentro de uma tela existente).
   O contrato dele não mudou: os sete pontos de extensão são `custom/migrations/`,
   `custom/paginas/`, `custom/slots/`, `custom/api/`, `custom/tarefas/`, `custom/eventos/` e
   `custom/menu.ts`, e a extensão do arquivo faz parte do contrato (`pagina.tsx`, âncora `.tsx`,
   os outros `.ts`). Cada pasta tem um `LEIA-ME.md` com exemplo copiável.
   - **O `custom/menu.ts` recusa item em silêncio.** No máximo **10 itens**, contando só os
     válidos — do 11º válido em diante o resto não aparece. `titulo` até **40** caracteres e
     `caminho` até **200**: passar disso faz o item **sumir inteiro**, e o mesmo vale para campo
     vazio ou ausente. O `caminho` começa com `/x/`, só minúsculas, números e hífen, no máximo
     3 níveis (`/x/Financeiro`, `/x/relatórios`, `/x/meu_modulo` e `/x/financeiro-` são
     recusados). `grupo` acima de 24 cai em "Personalizado" e `icone` fora da lista cai no padrão
     — nesses dois o item continua aparecendo. Nada disso gera erro na tela nem linha no log.
4. **O CRM é multi-inquilino — o isolamento é do banco, não do código.** Toda tabela precisa de
   `workspace_id`, `enable row level security` e uma policy. Sem as três coisas, o dado de um
   espaço de trabalho aparece para outro, **sem nenhum aviso**. Vale para tabela em `custom/` e
   vale igual para tabela nova em `supabase/migrations/`.
   - **Guardando ARQUIVO? Bucket próprio e privado** (`public = false`). Bucket público serve
     qualquer objeto pela URL, sem passar por policy nenhuma.
   - **Não escreva `create policy ... on storage.objects` numa migration.** O comando exige ser
     dono da tabela, o papel da instalação pode não ser, e **migration que falha impede o boot**.
     Bucket privado já é fechado por padrão: quem lê é o servidor, não o navegador.
   - **Toda instrução de migration precisa aguentar rodar DUAS vezes.** O CRM reaplica no boot
     qualquer migration que ele não encontre registrada, e uma instrução que falhe com "objeto já
     existe" **impede o servidor de subir**. Use `if not exists` onde a linguagem aceita
     (`create table`, `create index`, `add column`). Onde ela **não** aceita — `create policy`,
     `create trigger` e `alter table … add constraint` — embrulhe num bloco `do $$ … end $$;` que
     pergunte ao catálogo antes (`pg_policies`, `pg_trigger`, `pg_constraint`).
   - **`clienteSemIsolamento()` desliga o isolamento.** Ele existe para os lugares onde **não há
     ninguém logado**: `custom/api/` (webhook de sistema externo), `custom/tarefas/` e
     `custom/eventos/`. Sob ele, o `.eq('workspace_id', …)` é responsabilidade sua: um `select`
     sem esse filtro devolve o dado de TODOS os espaços de trabalho, sem erro e sem aviso.
     - Em `custom/eventos/`, o `workspaceId` **vem no próprio evento** — use aquele, não um fixo.
     - Em tela e em bloco (`custom/paginas/`, `custom/slots/`) use `clienteDaSessao()`, que aplica
       o isolamento sozinho.
     - Tarefa e gancho têm **10 segundos** cada. Use `AbortSignal.timeout()` no seu `fetch`:
       passado o limite, o CRM para de esperar e o resultado é descartado.
5. **Nome, logo, favicon e cor se configuram em Configurações → Servidor → Marca.** A seção fica
   no `/config`, na aba **Servidor**, e vale para o servidor inteiro. Prefira essa tela a editar
   token de CSS ou arquivo de marca.
   - A **cor é recusada quando não dá contraste** (mínimo de 4,5:1 contra o branco, medido na hora
     de salvar). Não contorne editando token de CSS na mão: a partir dessa única cor o produto
     **deriva** os tons de passar o mouse, de clicar e de fundo de chip, e faz isso **duas vezes**
     — tema claro e escuro, cada um medido contra o fundo do seu tema. O token que você editar à
     mão só conserta o tema em que você olhou.

## O que ficou parado no código

A remoção da atualização em um clique foi **só de tela**: o card saiu do `/config`, o ponto no
menu saiu do `Rail`, e o `layout.tsx` deixou de consultar o aviso. O código do servidor continua
no repositório, **parado e sem ninguém chamando**:

- `src/server/atualizacao/` — `aplicar.ts`, `reverter.ts`, `detectar.ts`, `git.ts`, `gatilho.ts`, `aviso.ts`
- `src/app/(app)/config/acoes-atualizacao.ts` e `AtualizacoesCard.tsx` (o componente não é mais renderizado)
- `src/lib/atualizacao.ts`, `src/lib/estado-atualizacao.ts`, `src/lib/gatilho-implantacao.ts`
- `src/lib/manifesto-diff.ts`, `src/server/awave-manifest.json`, `src/server/awave-stamp.json`

**Eles não foram apagados de propósito**, porque compartilham código com coisas que continuam
ativas — em especial a **licença** (`src/server/license/`, `LicencaCard`) e o **controle de
migrations** (`public.awave_migrations`, lido por `src/server/crm/relatorios.ts`). Arrancar esse
bloco inteiro tem risco de derrubar o boot por algo que não se ganha em trocar. Se algum dia
valer a pena remover de verdade, trate como refactor separado, com a suíte verde em cada passo.

## Licença

A licença **não destranca funcionalidade nenhuma** — o CRM funciona inteiro, offline. Ela
interrompe o acesso em duas situações: reembolso dentro da garantia, e instalação recente que
ficou dias sem conseguir confirmar a licença. Nos dois casos o CRM leva para uma tela única que
explica e oferece a saída.

Se o CRM parar nessa tela, **isso não é bug do código**: é estado de licença, e quem resolve é o
dono da instalação, em Configurações → Servidor → Licença. O `docs/DEPLOY.md` descreve as duas.

Nesse estado a **API de integração** (`/api/v1/...`) também para, e responde **403** com
`{"error":{"code":"licenca_bloqueada"}}` — não confunda com o **401** `nao_autorizado`, que é
credencial errada ou ausente. O `/api/v1/echo` continua respondendo de propósito, para provar que
a credencial está certa mesmo com o acesso interrompido.

   | Onde | O que é | Vira |
   |---|---|---|
   | `custom/migrations/` | arquivos `.sql` seus, numerados de `9000` para cima | tabelas suas, aplicadas no boot |
   | `custom/paginas/` | uma pasta por tela, com `pagina.tsx` dentro | uma tela em `/x/<nome>`, dentro do CRM logado |
   | `custom/slots/` | um arquivo por âncora (`.tsx`) | um bloco seu dentro de uma tela do produto |
   | `custom/api/` | um arquivo `.ts` por endereço, exportando `GET`/`POST`/… | um endereço em `/api/custom/<nome>` |
   | `custom/tarefas/` | um arquivo `.ts` por tarefa, com `export const cada` | código seu rodando sozinho, de tempos em tempos |
   | `custom/eventos/` | um arquivo `.ts` com o nome do evento | código seu reagindo ao que acontece no CRM |
   | `custom/menu.ts` | uma lista | os itens das suas telas no menu lateral |

   **A extensão faz parte do contrato** (`pagina.tsx`, âncora `.tsx`, os outros `.ts`). Arquivo
   com a extensão errada não é encontrado, e a superfície responde como se ele não existisse —
   sem erro em lugar nenhum.

   **O `custom/menu.ts` recusa item em silêncio, por vários limites.** No máximo **10 itens** —
   e a conta é de itens **válidos**, do 11º válido em diante o resto não aparece (entradas
   recusadas não gastam a cota). `titulo` até **40** caracteres e `caminho` até **200**: passar
   disso faz o item **sumir inteiro**, não ser cortado, e o mesmo vale para campo **vazio** ou
   ausente. O `caminho` ainda tem forma fixa — começa com `/x/`, só minúsculas, números e hífen
   no meio, no máximo 3 níveis: `/x/Financeiro`, `/x/relatórios`, `/x/meu_modulo` e
   `/x/financeiro-` são todos recusados. Já `grupo` acima de **24** cai em "Personalizado" e
   `icone` fora da lista cai no padrão — nesses dois o item continua aparecendo. Nada disso gera
   erro na tela nem linha no log. Se um item não apareceu no menu, é aqui que se olha primeiro.

   Na faixa das migrations, a numeração abaixo de 9000 é do produto: um número de lá colide
   com uma release futura, e um arquivo fora da faixa **impede o boot** de propósito.

   Precisa de uma biblioteca do npm? Crie um `package.json` dentro da pasta `custom/` com as
   dependências dela. Elas são instaladas isoladamente e **não** tocam no `package.json` do
   produto — que você continua não podendo editar.
4. **Toda tabela sua precisa de `workspace_id`, `enable row level security` e uma policy.**
   O CRM é multi-inquilino e o isolamento é feito no banco, não no código: sem as três
   coisas, o dado de um cliente seu aparece para outro, **sem nenhum aviso**. O
   `custom/LEIA-ME.md` traz o modelo pronto para copiar.
   - **Se você for guardar ARQUIVO, crie um bucket próprio e deixe-o privado**
     (`public = false`). Bucket público serve qualquer objeto pela URL, sem passar por
     policy nenhuma — documento de cliente ali é vazamento com endereço adivinhável.
   - **Não escreva `create policy ... on storage.objects` numa migration.** Esse comando
     exige ser dono da tabela, o papel da instalação pode não ser, e **migration que falha
     impede o servidor de subir**. Você troca um recurso ausente por um CRM fora do ar.
     Bucket privado já é fechado por padrão: quem lê é o servidor, não o navegador.
   - **Toda instrução da sua migration precisa aguentar rodar DUAS vezes.** O CRM reaplica no
     boot qualquer migration que ele não encontre registrada, e uma instrução que falhe com
     "objeto já existe" **impede o servidor de subir** — não é a sua tabela que deixa de
     nascer, é o CRM inteiro que não volta. Use `if not exists` onde a linguagem aceita
     (`create table`, `create index`, `add column`). Onde ela **não** aceita — `create
     policy`, `create trigger` e `alter table … add constraint` —, embrulhe a instrução num
     bloco `do $$ … end $$;` que pergunte ao catálogo antes: `pg_policies` (por `schemaname`,
     `tablename` e `policyname`), `pg_trigger` (por `tgname` e `tgrelid`) ou `pg_constraint`
     (por `conname` e `conrelid`). Metade guardada é pior que nenhuma: ela convida à segunda
     passada e falha no meio dela.
   - **`check` numa coluna DO PRODUTO: a sua sobrevive, e vale saber por quê.** Quando uma
     versão nova passa a aceitar valores novos numa coluna nossa (hoje é o caso de
     `canais.provider`, `conversas.status`, `mensagens.autor` e `mensagens.status`), a
     migration oficial precisa trocar a restrição de domínio daquela coluna por uma mais
     larga. Ela derruba a restrição **só quando as duas coisas batem**: o nome é um dos que o
     produto usa (`<tabela>_<coluna>_check`, `<tabela>_<coluna>_check<N>` ou
     `<tabela>_<coluna>_dominio_check`) **e** a definição é exatamente um dos domínios que o
     produto já teve naquela coluna. A sua regra não é nenhum desses domínios, então ela é
     **preservada** — mesmo que o nome coincida.
     - **Ainda assim, NOMEIE a sua `check`.** `add check (…)` sem nome recebe do Postgres
       exatamente `<tabela>_<coluna>_check`, que é um dos nomes acima; nomear tira a sua
       restrição do caminho de uma vez, em vez de depender da segunda metade da conferência.
     - **Leia o log do servidor depois de atualizar.** Restrição sua preservada vira um aviso
       ali, e é o único lugar onde ele aparece: uma regra sua que não conheça o valor novo faz
       o recurso novo dar erro na tela sem explicar o motivo. Se o aviso disser que o domínio
       **não foi alargado**, é o produto avisando que não conseguiu concluir a troca — o valor
       novo vai ser recusado até alguém olhar.
   - **O mesmo cuidado vale para CHAVE ESTRANGEIRA em coluna do produto.** Ao trocar uma FK
     simples por uma composta (o que o produto faz para amarrar a linha ao espaço de trabalho
     certo), a migration acha a antiga no catálogo pela **coluna**, nunca pelo nome, e derruba
     só a FK de coluna única **daquela coluna**. Uma FK sua sobre **outra** coluna sobrevive,
     mesmo que ela ligue as mesmas duas tabelas.
     - **O que ainda some, e some em silêncio, é uma FK sua criada sobre a PRÓPRIA coluna do
       produto** — e essa é a única forma que você precisa evitar. Ali o produto não tem como
       distinguir a sua da dele: mesma coluna, mesma tabela referenciada, mesma checagem.
       Diferente do `check`, aqui não há aviso nenhum no log quando isso acontece.
     - **Não crie FK de coluna única a partir de uma coluna do produto:** aponte a partir da
       SUA tabela, ou use uma FK composta que inclua `workspace_id`. As duas formas ficam fora
       do caminho de qualquer troca futura, e o conselho não muda se o produto converter mais
       uma coluna amanhã.
5. **Use o ponto de extensão que existe; não invente outro.** Se o que te pediram não couber
   em nenhum dos sete da regra 3, **pare e peça** — não resolva editando o produto, porque
   essa edição some na próxima atualização.
   - **Importe apenas de `@awave/custom`** (dado e sessão), `@awave/custom/ui` (componentes
     visuais) e `@awave/custom/servidor` (só onde não há sessão — ver a regra 6). O que está em `src/` é
     interno do produto: os nomes mudam entre versões, sem aviso e sem erro de compilação —
     o que você importar de lá funciona hoje e quebra na tela do usuário depois de uma
     atualização.
   - Você pode instalar bibliotecas do npm (regra 3) e usar `fetch` à vontade.
6. **`clienteSemIsolamento()` desliga o isolamento entre espaços de trabalho.** Ele existe
   para os três lugares onde **não há ninguém logado**: `custom/api/` (webhook de sistema
   externo), `custom/tarefas/` e `custom/eventos/` (rodam sozinhos, no relógio do servidor).
   Sob ele, o `.eq('workspace_id', …)` é responsabilidade sua: um `select` sem esse filtro
   devolve o dado de TODOS os clientes hospedados neste servidor, sem erro e sem aviso.
   - Em `custom/eventos/`, o `workspaceId` **vem no próprio evento** — use aquele, não um
     valor fixo.
   - Em tela e em bloco (`custom/paginas/`, `custom/slots/`) use `clienteDaSessao()`, que
     aplica o isolamento sozinho e é o caminho normal.
   - Tarefa e gancho têm **10 segundos** cada. Use `AbortSignal.timeout()` no seu `fetch`:
     passado o limite, o CRM para de esperar e o resultado é descartado.
7. **Rode `pnpm build` (nunca `npm`) antes de commitar.** O projeto usa pnpm; misturar os
   dois gera um lockfile que o build do servidor não entende.
8. **Nome, logo, favicon e cor se configuram em Configurações → Servidor → Marca — nunca
   no código.** A seção fica no `/config`, na aba **Servidor**: ela vale para o servidor
   inteiro e só o dono dele a enxerga. O que
   é salvo ali vive no banco, então **sobrevive à atualização em 1 clique**; o mesmo ajuste
   feito em arquivo do produto vira aviso de divergência e é substituído no próximo update,
   que é exatamente o que a regra 5 proíbe.
   - A **cor é recusada quando não dá contraste** (mínimo de 4,5:1 contra o branco, medido
     na hora de salvar). Não contorne editando token de CSS: a partir dessa única cor o
     produto **deriva** os tons de passar o mouse, de clicar e de fundo de chip, e faz isso
     **duas vezes** — uma para o tema claro e outra para o escuro, cada uma medida contra o
     fundo do seu tema. Uma cor que não passa no portão não tem de onde derivar, e o token
     que você editar à mão só conserta o tema em que você olhou.
   - Se o que te pediram não couber nesses quatro campos, **pare e avise** — não resolva
     editando o tema.

> **Nenhuma funcionalidade daqui é vendida à parte.** O CRM funciona inteiro, offline, para
> sempre: não há tela, campo ou relatório que a licença destranque. Ela habilita só a
> atualização em 1 clique; sem ela você atualiza pelo passo a passo do `docs/DEPLOY.md`, com o
> produto inteiro funcionando.
>
> **O que a licença PODE fazer** é interromper o acesso em duas situações — reembolso dentro
> da garantia, e instalação recente que ficou dias sem conseguir confirmar a licença. Nos dois
> casos o CRM leva para uma tela única que explica e oferece a saída. Se você é um agente de
> código e o CRM parou nessa tela, **isso não é bug do código nem coisa a consertar em
> `custom/`**: é estado de licença, e quem resolve é o dono da instalação, em
> Configurações → Servidor → Licença. O `docs/DEPLOY.md` descreve as duas.
>
> Nesse estado a **API de integração** (`/api/v1/...`) também para, e responde **403** com
> `{"error":{"code":"licenca_bloqueada"}}` — não confunda com o **401** `nao_autorizado`, que é
> credencial errada ou ausente. O `/api/v1/echo` continua respondendo de propósito, para você
> conseguir provar que a credencial está certa mesmo com o acesso interrompido.
