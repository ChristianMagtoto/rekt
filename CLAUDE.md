# CLAUDE.md — Working rules for AI sessions on REKT

Read this file fully before writing any code. Also read `PROGRESS.md` — it tells you exactly
where the last session left off. Do not re-derive project state from guessing; read the log.

## Project context

- Full architecture, security audit, schema, and roadmap: `ARCHITECTURE.md`
- Legacy reference code: `/legacy/nomad.html` — READ-ONLY, historical reference only. It is not
  connected to any current infrastructure and nothing in it is live. Inspect it for trade-calc
  logic and UI patterns worth preserving. Never build on top of its Supabase calls, auth/tenancy
  logic, or RLS policies — those patterns are documented as anti-patterns to avoid (see
  ARCHITECTURE.md §C.1), not a system to migrate or fix.
- Product: REKT. Roles: `trader`, `master_trader`, `superadmin` only. No communities/tenancy —
  flat, user-based. See ARCHITECTURE.md §D.2–D.3 if you're tempted to add a server/community
  concept back in — don't.

## Infrastructure status

This is a fresh build with no existing production system. Do not assume any of the following
exist until a session's PROGRESS.md entry says otherwise:

- **GitHub:** this repo. No CI, no branch protection, no merged PRs yet — CONTRIBUTING.md's
  branching convention starts applying from the first real feature branch.
- **Supabase:** a new, empty project created for this build. No schema, no migrations, no data.
  It is unrelated to whatever project the legacy `nomad.html` file once pointed at — don't reuse
  connection details, table names, or RLS from that file by assumption; everything here gets
  built from ARCHITECTURE.md §D.4 forward.
- **Cloudflare:** role not yet decided (Pages vs. Workers vs. just DNS/CDN in front of something
  else). Don't assume a deployment target in code or docs until this is settled — ask or flag it
  rather than guessing.

## Module boundaries — stay inside your lane

```
modules/
  auth/  users/  journal/  trades/  analytics/
  markets/  news/  profiles/  notifications/  signals/  exchange/
shared/
  database/  validation/  security/  logging/  errors/  permissions/
```

Don't edit files in a module outside the current phase's scope unless the task explicitly
requires it (e.g. a shared/ change). If a change seems to require touching an unrelated module,
stop and flag it instead of doing it silently.

## Session workflow — do this every time, without being asked

1. **Start of session:** read `PROGRESS.md` top to bottom. Confirm out loud (briefly) what phase
   we're on and what the next task is before starting work.
2. **During the session:** work only on the scope given in the day's prompt. If you finish early,
   don't silently start the next phase — note it as "ready to start" in the log and stop.
3. **End of session — always do this, even if the session was cut short or hit an error:**
   update `PROGRESS.md` with:
   - What was completed today (be specific: files/modules touched, what now works)
   - What's partially done / in progress (so it's not mistaken for finished)
   - Any decisions made that aren't already in ARCHITECTURE.md (so they aren't re-litigated)
   - Any blockers or open questions for the human
   - **Exactly what the next session should do first** — one or two concrete sentences, not
     "continue Phase 2," but "implement the trade-edit endpoint in modules/trades/, the create
     endpoint is done and tested."
   - Move the current date's entry to the top of the log (most recent first)

Never end a session without touching `PROGRESS.md` — that file is the only memory between
sessions, since each day starts with fresh context.

4. **Promoting decisions out of PROGRESS.md:** PROGRESS.md is where ad hoc decisions get
   *recorded*, not where they should live forever. If a decision logged in PROGRESS.md is still
   true and load-bearing after ~2–3 sessions (i.e. it's not going to be revisited), fold it into
   ARCHITECTURE.md as a proper section during that session and note in PROGRESS.md that it's
   been promoted. ARCHITECTURE.md should always be the single current source of truth for
   "how the system is designed"; PROGRESS.md should only hold things that are still in flux.
5. **Archiving PROGRESS.md:** once PROGRESS.md holds more than ~8–10 session entries, move all
   but the most recent 5 into `PROGRESS_ARCHIVE.md` (oldest at the bottom, same format), leaving
   a one-line pointer at the bottom of PROGRESS.md ("earlier sessions: see PROGRESS_ARCHIVE.md").
   Do this at the *start* of a session, before reading further, so "read PROGRESS.md top to
   bottom" stays cheap. Never archive an entry whose decisions haven't yet been promoted to
   ARCHITECTURE.md per rule 4.

## Code quality bar

- No feature is "done" without at least a basic test for anything touching money math
  (P&L, R-multiple, win rate, expectancy, drawdown) or authorization.
- No RLS policy is ever `USING (true)` for a table containing user data — every policy must
  scope to `auth.uid()` or an explicit permission check. This is the #1 mistake in the legacy
  code; do not repeat it.
- Prefer finishing one module cleanly over touching five modules partially.
