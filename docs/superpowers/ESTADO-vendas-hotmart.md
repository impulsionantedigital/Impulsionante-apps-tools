# Estado do trabalho — branch `vendas-hotmart`

Documento de retoma. Se a sessão que o escreveu desaparecer, isto mais o `git log` são
suficientes para continuar sem repetir nada.

**Branch:** `vendas-hotmart`, criada de `main` @ `6a0f31e` com consentimento do usuário.
`main` já contém a calculadora de indulto (migration `0062`).

## O que está FEITO e commitado

**Plano 1 — subsistema de e-mail transacional: COMPLETO.** 22 commits, 1373 testes verdes,
árvore limpa. As nove tarefas do plano foram implementadas, revistas uma a uma, e depois
submetidas a uma revisão da branch inteira cujos achados foram todos corrigidos.

- Spec: `docs/superpowers/specs/2026-09-13-vendas-hotmart-design.md` (§8 é a parte executada)
- Plano: `docs/superpowers/plans/2026-09-13-email-transacional.md`

O que passou a existir: configuração SMTP por variáveis de ambiente, quatro modelos HTML
editáveis pelo dono do servidor com campos de mesclagem escapados, fila com retentativa
drenada pelo relógio interno, e a tela em Configurações → Servidor. Migration `0063`.

O CRM passou também a ter **recuperação de senha possível**, que antes não existia.

## O que FALTA

1. **Uma re-revisão escopada da última ronda de correção** (commits `ba49bfd` e `aa33eab`).
   É o último portão do processo. Nada depende dela para o código funcionar.
2. **Verificação manual com SMTP real** — nunca foi feita, e nenhum agente a fingiu. Passos em
   `.superpowers/sdd/2026-09-13-email-transacional/task-9-report.md`, secção "Verificação manual
   pendente". Resumo: configurar as seis variáveis contra Mailpit ou Ethereal, abrir
   Configurações → Servidor, editar um modelo, "Enviar teste para mim", confirmar que chega com
   o modelo editado.
3. **Plano 2 — vendas, ofertas, CPF/CNPJ, webhook da Hotmart e gate de acesso.** O spec já está
   escrito e aprovado (secções 4 a 7 e 9). O plano de implementação ainda não. A migration dele
   será a `0064`.

## Decisões tomadas que o usuário deve poder desfazer

Registo completo em `.superpowers/sdd/2026-09-13-email-transacional/progress.md` (não versionado,
mas persiste em disco). As que mudam comportamento:

- **Enfileirar sem SMTP configurado.** A §8.1 do spec dizia para não enfileirar; o código
  enfileira na mesma e as linhas esperam. Razão: a §8.4 promete que a fila não perde a credencial
  de quem comprou. O spec foi emendado para refletir isto. **Se discordar, reverter é uma
  condição em `enfileirar`.**
- **A fila apaga o corpo do e-mail depois de enviar** (`html: ''`), mantendo o assunto. Razão:
  dois dos quatro modelos embutem a senha temporária no corpo, e o spec promete que o banco nunca
  vê o texto claro. Custo: perde-se auditoria do corpo exato enviado.
- **Senha temporária é credencial paralela**, não substitui a principal — decidido consigo
  durante o desenho, implementado só no Plano 2.
- **Dois commits têm o trailer colado na linha de assunto** (`951bade`, `7dc7a51`). Não foi
  corrigido: reescrever a história invalidaria os intervalos de SHA que documentam que cada
  commit foi revisto.

## Armadilhas do repositório, aprendidas à força

- **`pnpm build` regenera `next-env.d.ts`**, que é versionado e está no `awave-manifest.json`.
  Nunca o inclua num commit; reverta com `git checkout -- next-env.d.ts`.
- **Nunca restaure um arquivo copiando-o para o lado e de volta** — isso deixou um
  `src/lib/retentativa 2.ts` perdido na árvore, que passou despercebido a uma revisão.
- **`git clean -fdx` destrói o ledger** desta execução, que é git-ignored.
- **Não há banco nem SMTP sob teste.** Toda a lógica testável vive em `src/lib/`; `src/server/`
  é fino de propósito.
- **Migration que falha impede o contentor de subir** em toda instalação que atualizar. A guarda
  em `tests/migracoes/idempotencia.spec.ts` varre as migrations da `0063` para cima.
