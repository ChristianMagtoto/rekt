# API.md — REKT

Tracks the REKT API surface as it's actually built. Empty until Phase 1 lands the first
endpoints — update this in the same session that adds or changes a route, not as a
separate cleanup pass later.

## Conventions (fill in / adjust once Phase 1 starts)

- Auth: every request (except explicitly public ones) requires a verified Supabase Auth JWT;
  the API resolves identity/role server-side, never trusts a client-supplied user id or role.
- Errors: consistent shape across modules (see `shared/errors`) — document the shape here once
  decided.
- Versioning: decide and document here before the first breaking change, not after.

## Endpoints

_None shipped yet. Add a section per module as it lands, e.g.:_

### auth/

| Method | Path | Auth | Description |
|---|---|---|---|
| — | — | — | Not yet implemented |

### trades/

| Method | Path | Auth | Description |
|---|---|---|---|
| — | — | — | Not yet implemented |

(Add one table per module as in ARCHITECTURE.md's module list: users, journal, trades,
analytics, markets, news, profiles, notifications, signals, exchange, messaging.)
