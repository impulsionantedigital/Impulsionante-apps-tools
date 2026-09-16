# Plano de correções — GPS da Pena (calculadoras de indulto/comutação e detração)

Consolidação das correções levantadas em conversa. Cada item traz: o que muda, onde, e o
risco/pendência. Ao final, a ordem de execução sugerida e os pontos em aberto.

> ⚠️ **Regra de ouro do repositório:** por padrão só se edita `custom/`. **MAS** todos os itens
> abaixo vivem dentro de `src/` (motores de decreto, questionário, cálculo, petição, sidebar).
> Isso significa que **este repositório é o CORE da Awave** (tem suíte de testes e docs internas
> — sinais descritos no AGENTS.md), e editar `src/` é exatamente o trabalho esperado aqui. Se
> este for, ao contrário, a cópia do comprador, então **este plano inteiro não se aplica** e as
> mudanças precisam passar para `custom/` ou para o time do core.

---

## Contexto técnico (o que já apurei)

- **Motor por decreto**: `src/lib/indulto-comutacao/motores/2024/` e `2025/`, cada um com
  `motor.ts` (cálculo), `questionario.ts` (perguntas) e `peticoes.ts` (texto da petição).
- **Questionário é renderizado direto do motor**: `Questionario.tsx` desenha `campo.rotulo`,
  `secao.aviso` e `campo.opcoes` **sem transformação**. Portanto, **a tela sempre reflete o
  `questionario.ts`**.
- **Anexo/petição**: `anexo-texto.ts` → `formatarAnexoTexto()` monta o bloco "RESPOSTAS
  INFORMADAS" (todas as respostas via `todasAsRespostas`) + INDULTO + COMUTAÇÃO.
- **Impressão**: `resultado.module.css` reescreve os tokens para preto/branco em `@media print`.
  O bloco só-do-papel é o `CabecalhoAnexo.tsx` (hoje **sem logo**).
- **Sidebar**: `Rail.tsx` usa `MarcaLockup`, que renderiza **uma** `<img src={marca.logo}>` (a
  logo configurada em Configurações → Servidor → Marca). Tema chega via `data-tema="claro"` no
  `<html>` (`layout.tsx`), derivado de `temaDaRequisicao()`.

---

## Itens de correção

### #1 — Ocultar o card da calculadora 2024 e 2025
- **O que**: remover da página `/ferramentas` os cards "GPS CIC - Calculadora 2024" e "…2025".
- **Onde**: `src/app/(app)/ferramentas/page.tsx` (renderiza `visiveis.map(...)` a partir de
  `PRODUTOS`), e `src/lib/produtos/catalogo.ts` (fonte da lista).
- **Como**: filtrar os dois produtos de `familia: 'indulto-comutacao'` da vitrine de
  `/ferramentas` (mantendo-os no menu lateral do `Rail`, que tem sua própria montagem), **ou**
  remover os cards conforme a intenção exata. **PENDENTE**: confirmar se é para sumir só da
  vitrine de Ferramentas ou também do menu lateral.
- **Risco**: baixo. Cuidado para não quebrar o gate de acesso (`estadoDoProduto`).

### #2 + #9 — Reorganizar campos entre blocos (2024 e 2025)
- **O que**: mover `regime`, `livramentoCondicional` e `dataUltimaPrisao` do bloco
  "Perfil do sentenciado" para o bloco "Regime, tempo e situação prisional", **com o
  `livramentoCondicional` logo após o `regime`**.
- **Onde**: `motores/2025/questionario.ts` e `motores/2024/questionario.ts` (mover as entradas
  de campo entre as seções `perfil` e `regime-situacao`).
- **A confirmar**: se os **três** migram, ou só o `livramentoCondicional` e a `dataUltimaPrisao`.
- **Risco**: médio — **ordem das chaves** é verificada por testes (`questionario-2024.spec.ts`,
  docs de contrato citam a ordem exata por seção). Atualizar os testes junto.

### #3 — Nota de privacidade: fora da impressão, virar nota de rodapé do papel
- **O que**: hoje o `<p class="notaPrivacidade">` ("O cálculo fica guardado na sua conta…")
  aparece na tela **e** na impressão. Deve sair da impressão e virar **nota de rodapé** do
  papel.
- **Onde**: `ferramentas/[calculadora]/novo/page.tsx` (e o gêmeo
  `ferramentas/detracao/[calculadora]/novo/page.tsx`), + `calculadora.module.css`.
- **Como**: (a) `@media print { .notaPrivacidade { display: none }`; (b) adicionar uma nota de
  rodapé no anexo (provável `CabecalhoAnexo.tsx` ou `Resultado.tsx`), visível só no papel, com o
  texto de retenção.
- **Risco**: baixo.

### #4 — Sidebar: logo por tema (escura no claro, clara no escuro)
- **O que**: no modo **escuro** usar `temp/logo-branco.png`; no modo **claro** usar
  `temp/logo-preto.png` (a imagem confirmada, "GPS DA PENA", traço preto).
- **Onde**: `src/components/shell/Rail.tsx` + `MarcaLockup.tsx` + `Rail.module.css`.
- **Como (recomendado)**: as imagens são **assets do app** (não da Marca configurável), então:
  1. copiar `temp/logo-preto.png` e `temp/logo-branco.png` para `public/` (ex.: `public/marca/`);
  2. renderizar as duas `<img>` no lockup do rail, uma com classe `.logoClaro` e outra
     `.logoEscuro`;
  3. CSS: `.logoEscuro { display: none }` e `:root[data-tema="claro"] .logoEscuro { display: block }`
     (+ esconder a clara no claro). **Fora** de módulo CSS que "não sabe o tema" — usar o
     atributo `data-tema` no `:root`, como o `globals.css` já usa.
- **Conflito a resolver**: a logo do rail hoje vem da **Marca configurável** (Configurações →
  Servidor → Marca, regra 8 do AGENTS). Substituir por asset fixo **ignora** a marca do
  comprador. **DECISÃO NECESSÁRIA**: (a) fixar as logos GPS (perde a marca configurável), ou
  (b) adicionar campos "logo clara"/"logo escura" na tela de Marca e escolher por tema
  (preserva a marca). A opção (b) é mais consistente com o produto.
- **Risco**: médio — mexer em marca/tema toca o `globals.css` e o layout raiz.

### #5 — Petição: usar a íntegra do texto do decreto, não o resumo
- **O que**: onde a petição hoje cita o dispositivo de forma resumida (`enquadramento.descricao`
  / texto genérico), trazer a **íntegra do texto do decreto** do dispositivo aplicável.
- **Onde**: `motores/*/peticoes.ts` (seções 1 e 3) e possivelmente um novo campo em
  `MetaInciso` (tipos.ts) com o texto integral do artigo.
- **PENDENTE**: confirmar que é isso (a íntegra do artigo aplicável) e se **substitui** o resumo
  ou entra **além** dele. Precisa de uma fonte do texto integral por inciso (provavelmente novo
  dado em `motores/*/incisos`).
- **Risco**: alto — é texto que vai assinado ao juízo; cada inciso precisa do texto correto.

### #6 — Petição: enxugar "Respostas informadas"
- **O que**: parar a lista de respostas antes das entradas de cálculo (não listar todas as ~50).
- **Onde**: `anexo-texto.ts` (`formatarAnexoTexto` → bloco "RESPOSTAS INFORMADAS") e/ou
  `respostas-anexo.ts`.
- **PENDENTE**: definir **até qual campo** vai (ex.: parar em "Unidade prisional", antes de
  "Penas impostas"). Sugestão: manter só a seção `identificacao` + o essencial.
- **Risco**: médio — `todasAsRespostas` é compartilhado com o anexo impresso
  (`CabecalhoAnexo.tsx`). Se o corte for só na petição, criar variante separada; se for nos dois,
  ajustar o anexo também.

### #7 — Petição de comutação: informar o quantum comutado
- **O que**: o corpo da petição de comutação deve dizer **quanto** será comutado (quantum /
  pena após), não só que o requisito foi preenchido.
- **Onde**: `motores/*/peticoes.ts` — `gerarPeticaoComutacao*`, seções 5/6.
- **Dados já existem**: `ResultadoInciso.quantum` e `.penaApos`. No 2025 `montaComut` já calcula
  os dois; no **2024 `penaApos` é sempre `null`** (a planilha 2024 não calcula pena após) — a
  petição tem que tratar a ausência (mostrar só o quantum, ou "(não calculado nesta versão)").
- **Risco**: médio — número que vai para petição; conferir o formato (`fmtDias`).

### #8 — Aviso "Penas impostas (2025)" truncado ⚠️ origem duvidosa
- **O que**: o print mostra "Impeditivo = hediondo/equiparado." cortado, sem o
  "+ crimes previstos no Art. 1º".
- **ACHADO**: o texto-fonte em `questionario.ts:31` (2025) **já está completo**. A tela renderiza
  o texto cru (`Questionario.tsx`), sem corte. O texto truncado bate com a **POC de validação**
  (`validacao/2025/ui.js:15`), não com o app.
- **Conclusão**: provavelmente **não é bug do app atual** — veio da POC/protótipo. **Reconfirmar**
  em qual tela você viu. Se for o app, a causa pode ser quebra de layout (CSS) — mas o texto está
  correto na fonte.

### #13 + #14 — Rótulos de `penasSubstituidas` e `crimePatrimonio` ⚠️ mesma origem
- **#14**: `crimePatrimonio` deve exibir "Todos os crimes são contra o patrimônio sem violência
  ou grave ameaça?" — **já é esse o texto** em `questionario.ts:215` (2025). Vale p/ 2024 e 2025
  (alinhar a redação no 2024, que hoje diz "Tem crime contra o patrimônio cometido sem…").
- **#13**: frase de `penasSubstituidas` — **PENDENTE de identificação** (você mesmo disse que não
  lembra de onde veio). O texto que apareceu na tela ("Alguma pena substituída por restritiva de
  direito ou com sursis?") existe em `validacao/2025/ui.js:72` — de novo, **POC**, não app.
- **Ação**: (1) confirmar em qual tela isso aparece; (2) se for o app, já está correto — nada a
  fazer; (3) se for a POC, decidir se a POC precisa ser atualizada. **Alinhar 2024 e 2025** para
  a mesma redação onde você confirmou (#14).

### #10 — Inciso XI (Art. 9º): `tempoSemiaberto` OR `tempoSemiabertoAberto`
- **O que**: o inciso só considera a 2ª pergunta (`tempoSemiabertoAberto`). Deve aceitar
  **qualquer uma** das duas (quem cumpriu o requisito só em semiaberto também preenche).
- **Onde**:
  - **2025**: `motor.ts:377-385` — **JÁ CORRIGIDO** (usa `|| I30`), com comentário do bug.
  - **2024**: `motor.ts:437` (`M`) e `motor.ts:442` (`S`) — **AINDA como a planilha** (só `I30`).
    **Corrigir** para `… || I28 >= …`, espelhando o 2025, no `geral` **e** no `especial`.
- **Risco**: médio — altera resultado; há testes de fronteira (`paridade-fronteiras.spec.ts`
  cobre `tempoSemiaberto`/`tempoSemiabertoAberto`). Atualizar/rodar a suíte.

### #11 — Art. 13: `<` → `<=` (aceitar a fração exata)
- **O que**: o Art. 13 exige cumprimento **maior** que a fração (`<` estrito). Deve aceitar
  **exatamente** a fração (`<=`), como todos os outros dispositivos (inclusive o §4º do mesmo
  artigo).
- **Onde**: `motores/2025/motor.ts:505` e `motores/2024/motor.ts:635`.
- **Também**: revisar o aviso "Pontos a validar juridicamente" que hoje documenta esse `<` como
  ambigüidade preservada (2025: `motor.ts:558-561`; 2024 equivalente).
- **Risco**: **alto** — muda o "oráculo" da planilha; citado em docs/planos antigos como decisão
  consciente. Atualizar testes de paridade/esperado e o comentário de ambiguidade.

### #12 — Inciso VIII §2º: dobrar o teto — ✅ VALIDADO (não mexer)
- **Validado por você**: dobrar (×2) o teto da pena remanescente está **correto** (reduzir à
  metade prejudicaria o perfil vulnerável). Código já faz isso (2024 `motor.ts:386-388`; 2025
  `motor.ts:334-343`). **Nenhuma alteração.**

---

## Pontos em aberto (preciso da sua decisão antes de começar)

1. **#1**: esconder os cards só da vitrine `/ferramentas`, ou também do menu lateral?
2. **#2/#9**: quais campos exatamente migram (os três? só livramento + data?) e o `regime` fica
   onde?
3. **#4**: fixar as logos GPS como asset **ou** adicionar campos "logo clara/escura" na tela de
   Marca?
4. **#5**: a "íntegra do decreto" **substitui** o resumo ou entra além? Tem a fonte dos textos?
5. **#6**: até qual campo vai a lista de respostas na petição?
6. **#8/#13/#14**: em qual **tela** você viu os textos divergentes? (app vs POC `validacao/`)
7. **#14**: alinhar 2024 e 2025 para a mesma redação de `crimePatrimonio`?
8. **#11**: confirmar explicitamente que podemos trocar o `<` por `<=` e revisar o aviso (é uma
   mudança de resultado jurídico).

---

## Ordem de execução sugerida (menor risco → maior)

1. **#1** (vitrine) — isolado, baixo risco.
2. **#3** (nota de privacidade/rodapé) — isolado.
3. **#2/#9** (campos entre blocos) — + atualizar testes de ordem do questionário.
4. **#14** (rótulos alinhados) — baixo risco.
5. **#10**, **#11** (motor) — juntos, com ajuste dos testes de paridade/oráculo.
6. **#7** (quantum na petição de comutação) — com atenção ao `null` do 2024.
7. **#6** e **#5** (petição) — maior risco (texto assinado).
8. **#4** (sidebar/tema/marca) — depende da decisão (a)/(b).
9. **#8/#13/#14 (origem)** — investigação final: confirmar app vs POC.

Depois de cada bloco: **`pnpm build`** e **`pnpm run test`** (nunca `npm`).
