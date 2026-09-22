# Task 4 Report: Catálogo de produtos — família e novo produto

## Status: DONE

All changes implemented successfully. All tests pass.

## Changes Made

### 1. catalogo.ts: Familia type added
- Added `export type Familia = 'indulto-comutacao' | 'detracao'`

### 2. catalogo.ts: PRODUTOS updated (all 3 products + familia field)
- Added `familia: 'indulto-comutacao'` to indulto-comutacao-2025 product
- Added `familia: 'indulto-comutacao'` to indulto-comutacao-2024 product
- Added new product:
  ```ts
  {
    id: 'detracao-recolhimento-noturno',
    slug: 'recolhimento-noturno',
    familia: 'detracao',
    rotulo: 'Detração por Recolhimento Noturno — Tema Repetitivo 1.155/STJ',
    menuTitulo: 'GPS Detração - Recolhimento Noturno',
    menuDescricao: 'Tema 1.155/STJ',
  }
  ```

### 3. catalogo.ts: caminhoDoProduto updated for familia prefixes
- Updated `caminhoDoProduto(slug)` function to:
  - Return `/ferramentas/detracao/${slug}` for detracao family products
  - Return `/ferramentas/${slug}` for indulto-comutacao family products (unchanged)
  - Use `produtoPorSlug` to determine family and apply prefix accordingly

### 4. catalogo.spec.ts: Tests updated
- Replaced test "'todo produto do catálogo tem motor no registro'" with "'todo produto de indulto-comutacao tem motor no registro'" that only checks indulto-comutacao products
- Added test "'monta o caminho de produto de detração com o prefixo da família'" — verifies detracao paths use family prefix
- Added test "'não muda o caminho de produtos de indulto-comutacao já publicados'" — verifies backward compatibility for existing products

### 5. vendas/catalogo.spec.ts: Test updated
- Updated "'todo produto é um motor do REGISTRO, e todo motor é vendável'" to "'todo produto de indulto-comutacao é um motor do REGISTRO, e todo motor é vendável'" to only check indulto-comutacao products

## Tests

### Command: pnpm vitest run tests/produtos/catalogo.spec.ts tests/vendas/catalogo.spec.ts

**Output:**
```
RUN  v4.1.10 /private/tmp/detracao-impl


 Test Files  2 passed (2)
      Tests  14 passed (14)
   Start at  11:41:43
   Duration  148ms (transform 122ms, setup 0ms, import 150ms, tests 4ms, environment 0ms)
```

### Command: pnpm vitest run tests/indulto-comutacao

**Output:**
```
RUN  v4.1.10 /private/tmp/detracao-impl


 Test Files  23 passed (23)
      Tests  1411 passed (1411)
   Start at  11:41:30
   Duration  1.09s (transform 1.48s, setup 0ms, import 2.65s, tests 1.06s, environment 1ms)
```

All 1,425 tests pass across both test suites. No regressions detected in existing indulto-comutacao tests.

## Files Modified

- `src/lib/produtos/catalogo.ts` — +30 lines, -4 lines
- `tests/produtos/catalogo.spec.ts` — +13 lines, -2 lines  
- `tests/vendas/catalogo.spec.ts` — +5 lines, -2 lines

Total: 3 files modified, +48 insertions, -8 deletions

## Git Status

```
On branch detracao-recolhimento-noturno
Changes not staged for commit:
  modified:   src/lib/produtos/catalogo.ts
  modified:   tests/produtos/catalogo.spec.ts
  modified:   tests/vendas/catalogo.spec.ts
```

Ready to commit with message:
```
feat(catalogo): familia de produto e novo produto detracao-recolhimento-noturno
```

## Implementation Checklist

- [x] catalogo.ts: familia type added
- [x] catalogo.ts: PRODUTOS updated (all 3 products with familia field)
- [x] catalogo.ts: caminhoDoProduto updated for familia prefixes
- [x] catalogo.spec.ts updated (1 replaced, 2 added tests)
- [x] vendas/catalogo.spec.ts updated (test contract adapted for multiple families)
- [x] All tests passing (14 catalog tests + 1411 indulto-comutacao tests = 1425 total)
- [x] No regressions detected
