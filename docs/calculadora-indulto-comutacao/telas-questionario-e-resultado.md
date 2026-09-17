# As telas do resultado e do questionário — decisões de 17/09/2026

> Leia antes de mexer em `Resultado.tsx`, `Questionario.tsx`, `CabecalhoAnexo.tsx`,
> `resultado.module.css` ou `calculadora.module.css`. **Oito coisas aqui contrariam o que o plano e
> os documentos anteriores diziam**, e todas foram pedidas pelo dono do produto olhando a tela no ar.
> Quem revisar sem saber disto vai "corrigir" de volta — foi o que aconteceu antes, com a folha de
> impressão (ver `verificacoes-de-conjunto.md`).

Nada aqui muda **regra jurídica**. É layout e apresentação; os vereditos, quantum e tempos
seguem saindo do motor, intocados. Onde o layout *parece* mexer em regra, o texto diz por quê.

## 1. O card "Pontos a validar juridicamente" saiu da tela

`Resultado.tsx` — o bloco `<section>` inteiro está comentado, com o comentário explicando como
reativar. O conteúdo **continua no motor** (`motor.avisos.validarJuridicamente`), íntegro e
testado: a petição e a auditoria ainda o leem.

**Não mova o conteúdo para fora de `incisos.ts`, e não apague a lista.** O que o dono do
produto pediu foi tirar o card da tela, não apagar a informação. Se um dia voltar, é descomentar
sete linhas — o CSS `.validar` ficou no lugar de propósito, mesmo sem uso.

⚠️ Consequência que fica registrada: **a tela não mostra mais nada sobre as ambiguidades da
planilha.** As "Notas" (`avisos.fixos`) continuam aparecendo. Ao mexer em regra do motor que
tenha um aviso em `validarJuridicamente`, lembre que o advogado **não o vê mais na tela** —
só na petição.

## 2. O questionário é um acordeão de uma seção aberta

`Questionario.tsx` + `calculadora.module.css`.

**O problema que motivou:** as 12 seções abertas ao mesmo tempo ocupavam a altura toda e
empurravam o `Resultado` para fora da tela — justamente o que o advogado precisa ver mudar
enquanto responde. A calculadora calcula ao vivo; sem o resultado à vista, isso não servia para
nada.

**Como funciona:** a primeira seção (`secoes[0]`) abre; clicar numa fechada abre ela e fecha a
anterior; clicar na aberta fecha tudo. Uma aberta por vez.

Quatro decisões que um revisor tende a desfazer:

1. **Só o painel aberto é montado no DOM.** Os fechados não existem, em vez de existirem com
   `display: none`. Medido: 1 região e 3 inputs, contra 12 regiões e 60+ controles antes.
   Se alguém trocar por `hidden` ou `display: none` para "manter o estado dos campos", o custo
   de montar 60 controles a cada tecla volta — e o estado dos campos **não** está neles: vem de
   `entrada`, que vive na `Calculadora`. Fechar não perde resposta.
2. **O título é um `<button>`, não uma `div` com `onClick`.** É o que dá foco por teclado e faz
   o leitor de tela anunciar "expansível". Com `aria-expanded` e `aria-controls` ligando botão e
   painel. Trocar por `div` quebra as duas coisas sem quebrar nenhum teste.
3. **O alvo do clique é a linha inteira** (`width: 100%`), não só o texto. "Observações" tem
   ~100px de título; como alvo, é pouco.
4. **A seção aberta ganha `--linha-forte`** além da diferença de altura: quem não percebe a
   altura (ou vê a tela inteira de uma vez) ainda distingue qual está ativa.

O `@media print` já escondia a coluna do questionário inteira, então o acordeão **não muda o
anexo impresso**.

## 3. O resultado separa aplicáveis de não aplicáveis

`Resultado.tsx` + `resultado.module.css`. Cada grupo (Indulto, Comutação) se desenha em duas
listas, com contagem no título: `Indulto aplicável (1)` e `Indulto não aplicáveis (17)`.

**Aplicável = `geral === 'preenche'`** — o mesmo critério de `temAplicavel` e `primeiroAplicavel`
em `enquadramentos.ts`, que são quem decide o que vai para a petição. **Não invente outro
critério aqui**: a tela passaria a separar diferente do que o botão "Petição" entrega, e o
advogado clicaria num artigo que a petição não usa.

Três decisões que parecem detalhe e não são:

1. **A ordem dentro de cada lista é a do decreto** (Art. 9º I, II, III…). O que separa as listas
   é o veredito, não a posição — reordenar por veredito faria o Art. 9º, IV se perder no meio.
2. **A lista de baixo fica sempre visível NA TELA**, mesmo cheia ou vazia. É dela que os cartões
   saem conforme o questionário é preenchido; escondê-la tiraria de vista exatamente o que o
   advogado está tentando destravar. A de cima **some quando vazia** (uma caixa "Aplicáveis" vazia
   só ocuparia a tela). **No PAPEL é o contrário** — a lista de baixo não sai, e a de cima sim.
   Ver §6.
3. **O título do cartão é `h4`** (era `h3`). A hierarquia virou h2 (grupo), h3 (lista),
   h4 (dispositivo). Não é preciosismo: leitor de tela navega por cabeçalho, e dois níveis
   iguais achatam a leitura.

O acordeão (§2) e esta divisão (§3) atacam o mesmo problema por dois lados: um encurta o
formulário, o outro põe a resposta no alto da coluna.

## 4. Os três campos que mudaram de card (17/09/2026)

Em **ambos** os decretos (`motores/2024/questionario.ts` e `motores/2025/questionario.ts`):

- `regime`, `livramentoCondicional` e `dataUltimaPrisao` **saíram** de "Perfil do sentenciado" e
  **abrem** "Regime, tempo e situação prisional";
- a seção `perfil` **subiu para 2ª**, logo abaixo de "Identificação".

**A ordem das seções e dos campos é ordem de TELA.** O motor lê cada campo **pela chave**, onde
quer que ela esteja — mover não muda veredito nenhum. Mas os testes `questionario-2024.spec.ts` e
`questionario-2025.spec.ts` travam a ordem, e é de propósito: sem eles, mover uma seção passa em
silêncio. Ao mexer na ordem, **atualize a lista esperada no spec** — foi o que se fez aqui.

## 5. O Art. 13 passou a aceitar o cumprimento exato da fração

`motores/2024/motor.ts`, `motores/2025/motor.ts` e os `incisos.ts` dos dois.

**Isto é regra jurídica, e foi DECISÃO do dono do produto** — não é engano a desfazer. A planilha
exigia pena cumprida **maior** que 1/5 (1/4 se reincidente), com `<` estrito: quem cumpriu
exatamente a fração tinha a comutação **negada**, e um dia a mais a concedia. O texto do Art. 13
fala em "tenham cumprido um quinto da pena", o que inclui o exato, e todos os demais dispositivos
inclusive o §4º do mesmo artigo e os três incisos do Art. 11 já comparavam com `<=`.

**`<=` aqui é INTENCIONAL. Não "restaure" o `<` para bater com a planilha — a divergência é o
ponto.** Aplicado nos **dois** decretos porque o `art13` é idêntico nos dois, e deixar 2024 com o
erro prejudicaria quem usa o decreto anterior.

**A consequência nos testes, que é onde um revisor se perde:** feita a troca sem tratar o desvio,
os testes de paridade **reprovam** — e **isso é o comportamento correto deles**, porque a planilha e
o `engine.js` ainda dizem "não preenche". (Não registre um número aqui: a contagem depende de quantos
cruzamentos da varredura caem na igualdade exata, e muda se os cenários mudarem.)

O desvio está **registrado, não escondido**. Hoje a suíte termina em `1657 passed | 4 skipped`, e os
4 são estes:

| Onde | O que faz |
|---|---|
| `tests/indulto-comutacao/_oraculo.ts` | As listas `CENARIOS_ART13_EXATO` e `CENARIOS_ART13_EXATO_2024`: nome do cenário → motivo. **Não acrescente nada aqui sem decisão do dono do produto registrada** — a lista é para desvio conhecido, não para silenciar reprovação |
| `paridade-engine.spec.ts`, `motor-2025.spec.ts` | Pulam os cenários nomeados, com o motivo **no título do teste** (`describe.skip`), e há um teste que reprova se a lista deixar de bater com a realidade, **nos dois sentidos** |
| `paridade-fronteiras.spec.ts` | Filtra só a mensagem exata do desvio (só `art13`/`art13_4`, só quando o porte concede a mais). Um teste roda a varredura **sem filtro** para provar que nada além disso está suprimido |
| `motor-2024.spec.ts` | Marca apenas o `art13` como desviado no cenário da fronteira; o resto continua conferido campo a campo |

Se alguém "arrumar" a paridade removendo o skip, a suíte fica verde e o motor volta a negar a
comutação a quem tem direito. O teste que confere a lista contra a realidade existe para isso.

## 6. O que NÃO sai na impressão (17/09/2026)

O anexo de petição mudou de novo, a pedido do dono do produto. A classe é `.soNaTela`
(`resultado.module.css`): `display: contents` na tela, `display: none` em `@media print`. É o
**inverso** do `.anexo`, que existe no papel e não na tela.

| O que some no papel | Por quê |
|---|---|
| **Título do cálculo salvo** (`CabecalhoAnexo`) | É o nome que o membro deu ao registro, não informação do caso. A data de impressão continua saindo |
| **Lista de dispositivos NÃO aplicáveis**, Indulto e Comutação | O anexo vai ao juiz com o que se aplica ao caso; a lista do que não se aplica só daria o que contestar sem motivo |

E as **cinco frações de referência saíram do resumo** — da tela **e** do papel. Ver §7.

**Por que CSS e não um `if (isPrinting)`:** com a regra no CSS, o React não precisa saber que está
imprimindo, então não existe um estado de impressão para dessincronizar do que o CSS decidiu.
Mantenha assim.

## 7. O resumo de tempos, card a card
O resumo mostra **cinco totais**, nesta ordem:

| # | Card | Campo do motor | O que é |
|---|---|
| 1 | Total de penas impostas | `resumo.totalImposto` | a soma das três categorias do questionário |
| 2 | **Total de penas impeditivas** | `resumo.totalImpeditivo` | o campo `penaImpeditiva` |
| 3 | **Total de penas permissivas** | `resumo.totalPermissivo` | `penaViolencia` + `penaSemViolencia` |
| 4 | Total de pena cumprida | `resumo.totalCumprido` | SEEU + não lançado |
| 5 | Cumprida computável nos impeditivos **(2/3)** | `resumo.penaCumpridaImpeditivos` | `min(cumprido, 2/3 do impeditivo)` |
| 6 | **Cumprida computável nos permissivos** | `resumo.penaCumpridaPermissivos` | **card 4 − card 5** |
| 7 | Pena remanescente | `resumo.remanescente` | `total imposto − total cumprido` |
| 8 | **Remanescente dos impeditivos (2/3)** | `resumo.remanescenteImpeditivo` | **card 2 − card 5** |
| 9 | **Remanescente dos permissivos** | `resumo.remanescentePermissivo` | **card 7 − card 8** |

🔴 **A POSIÇÃO dos cards 8 e 9 está a confirmar.** Ele é o único que lê cards do alto da lista
(os 2 e 5) estando no fim — o pedido foi "criar card 8", e ele foi posto depois do 7. Se a
intenção for lê-lo junto dos outros impeditivos, o ajuste é mover um bloco no `Resultado.tsx`;
nada mais depende da ordem.

Os **cards 2, 3 e 6 são novos** (17/09/2026), com regra explícita do dono do produto.

### Cards 2 e 3 — decomposição do card 1, e leem o FORMULÁRIO
Leem os **campos do formulário "Penas impostas"** e nada mais. Ficam logo abaixo do card 1:

> `totalImpeditivo + totalPermissivo == totalImposto`

### Cards 6, 8 e 9 — decomposição, e leem OUTROS CARDS
São **diferenças entre dois cards**, e não somas de campos do formulário — as três únicas
grandezas do painel definidas assim:

> `card 6 = card 4 − card 5`  →  `penaCumpridaPermissivos = totalCumprido − penaCumpridaImpeditivos`
>
> `card 8 = card 2 − card 5`  →  `remanescenteImpeditivo = totalImpeditivo − penaCumpridaImpeditivos`
>
> `card 9 = card 7 − card 8`  →  `remanescentePermissivo = remanescente − remanescenteImpeditivo`

O **card 8 usa o impeditivo CHEIO (card 2) como base**, e não os 2/3 dele: quem é limitado pelos
2/3 é o subtraendo (card 5). Usar a fração como base daria 0 no cenário do relato (6 − 6) em vez
de 3 — é o erro natural de leitura do nome do card, e há teste para ele.

🔴 **O card 9 parece o card 4 e não é.** No cenário do relato os dois mostram **8 anos**, por
coincidência aritmética. Divergem assim que a pena impeditiva é pequena: com 3 anos de impeditivo
e 5 cumpridos, o card 4 mostra 5 e o card 9 mostra 7; sem nada cumprido, 0 e 10. Quem
"simplificar" o card 9 para `totalCumprido` acerta no cenário de hoje e erra em todos os outros —
há um teste que fixa os três casos justamente para isso.

Desenvolvendo a expressão, o card 9 **equivale** a `card 3 − card 6` (a mesma regra dita de dois
jeitos). As duas leituras coincidem, e há teste conferindo as duas em três cenários — mas a
forma que está no motor é a pedida (card 7 − card 8).

Essas igualdades têm teste (`resumo.spec.ts`), inclusive com valor quebrado em dias, e o
card 6 tem teste de **não ficar negativo** (com pena impeditiva que ultrapassa o cumprido, o
card 6 zera em vez de virar número negativo — que iria para petição).

🔴 **A diferença entre cards é sensível à ordem de cálculo:** se a fórmula do card 5 mudar,
**o card 6 muda junto sem que ninguém o tenha tocado.** Ao mexer em `penaCumpridaImpeditivos`,
confira o card 6.

⚠️ **Os dois primeiros são os únicos que somam entre si.** O card 3 tem "permissiva" no nome e
card 5 fala de impeditivo, mas eles não se relacionam: o card 5 é do **cumprido**, não do
imposto. Não tire conclusão de semelhança de nome — só do campo de origem na tabela.

🔴 **Não confunda o card 2 com o card 5.** Os nomes se parecem e as grandezas não:

- card 2 = o impeditivo **IMPOSTO** pela sentença;
- card 5 = o que já foi **CUMPRIDO** e conta contra os impeditivos, **limitado aos 2/3
deles** — com 9 anos impeditivos, o teto do card 5 são 6 anos.

Os dois são plausíveis e diferentes no mesmo cenário (foi o que aconteceu: com 19 anos
impostos dos quais 9 impeditivos e 8 cumpridos, o card 2 mostra 9 e o card 5 mostra 6). Trocar
um pelo outro põe um número juridicamente errado na tela sem quebrar teste nenhum de paridade
— que compara dispositivo a dispositivo e não olha o resumo por esse ângulo.

### As cinco frações saíram do resumo
As cinco frações de referência — `2/3 dos impeditivos`, `1/5`, `1/4`, `1/3`, `1/2 da pena não
impeditiva` — saíram da tela.

🔴 **As frações continuam sendo CALCULADAS pelo motor** (`resultado.resumo.fracoes`), e continuam nos
testes. Não as remova para "limpar": a régua de **1/5** é a que o Art. 13 exige (é a comparação que o
§5 descreve) e o **2/3 dos impeditivos** é requisito de outros dispositivos. Apagá-las do motor
quebraria teste e petição sem mudar nada na tela. Para voltar a exibi-las, bastam cinco linhas no JSX.

## Como verificar sem banco

A calculadora exige login (o `src/proxy.ts` redireciona para `/entrar`) e o ambiente de
desenvolvimento não tem Supabase. O caminho que funciona é renderizar o componente direto:

```ts
// tests/tmp-prova.spec.ts — temporário, apagar depois
import { it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import Questionario from '@/app/(app)/ferramentas/[calculadora]/Questionario'
import { motorPadrao } from '@/lib/indulto-comutacao/registro'

it('gera o html', () => {
  const motor = motorPadrao()
  const html = renderToStaticMarkup(
    createElement(Questionario, { secoes: motor.questionario, entrada: {}, aoMudar: () => {} }),
  )
  writeFileSync('/tmp/quest.html', html)
})
```

Duas armadilhas, as duas já sentidas aqui:

- **`include` do Vitest é `tests/**/*.spec.ts`.** Um arquivo `.tsx` no `tests/` **não é coletado**,
  e o Vitest sai com "No test files found" **e código 0** — parece que passou. Use `.spec.ts` e
  `createElement`, ou amplie o `include`.
- **Leia o DOM, não o PNG.** Servindo o HTML por `python3 -m http.server`, as capturas saíram de
  uma versão em cache e mostraram todas as seções **abertas**, enquanto o DOM tinha 11 fechadas.
  A consulta que decide é esta, e ela é barata:

  ```bash
  node <skill>/browser.mjs "http://localhost:8899/p.html?v=$(date +%s%N)" \
    --eval "JSON.stringify({e:[...document.querySelectorAll('[aria-expanded]')].map(b=>b.getAttribute('aria-expanded')),r:document.querySelectorAll('[role=region]').length,i:document.querySelectorAll('input').length})"
  ```

  Resultado esperado no questionário de 2025: `["true", 11×"false"]`, 1 região, 3 inputs.

## Estado

`pnpm run test` → 60 arquivos, 1657 testes passando, 4 pulados (os desvios do Art. 13
documentados). `npx tsc --noEmit` limpo. Nada disto foi testado **logado** — o
`pendencias-e-roteiro-de-teste.md` continua sendo o roteiro do que falta.
