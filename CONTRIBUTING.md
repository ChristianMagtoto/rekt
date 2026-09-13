# CONTRIBUTING.md — REKT

Conventions for keeping AI-driven change sets scoped and reviewable. Read alongside
CLAUDE.md (session workflow / module boundaries) and ARCHITECTURE.md (design).

## Branching

- One branch per module per unit of work: `feat/<module>-<short-description>`, e.g.
  `feat/trades-crud`, `feat/auth-jwt-verification`.
- Don't mix changes across modules in one branch unless the task explicitly requires a
  `shared/` change alongside a module change — in that case, name it
  `feat/<module>-<desc>` and call out the `shared/` touch explicitly in the PR/commit
  description, per CLAUDE.md's "stop and flag" rule.
- A branch should map to roughly one PROGRESS.md session entry. If a session's work doesn't
  fit cleanly in one branch, that's a signal the session tried to do too much — split it.

## Commit / PR description expectations

Every PR should make it possible for a human (or the next AI session) to answer, without
reading the diff:
- What module(s) did this touch, and why (if it crossed a boundary)?
- What's tested, and what specifically (money math / auth changes must say what test covers them, per CLAUDE.md's code quality bar)?
- Any schema change? Link to the DATABASE.md update in the same PR.
- Any RLS policy change? Link to the SECURITY.md update in the same PR.

## Definition of done (per feature)

- [ ] Code lives in its module's directory, no unrelated files touched.
- [ ] Tests exist for anything touching money math or authorization.
- [ ] DATABASE.md updated if schema changed.
- [ ] SECURITY.md updated if an RLS policy or auth path changed.
- [ ] API.md updated if an endpoint was added/changed.
- [ ] PROGRESS.md updated per CLAUDE.md's end-of-session workflow.

## What NOT to do

- Don't reintroduce a server/community/tenancy concept (ARCHITECTURE.md §D.2 — dropped on
  purpose).
- Don't add an RLS policy with `USING (true)` on any table with user data (ARCHITECTURE.md §C,
  SECURITY.md).
- Don't build on top of `nomad.html`'s Supabase calls or auth/tenancy logic, and don't reuse its
  Supabase project or credentials if you ever find them in the file — it's a read-only historical
  reference for trade-calc logic and UI patterns only, unconnected to REKT's actual infrastructure
  (CLAUDE.md).
