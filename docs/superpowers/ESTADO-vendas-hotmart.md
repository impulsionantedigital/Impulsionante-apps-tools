# Estado do trabalho — branch `vendas-hotmart`

Documento de retoma. Com ele e o `git log` dá para continuar sem a sessão que o escreveu.

## Plano 1 — e-mail transacional: CONCLUÍDO

- **Integrado ao `main`** (merge `20b0eff`) e publicado no GitHub. O EasyPanel faz o deploy a
  partir do `main`.
- **Verificado em produção com SMTP real** (Amazon SES) em 2026-09-13: o e-mail de teste chegou,
  com o modelo editado e os campos renderizados.
- 1373 testes verdes. Revisão por tarefa, revisão final da branch inteira, e as dez correções
  dela verificadas.

O que passou a existir: envio por SMTP configurado em variáveis de ambiente, quatro modelos HTML
editáveis em Configurações → Servidor, fila com retentativa drenada pelo relógio interno, e a
migration `0063`.

- Spec: `docs/superpowers/specs/2026-09-13-vendas-hotmart-design.md` (§8)
- Plano: `docs/superpowers/plans/2026-09-13-email-transacional.md`

### Configuração SMTP — o que aprendemos em produção

| Porta | `SMTP_SECURE` |
|---|---|
| 587 | `false`, ou deixar em branco |
| 465 | `true`, ou deixar em branco |

`SMTP_SECURE=true` na porta 587 derruba **toda** conexão (`wrong version number`), e a tela diz
"chega em segundos" na mesma — o erro só aparece em `emails_fila.ultimo_erro`. Para diagnosticar:

```sql
select destinatario, tentativas, ultimo_erro, enviado_em
from emails_fila order by criado_em desc limit 5;
```


## ▶ RETOMAR AQUI — Plano 2 concluído: blocos A e B publicados e verificados em produção

Aprovado pelo usuário em 2026-09-13: manter o spec e o plano do Claude, aproveitar só o que faz
sentido do trabalho do Codex (arquivado fora do repositório, em `scratchpad/codex-arquivo`).

**Bloco A** = itens 1–4: §16.1 do spec · migration `0064_vendas_e_ofertas.sql` · identidade
(`src/lib/documento.ts`, `src/lib/auth/credenciais.ts`, `src/server/auth/temporaria.ts`, login pelo
segundo caminho em `sessao.ts`, troca obrigatória no `(app)/layout.tsx`, telas `/trocar-senha` e
`/recuperar`) · lógica pura de venda (`src/lib/produtos/catalogo.ts`,
`src/lib/vendas/{duracao,periodos,emails,hotmart}.ts`).

**Estado:** 1476 testes verdes, tipos limpos. Revisão sem nenhum Critical; os quatro Important
foram corrigidos:

- **Troca obrigatória decidida pela ORIGEM da sessão** (claim `amr` do token), e não pela presença
  do hash. Antes, um terceiro que pedisse `/recuperar` prendia a sessão do dono na troca de senha.
  Definir a senha agora encerra **todas** as sessões e manda entrar de novo.
- **O usuário do link mágico é conferido antes de a sessão existir.**
- **`/recuperar` emite depois da resposta** (`after()`), sem oráculo de tempo.
- **Testes para as mutações que passavam** (entropia da senha, empilhamento, documento).

Também corrigidos: o desfazer da emissão restaura a senha anterior; limite do login por conta e IP;
busca por e-mail determinística; a fila apaga o HTML também quando desiste; e uma guarda em teste
impede que uma migration futura volte a expor o hash de `membros` ao navegador.

**Re-revisão concluída em 2026-09-13:** todos os achados endereçados, nenhuma quebra nova. Conferido
contra o código real das dependências: `getClaims()` verifica a assinatura antes de devolver o `amr`;
o `amr` sobrevive à renovação do token; `signOut` global revoga também a sessão atual; `after()`
executa mesmo com `redirect()` depois; sem loop de redirecionamento.

**Concluído:** publicado no `main` (merge `2145a44`) e verificado em produção — o roteiro manual
abaixo foi executado de ponta a ponta em 14/09/2026.

**Riscos aceites e anotados:** `x-forwarded-for` só é confiável se o proxy do EasyPanel o
sobrescreve (os limites por conta não dependem disso); `generateLink` substitui um link mágico
pendente no Auth (inofensivo); a `0064` precisa de lock em `membros` no deploy — se estourar o
tempo, o contentor antigo segue no ar e basta tentar de novo.

### Bloco B — webhook, vendas, acesso e tela comercial

**Publicação do bloco A:** merge `2145a44` no `main` em 2026-09-13, com a `0064`.

**Bloco B:** webhook `/api/webhook/hotmart`, processamento das vendas, controle de acesso na
calculadora, aba Comercial, CPF/CNPJ na aba Pessoas, e a secção 6.7 do `docs/DEPLOY.md`. Mais a
migration `0065`.

**A revisão (opus) achou 2 Critical, 1 condicional e 4 Important — todos corrigidos antes de
publicar** (detalhe na §16.2 do spec):

- **C1** — o owner de qualquer workspace passava por cima do controle de acesso, e qualquer usuário
  cria workspace: um comprador usaria tudo de graça. Agora só o dono do servidor.
- **C2** — todo comprador via nome, e-mail e CPF/CNPJ dos outros. Agora cada um vê a própria linha.
- **C3** — o comprador virava membro do CRM inteiro. **Decisão do usuário: esta instalação é só de
  ferramentas.** Comprador só entra em `/ferramentas`, e não cria espaço de trabalho.
- **I1–I4** — questionário desativado em leitura; Comercial só do dono do servidor; documento só
  associa com e-mail a bater; falha de e-mail vira 500 para a Hotmart reenviar.

Verificado: 1528 testes, tipos e `pnpm build` verdes.

**Re-revisão concluída em 2026-09-13:** todos os achados endereçados, sem quebra nova crítica — sem
loop de redirecionamento, nenhum dono preso em `/ferramentas`, a `0065` não quebra leitura legítima,
e revogar `criar_workspace` não afeta o cadastro. Ela apontou que as ações de CRM do painel lateral
iam no bundle do layout e chegavam ao comprador por chamada direta; corrigido em `sessaoEws()`.
1529 testes, tipos e build verdes.

**Condições para publicar** (da re-revisão):
1. Endereço público e SMTP configurados **antes** de ativar a oferta na Hotmart — sem o endereço, a
   compra fica paga e gravada, mas o comprador não recebe a senha e não entra.
2. `signup_aberto` continua `false` (é o padrão; nenhuma tela o muda).
3. Aceitas pelo usuário, pela decisão "só ferramentas": convidados `membro` que não são donos de
   nenhum workspace perdem o CRM; e as tabelas de CRM seguem legíveis pelo console a qualquer
   membro (sem dado de CRM, não expõe nada).

**🔴 DEFEITO CRÍTICO ACHADO, CORRIGIDO E PUBLICADO EM 14/09/2026.**

A calculadora devolvia **500** em `/ferramentas/indulto-comutacao/novo` e `/[id]`: a página do
servidor passava o objeto `motor` (que tem o método `calcular`) como prop para a `Calculadora`,
que é `'use client'`, e o React recusa função ao serializar. Quer dizer: o comprador pagava,
entrava, e a ferramenta não abria. Nem o TypeScript nem o `pnpm build` nem os 1529 testes pegavam,
porque as páginas são dinâmicas e o erro nascia a cada requisição.

Corrigido: a `Calculadora` recebe `decretoId` e resolve o motor pelo registro, do lado do cliente.
Verificado com navegador real contra o banco de produção — login, troca de senha, cálculo ao vivo,
gravação e a página `[id]`. Guarda de regressão em `tests/fronteira-rsc.spec.ts` (três verificações,
todas provadas por inversão). **História completa, causa, regra e varredura do resto do código:
`docs/calculadora-indulto-comutacao/fronteira-rsc.md`.**

**Publicado:** merge `08cc47e` no `main` às 09:02 UTC de 14/09/2026. Confirmado no domínio real
(`app.gpsdapena.com.br`) com a conta `+4`: `/novo` abre e o cálculo ao vivo responde (5 anos →
remanescente 5 anos, 1/5 = 1 ano, 1/2 = 2 anos 6 meses), zero erros no console.

⚠️ **`origin/vendas-hotmart` continua em `65c4f84`, com o defeito** (`<Calculadora motor={motor} />`).
Quem retomar dali ressuscita o 500. Apagar (`git push origin --delete vendas-hotmart`) ou sobrescrever
(`git push origin main:vendas-hotmart --force`).

**Verificado em produção em 2026-09-14 — o circuito inteiro, ponta a ponta:**

Três compras `PURCHASE_APPROVED` entraram pelo webhook real (`HP0000000003/4/5`, oferta `3kavznaa`).
Cada uma: conta criada no Auth, membro com nome e CPF, venda `ativa`, período 13/09→13/10 do produto
`indulto-comutacao-2025`, e os dois e-mails (acesso + entrega) enviados sem erro. O comprador
`+3` entrou com a senha temporária do e-mail, trocou-a, e o `senha_temporaria_hash` foi apagado —
a troca obrigatória funciona de verdade. Os outros dois seguem com a temporária pendente e válida
por sete dias, como esperado de quem ainda não entrou.

**Armadilha que apareceu no teste, e não é defeito:** reenviar o payload trocando só a transação e o
CPF **não cria nada** e devolve 200. Quem identifica a entrega é o campo `id` do topo do envelope
(`lerEventoHotmart` → `envelope.id`), com chave única em `webhook_compras_recebidas`. Repetido, o
código encontra o evento anterior já processado e devolve `ok` sem reprocessar
(`src/server/vendas/processar.ts`, ramo do erro `23505`). É essa regra que impede venda duplicada
quando a Hotmart reentrega. **Para testar à mão, troque também o `id`** — a Hotmart gera um novo a
cada evento, por isso em produção isto nunca prende.

**Riscos residuais anotados:**
- Tabelas de CRM continuam legíveis pelo console a qualquer membro (RLS `e_membro`). Aceitável só
  porque a instalação não tem dado de CRM — **se um dia tiver, isto tem de ser revisto.**
- As ações de CRM do painel lateral recusam comprador (`sessaoEws()` em `src/server/crm/acoes.ts`);
  as de outras telas de CRM só são carregadas por rotas que o proxy já recusa.
- `/sem-workspace` ainda deixa criar workspace a quem tem **zero** vínculos (por exemplo, um cadastro
  por convite cujo aceite falhou). Exige convite emitido por um owner, logo gente de confiança.
- O motor da calculadora corre no navegador (é o desenho, e desde 14/09/2026 é de fato o que
  acontece — ver `docs/calculadora-indulto-comutacao/fronteira-rsc.md`): com acesso encerrado, quem
  insistir calcula pelo console. Só a gravação é barrada de verdade, pela server action.
- Membros não-owner que já tinham cálculos antes de haver vendas ficam sem acesso a eles.
- Duas compras do mesmo produto e membro no mesmo instante podem sobrepor dias; cancelar a venda
  atual com uma renovação empilhada deixa um intervalo sem acesso.

### Roteiro de verificação manual do bloco B

Antes: SMTP a funcionar, **endereço público** configurado, uma oferta cadastrada, e o hottok salvo
em Configurações → Comercial.

```bash
BASE=https://SEU-CRM; TOKEN='hottok'; OFERTA='codigo-cadastrado'
enviar() { # $1=evento $2=transacao $3=email $4=event_id
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/webhook/hotmart" \
    -H 'content-type: application/json' -H "x-hotmart-hottok: $TOKEN" \
    -d "{\"id\":\"$4\",\"creation_date\":$(date +%s)000,\"event\":\"$1\",\"version\":\"2.0.0\",
        \"data\":{\"buyer\":{\"name\":\"Teste\",\"email\":\"$3\"},
        \"purchase\":{\"approved_date\":$(date +%s)000,\"price\":{\"value\":97,\"currency_value\":\"BRL\"},
        \"transaction\":\"$2\",\"offer\":{\"code\":\"$OFERTA\"}}}}"; }
```

1. **Comprador preso às ferramentas.** Compre com um e-mail de teste, entre com a senha do e-mail e
   tente abrir `/painel`, `/contatos`, `/config`: cai sempre em `/ferramentas`, e o menu só mostra
   Ferramentas.
2. **Comprador não vê os outros.** Com o token de sessão dele, `GET $SUPABASE/rest/v1/membros?select=nome,cpf_cnpj`
   devolve só a própria linha.
3. **Comprador não cria workspace.** `POST $SUPABASE/rest/v1/rpc/criar_workspace` com o token dele
   é recusado.
4. **Token.** Sem o cabeçalho, ou com token errado: 401, e nada novo em `webhook_compras_recebidas`.
5. **Compra nova.** `enviar PURCHASE_APPROVED T1 novo@teste.com e1` → 200; uma venda, um período,
   um membro `membro`, e na fila as boas-vindas e a entrega.
6. **Sem duplicar.** `for i in 1 2 3 4 5; do enviar PURCHASE_APPROVED T2 corrida@teste.com e2 & done; wait`
   → uma venda, um período, sem e-mails repetidos.
7. **Encerramento depois.** `enviar PURCHASE_REFUNDED T1 x e3` → venda `reembolsada`; o comprador vê
   "Acesso encerrado", o questionário desativado, e não salva.
8. **Encerramento antes.** `enviar PURCHASE_CANCELED T4 x e4` e depois `enviar PURCHASE_APPROVED T4 antes@teste.com e5`
   → a venda nasce `cancelada`, sem período nem e-mail.
9. **Renovação.** Uma segunda aprovação do mesmo produto e comprador: o período novo começa no
   vencimento anterior, e sai só o "pagamento recebido".
10. **Hotmart de verdade.** Mande o teste pelo painel dela e confirme que o `id` do envelope se
    repete nos reenvios automáticos — a deduplicação por `event_id` depende disso.

### Roteiro de verificação manual do bloco A

1. **Hash escondido.** No SQL Editor:
   `select has_column_privilege('authenticated','public.membros','senha_temporaria_hash','select'), has_table_privilege('authenticated','public.membros','select');`
   → os dois `false`. Depois, como membro comum, abrir `/painel`, `/config` (Pessoas), `/conversas`
   e um negócio com responsável: nenhum erro `42501`.
2. **Login pela temporária.** `/recuperar` para um membro de teste → entrar com a senha do e-mail
   → cai em `/trocar-senha` → definir → cai em `/entrar` com "Senha definida" → entrar com a nova
   → `/painel`. Em `auth.users`, nenhum usuário novo criado.
3. **A correção do I1.** Com o dono logado pela senha principal, pedir `/recuperar` para o e-mail
   dele noutro navegador e recarregar: ele **não** pode cair em `/trocar-senha`.
4. **E-mail com maiúsculas e espaços** no login pela temporária.
5. **Nenhum e-mail de link mágico** do Supabase disparado (logs de Auth).
6. **Entrar pela senha principal** com uma temporária pendente → `senha_temporaria_hash` nulo.
7. **Limite do Supabase:** Auth → Rate Limits, verificações de token por IP — todos os logins pela
   temporária saem do IP do servidor.

## Pendências

> Atualizado em 14/09/2026, depois de os dois planos estarem publicados e verificados em produção.
> **Nada do que foi especificado falta implementar.** O que segue é operação, dívida menor e
> escolhas suas.

### Bloqueia ir ao ar de verdade

1. **Trocar credenciais** que foram expostas numa conversa: senha do banco, chave de serviço do
   Supabase e senha SMTP. Usar um `TICK_SECRET` aleatório e independente, nunca um pedaço de outra
   chave.
1b. **`origin/vendas-hotmart` ainda serve o código com o defeito do 500** — apagar ou sobrescrever.
1c. **Limpar os dados de teste** antes de vender: 3 vendas (`HP0000000003/4/5`), 3 contas de teste e
   os períodos delas. As 3 ofertas, os 4 modelos de e-mail e o hottok ficam. A conta
   `alexandre.pavon+4@gmail.com` ficou com a senha `TesteLocal2026!`, definida durante a verificação;
   a `+5` ainda tem senha temporária pendente.
### ✅ Feitos em 14/09/2026

2. **Diagnóstico de envio na tela de modelos** — `avisoDeTls` (`src/lib/email/smtp.ts`) denuncia
   porta e `SMTP_SECURE` incompatíveis sem recusar a configuração, e `saudeDaFila`
   (`src/server/email/fila.ts`) traz a última falha, os pendentes e os desistidos para o card.
   Era essa lacuna que escondia o `SMTP_SECURE=true` na 587: a tela dizia "SMTP configurado" e o
   erro morria dentro da coluna `ultimo_erro` de cada linha.
3. **Senha temporária em formato legível** — `WHCV-QPE8-B2YP` no lugar de `eQroVvdHehFnLoum`.
   Alfabeto de 32 símbolos sem `I`, `O`, `0` e `1` (o `L` fica: sem o `1`, não confunde com nada),
   sorteio uniforme por byte (256 é múltiplo de 32), 60 bits. `normalizarSegredo` aceita a senha
   digitada sem hífen, em minúscula ou com espaço, **sem** abrir porta dos fundos: ela devolve
   `null` para o que não couber no formato novo, então credencial antiga em base64url continua
   valendo pelo caminho normal e senha errada não ganha tentativa extra.

**Próximo:** uma terceira correção que o usuário vai trazer.

### Dívida menor, sem urgência

4. **Duas ressalvas sem teste automatizado**, corretas no código: `lerModelo` propagar o erro do
   banco (`src/server/email/modelos.ts`) e a ressincronização da tela depois de salvar
   (`ModelosEmailCard.tsx`). Nada acusa se alguém as reverter.
5. **`mesmoResultado(undefined, x)` lança** em vez de devolver booleano
   (`src/lib/indulto-comutacao/comparar.ts`). Inalcançável hoje, mas é função pública e partilhada.
6. **`pnpm sync:foundation`, `check:motor`, `gen:manifest` e `audit:entrega` apontam para scripts que
   não existem** em `scripts/` — herdado do Awave CRM original, quebra na primeira vez que alguém os
   chamar.
7. O resto da dívida da calculadora está em
   `docs/calculadora-indulto-comutacao/pendencias-e-roteiro-de-teste.md`.

## Plano 2 — vendas, ofertas, CPF/CNPJ, webhook Hotmart e gate de acesso: CONCLUÍDO

Ver **▶ RETOMAR AQUI** acima. O trabalho que o Codex tinha começado foi analisado; ficou só o que
fazia sentido, e o resto está arquivado fora do repositório.

## Decisões tomadas que o usuário pode querer desfazer

- **O e-mail entra na fila mesmo sem SMTP configurado**, e espera. A §8.4 promete que a fila não
  perde a credencial de quem comprou; a §8.1 foi emendada para o mesmo. As linhas envelhecem por
  `IDADE_MAX_MS` para não despejar credenciais expiradas meses depois.
- **A fila apaga o corpo do e-mail depois de enviar**, mantendo o assunto — dois modelos levam a
  senha temporária no corpo.
- **Dois commits têm o trailer colado na linha de assunto** (`951bade`, `7dc7a51`). Não corrigido:
  reescrever a história invalidaria o registo de que cada commit foi revisto.

## Subir o produto localmente contra o banco de produção (para testar de ponta a ponta)

Foi assim que o defeito da calculadora (§ acima) foi confirmado e a correção verificada.

```bash
export SUPABASE_DB_URL=…          # a do EasyPanel
export SUPABASE_ANON_KEY=…        # ⚠️ ver a armadilha abaixo
export SUPABASE_SERVICE_ROLE_KEY=…
PORT=3311 pnpm build && PORT=3311 pnpm start
```

- **🔴 A `SUPABASE_ANON_KEY` não pode ser adivinhada nem colhida do site.** Todo o `auth` desta
  instalação passa por server action, então a chave **nunca chega ao navegador** — não adianta
  procurá-la no HTML nem nos chunks de produção. Com uma chave errada o login até funciona
  (`verifyOtp` usa outro caminho), mas o `getUser()` do proxy falha em silêncio e **toda** rota
  protegida devolve redirecionamento para `/entrar`, o que parece sessão inválida e não é. O
  sintoma que denuncia: `curl -H "apikey: <chave>" $SUPABASE_URL/auth/v1/settings` devolve 401.
  Pegue a chave real no EasyPanel. (Em último caso, para um teste local, a service role key serve
  de `apikey`: o PostgREST continua honrando a RLS pelo JWT do usuário no `Authorization`.)
- Para entrar sem esperar e-mail, grave uma senha temporária direto no membro com o
  `criarCredencial()` do próprio repositório (`src/lib/auth/credenciais.ts`) — é o mesmo código que
  o sistema usa, então o `scrypt` bate.
- **Conta de teste em 14/09/2026:** `alexandre.pavon+4@gmail.com` ficou com a senha
  `TesteLocal2026!`, definida durante essa verificação.

## Armadilhas deste repositório

- **`pnpm build` regenera `next-env.d.ts`**, que é versionado e está no `awave-manifest.json`.
  Nunca o commite; reverta com `git checkout -- next-env.d.ts`.
- **Push no `main` publica em produção** (deploy do EasyPanel).
- **Pasta partilhada com outro agente — aconteceu duas vezes.** Em 2026-09-13 às 19:43, um commit
  deste trabalho caiu em `codex/compras-hotmart` porque outro agente tinha trocado de branch na
  pasta; foi refeito aqui num worktree separado. Antes disso, um commit da calculadora (`21b2c16`) caiu nesta branch
  porque outro agente commitou enquanto ela estava ativa. Confira a branch antes de commitar.
- **Nunca restaure um arquivo copiando-o para o lado e de volta** — deixou um duplicado perdido
  em `src/` que passou por uma revisão.
- **🔴 Esta máquina recria arquivos apagados como duplicados `nome 2.ext`.** Em 14/09/2026 apaguei
  `src/app/teste-rsc/` (rota descartável de diagnóstico) e minutos depois a pasta reapareceu com
  `page 2.tsx` dentro — arquivo com permissão `-rw-------`, recriado pela sincronização do sistema,
  não por nenhum comando meu. O mesmo padrão do `src/lib/retentativa 2.ts` de antes, e há
  `… 3.ts` iguais dentro do `.next`. **Perigo real:** um desses entra no commit sem ninguém ver, e
  como não é `page.tsx` o Next nem o trata como rota — ele só quebra o `tsc` (importa um vizinho que
  já não existe) ou, pior, fica ali como código morto. **Antes de todo commit, rode:**

  ```bash
  find . -path ./node_modules -prune -o -path ./.next -prune -o -path ./.git -prune \
       -o -name "* [0-9].*" -print
  ```

  Se listar qualquer coisa em `src/` ou `tests/`, apague antes de commitar.

  Os duplicados **dentro do `.next`** não vão para o commit (a pasta é ignorada), mas envenenam o
  `pnpm exec tsc --noEmit`: o `tsconfig` inclui `.next/types`, e um `routes.d 2.ts` ao lado do
  `routes.d.ts` vira "Duplicate identifier" e "Cannot find module" de rotas que já não existem —
  erros fantasma, que não vêm do código. Limpe com
  `find .next -name "* [0-9].*" -delete` e rode o `tsc` de novo antes de acreditar no relatório.
- **`git clean -fdx` destrói o ledger** em `.superpowers/sdd/`, que é git-ignored.
- **Não há banco nem SMTP sob teste.** A lógica testável vive em `src/lib/`; `src/server/` é fino.
- **Migration que falha impede o contentor de subir** em toda instalação. A guarda em
  `tests/migracoes/idempotencia.spec.ts` varre da `0063` para cima.
- **O `pnpm dev` não liga o relógio interno.** Localmente a fila só anda com
  `PORT=3000 TICK_SECRET=… node heartbeat-tick.mjs` num segundo terminal.
