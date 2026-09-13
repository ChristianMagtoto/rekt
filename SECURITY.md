# SECURITY.md — REKT

Findings from the Phase 0 audit (ARCHITECTURE.md §C.1), tracked here as documented anti-patterns
from the legacy reference file (`legacy/nomad.html`) — **not an active incident.** That file is
not connected to REKT's Supabase project or GitHub repo, both of which are new and empty. The
point of this list is to make sure the new schema never reproduces these mistakes, not to track
a remediation effort against a live system.

## Documented anti-patterns (legacy reference file only)

| Severity | Finding | Status | Notes |
|---|---|---|---|
| 🔴 Critical | `server_memberships` RLS policy is `USING (true)` — any authenticated user can read/write any row, including `role`, enabling self-promotion to `server_admin` | Documented, not live | REKT's schema must never ship a policy like this — see "Build checklist" below. |
| 🔴 Critical | `trades` rows carry client-supplied `discord_user_id`/`server_id`/`username` with no server-side ownership check; superadmin dashboard reads `trades?select=*` with a normal session token, implying SELECT isn't scoped either | Documented, not live | REKT's `trades` table is owner-scoped (`user_id = auth.uid()`) from the first migration — see DATABASE.md. |
| 🟠 High | Monthly access code derived client-side from a `seed` column readable by any authenticated user (`SHA256(seed + month + year)`) | Documented, not live | If REKT ever wants a similar feature, generate it server-side, return only to an authorized admin. |
| 🟠 High | Unsalted client-side SHA-256 password hashing for legacy admin logins | Documented, not live | REKT uses Supabase Auth / OAuth exclusively — no custom client-side password hashing path exists or should be added. |
| 🟡 Medium | No backend means no rate limiting, input validation, or audit log on writes | Documented, not live | REKT's API layer (ARCHITECTURE.md §D.1) validates every write server-side from Phase 1 onward. |
| 🟡 Medium | `donate_addresses` write access may be as permissive as `server_memberships` | Documented, not live | If REKT adds an equivalent table, it ships admin-write / public-read from day one, not as a later fix. |

## Build checklist (apply from the first migration, not as a later fix)

- [ ] No RLS policy on a table with user data is ever `USING (true)`.
- [ ] Every table's write policy is owner-scoped or explicit-permission-scoped before it ships, not added after.
- [ ] No custom password hashing anywhere — auth goes through Supabase Auth / the chosen OAuth provider only.
- [ ] Any derived "secret" (access codes, tokens) is generated server-side and never computed from a client-readable value.
- [ ] `donate_addresses` or any equivalent public-data table is public-read / admin-write from its first migration.

## Target security model (see ARCHITECTURE.md §C.2 for full reasoning)

- All writes move behind the REKT API — the browser never talks directly to PostgREST for writes.
- RLS stays on as defense-in-depth, correctly scoped (`user_id = auth.uid()` style), even with the app backend as the primary gate.
- Authorization is permission-based (`has_permission(user, 'create_trade')`), not role-string matching.
- Exchange API keys (Phase 7+) are encrypted at rest, trade-only scope, never withdrawal-capable, never returned to the client after initial save.
- Kill switch, position limits, and webhook signature verification are designed into the Exchange Adapter module from day one.
- Rotating access codes, if kept, are generated server-side on request only.

## Closed findings

_None yet._
