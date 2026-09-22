# Task 2 Report
## Status: DONE_WITH_CONCERNS
## Implementation
- [x] motor.ts created (calcular function, all 12 cases)
- [x] comparar.ts created (mesmoResultado function)
- [x] motor.spec.ts created (12 acceptance tests + 3 edge-case tests from §12)
- [x] comparar.spec.ts created (3 comparison tests)

## Tests
Command: `pnpm vitest run tests/detracao/recolhimento-noturno/motor.spec.ts tests/detracao/recolhimento-noturno/comparar.spec.ts`

Output:
```
 RUN  v4.1.10 /private/tmp/detracao-impl

 Test Files  2 passed (2)
      Tests  18 passed (18)
   Start at  11:43:27
   Duration  105ms (transform 49ms, setup 0ms, import 63ms, tests 7ms, environment 0ms)
```

All 15 motor tests (T01–T12 + 3 edge cases from §12) and all 3 comparar tests pass (18/18 total).

`pnpm exec tsc --noEmit` was also run; no type errors attributable to the new files.

## Commits
```
c4c156f feat(detracao): motor de cálculo do recolhimento noturno (T01-T12) e comparação de resultado
e74818c feat(catalogo): familia de produto e novo produto detracao-recolhimento-noturno
05b8478 feat(detracao): migration da tabela detracao_calculos
448a372 feat(detracao): tipos e helpers de intervalo do motor de recolhimento noturno
5155a75 docs(detracao): plano de implementação da calculadora de recolhimento noturno
```
(4 files changed, 474 insertions(+): motor.ts, comparar.ts, motor.spec.ts, comparar.spec.ts)

## Self-Review
- `motor.ts` and `comparar.ts` were copied verbatim from plan §Task 2 Steps 1 and 4 — no changes.
- `motor.spec.ts` was copied verbatim from plan §Task 2 Step 2, covering all T01–T12 plus the 3 boundary tests from §12 (ambiguous 00:00–00:00 rejection, integer-only output, empty-segmento rejection). All pass unmodified.
- `comparar.spec.ts` required one deviation from the verbatim plan text: the second test ("é true mesmo com as chaves do objeto em outra ordem") contains a line `JSON.parse(JSON.stringify(r).split('').reverse().join(''))` that the plan's own adjacent comment already flags as broken ("A rodada acima quebraria como JSON" — "the round above would break as JSON"). Reversing a JSON string does not, in general, produce valid JSON, so `JSON.parse` throws a `SyntaxError` and crashes the test before it reaches the real assertion (the `outraOrdem`-based check that actually exercises key-order independence).
  - Fix applied: wrapped that line in try/catch (swallowing the expected parse error into `reordenado = undefined`), and changed the trailing "keep the variable used" line from `expect(reordenado).toBeDefined()` (which would now fail since `reordenado` is `undefined`) to `void reordenado`. This preserves the plan's intent (the line is dead/decorative per its own comment) without asserting anything false.
  - This is a pre-existing bug in the plan document itself, not something introduced during implementation. Flagging it here since the task instructions required verbatim copying, and I want this documented explicitly for review.
- No other deviations from the plan.
