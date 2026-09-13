# API.md — REKT

Tracks the REKT API surface as it's actually built. Update this in the same session that adds
or changes a route, not as a separate cleanup pass later.

## Stack (decided this session — see PROGRESS.md)

Node.js + TypeScript + Fastify. Picked for a lightweight plugin architecture that maps cleanly
onto the `modules/`/`shared/` boundaries in CLAUDE.md, and because it stays portable if
Cloudflare Workers ends up being the deployment target once that's decided (ARCHITECTURE.md
still lists Cloudflare's role as undecided).

## Conventions

- **Auth:** every request except explicitly public ones requires a verified Supabase Auth JWT,
  checked via `fastify.requireAuth` (`src/shared/security/authenticate.ts`). The API resolves
  identity from the token's `sub` claim only — it never trusts a client-supplied user id or role.
- **Authorization:** permission-based, not role-string matching, via `requirePermission(name)`
  (`src/shared/permissions/hasPermission.ts`), which calls the `has_permission` SQL function from
  `migrations/0001_phase1_foundation.sql`. See ARCHITECTURE.md §D.3 for why.
- **Errors:** every error response is `{ error: { code, message } }` — see
  `src/shared/errors/index.ts`. Document any new `code` value in the table below when introduced.
- **Audit logging:** any endpoint that changes state on behalf of a user should call
  `writeAuditLog()` (`src/shared/logging/auditLog.ts`). It's fire-and-forget/non-fatal by design
  — a logging failure must never roll back the action itself.
- **Versioning:** not yet needed (no external consumers). Decide and document here before the
  first breaking change to a shipped endpoint.

### Error codes in use

| Code | Meaning |
|---|---|
| `UNAUTHENTICATED` | Missing, invalid, or expired bearer token |
| `FORBIDDEN` | Authenticated, but missing the required permission |
| `NOT_FOUND` | Resource doesn't exist or isn't visible to the caller |

## Endpoints

### auth/

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/auth/me` | Required | Resolves the caller's `users` row, `profiles` row, roles, and flattened permission list. First real endpoint — also serves as the smoke test that JWT verification and the RBAC schema agree with each other. |

### (platform)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | Liveness check. |

(Add one section per module as it lands, per ARCHITECTURE.md's module list: users, journal,
trades, analytics, markets, news, profiles, notifications, signals, exchange, messaging.)
