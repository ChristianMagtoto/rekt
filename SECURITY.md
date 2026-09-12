# SECURITY.md — REKT

Findings from the Phase 0 audit (ARCHITECTURE.md §C), tracked here as a living checklist.
Update the status column as items close. Do not delete closed items — move them to the
"Closed" section at the bottom with the date and what changed, so there's a record.

## Open findings

| Severity | Finding | Status | Notes |
|---|---|---|---|
| 🔴 Critical | `server_memberships` RLS policy is `USING (true)` — any authenticated user can read/write any row, including `role`, enabling self-promotion to `server_admin` | **Open — verify first** | Must be confirmed against live deployed policy, not just the code comment, before Phase 1 work starts. See PROGRESS.md. |
| 🔴 Critical | `trades` rows carry client-supplied `discord_user_id`/`server_id`/`username` with no server-side ownership check; superadmin dashboard reads `trades?select=*` with a normal session token, implying SELECT isn't scoped either | Open | Any signed-in trader can plausibly read/forge any other trader's trade data. |
| 🟠 High | Monthly access code derived client-side from a `seed` column readable by any authenticated user (`SHA256(seed + month + year)`) | Open | Not a real secret if the derivation and the seed are both client-visible. Fix: generate server-side, return only to an authorized admin. |
| 🟠 High | Unsalted client-side SHA-256 password hashing for legacy admin logins | Open | No salt, no work factor, trivially reversible if the table is ever read (which it currently can be). Force-reset affected passwords and retire this path in favor of Discord OAuth only. |
| 🟡 Medium | No backend means no rate limiting, input validation, or audit log on writes | Open | Nothing stops e.g. `pnl: 999999999999` or negative `qty` today. |
| 🟡 Medium | `donate_addresses` write access may be as permissive as `server_memberships` | Open — verify | If so, any authenticated user could redirect donation addresses to their own wallet. Should be admin-write / public-read only. |

## Immediate remediation checklist (do before Phase 1 feature work)

- [ ] Pull actual deployed RLS policies from the Supabase dashboard for `server_memberships`, `trades`, `users`, `servers`, `donate_addresses`.
- [ ] Compare against the findings above; confirm or correct each one.
- [ ] Lock `server_memberships`, `trades`, `users`, `servers` writes to owner-scoped or admin-scoped policies.
- [ ] Rotate `seed` values; stop deriving join codes client-side.
- [ ] Force-reset any admin passwords stored via the unsalted hash; remove that login path.
- [ ] Verify `donate_addresses` write policy is admin-only.

## Target security model (see ARCHITECTURE.md §C.2 for full reasoning)

- All writes move behind the REKT API — the browser never talks directly to PostgREST for writes.
- RLS stays on as defense-in-depth, correctly scoped (`user_id = auth.uid()` style), even with the app backend as the primary gate.
- Authorization is permission-based (`has_permission(user, 'create_trade')`), not role-string matching.
- Exchange API keys (Phase 7+) are encrypted at rest, trade-only scope, never withdrawal-capable, never returned to the client after initial save.
- Kill switch, position limits, and webhook signature verification are designed into the Exchange Adapter module from day one.
- Rotating access codes, if kept, are generated server-side on request only.

## Closed findings

_None yet._
