# rekt-api

Phase 1 foundation skeleton — see ARCHITECTURE.md and API.md in the repo root for the full plan.

## Setup

1. Run `migrations/0001_phase1_foundation.sql` against the (empty) Supabase project first.
2. `cp .env.example .env` and fill in the real values from Project Settings > API.
3. `npm install`
4. `npm run dev`

## What exists so far

- `shared/security` — JWT verification (`fastify.requireAuth`) and permission checks
  (`requirePermission`), both built on the RBAC schema in the migration.
- `shared/database` — the single server-side Supabase client (service role key; never sent to
  the browser).
- `shared/logging/auditLog.ts` — append-only audit trail writer.
- `modules/auth` — `GET /auth/me`, the first real endpoint, resolving identity + roles +
  permissions for the caller. Use this as the template for the next module's routes file.

## Important caveat

`shared/security/jwt.ts` assumes the Supabase project issues HS256 JWTs signed with a shared
secret. Check Project Settings > API > JWT Keys before relying on this — if the project uses
Supabase's newer asymmetric signing keys, JWT verification needs to switch to JWKS instead.
