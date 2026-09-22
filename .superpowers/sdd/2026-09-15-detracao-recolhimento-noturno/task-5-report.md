# Task 5 Report

## Status: DONE

## Implementation

- [x] 0066_ferramentas_detracao.sql created at `supabase/migrations/0066_ferramentas_detracao.sql`
- [x] Migration is idempotent:
  - `CREATE TABLE ... IF NOT EXISTS public.detracao_calculos`
  - `CREATE INDEX ... IF NOT EXISTS detracao_calculos_dono_idx`
  - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (safe to run multiple times)
  - `GRANT ALL ... to anon, authenticated, service_role` (safe to run multiple times)
  - `CREATE POLICY ... detracao_calculos_sel` wrapped in `DO $$ ... END $$` block with existence check
- [x] RLS policy is SELECT-only:
  - Policy name: `detracao_calculos_sel`
  - Clause: `for select to authenticated`
  - Condition: `public.e_membro(workspace_id) and user_id = auth.uid()`
  - No INSERT/UPDATE/DELETE policies for authenticated role
- [x] Timestamp columns use `DEFAULT NOW()`:
  - `criado_em timestamptz not null default now()`
  - `atualizado_em timestamptz not null default now()`

## Verification

- SQL syntax validated: file created successfully with 46 lines
- Migration number verified: `0066` is the next sequential number after `0065_membros_e_workspaces_so_para_quem_pode.sql`
- All idempotency requirements met
- Table schema matches plan specification:
  - Columns: id, workspace_id, user_id, calculo_tipo, algoritmo_versao, titulo, entrada (jsonb), resultado (jsonb), criado_em, atualizado_em
  - Index: (workspace_id, user_id, atualizado_em desc)
  - Constraints: foreign keys with on delete cascade

## Commits

Ready to commit: `supabase/migrations/0066_ferramentas_detracao.sql`

## Self-Review

- Migration follows the same pattern as `0062_ferramentas_indulto_comutacao.sql`
- All statements are additive (no DELETE or DROP commands)
- RLS policy correctly restricts access to workspace members who own the calculation
- Service role writes will bypass RLS (as designed for Task 6)
- Migration is safe for reapplication in container boot scenario
