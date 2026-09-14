# Roteiro da revisão final da branch

A revisão de cada tarefa já aconteceu. Esta é a revisão do **conjunto**: o que só aparece quando as
doze tarefas estão juntas. Não refaça as revisões por tarefa; procure o que atravessa tarefas.

## Onde está tudo

- **Spec (autoridade):** `docs/superpowers/specs/2026-09-12-calculadora-indulto-comutacao-design.md`
- **Plano:** `docs/superpowers/plans/2026-09-12-calculadora-indulto-comutacao.md`. Ele foi corrigido várias
  vezes durante a execução. Onde o código diverge dele por decisão registrada, vale a decisão.
- **Pendências deferidas e decisões do dono do produto:** `pendencias-e-roteiro-de-teste.md`, ao lado deste arquivo
- O ledger da execução (com as 33 decisões tomadas durante o desenvolvimento) viveu numa área de trabalho
  temporária e não foi versionado — o que dele importa está resumido no `pendencias-e-roteiro-de-teste.md`
  e nas mensagens dos 36 commits da feature (`git log 0879f3c..6a0f31e`)
- **Contextos por tarefa** (`task-N-contexto.md`): as decisões que alteraram cada brief.
- **POC de origem e planilha:** `validacao/2025/`

## 🔴 O que NÃO é defeito a corrigir

As oito **decisões do usuário** listadas no fim de `pendencias-revisao-final.md` (o `<` estrito do Art. 13,
o teto dobrado do Inciso VIII, os dois problemas da planilha e da POC em uso, e as questões de LGPD sobre
guarda e exclusão). O motor reproduz a planilha de propósito, e as ambiguidades são exibidas ao advogado.
**Não proponha mudar regra jurídica.** Se achar uma ambiguidade nova, relate; não corrija.

## O que conferir no conjunto

### 1. Isolamento entre membros, de ponta a ponta
A Task 10 foi revisada adversarialmente em isolamento. Confira agora o caminho **com as telas** (Task 11):
- nenhuma tela ou componente de cliente usa `admin()` nem importa de `@/server/supabase`;
- a tela de cálculo salvo trata `null` com `notFound()`, sem distinguir "não existe" de "é de outro";
- o cliente nunca envia `resultado`, `workspace_id` nem `user_id`;
- nada em `src/app/(app)/ferramentas/` lê a tabela fora de `calculos.ts`.

### 2. Arquivos compartilhados entre decretos não contêm dado de 2025
Os decretos de 2024 e 2026 vão entrar como motores novos. **Nenhum destes arquivos pode citar data,
artigo, parágrafo, inciso ou célula do decreto de 2025** — a não ser como exemplo claramente rotulado ou
como origem histórica de uma decisão:
- `src/lib/indulto-comutacao/{tempo,tipos,registro,padrao,comparar}.ts`
- `src/app/(app)/ferramentas/indulto-comutacao/*.tsx` e seus `.module.css`
- `src/app/(app)/ferramentas/indulto-comutacao/{preparar,acoes,calculos}.ts` — em especial o `preparar.ts`,
  onde a lista de chaves permitidas precisa vir de `motor.questionario`, nunca de uma lista fixa
- `src/app/(app)/ferramentas/indulto-comutacao/{novo,[id]}/page.tsx` e `src/app/(app)/ferramentas/page.tsx`
- os testes que rodam sobre o `REGISTRO` inteiro (`registro.spec.ts`, `preparar.spec.ts`) — eles precisam
  continuar genéricos para cobrir o motor de 2026 sem edição

Procure `2025`, `12.970`, `25/12`, `§`, `Art.`, número romano de inciso. O critério: se afirma **regra** de
um decreto, é defeito.

### 3. Os avisos jurídicos chegam ao advogado
- As 5 entradas de `motor.avisos.validarJuridicamente` aparecem **sempre** na tela de resultado, na de
  cálculo novo e na de cálculo salvo.
- O aviso da seção "data do fato" (responder NÃO veta indulto e comutação) aparece no questionário.
- A nota de dado pessoal (spec §9) está na tela de novo cálculo, com as três afirmações.
- A folha de impressão mostra o resultado com os avisos e esconde o questionário e as barras de ação.

### 4. Adicionar um decreto novo continua sendo "plugar um motor"
Simule, **por leitura**, a entrada de um `motor2026`: criar a pasta, acrescentar uma linha no `REGISTRO`.
- Algum arquivo fora de `motores/2026/` precisaria mudar? Se sim, é defeito.
- Os testes de contrato (`registro.spec.ts`) e o `preparar.spec.ts` já cobririam o motor novo?
- A tela de novo cálculo reage a `REGISTRO.length > 1`?

### 5. Integridade do produto (Awave CRM) que foi editado
A calculadora é funcionalidade nativa em `src/`, e este repositório não recebe mais atualizações do
produto original (spec §2). Mesmo assim:
- a única edição em arquivo do produto é `src/components/shell/Rail.tsx` (Task 12) e o `.gitignore` e o
  `.dockerignore`. Confira que nenhum outro arquivo do produto foi alterado: `git diff --stat <merge-base>..HEAD`
  fora de `src/lib/indulto-comutacao/`, `src/app/(app)/ferramentas/`, `tests/indulto-comutacao/`,
  `supabase/migrations/0062_*`, `validacao/`, `docs/superpowers/`;
- a migration `0062` é aditiva, idempotente e não toca tabela do produto;
- `validacao/` está no `.dockerignore`; `.venv/` e `__pycache__/` no `.gitignore`; nada disso versionado.

### 6. Consistência entre as camadas
- O `titulo` gravado, o limite de 200 caracteres do zod e o `maxLength` da tela batem.
- `CalculoResumo` tem os campos que a lista usa; `CalculoSalvo`, os que a tela de cálculo salvo usa.
- A mensagem de erro que as actions devolvem chega ao usuário como veio (nenhuma tela a troca por texto genérico).
- 🔴 **Nenhuma comparação entre dado recém-calculado e dado lido do banco pode ser por texto.** O `jsonb` do
  Postgres não preserva a ordem das chaves de objeto. A Task 11 tinha exatamente esse defeito no aviso
  "Este cálculo mudou" (`JSON.stringify` dos dois lados), corrigido com `src/lib/indulto-comutacao/comparar.ts`.
  Confira que o aviso usa a comparação estrutural e procure em toda a branch outro `JSON.stringify` usado para
  comparar igualdade com algo que veio do banco.

### 7. Os minors deferidos
Para cada linha de "Minors deferidos" e "Observações fora de escopo" em `pendencias-revisao-final.md`,
diga: **corrigir antes do merge** ou **pode ficar**, com uma frase de motivo.

## Verificação

- `pnpm test` e `pnpm exec tsc --noEmit` verdes. Um `pnpm build` (um só, nunca dois ao mesmo tempo).
- Não há Supabase nesta máquina: nada logado foi executado. Não tente configurar banco.
- Árvore limpa no fim.

## O que devolver

- Achados **Critical / Important / Minor**, cada um com arquivo, linha e cenário concreto, ordenados do
  mais grave. Critical = um membro alcança dado de outro, número jurídico errado na tela, ou decreto novo
  exige mexer fora da pasta dele.
- A triagem dos deferidos (item 7).
- Uma lista do que **não foi possível verificar** sem banco, para virar roteiro de teste do usuário.

---

## A folha de impressão — o que o anexo leva, e por quê (14/09/2026)

> Leia antes de mexer em `@media print`, na `Calculadora`, na `BarraSalvar` ou no `CabecalhoAnexo`.
> **O plano original dizia o contrário do que está no código hoje**, e a mudança foi pedida pelo
> usuário: quem revisar sem saber disto vai "corrigir" de volta.

O destino do resultado é anexo de petição. Quem manda no que sai é o CSS, não o React.

**O que o plano de 12/09 decidiu:** *"Ao imprimir, o questionário não vai junto: o anexo é o
resultado"* (`calculadora.module.css`). Só tempos e incisos iam ao papel.

**O que o usuário pediu em 14/09, depois de ver o anexo pronto:** que as respostas fossem junto —
*"hoje vai só as penas e os artigos"* — e, entre imprimir o questionário inteiro ou só o que saiu
do padrão, **escolheu só as preenchidas**.

**Como ficou:**

| Elemento | Na tela | No papel |
|---|---|---|
| Questionário (coluna esquerda) | visível | oculto |
| Barra de salvar, botão imprimir, excluir | visível | oculto |
| `CabecalhoAnexo` — identificação, data e respostas | **oculto** | **visível** |
| Resumo de tempos, incisos, avisos, proveniência | visível | visível |

Três decisões que não são óbvias e que um revisor tende a desfazer:

1. **`respostasPreenchidas` compara com `padraoDoCampo`, nunca com `'NÃO'`.** Os dois requisitos da
   data do fato nascem em `'SIM'`: neles é o `'NÃO'` que muda o cálculo. Comparar com `'NÃO'`
   esconderia do juiz justamente a premissa decisiva.
2. **A data do anexo é fixada num `useEffect`.** `new Date()` no corpo do componente daria um valor
   no servidor e outro no navegador, e o React acusaria divergência de hidratação.
3. **O título vive na `Calculadora`, não na `BarraSalvar`.** O cabeçalho do anexo precisa dele, e a
   barra some na impressão — duas cópias do mesmo texto divergiriam ao primeiro rascunho.

**Como verificar sem imprimir:** emule a mídia no navegador
(`page.emulateMedia({ media: 'print' })` no Playwright) e meça `getBoundingClientRect().height`.
Não use `getComputedStyle(filho).display`: num filho de um elemento `display: none` ele devolve o
display do próprio filho, e faz tudo parecer visível.
