# validacao/

A prova de que o motor de cálculo da calculadora de indulto e comutação calcula o que a
**planilha original** calcula. A planilha é a fonte de verdade jurídica do produto, e os números
do motor vão para petições judiciais.

```
validacao/
├── oraculo.py            avalia a planilha e congela o resultado (este harness)
├── requirements.txt      formulas[excel]==1.3.4
└── 2025/
    ├── planilha.xlsx     a planilha original do Decreto 12.970/2025 — NÃO EDITAR
    ├── cenarios.json     as entradas: 15 da POC + 6 posicionados
    ├── esperado.json     GERADO pelo oraculo.py — NÃO EDITAR À MÃO
    ├── engine.js         a POC em JS de onde o motor foi portado
    ├── validate-original.py, run_engine.js, ui.js   o harness e a tela da POC, como vieram
```

## Por que existe

Há duas camadas de prova, e cada uma pega um tipo de erro que a outra não pega:

| Teste | Compara | Pega |
|---|---|---|
| `tests/indulto-comutacao/paridade-*.spec.ts` | motor × `engine.js` | erro de **porte** (JS → TS) |
| `tests/indulto-comutacao/motor-2025.spec.ts` | motor × **planilha** | erro que o `engine.js` já tinha ao transcrever a planilha |

A paridade sozinha não basta: se o `engine.js` transcreveu uma fórmula errado, o motor herdou o
erro fielmente e a paridade passa. **Só a planilha pega isso.**

A planilha é avaliada pela lib Python [`formulas`](https://pypi.org/project/formulas/), que
interpreta o `.xlsx` sem Excel nem LibreOffice. É um segundo implementador, que não conhece o
motor. Por isso a comparação vale como evidência, e não como repetição.

O `oraculo.py` **não compara nada**. Ele avalia a planilha para cada cenário e grava a saída em
`2025/esperado.json`. Quem compara é o `motor-2025.spec.ts`, que lê esse congelado e roda em
Vitest **sem Python e sem planilha**, dentro do `pnpm test` normal.

## Como rodar

Da raiz do repositório, com Python 3.9 (verificado em 3.9.6):

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r validacao/requirements.txt
python validacao/oraculo.py 2025      # ~25 s; ~16 s são para montar o modelo
pnpm exec vitest run tests/indulto-comutacao/motor-2025.spec.ts
```

O extra `[excel]` é obrigatório. Sem ele, a `formulas` instala e importa normalmente, e só quebra
ao abrir o `.xlsx`, com `ModuleNotFoundError: openpyxl`. `.venv/` e `__pycache__/` estão no
`.gitignore`.

## Quando rodar

O `oraculo.py` **não** roda a cada commit. O `esperado.json` congelado já está no `pnpm test`.
Rode o oráculo de novo quando:

- **acrescentar ou mudar um cenário** em `cenarios.json`. O teste
  "o congelado está em dia com cenarios.json" reprova até você rodar;
- **chegar uma planilha nova ou corrigida** dos autores do método. O `esperado.json` guarda o
  sha256 da planilha, e o teste "o congelado é da planilha que está na árvore" reprova até você
  rodar;
- **surgir um motor novo** (decreto de outro ano). Nesse caso a planilha nova traz células novas,
  e o `build_inputs`/`OUT_MAP` do `oraculo.py` precisa de revisão, porque não serve para outro ano.

## Divergências conhecidas (e tratadas no teste, com comentário)

Duas são **bugs de fórmula da planilha**, que o motor corrige de propósito:

- **L145:L149**: sem requisito, `G14x` vira o texto `"SEM COMUTAÇÃO"` e `L14x = P9 - G14x` dá
  `#VALUE!`. A aba Resultado cobre o erro com `"Sem Comutação"`; o motor devolve `null`.
- **G149**: o quantum do §4º do Art. 13 é condicionado a `F148` (o Art. 13) em vez de `F149`
  (o próprio §4º). O erro tem dois lados, e o teste trata os dois:
  1. Art. 13 preenche e §4º não: a planilha **mostra** um quantum de 2/3 indevido. O motor não mostra.
  2. §4º preenche e Art. 13 não: a planilha **esconde** o quantum devido. O motor mostra, e o
     teste confere o valor contra a fórmula do G149 com `F148→F149`, aplicada às bases que a
     planilha avaliou (`Cálculo!P6…P17`). Este lado é **consequência** do `<` estrito do Art. 13
     (ver abaixo): F148 e F149 só divergem assim quando a pena cumprida é exatamente a fração.

Outra é **provável erro da planilha, preservado** (não corrigido, porque a decisão é jurídica):

- **`Cálculo!H138`, Art. 13**: exige pena cumprida **maior** que 1/5 (1/4 se reincidente), com `<`
  estrito. Todos os demais dispositivos comparam com `<=`, inclusive o §4º do mesmo artigo
  (`H141`) e os incisos do Art. 11 (`L129`, `L132`, `L135`). O texto do dispositivo
  (`Cálculo!C138`) fala em "tenham cumprido […] um quinto da pena", o que inclui o cumprimento
  exato. Efeito: quem cumpriu **exatamente** a fração tem a comutação do Art. 13 negada. O motor é
  fiel à planilha, e o ponto é exibido ao advogado em "Pontos a validar juridicamente". O cenário
  posicionado 4 fica nessa fronteira: ele prova que o motor reproduz a planilha, **não** que o
  `<` está certo.

A outra é **arredondamento**. Quantum e pena após saem da planilha como texto
(`"X anos Y meses Z dias"`, com `ROUNDDOWN`/`ROUND`), e o teste compara em dias com
**tolerância de 1 dia**. Não aumente essa tolerância: 2 dias já é regra diferente.

## O que NÃO fazer

- **Não edite a planilha para um teste passar.** Ela é o que está sendo usado como verdade.
- **Não "conserte" o `esperado.json` à mão.** Ele é saída de máquina. Editá-lo apaga a única
  evidência independente que o motor tem.
- **Não resolva ambiguidade jurídica sozinho.** Se a planilha divergir do motor por algo que não é
  porte, nem um dos bugs acima, nem erro do harness (célula, prefixo, tipo), é **bug novo da
  planilha**. Pare e leve ao dono do produto. Corrigir a planilha é decisão dos autores do método.
  As ambiguidades já conhecidas (o teto dobrado do Inciso VIII, o `<` estrito do Art. 13, a base da
  comutação, a base da pena após) são preservadas no motor e sinalizadas na tela.
- **Não contorne uma fórmula que a `formulas` não entende.** Anote-a, reduza o cenário e trate como
  achado: é exatamente ali que o porte pode estar errado.

## Fora da imagem Docker

`validacao/` está no `.dockerignore`. Nada daqui vai para produção: nem a planilha, nem o Python,
nem o `engine.js`. O que roda no produto é só o motor em `src/lib/indulto-comutacao/`.
