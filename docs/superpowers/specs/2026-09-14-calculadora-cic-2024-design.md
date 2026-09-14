# GPS CIC — Calculadora 2024 (Decreto nº 12.338/2024) — design

> Spec de implementação da segunda calculadora de indulto e comutação.
> Data: 2026-09-14. Branch: `calculadora2024`.
> Fonte de verdade jurídica: `validacao/2024/planilha.xlsx`.

## 1. Objetivo

Entregar a **GPS CIC - Calculadora 2024**, que aplica o **Decreto nº 12.338/2024** com a mesma
experiência da calculadora de 2025 já em produção: questionário à esquerda, resultado ao vivo à
direita, salvar/imprimir/petição, e lista dos cálculos do próprio membro.

O produto é vendido à parte da calculadora de 2025.

## 2. Premissas verificadas

1. **A arquitetura já prevê isto.** `src/lib/indulto-comutacao/registro.ts` diz, em comentário,
   que acrescentar 2024 é criar a pasta em `motores/` e uma linha no array. O contrato
   `MotorDecreto` (`tipos.ts`) não tem nada específico de 2025.
2. **Os componentes de tela já são agnósticos de decreto.** `Calculadora.tsx`, `Questionario.tsx`,
   `Resultado.tsx`, `PeticaoOverlay.tsx` e `CabecalhoAnexo.tsx` recebem o motor (ou o `decretoId`)
   e nada importam de `motores/2025/`.
3. **Não existe `engine.js` para 2024.** O motor de 2025 foi portado de uma POC em JS que serve
   de segunda camada de prova (`paridade-engine.spec.ts`). Para 2024 só existe a planilha.
4. **Não existem modelos de petição para o Decreto 12.338/2024.** Serão adaptados dos de 2025 e
   aprovados pelo dono do produto antes de virarem código.
5. **`ofertas.produtos` é um array.** Qual oferta da Hotmart libera qual produto é dado no banco,
   não código: declarar o produto novo em `PRODUTOS` não obriga a decidir empacotamento agora.

## 3. Decisões tomadas (e por quê)

| Decisão | Escolha | Razão |
|---|---|---|
| Estrutura de rota | **`/ferramentas/[calculadora]`**, uma só | Evita manter ~20 arquivos de tela em duplicata, e em triplicata quando entrar 2026 |
| Motor | **Isolado em `motores/2024/`**, transcrito da planilha | 2025 está vendido e validado; generalizar obrigaria a revalidá-lo inteiro |
| Petições | **Adaptadas de 2025**, com revisão do dono antes do código | O texto é decisão jurídica, não refatoração |
| Venda | **Produto próprio** `indulto-comutacao-2024` | Permite vender separado ou junto, decidindo depois na tabela `ofertas` |

### 3.1 Por que o motor NÃO pode ser copiado e ajustado

As duas planilhas têm fórmulas visualmente quase idênticas, mas o **mesmo endereço de célula
significa coisas diferentes** em cada uma. O caso mais perigoso é o `I45`:

| Endereço | O que é em 2024 | O que é em 2025 |
|---|---|---|
| `I45` | falta grave no ano (`E57`) | **justiça restaurativa** (`E51`) |
| `I51` | valor do bem ≤ salário-mínimo (`E105`) | **falta grave no ano** (`E57`) |
| `I39` | justiça restaurativa (`E51`) | célula **quebrada** (`Questionario!#REF!`), órfã e não usada |
| coluna `I` da linha 5 | fração **1/6** | fração **1/8** (o 1/6 mudou para `J`) |
| coluna `M` | **total de dias** | dias (o total mudou para `N`) |

E o mesmo conceito mudou de endereço:

| Conceito | Célula em 2024 | Célula em 2025 |
|---|---|---|
| data de nascimento | `D47` | `D53` |
| dias desde a última prisão | `F43` | `F49` |
| curso em andamento | `I64` | `I70` |
| crime contra filho/criança | `I40` | `I46` |

Copiar o motor de 2025 e trocar constantes produziria número errado **sem erro de compilação e
sem teste vermelho**, porque a estrutura do código continuaria válida — a fórmula de impedimento
de todo inciso passaria a testar justiça restaurativa onde deveria testar falta grave. A
transcrição de 2024 é feita a partir da planilha de 2024, célula a célula.

## 4. Diferenças de regra entre 2024 e 2025

Apuradas por diff mecânico das duas abas `Cálculo`, normalizando o deslocamento de linha (+6) e
de coluna (`M`→`N`, `I`→`J` para a fração 1/6). Tudo o que **não** está nesta tabela é regra
idêntica, e o motor de 2024 deve reproduzi-la com os mesmos números.

| # | Onde | 2024 | 2025 |
|---|---|---|---|
| 1 | **Regra especial do §2º** (todos os incisos do Art. 9º e o Art. 13 §4º) | idade **≥ 70 anos**; perfil com **5** marcadores | idade ≥ 60; perfil com 8 marcadores |
| 2 | Art. 9º, **XII** — fração exigida | **1/5** (não reinc.) / **1/4** (reinc.) | 1/6 / 1/5 |
| 3 | Art. 9º, **VIII** — base do §2º | **pena remanescente NÃO impeditiva** (`M17`) | remanescente total (`N16`) |
| 4 | Art. **11, II e III** — requisito do filho | marcador **único** (mulher com filho < 16 anos, ou com deficiência/doença crônica grave que necessite de cuidados) | `OR` de três combinações de marcadores |
| 5 | Art. **10** — perfil | avó com netos até 12 anos + pessoa com deficiência | combinações desmembradas |
| 6 | Comutação — pena após | **não existe**: a planilha só calcula o quantum | existe |

### 4.1 O perfil do §2º em 2024

`IF(OR(D47<=DATE(2024-70,12,25), I32=1, I35=1, I36=1, I38=1, I39=1), "OK", "NÃO")`

| Marcador | Célula | Pergunta (Questionário) |
|---|---|---|
| idade ≥ 70 anos em 25/12/2024 | `D47` | data de nascimento (`E33`) |
| mulher gestante ou com filho até 14 anos, ou com doença crônica grave ou deficiência | `I32` | `E75` |
| homem único responsável por filho menor de 14 anos, ou com doença crônica grave ou deficiência | `I35` | `E81` |
| pessoa imprescindível aos cuidados de criança de até 12 anos, ou com doença grave/deficiência | `I36` | `E83` |
| pessoa com deficiência | `I38` | `E71` |
| submetida a programa de justiça restaurativa | `I39` | `E51` |

Atenção: o **Art. 10** usa `DATE(2024-60,...)` e `DATE(2024-21,...)` — 60 e 21 anos —, não os 70
do §2º. As duas idades convivem na mesma planilha e não devem ser unificadas.

### 4.2 Diferenças de REDAÇÃO, que não são diferenças de regra

Perguntas cujo texto mudou de um ano para o outro mas que continuam reduzindo ao mesmo
`SIM`/`NÃO`, alimentando fórmula idêntica. **Devem ser transcritas com a redação de 2024**,
porque é o que o advogado lê na tela e imprime no anexo — mas não implicam lógica diferente.

| Campo | 2024 | 2025 |
|---|---|---|
| saídas temporárias / trabalho externo (Art. 9º, XI) | "obteve 05 saídas temporárias ou trabalhou externamente nos três anos anteriores" | acrescenta "por, no mínimo, doze meses" |
| pena substituída (Art. 9º, VII) | "**Tem** pena substituída por restritiva de direito ou beneficiadas com a suspensão condicional da pena?" | "**Todas as penas** foram substituídas…" |
| regime aberto (Art. 9º, VII) | "**Tem** condenação em regime aberto?" | "**Todas as condenações** foram em regime aberto?" |
| reincidência | "Reincidente?" | "Reincidente em 25/12/2025?" |
| hipossuficiência (Art. 12) | "Sentenciado hipossuficiente?" | "…nos termos do Art. 12, §2º" |
| requisitos da data do fato | sem alerta | trazem "(Cuidado! Ao selecionar NÃO, a Calculadora bloqueará tanto o Indulto quanto a Comutação.)" |

A diferença de "Tem" para "Todas as" é a que mais muda o sentido para quem responde, mesmo com a
fórmula igual. Fica registrada aqui para que a transcrição não "melhore" o texto de 2024 usando o
de 2025 como modelo.

## 5. Ambiguidades jurídicas

Vão para `AVISOS_2024.validarJuridicamente` e aparecem ao advogado em "Pontos a validar
juridicamente", como já acontece em 2025. **Nenhuma delas é corrigida no motor**: a planilha é a
fonte de verdade, e corrigi-la é decisão dos autores do método.

1. **Art. 9º, VIII — a regra especial troca de base.** A regra geral compara a pena remanescente
   **total** (`M16`) com o teto; o §2º compara a remanescente **não impeditiva** (`M17`) com o
   teto dobrado. Nenhum outro inciso troca de base entre a regra geral e a especial, e em 2025 o
   mesmo dispositivo usa a mesma base nas duas. **Esta é nova de 2024** e é a mais relevante da
   lista.
2. **Art. 9º, VIII — o §2º dobra o teto.** Como em 2025: a regra especial multiplica o teto por 2
   em vez de reduzir a fração pela metade. Faz sentido porque ali o §2º incide sobre um teto e
   não sobre uma fração exigida, mas é interpretação.
3. **Art. 13 — comparação estrita.** `H132` exige pena cumprida **maior** que 1/5 (1/4 se
   reincidente), com `<`. Todos os demais dispositivos, inclusive o §4º do mesmo artigo, aceitam
   o cumprimento exato. Idêntico ao que já existe em 2025.
4. **Base da comutação do Art. 13 e §4º.** `G142`/`G143` usam o **maior** valor entre pena
   cumprida e remanescente. Idêntico a 2025.
5. **Art. 11 — "NÃO SE APLICA" na reincidência** satisfaz tanto o requisito de reincidente
   obrigatório (I e III) quanto o de não reincidente (II), porque a fórmula testa diferença e não
   igualdade. Idêntico a 2025.

### 5.1 O que 2024 NÃO herda

O bug `G149` de 2025 — em que o quantum do §4º é condicionado ao requisito do Art. 13 em vez do
próprio §4º — **não existe em 2024**: `G142` referencia `F142` e `G143` referencia `F143`, cada um
o seu. O motor de 2024 não deve reproduzir aquele desvio nem o tratamento de teste correspondente.

### 5.2 Ruído da planilha, a ignorar

Vários rótulos da aba `Cálculo` de 2024 dizem "25/12/2023" (`C18`, `C23`, `C24`, `C45`, `C57`,
`C58`, `C60`) e a célula `E47` guarda `2023-12-25`. São sobras da planilha do decreto anterior:
as **fórmulas** leem o Questionário, que diz 25/12/2024, e o §2º usa `DATE(2024-70,12,25)`
literal. Transcrever o rótulo em vez da fórmula seria erro.

Dois erros de rótulo na aba `Resultado`, também a ignorar:
- a linha do **inciso II** (`B9`) repete o texto do inciso I; o texto correto está em `Cálculo!C72`;
- as linhas de comutação do **Art. 13** estão rotuladas "ART 12" em `Cálculo!C142`/`C143`,
  enquanto `Resultado!B51`/`B53` as chamam de Art. 13 e Art. 13 §4º. Vale o `Resultado`, que é o
  que o advogado lê.

## 6. Arquitetura

### 6.1 O motor

```
src/lib/indulto-comutacao/motores/2024/
├── questionario.ts   ~50 campos, com a redação de 2024
├── incisos.ts        18 dispositivos de indulto + 5 de comutação, e AVISOS_2024
├── motor.ts          calcular2024 — transcrição célula a célula da aba Cálculo
├── peticoes.ts       os dois modelos (entra na fatia 3)
└── index.ts          motor2024
```

```ts
export const motor2024: MotorDecreto = {
  id: 'indulto-comutacao-2024',
  ano: 2024,
  rotulo: 'Decreto 12.338/2024 — indulto natalino',
  versao: '1.0.0',
  dataBase: '2024-12-25',
  // …
}
```

`REGISTRO` passa a `[motor2025, motor2024]` — do mais recente para o mais antigo, como o
comentário do arquivo exige. `motorPadrao()` continua devolvendo 2025.

**Nada é compartilhado com `motores/2025/`** além dos contratos (`tipos.ts`) e dos utilitários
neutros que já existem: `tempo.ts`, `padrao.ts`, `comparar.ts`, `enquadramentos.ts`,
`anexo-texto.ts`, `respostas-anexo.ts`.

**Os `ResultadoInciso` de comutação de 2024 trazem `penaApos: null`** nos cinco dispositivos,
porque a planilha não calcula esse valor (diferença nº 6). `Resultado.tsx` já trata `null` como
ausência; confirmar que a linha some em vez de exibir "0 dias".

### 6.2 A rota parametrizada

```
src/app/(app)/ferramentas/
├── page.tsx                     vitrine: um cartão por produto visível
└── [calculadora]/
    ├── page.tsx                 lista dos cálculos DAQUELE decreto
    ├── novo/page.tsx            questionário em branco
    ├── [id]/page.tsx            cálculo salvo
    ├── acoes.ts  calculos.ts  preparar.ts  filtro-calculos.ts
    ├── Calculadora.tsx  Questionario.tsx  Resultado.tsx  BarraSalvar.tsx
    ├── BotaoImprimir.tsx  BotaoPeticao.tsx  PeticaoOverlay.tsx
    ├── CabecalhoAnexo.tsx  ListaCalculos.tsx  ExcluirCalculo.tsx
    └── *.module.css
```

As URLs continuam exatamente as mesmas: `/ferramentas/cic-2025` e, nova,
`/ferramentas/cic-2024`. Slug desconhecido devolve `notFound()`.

O catálogo vira a fonte única do slug:

```ts
export const PRODUTOS = [
  {
    id: 'indulto-comutacao-2025',
    slug: 'cic-2025',
    rotulo: 'Calculadora de Indulto e Comutação — Decreto 12.970/2025',
    menuTitulo: 'GPS CIC - Calculadora 2025',
    menuDescricao: 'Decreto 12.970/2025',
  },
  {
    id: 'indulto-comutacao-2024',
    slug: 'cic-2024',
    rotulo: 'Calculadora de Indulto e Comutação — Decreto 12.338/2024',
    menuTitulo: 'GPS CIC - Calculadora 2024',
    menuDescricao: 'Decreto 12.338/2024',
  },
] as const

export function caminhoDoProduto(slug: string): string   // `/ferramentas/${slug}`
export function produtoPorSlug(slug: string): Produto | null
export function slugDoMotor(motorId: string): string | null
```

`href` sai do objeto e passa a ser derivado, para não haver duas verdades. `Rail.tsx`, que hoje
lê `produto.href`, passa a chamar `caminhoDoProduto(produto.slug)`.

**Nenhum componente ganha lógica nova.** A mudança é trocar os literais
`'/ferramentas/cic-2025'` — que hoje estão em `acoes.ts` (`BASE`), `BarraSalvar.tsx`,
`ExcluirCalculo.tsx`, `ListaCalculos.tsx` e nos três `page.tsx` — pelo caminho derivado do slug
da rota. Nos componentes de cliente o slug entra como prop; nas páginas de servidor vem de
`params`.

**`excluirCalculo` não recebe decreto.** Em vez de confiar num slug vindo do cliente, o `delete`
passa a fazer `.select('id, decreto_id')` e a revalidar o caminho do produto daquele
`decreto_id`. O dado para revalidar vem do banco, como o resto das guardas deste arquivo.

### 6.3 A lista passa a filtrar por decreto

Correção de comportamento, não só refatoração. Hoje `listarCalculos()` devolve **todos** os
cálculos do membro no workspace, e a página mostra tudo — o que funciona porque só existe um
decreto. Com dois, a tela de 2024 mostraria cálculos de 2025 misturados, cada um abrindo com
motor diferente.

- `listarCalculos(decretoId)` ganha `.eq('decreto_id', decretoId)`.
- `page.tsx` deixa de olhar `PRODUTOS` inteiro (`estados.every` / `estados.some`) e passa a olhar
  **o produto daquela rota**: `estado === 'nunca'` → redireciona para `/ferramentas`;
  `estado !== 'ativo'` → mostra a faixa de acesso encerrado e esconde "Novo cálculo".
- `ListaCalculos.tsx` continua exibindo o rótulo do decreto em cada cartão — passa a ser sempre o
  mesmo dentro de uma rota, mas o custo de manter é zero e o cartão fica autoexplicativo quando
  impresso.
- `/[id]/page.tsx` ganha uma guarda a mais: se o `decreto_id` do cálculo não bate com o slug da
  rota, `notFound()`. Impede que `/ferramentas/cic-2024/<id-de-2025>` abra um cálculo de 2025 sob
  o cabeçalho de 2024.

### 6.4 A vitrine

`/ferramentas/page.tsx` hoje tem um `<Link>` fixo para `cic-2025`. Passa a iterar sobre os
produtos com estado diferente de `'nunca'`, um cartão cada, com `menuTitulo` no título,
`menuDescricao` no subtítulo e o estado de acesso no rodapé do cartão. Regra da spec original
mantida: **não existe vitrine do que o membro nunca teve**.

`Rail.tsx` já itera sobre `PRODUTOS` e não precisa de mudança além do `caminhoDoProduto`.

## 7. Validação

### 7.1 Só uma camada de prova, e é a mais forte

2025 tem duas: paridade contra o `engine.js` (pega erro de porte JS→TS) e comparação contra a
planilha (pega erro que o próprio `engine.js` já tinha). 2024 não tem `engine.js`, então só resta
a segunda — que o `validacao/README.md` já descreve como a única capaz de pegar erro de
transcrição. A perda é real mas é da camada mais fraca.

### 7.2 O oráculo

`validacao/oraculo.py` hoje recusa qualquer argumento que não seja `2025`, de propósito: o
`build_inputs`/`OUT_MAP` é do mapeamento de 2025 e não serve para outro ano. Passa a aceitar
`2024` com um mapa próprio, escolhido pelo argumento. O mapa de 2025 **não é tocado**.

Mapa de saída de 2024 (`OUT_MAP`), que **não** coincide com o de 2025 — lá a aba `Resultado`
começa uma coluna e duas linhas adiante:

| O quê | Em 2024 | Em 2025 |
|---|---|---|
| indulto, regra geral | `Resultado!C7, C9, … C41` (18 linhas, passo 2) | `D9 … D41` |
| indulto, regra especial | `Resultado!D7 … D41` | `E9 … E41` |
| comutação, veredito | `Resultado!C45, C47, C49, C51, C53` | `D47 … D59` |
| comutação, quantum | `Resultado!D45 … D53` | `E47 … E59` |
| comutação, pena após | **não existe** | `E48, E51, E54, E57, E60` |
| resumo (totais e frações) | `Questionario!C12..E29` | idem |

O `build_inputs` de 2024 também é próprio: as perguntas vivem em `Questionario!E31..E113`, contra
`E31..E119` em 2025, e o bloco de filhos/cuidados não tem correspondência de um para um (ver §4).

- `validacao/2024/cenarios.json` — os 21 cenários de 2025 traduzidos para os campos de 2024, mais
  ~6 desenhados para o que só existe aqui: a fronteira dos 70 anos do §2º, o perfil reduzido de 5
  marcadores, a fração 1/5–1/4 do inciso XII, a base trocada do §2º do inciso VIII, e um caso sem
  pena impeditiva.
- `validacao/2024/esperado.json` — gerado pelo oráculo, com o sha256 da planilha. Nunca editado à
  mão.
- `tests/indulto-comutacao/motor-2024.spec.ts` — compara o motor contra o congelado, dentro do
  `pnpm test` normal, sem Python e sem planilha. Tolerância de 1 dia em quantum, como em 2025.

`validacao/README.md` ganha a seção de 2024, dizendo explicitamente que ali não há camada de
paridade e por quê.

### 7.3 Testes

Passam a apontar para `[calculadora]/` em vez de `cic-2025/`:
`preparar.spec.ts`, `filtro-calculos.spec.ts`, `respostas-anexo.spec.ts` e `fronteira-rsc.spec.ts`
(que lê caminhos de arquivo literais). `auth/proxy.spec.ts` já usa a URL, que não muda.

Entram, espelhando os de 2025: `motor-2024`, `questionario-2024`, `incisos-2024`,
`reconciliacao-2024` (toda chave que o motor lê existe no questionário, e vice-versa) e
`peticao-2024` (na fatia 3).

Entra um teste novo de catálogo: todo produto tem slug único, todo slug resolve para um motor do
`REGISTRO`, e todo motor do `REGISTRO` tem produto. O `registro.spec.ts` atual já cobre metade
disso e é estendido em vez de duplicado.

## 8. Petições

Adaptação dos modelos de 2025 (`motores/2025/peticoes.ts`, ~278 linhas), trocando número do
decreto, data-base e os dispositivos/frações que mudaram. **O texto adaptado é apresentado ao
dono do produto em prosa, para aprovação, antes de virar código.**

O contrato `MotorDecreto.peticoes` é opcional: até a aprovação, `motor2024` sai sem ele e o botão
"Petição" simplesmente não aparece na calculadora de 2024 — comportamento já previsto em
`BotaoPeticao.tsx`.

## 9. Ordem de entrega

Quatro fatias. Dá para parar entre uma e outra com a árvore verde.

| # | Fatia | Entrega | Risco |
|---|---|---|---|
| 1 | Rota `[calculadora]` | `slug` no produto de 2025, rota parametrizada, lista filtrando por decreto. 2025 na mesma URL, testes verdes | Regressão em 2025 — mitigada por não tocar em motor nem em regra |
| 2 | Motor de 2024 | `motores/2024/` no `REGISTRO`, oráculo, cenários, `motor-2024.spec.ts` | Erro de transcrição — mitigado pelo oráculo |
| 3 | Petições | Texto aprovado → `peticoes.ts` + `peticao-2024.spec.ts` | Nenhum técnico; depende da aprovação do texto |
| 4 | Produto e vitrine | Entrada `indulto-comutacao-2024` em `PRODUTOS`, vitrine iterada, menu | Liberar produto sem oferta configurada — resolvido no banco |

A fatia 1 é a única que mexe em código de 2025, e mexe só em caminho e em como a lista filtra.

**2024 só fica alcançável na fatia 4.** Entre a 2 e a 4 o motor existe no `REGISTRO` mas não tem
produto, então `produtoDoMotor` devolve `null`, `/ferramentas/cic-2024` devolve 404 e nada aparece
no menu — o motor é exercitado só pelos testes. É proposital: permite validar o cálculo contra a
planilha antes de qualquer membro conseguir abrir a tela.

## 10. Fora de escopo

- Tocar no `motor.ts` de 2025 ou no `esperado.json` de 2025.
- Editar qualquer planilha.
- Unificar os dois motores numa engine paramétrica. Fica para depois dos dois validados lado a
  lado, se houver evidência de que vale.
- Resolver qualquer das ambiguidades da seção 5 — elas são exibidas, não corrigidas.
- Migration de banco: `indulto_comutacao_calculos` já tem `decreto_id` e não muda.
