# Calculadora de Indulto e Comutação — design

> Spec de implementação para a calculadora dentro do CRM do GPS da Pena.
> Data: 2026-09-12.

## 1. Objetivo e público

Entregar, dentro do CRM, uma ferramenta que recebe os dados de um sentenciado e diz,
dispositivo por dispositivo, se ele preenche os requisitos de **indulto** e de **comutação**
de um decreto de indulto natalino — hoje o **Decreto nº 12.970/2025**.

O público são os **membros do GPS da Pena**: advogados de execução penal que entram neste
CRM como usuários do workspace. Cada membro vê e guarda apenas os cálculos que ele mesmo fez.

A ferramenta é a **primeira de várias**. A estrutura de pastas e o hub `/ferramentas` nascem
prontos para as próximas, sem abstrair nada que a segunda ferramenta ainda não exija.

## 2. Premissas

1. **Este repositório não recebe atualizações do Awave CRM original.** A regra do `AGENTS.md`
   que restringe edições a `custom/` não se aplica: a calculadora é feita como funcionalidade
   nativa em `src/`, com URL limpa, checagem de tipo no `pnpm build` e menu lateral nativo.
   Verificado: o `Dockerfile` roda apenas `pnpm build`. Nenhuma das guardas declaradas no
   `package.json` faz parte do build, e três delas não têm script nesta cópia — `check:motor`,
   `gen:manifest` e `audit:entrega` apontam para arquivos ausentes em `scripts/`. O
   `FOUNDATION.lock` cobre quatro arquivos de licença e assinatura, e só acusa divergência se
   `pnpm verify:foundation` for rodado à mão.
2. **O material da POC existe e será entregue:** `engine.js` validado, `scenarios.json` e a
   planilha Excel original do GPS da Pena.
3. **Já existe uma calculadora de 2024** cujas regras serão fornecidas depois, e é esperado um
   **decreto de 2026**.

## 3. Requisito estrutural: múltiplos decretos

Cada indulto natalino é um decreto novo. Historicamente mudam a data-base, os incisos, as
frações, os requisitos e até dispositivos inteiros — um inciso desaparece, outro nasce.

**Cada decreto é um motor próprio.** Não um motor genérico configurado por JSON de regras:
os incisos diferem *estruturalmente* entre decretos, e um motor dirigido por dados viraria
uma linguagem de regras não especificada, perdendo a correspondência linha-a-linha com a
planilha validada — que é a única defesa de corretude do projeto. Validar 2026 não pode
colocar em risco o motor de 2025 já validado.

O que os motores compartilham: os **tipos** de entrada e resultado, e as **primitivas de
tempo**. Nenhuma regra jurídica, e nenhum campo de questionário.

## 4. Arquitetura

### 4.1 Estrutura de pastas

```
src/lib/indulto-comutacao/
  tipos.ts          Tempo, Entrada, Veredito, ResultadoInciso, Resultado, Resumo,
                    MotorDecreto, MetaInciso, Secao, Campo
  tempo.ts          dias() e fmtDias() na convenção 30/360; diasCorridos() em calendário real
  registro.ts       REGISTRO: MotorDecreto[] (imports estáticos); motorPorId(); motorPadrao()
  motores/
    2025/
      index.ts        o módulo do decreto: rótulo, versão, data-base, questionário, metadados
      motor.ts        porte literal do engine.js — um arquivo só
      questionario.ts as seções declarativas do questionário
      incisos.ts      metadados de exibição dos incisos e os avisos fixos

src/app/(app)/ferramentas/
  page.tsx                            hub de ferramentas
  indulto-comutacao/page.tsx          "Meus cálculos" + Novo cálculo
  indulto-comutacao/novo/page.tsx     seleção de decreto -> questionário -> resultado
  indulto-comutacao/[id]/page.tsx     cálculo salvo: resultado, editar, excluir
  indulto-comutacao/acoes.ts          server actions de escrita
  indulto-comutacao/*.tsx             componentes de cliente (formulário, resultado)

validacao/                            FORA da imagem Docker (.dockerignore)
  oraculo.py                          avalia a planilha via `formulas` e gera o esperado.json
  2025/planilha.xlsx
  2025/cenarios.json
  2025/esperado.json                  saída congelada do oráculo

tests/indulto-comutacao/
  motor-2025.spec.ts                  regressão do motor contra o esperado.json
  tempo.spec.ts                       convenções de contagem
  registro.spec.ts                    contrato do registro de motores
```

**Por que os testes ficam em `tests/` e não ao lado do motor:** `tests/` já está no
`.dockerignore`, e `validacao/` será acrescentado. Um `.spec.ts` dentro de `src/` que importe
`validacao/` passaria pelo typecheck do `next build` dentro do container, onde essas pastas
não existem, e derrubaria o build. Em `tests/` isso não acontece, e o caminho já bate com o
`include` do `vitest.config.ts` — nenhuma mudança de configuração é necessária.

### 4.2 O contrato do motor

```ts
export type MotorDecreto = {
  id: string            // 'indulto-comutacao-2025'
  ano: number           // 2025
  rotulo: string        // 'Decreto 12.970/2025 — indulto natalino'
  versao: string        // '1.0.0' — sobe quando qualquer fórmula muda
  dataBase: string      // '2025-12-25'
  questionario: Secao[]
  incisos: { indulto: MetaInciso[]; comutacao: MetaInciso[] }
  avisos: { fixos: string[]; validarJuridicamente: string[] }
  calcular(entrada: Entrada): Resultado
}
```

`Entrada` é um objeto plano de chaves do questionário, como na POC. `Resultado` traz
`{ incisos, resumo, avisos }`.

Vereditos possíveis, compartilhados entre motores:
`'preenche' | 'nao_preenche' | 'a_analisar' | 'sem_previsao'`.

O `registro.ts` é um **array com imports estáticos**, nunca varredura de diretório — varredura
não sobrevive ao bundler do Next. Adicionar 2024 é criar a pasta e acrescentar uma linha.

### 4.3 A regra do `motor.ts`

O porte do `engine.js` é **literal e não refatorado, de propósito**: mesma ordem de blocos,
mesmos nomes de variável (`N6`, `D6`, `P14`, `gates5`, `i18ok`), mesmos comentários de célula
da planilha. TypeScript entra para tipar a entrada e a saída, não para melhorar o miolo.

O motivo: esse arquivo é a única coisa do projeto cuja corretude não se verifica lendo. Ele é
verificado por comparação contra um oráculo independente, e essa comparação só continua
auditável enquanto `G149` no código continuar sendo `G149` na planilha. Extrair funções,
renomear para nomes expressivos ou unificar incisos parecidos troca uma corretude demonstrável
por uma legibilidade que ninguém pode conferir.

**Bugs da planilha corrigidos**, cada um marcado no código com o que a planilha faz, o que o
código faz e por quê:

- `L145:L149` — a planilha devolve `#VALUE!` quando não há comutação aplicável; o motor
  devolve `null`.
- `G149` — a fórmula da comutação do Art. 13, §4º referencia a linha da condição errada,
  exibindo a comutação sem os requisitos do §4º; corrigido para a condição certa.

**Ambiguidades jurídicas preservadas** (herdadas da planilha, exibidas na tela em "Pontos a
validar juridicamente", nunca alteradas em silêncio):

1. A "pena após comutação" usa a **pena total imposta** como base do desconto, não a pena
   remanescente.
2. A comutação do Art. 13 e §4º usa **`max(pena cumprida, pena remanescente)`** como base do
   quantum, quando tecnicamente incidiria sobre a remanescente.

### 4.4 Convenções de tempo

Duas coexistem, herdadas da planilha, e ambas vivem em `tempo.ts`:

- **30/360** (padrão): 30 dias por mês, 360 por ano, para todo cálculo de fração de pena.
- **Dias-calendário** (exceção, só no inciso IV do Art. 9º), em `diasCorridos()`: diferença
  real entre a data da última prisão e a data-base, porque o inciso exige cumprimento
  ininterrupto em tempo corrido.

`MetaInciso` carrega o que a tela precisa para desenhar o cartão de um dispositivo: rótulo,
descrição resumida da regra e se há previsão de regra especial do §2º.

## 5. Validação

O harness Python/Excel é um **teste diferencial contra um oráculo independente**. A biblioteca
`formulas` interpreta o `.xlsx` e calcula suas fórmulas sem Excel nem LibreOffice instalados —
é um segundo implementador do mesmo problema, que não conhece o motor.

O que ele pega e nada mais pega: **erro de transcrição**. Uma fração trocada de 1/5 para 1/6,
um `>=` que virou `>`, uma condição do §2º aplicada ao inciso vizinho. Nada disso quebra teste,
não aparece na tela e produz um número plausível — que vai para uma petição.

Procedimento:

1. Portar o motor para TypeScript.
2. `validacao/oraculo.py` avalia a planilha para cada cenário de `cenarios.json` e grava
   `esperado.json`.
3. Comparar o motor portado contra o `esperado.json`, campo a campo.
   **Critério de aceite: zero divergências**, fora os dois bugs corrigidos acima.
4. Com o motor batendo, o `esperado.json` congela e vira o teste de regressão em Vitest —
   rápido, sem Python e sem planilha.
5. O oráculo só volta a ser chamado quando um motor novo nascer ou uma fórmula mudar.

`validacao/` fica **versionada no repositório** (proveniência: qual planilha validou qual
versão de qual motor) e **fora da imagem Docker** (uma linha no `.dockerignore`): nada ali tem
papel em runtime. O Python é dependência local de desenvolvimento, nunca do deploy.

## 6. Persistência

### 6.1 Tabela

`supabase/migrations/0062_ferramentas_indulto_comutacao.sql`:

```sql
create table if not exists public.indulto_comutacao_calculos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  decreto_id    text not null,
  motor_versao  text not null,
  titulo        text not null,
  entrada       jsonb not null,
  resultado     jsonb not null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists indulto_comutacao_calculos_dono_idx
  on public.indulto_comutacao_calculos (workspace_id, user_id, atualizado_em desc);

alter table public.indulto_comutacao_calculos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'indulto_comutacao_calculos'
      and policyname = 'indulto_comutacao_calculos_sel'
  ) then
    create policy indulto_comutacao_calculos_sel on public.indulto_comutacao_calculos
      for select to authenticated
      using (public.e_membro(workspace_id) and user_id = auth.uid());
  end if;
end $$;
```

A migration é **aditiva e idempotente** — o CRM reaplica no boot qualquer migration que não
encontre registrada, e uma instrução que falhe com "objeto já existe" impede o servidor de
subir. `create table`, `create index` e `alter table` aceitam `if not exists`; `create policy`
não, e por isso ela vai embrulhada no bloco `do $$ ... end $$;` acima, que consulta
`pg_policies` antes. Nada aqui apaga dado nem exige ownership de objeto do Supabase.

**Nenhuma policy de escrita para `authenticated`.** O CRM entrega um cliente Supabase ao
navegador na tela de Conversas, e o Postgres não distingue "o servidor agindo em nome do
usuário" de "o usuário agindo pelo console do navegador" — é o mesmo JWT. Uma policy de escrita
autorizaria o segundo, que pularia qualquer validação escrita em código.

O `user_id = auth.uid()` na policy de leitura é o que separa um membro do outro **dentro do
mesmo workspace**. Sem essa metade, `e_membro` sozinho deixaria qualquer membro ler o caso de
qualquer outro.

### 6.2 Por que guardar `entrada` e `resultado`

O `resultado` é o registro de auditoria: aquele número, gerado por aquela versão do motor,
naquela data. O `entrada` permite reabrir e editar.

Ao abrir um cálculo salvo, o resultado é recalculado a partir do `entrada` com o motor atual.
Se `motor_versao` mudou e o resultado mudou junto, a tela mostra os dois lado a lado com o
aviso de que o cálculo original foi feito com a versão anterior. Sem isso, uma correção de
fórmula reescreveria em silêncio números que já viraram petição.

### 6.3 Escritas

`src/app/(app)/ferramentas/indulto-comutacao/acoes.ts`, seguindo o padrão dos demais
`acoes.ts` do produto. Cada ação:

1. `exigirSessao()` + `resolverWorkspaceAtivo()`;
2. valida o payload com Zod;
3. grava com `admin()` (service-role), preenchendo `workspace_id` e `user_id` **a partir da
   sessão, nunca do payload**.

Ações: `salvar`, `atualizar`, `excluir`. As duas últimas levam `.eq('user_id', <sessão>)` no
filtro — sem ele, o service-role escreveria sobre o caso de outro membro.

## 7. Telas

| Rota | Conteúdo |
|---|---|
| `/ferramentas` | Hub. Hoje um card; pronto para as próximas ferramentas |
| `/ferramentas/indulto-comutacao` | "Meus cálculos" (só os do membro) + Novo cálculo |
| `/ferramentas/indulto-comutacao/novo` | Escolha do decreto -> questionário -> resultado |
| `/ferramentas/indulto-comutacao/[id]` | Cálculo salvo: resultado, editar, excluir, aviso de versão |

O questionário é um componente `'use client'` com um único objeto `entrada` em estado,
renderizado a partir do `questionario: Secao[]` do motor escolhido. **O cálculo roda no
navegador a cada mudança** — é função pura e custa nada; o resultado acompanha o preenchimento.
Nada vai ao servidor até o membro clicar em Salvar.

Tipos de campo do questionário: texto, tempo (anos/meses/dias), seleção (SIM/NÃO ou
SIM/NÃO/NÃO SE APLICA), data, número e faixa.

Requisitos de tela herdados do decreto:

- Os dois campos de "requisitos da data do fato" nascem em **SIM**. São veto total: o padrão
  errado bloquearia indulto e comutação inteiros, em silêncio.
- O bloco **"Pontos a validar juridicamente"** aparece sempre, com as duas ambiguidades da
  seção 4.3.
- As **notas fixas** aparecem sempre: a ferramenta não dispensa conhecimento técnico; crimes
  impeditivos nunca são atingidos; o indulto do Art. 9º (I, II, XIV, XV) e do Art. 10 não
  alcança crimes com violência ou grave ameaça; a comutação do Art. 11 só é calculada para
  crimes sem violência ou grave ameaça.
- O resultado abre com o **resumo de tempos** (total imposto, cumprido, computável para os
  impeditivos, remanescente e as frações de referência), antes da lista de incisos.
- Folha de impressão (`@media print`) no resultado: o destino do cálculo é papel ou PDF.

Com um motor só no registro, a tela **pré-seleciona e mostra** qual decreto está em uso, em vez
de esconder o seletor. Quando 2024 entrar, não há mudança de fluxo.

Componentes reaproveitados de `src/components/ui/`: `CabecalhoPagina`, `Campo`, `Botao`,
`Pill`, `ListCard`, `EstadoVazio`, `KpiCard`. Menu: um `<ItemNav>` em
`src/components/shell/Rail.tsx` e outro em `NavMobile.tsx`.

## 8. Testes

- `tests/indulto-comutacao/motor-2025.spec.ts` — cada cenário contra o `esperado.json`. É o
  teste que importa.
- `tests/indulto-comutacao/tempo.spec.ts` — 30/360 e dias-calendário, com as bordas.
- `tests/indulto-comutacao/registro.spec.ts` — todo motor do registro cumpre o contrato: `id`
  único, versão preenchida, questionário não vazio, metadados cobrindo os incisos que
  `calcular` devolve. É o teste que protege a entrada de 2024 e 2026.

## 9. Dado pessoal

A tabela guarda nome de sentenciado, unidade prisional, condição de saúde e maternidade —
dado pessoal sensível de terceiros sob a LGPD, e o controlador passa a ser o GPS da Pena, não
o advogado. Dois requisitos decorrentes:

- O campo de identificação é **livre e sem obrigatoriedade de nome real**; a tela sugere usar
  o nº de execução.
- A tela informa que o cálculo fica guardado na conta do membro e pode ser excluído por ele. A
  exclusão está no escopo.

Retenção automática e exportação ficam **fora do escopo** desta entrega.

## 10. Ordem de entrega

1. **Fundação** — `tipos.ts`, `tempo.ts`, registro vazio, testes de tempo verdes.
2. **Motor 2025** — porte literal, oráculo Python, `esperado.json`, regressão.
   **Portão: zero divergências** fora dos dois bugs documentados. Nada avança sem isso.
3. **Questionário e resultado** — telas, cálculo no navegador, impressão. Ainda sem salvar.
4. **Persistência** — migration, server actions, lista, abrir, editar, excluir, aviso de versão.
5. **Acabamento** — hub `/ferramentas`, itens de menu em `Rail.tsx` e `NavMobile.tsx`, linha
   `validacao` no `.dockerignore`.

O passo 2 depende da entrega da planilha, do `engine.js` e do `scenarios.json`. Os passos 1 e 3
não dependem: a forma do resultado está definida no contrato da seção 4.2.

## 11. Fora de escopo

- O motor de 2024 (as regras serão fornecidas depois) e o de 2026 (decreto não publicado).
  A arquitetura os comporta; esta entrega não os implementa.
- Retenção automática e exportação de dados.
- Compartilhamento de cálculos entre membros.
- Qualquer decisão sobre as duas ambiguidades jurídicas: elas são exibidas, nunca resolvidas.
