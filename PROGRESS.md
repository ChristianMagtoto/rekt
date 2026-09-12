# REKT — Progress Log

Most recent session at the top. Read this before starting any work — see CLAUDE.md for the
rules on how this file gets updated.

---

## [Day 0 — setup] — not yet started

**Status:** Project not yet started. This is the template entry.

**Completed today:** N/A — this is the starting state.

**In progress:** Nothing yet.

**Decisions made:**
- Product is REKT (rebranded from Nomad). Flat user-based model — no communities/tenancy.
- Roles: `trader`, `master_trader`, `superadmin` only, permission-mapped (see ARCHITECTURE.md §D.3).
- Discord integration via webhooks/slash-commands only — no in-house chat module.
- Legacy `nomad.html` is read-only reference, not a base to build on.

**Blockers / open questions:** None yet.

**Next session should:**
Do NOT start Phase 1 scaffolding first. Per ARCHITECTURE.md §C.1 / "Immediate next step," pull
the actual deployed Supabase RLS policies and compare against the audit's assumptions — the
audit found a likely live, exploitable cross-tenant data exposure (any authenticated user can
probably read/write any other user's `trades` and can self-promote via `server_memberships`).
This is a live-incident-style fix independent of the rebuild and should happen before any other
work this session. Concretely: (1) pull current RLS policies for `server_memberships`, `trades`,
`users`, `servers`, `donate_addresses`; (2) lock down the ones matching the 🔴/🟠 findings in
§C.1 (owner/admin-scoped policies, not `USING (true)`); (3) rotate any `seed` values used for
the client-derived monthly access code; (4) only once that's done and logged here, start Phase 1
(Foundation) — project structure, JWT auth verification, roles/permissions schema, database
access layer.

---

<!--
TEMPLATE FOR NEW ENTRIES — copy this block above the previous entry each session:

## [YYYY-MM-DD] — Phase N: <short phase name>

**Status:** <e.g. "In progress" / "Phase complete" / "Blocked">

**Completed today:**
- <specific: file/module, what now works>
- <specific: file/module, what now works>

**In progress (not finished, don't assume done):**
- <what's half-built and what's missing from it>

**Decisions made (not yet in ARCHITECTURE.md):**
- <anything decided ad hoc this session that future sessions need to know>

**Blockers / open questions for the human:**
- <anything the agent couldn't resolve itself>

**Next session should:**
<one or two concrete sentences — exact next task, not just "continue Phase N">

-->
