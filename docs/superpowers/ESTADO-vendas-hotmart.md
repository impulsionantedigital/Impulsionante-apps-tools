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


## ▶ RETOMAR AQUI — Plano 2, bloco A (em andamento)

Aprovado pelo usuário em 2026-09-13: manter o spec e o plano do Claude, aproveitar só o que faz
sentido do trabalho do Codex (arquivado fora do repo, em `scratchpad/codex-arquivo`).
**Pausado por limite de uso** com o bloco A ESCRITO mas NÃO VERIFICADO (commit "em andamento").

Bloco A = itens 1–4: §16.1 do spec · migration `0064_vendas_e_ofertas.sql` · identidade
(`src/lib/documento.ts`, `src/lib/auth/credenciais.ts`, `src/server/auth/temporaria.ts`, login com
segundo caminho em `sessao.ts`, troca obrigatória no `(app)/layout.tsx`, telas `/trocar-senha` e
`/recuperar`, `/recuperar` pública no `proxy.ts`) · lógica pura de venda (`src/lib/produtos/catalogo.ts`,
`src/lib/vendas/{duracao,periodos,emails,hotmart}.ts`) com testes.

Próximos passos, nesta ordem:
1. `pnpm test` e `pnpm exec tsc --noEmit`; corrigir o que falhar (nada foi rodado ainda).
2. Uma revisão do bloco A inteiro (auth + banco são risco real).
3. Corrigir achados, atualizar este documento, commitar.
4. **Parar e pedir ok ao usuário antes do bloco B** (webhook, processamento, gate, tela comercial, docs).

## Pendências

1. **Trocar credenciais** que foram expostas numa conversa: senha do banco, chave de serviço do
   Supabase e senha SMTP. Usar um `TICK_SECRET` aleatório e independente, nunca um pedaço de outra
   chave.
2. **Opcional:** mostrar na tela de modelos o último erro de envio, e avisar quando porta e
   `SMTP_SECURE` não combinam. Foi a lacuna que escondeu o problema acima.
3. **Duas ressalvas sem teste automatizado**, corretas no código: `lerModelo` propagar o erro do
   banco (`src/server/email/modelos.ts`) e a ressincronização da tela depois de salvar
   (`ModelosEmailCard.tsx`). Nada acusa se alguém as reverter.

## Plano 2 — vendas, ofertas, CPF/CNPJ, webhook Hotmart e gate de acesso: PAUSADO

Pausado a pedido do usuário. **O Codex está a trabalhar no mesmo tema nesta mesma pasta e branch**
(plano `2026-09-13-compras-hotmart.md`, migration `0064_compras_hotmart.sql` e outros, ainda sem
commit à data desta nota). Decidido com o usuário: o Codex não cria branches, e a organização de
branches do Claude prevalece. Antes de retomar o Plano 2, confirmar com o usuário o que o Codex já
entregou, para não duplicar.

- **O spec está escrito e aprovado** (§4 a §7, §9), mais a **§16**, com cinco correções
  encontradas ao ler o código antes de planear. Onde a §16 contradiz o resto, vale a §16.
- **O plano de implementação ainda não foi escrito.** Próximo passo quando retomar.
- A migration será a `0064`.
- Combinado com o usuário: plano **mais enxuto** que o do Plano 1 — sem código completo escrito de
  antemão, revisão só onde há risco real (banco, autorização, dinheiro, webhook).

## Decisões tomadas que o usuário pode querer desfazer

- **O e-mail entra na fila mesmo sem SMTP configurado**, e espera. A §8.4 promete que a fila não
  perde a credencial de quem comprou; a §8.1 foi emendada para o mesmo. As linhas envelhecem por
  `IDADE_MAX_MS` para não despejar credenciais expiradas meses depois.
- **A fila apaga o corpo do e-mail depois de enviar**, mantendo o assunto — dois modelos levam a
  senha temporária no corpo.
- **Dois commits têm o trailer colado na linha de assunto** (`951bade`, `7dc7a51`). Não corrigido:
  reescrever a história invalidaria o registo de que cada commit foi revisto.

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
- **`git clean -fdx` destrói o ledger** em `.superpowers/sdd/`, que é git-ignored.
- **Não há banco nem SMTP sob teste.** A lógica testável vive em `src/lib/`; `src/server/` é fino.
- **Migration que falha impede o contentor de subir** em toda instalação. A guarda em
  `tests/migracoes/idempotencia.spec.ts` varre da `0063` para cima.
- **O `pnpm dev` não liga o relógio interno.** Localmente a fila só anda com
  `PORT=3000 TICK_SECRET=… node heartbeat-tick.mjs` num segundo terminal.
