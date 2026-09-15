# Task 1 Report

## Status: DONE

## Implementation
- [x] tipos.ts created
- [x] intervalos.ts created
- [x] intervalos.spec.ts created

## Tests

Command: `pnpm test tests/detracao/recolhimento-noturno/intervalos.spec.ts`

Output:
```
> awave-crm@0.9.1 test /private/tmp/detracao-impl
> vitest run tests/detracao/recolhimento-noturno/intervalos.spec.ts


 RUN  v4.1.10 /private/tmp/detracao-impl


 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  11:37:19
   Duration  91ms (transform 17ms, setup 0ms, import 22ms, tests 3ms, environment 0ms)
```

## Commits
```
448a372 feat(detracao): tipos e helpers de intervalo do motor de recolhimento noturno
```

## Self-Review

### Implementation Quality

**tipos.ts (56 lines)**
- Exports all required constants, types, and interfaces per plan
- WEEKDAYS array properly typed with Weekday literal type
- ROTULOS_DIA_SEMANA maps weekdays to Portuguese labels
- ALGORITMO_VERSAO constant set to 'RN-1.0'
- All domain types match plan specification exactly:
  - Intervalo: string-based ISO date/time with semiopen semantics
  - IntervaloComMotivo: Intervalo extended with motivo field
  - SegmentoRegra: complete rule segment with temporal window
  - EntradaCalculo: input type with timezone and segments
  - ResultadoCalculo: output type with consolidated intervals and computed metrics

**intervalos.ts (107 lines)**
- Exports Faixa type (millisecond-based internal representation)
- All 9 required functions implemented:
  - paraInstante: regex parser accepts both HH:MM and HH:MM:SS formats
  - paraInstanteDeData: splits date and time inputs, combines with UTC
  - somarDias: adds 86,400,000ms (24 hours) per day
  - proximoDia: parses ISO date, increments, formats back
  - formatarInstante: converts ms back to ISO format with seconds
  - intersectar: returns null on non-overlapping semi-open intervals (faithful to spec)
  - mergeIntervalos: consolidates overlapping/contiguous ranges, preserves gaps
  - subtrairIntervalos: recorts exclusions from ranges, handles all edge cases
  - duracaoMinutos: sums and converts to integer minutes

### Test Coverage
- 8/8 tests passing (7 named test cases + import verification)
- Tests validate:
  - Round-trip conversion (paraInstanteDeData → formatarInstante)
  - Optional seconds in paraInstante
  - Day arithmetic across month/year boundaries
  - Semi-open interval semantics (contiguous intervals return null on intersectar)
  - Merge preserves gaps (e.g., 0-10, 10-20, 30-40 → 0-20, 30-40)
  - Subtraction handles edge cases (cropping from sides and middle)
  - Integer-only durations from millisecond ranges

### Constraint Compliance
- ✓ All durations in integers (minutes output, milliseconds internally)
- ✓ Intervals are semi-open [start, end) — contiguous boundaries don't intersect
- ✓ All dates/times are ISO strings without timezone (local time only)
- ✓ All functions are pure (no I/O, deterministic, no side effects)
- ✓ Regex patterns validate input format before parsing
- ✓ Date parsing uses Date.UTC to work with naive local times

### Integration Points
- tipos.ts: foundation for motor.ts and all downstream modules
- intervalos.ts: pure time arithmetic, no domain knowledge (motor.ts adds rules)
- Tests: fast (~3ms), no external dependencies, suitable for CI
- Plan alignment: Task 1 complete; unblocks Task 2 (motor.ts) which consumes both modules
