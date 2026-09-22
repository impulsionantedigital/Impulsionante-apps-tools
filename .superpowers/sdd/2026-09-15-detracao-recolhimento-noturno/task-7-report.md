# Task 7 Report: CSS do módulo + editor de intervalos

**Status:** ✅ COMPLETE

**Commit:** `9b2b53f` — feat(detracao): CSS do módulo e editor reusável de intervalos

## Deliverables

### 1. `calculadora.module.css`
- **File:** `src/app/(app)/ferramentas/detracao/[calculadora]/calculadora.module.css`
- **Lines:** 179
- **Content:** All CSS classes from the plan verbatim
- **Compliance:**
  - Uses design tokens only: `--s-*`, `--tinta-*`, `--linha-*`, `--r-*`, `--fs-*`, `--t-rapido`, `--suave`, `--acento`, `--superficie`, `--elev-1`, `--erro`, `--ok`, etc.
  - No hex colors (all via tokens)
  - Responsive layout: `max-width: 900px` media query for 2-column grid → 1-column
  - Print-aware: `@media print` hides UI controls (`barra`, `excluirWrap`, `voltar`) and shows only result
  - Includes all sections: `layout`, `pagina`, `questionario`, `secao`, `campos`, `editorLista`, `linhaIntervalo`, `painel`, `resultado`, `mensagem`, `lista`, etc.

### 2. `EditorIntervalos.tsx`
- **File:** `src/app/(app)/ferramentas/detracao/[calculadora]/EditorIntervalos.tsx`
- **Lines:** 71
- **Type:** Client component (`'use client'`)
- **Signature:** Matches plan exactly:
  ```tsx
  export default function EditorIntervalos<T extends Linha>({
    titulo: string,
    ajuda?: string,
    itens: T[],
    aoMudar: (itens: T[]) => void,
    comMotivo: boolean,
    emBranco: T,
  }: {...}): React.ReactNode
  ```
- **Features:**
  - Generic over `Linha = Intervalo | IntervaloComMotivo`
  - Controlled by parent (parent owns array, calls `aoMudar` to update)
  - Renders list of intervals with `datetime-local` inputs
  - Optional `motivo` field when `comMotivo={true}`
  - Add button (Plus icon) — creates new blank item
  - Remove button (Trash2 icon) per row — controlled by parent
  - Imports: `lucide-react` (Plus, Trash2), `Botao`, `Campo`/`Entrada` from UI library
  - Styling: Uses `calculadora.module.css` (`editorLista`, `editorCabecalho`, `rotuloGrupo`, `ajudaGrupo`, `linhaIntervalo`)

## Validation

**TypeScript compilation:** ✅ `pnpm exec tsc --noEmit` — no errors

**Plan compliance:**
- CSS classes: All copied verbatim from plan Task 7, Step 1
- EditorIntervalos: All specifications from plan Task 7, Step 2 satisfied
- Reusability: Generic type allows both `Intervalo` (for `intervalosAdicionais`) and `IntervaloComMotivo` (for `intervalosExcluidos`)
- No external data fetch, no tests required (visual testing in Task 11)

## Next Steps

- Task 8: CamposSegmento + Formulario (compose this editor with other fields)
- Task 9: Resultado component (display calculation results)
- Task 10: Calculadora page (tie everything together)
