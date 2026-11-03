# Unificação com o trilhasdearuanda-app — estado

Este repositório (`impulsionantedigital/Impulsionante-apps-tools`) é o **repositório único** de
GPS da Pena e Trilhas de Aruanda, como decidido na spec
[`specs/2026-09-22-repo-unico-e-filtro-por-projeto-design.md`](specs/2026-09-22-repo-unico-e-filtro-por-projeto-design.md).

## O que entrou (merge de `trilhasdearuanda-app/main`, 2026-11-03)

- As três specs e o plano: cursos e aulas (2026-09-14) e repositório único/filtro por projeto (2026-09-22).
- O código de cursos: `src/app/(app)/cursos/**`, `src/server/cursos/acoes.ts`, `src/lib/cursos/*`,
  `tests/cursos/*`, item "Cursos" no `Rail.tsx`.
- A migration de cursos, **renumerada de `0071` para `0075`**: aqui a `0071` já era
  `0071_produtos_da_oferta.sql`. Seguro porque a de cursos nunca foi aplicada em banco nenhum.

## 🔴 O que NÃO entrou: a ligação de cursos com vendas

Nos três arquivos de vendas que deram conflito (`src/server/vendas/processar.ts`,
`src/app/(app)/config/acoes-comercial.ts`, `src/app/(app)/config/ComercialCard.tsx`) ficou a versão
do GPS da Pena, que é a que roda em produção.

O motivo: depois da separação, os dois lados resolveram "produto que é dado, não código" de jeitos
incompatíveis.

| | GPS (este repo) | Aruanda |
|---|---|---|
| Mecanismo | `produtos_externos` (UUID) + `ehIdDeProdutoAceito` + `rotulosDosProdutos` | `cursos.produto_id` (texto livre) + `idsDeProdutoValidos` |
| O CRM entrega o acesso? | **Não**: externo não tem degustação nem é concedido | **Sim**: curso tem período e RLS por compra |
| Filtro em `processar.ts` | **Nenhum** (externo também ganha período) | Filtra por `idsDeProdutoValidos` |

Curso é um **terceiro tipo**: dado (como externo), mas entregue pelo CRM (como interno). Hoje, uma
oferta com curso é **recusada ao salvar** (`ehIdDeProdutoAceito` não conhece `cursos.produto_id`), então
nenhum curso pode ser vendido ainda, e isso não gera falha silenciosa. `src/server/produtos/vendaveis.ts`
veio no merge, mas ninguém o chama.

### Decisão a tomar antes de ligar cursos a vendas

1. Como o id de curso se distingue (UUID como externo? prefixo `curso:`?), e onde
   `ehIdDeProdutoAceito`, `ehDegustacaoValida` e `rotulosDosProdutos` passam a reconhecê-lo.
2. ~~Se um curso pode ser degustação (brinde de oferta filha).~~ **Decidido em 2026-11-03: pode.**
   `ehDegustacaoValida` precisa passar a aceitar curso.
3. O que fazer com os §8.4 e §8.5 da spec (`produto_id` mutável e ids compartilhados): com UUID,
   ambos desaparecem.

## Filtro por projeto — FEITO (2026-11-03)

`PROJETO=gpsdapena` ou `PROJETO=trilhasdearuanda`, obrigatória (o preflight recusa o boot sem ela).
Diferenças em relação à §4 da spec:

- **`produtosDoProjeto()` é função, não a constante `PRODUTOS`.** O `next build` carrega os módulos
  de servidor, e a imagem é construída sem `PROJETO`: a constante calculada no import derrubaria o
  build. `CATALOGO` é a lista inteira (para teste de contrato e para rótulo de histórico).
- **Gate de rota num `layout.tsx`** em `ferramentas/[calculadora]` e `ferramentas/detracao/[calculadora]`.
  As páginas de detração não conferiam o catálogo e abririam no outro projeto.
- **Coisas do GPS que não eram produto, também presas ao projeto:** o aviso do clube Hotmart e o
  subtítulo da vitrine, e a logo fixa da sidebar (`public/marca/*.png`). Nos outros projetos, a
  sidebar usa a logo da Marca do banco.
- **Item "Cursos" do menu só no `trilhasdearuanda`.**
- Hoje nenhum produto em código é do Trilhas de Aruanda: lá, a vitrine mostra um estado vazio.

## Próximos passos (ordem da §9 da spec, ajustada)

1. Guardas: teste de número de migration duplicado (§8.2).
2. Decisão acima, e ligação de cursos com vendas.
3. Verificação ao vivo de cursos (§8.3) no banco do Aruanda.
