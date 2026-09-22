# Task 6 Report — Camada de dados (leitura, validação, server actions)

## Status: complete

## Files created (verbatim from plan Task 6)

- `src/app/(app)/ferramentas/detracao/[calculadora]/calculos.ts`
  - `type CalculoSalvo`, `type CalculoResumo`
  - `listarCalculos(calculoTipo: string): Promise<CalculoResumo[]>`
  - `lerCalculo(id: string): Promise<CalculoSalvo | null>`
  - Reads via `criarClienteServidor()` (RLS-filtered), scoped to `resolverWorkspaceAtivo()`.

- `src/app/(app)/ferramentas/detracao/[calculadora]/preparar.ts`
  - Zod schema `Dados` (titulo + entrada: timezone, segmentos, observacoes, monitoramentoEletronico)
  - `preparar(bruto: unknown): { erro } | { titulo, entrada, resultado }`
  - Recalculates via `calcular()` from the engine inside a try/catch — never trusts client-supplied `resultado`, never throws.

- `src/app/(app)/ferramentas/detracao/[calculadora]/acoes.ts`
  - `'use server'` module with `salvarCalculo`, `atualizarCalculo`, `excluirCalculo`
  - Each: `exigirEngineLiberado()` → session/workspace context → `preparar()` validation → `exigirEscrita(PRODUTO_ID)` gate → write via `admin()` (service-role, bypasses RLS)
  - Constants: `TABELA = 'detracao_calculos'`, `CALCULO_TIPO = 'recolhimento-noturno'`, `PRODUTO_ID = 'detracao-recolhimento-noturno'`, `SLUG = 'recolhimento-noturno'`

## Dependencies verified present before writing

- `EntradaCalculo`, `ResultadoCalculo`, `ALGORITMO_VERSAO` — `src/lib/detracao/recolhimento-noturno/tipos.ts`
- `calcular` — `src/lib/detracao/recolhimento-noturno/motor.ts`
- `caminhoDoProduto`, `ProdutoId` (includes `'detracao-recolhimento-noturno'`) — `src/lib/produtos/catalogo.ts`
- `exigirEscrita` — `src/server/vendas/acesso.ts`
- `exigirSessao` — `src/server/auth/sessao.ts`
- `resolverWorkspaceAtivo` — `src/server/auth/workspace-ativo.ts`
- `admin`, `criarClienteServidor` — `src/server/supabase.ts`, `src/server/supabase-session.ts`
- `exigirEngineLiberado` — `src/server/license/exigir.ts`
- `codigoDeBanco`, `fraseDeBanco` — `src/lib/erro-de-banco.ts`
- `detalheSeguro` — `src/lib/sanitizar-erro.ts`

All signatures matched the plan's usage exactly; no adaptation was needed.

## Type checking

`pnpm exec tsc --noEmit` — zero errors, zero output (clean pass across the whole project).

## Testing

No runtime tests written for this task, per plan: database calls require a live Supabase instance. `preparar()` is pure and testable, but writing its test suite belongs to a later/adjacent task per the plan's own Step 4 note ("a suíte só valida tipos e o `preparar` puro" — no separate test task was scoped here).

## Commit

See git log for SHA — commit message: `feat(detracao): leitura, validação e server actions dos cálculos salvos`
