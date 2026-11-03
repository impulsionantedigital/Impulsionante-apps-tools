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
2. Se um curso pode ser degustação (brinde de oferta filha). O comprador do curso ganha
   acesso pelo período, então tecnicamente pode.
3. O que fazer com os §8.4 e §8.5 da spec (`produto_id` mutável e ids compartilhados): com UUID,
   ambos desaparecem.

## Próximos passos (ordem da §9 da spec, ajustada)

1. Guardas: teste de número de migration duplicado (§8.2).
2. Decisão acima, e ligação de cursos com vendas.
3. Filtro por projeto (§4): `PROJETO`, `projetos` no catálogo, e o item "Cursos" do menu só no
   Trilhas de Aruanda.
4. Verificação ao vivo de cursos (§8.3) no banco do Aruanda.
