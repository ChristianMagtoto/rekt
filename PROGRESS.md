# REKT — Progress Log

Most recent session at the top. Read this before starting any work — see CLAUDE.md for the
rules on how this file gets updated.

---

## [2026-09-13] — Phase 0: corrected scope — fresh build, no live incident

**Status correction:** an earlier version of this entry treated `legacy/nomad.html`'s findings as
an active production incident requiring emergency SQL against a live Supabase project, and
drafted `migrations/0_AUDIT_current_policies.sql` / `1_incident_rls_lockdown.sql` /
`2_rotate_seeds_and_reset_passwords.sql` on that basis. That framing was a misunderstanding:
**this is a fresh build.** There is no existing GitHub workflow, no existing Supabase project,
and no existing SQL beyond the reference comments inside `legacy/nomad.html` itself — that file
is historical reference only, not connected to any current infrastructure, and nothing in it is
live. Those three migration files describe how you'd fix a live system if one existed; they are
not applicable here and should not be run against the new Supabase project (their table/column
assumptions don't even necessarily match whatever schema gets designed for REKT). Leaving them in
`migrations/` for now as a reference in case the *old* project is ever separately revisited, but
they are not part of REKT's active build path.

**What's actually true as of this session:**
- **GitHub:** this repo, used for docs and code going forward. No CI, no branches beyond
  whatever exists today.
- **Supabase:** a new project has been created for REKT specifically. Empty — no schema, no
  data, no relationship to whatever project `legacy/nomad.html`'s embedded credentials once
  pointed at.
- **Cloudflare:** role not yet decided (Pages / Workers / just DNS-CDN) — to be settled when a
  deployment target is actually needed, not assumed in advance.

**Completed today:**
- Corrected CLAUDE.md, ARCHITECTURE.md, SECURITY.md, DATABASE.md, and CONTRIBUTING.md to drop
  the "live incident" framing throughout. The §C.1 findings are now documented explicitly as
  anti-patterns from a historical reference file, not an active remediation checklist. Added an
  "Infrastructure status" section to CLAUDE.md so future sessions don't re-assume a live system
  exists.

**Decisions made (not yet in ARCHITECTURE.md):**
- Confirmed: no data migration from `legacy/nomad.html`'s project happens at any point. The
  legacy file is mined for calc-logic/UI patterns only (per CLAUDE.md), never for schema or auth
  continuity.

**Blockers / open questions for the human:**
- Cloudflare's role is still undecided — flag this again once Phase 1 nears a point where a
  deployment target actually matters (likely not before Phase 2).

**Next session should:**
Start actual Phase 1 (Foundation) work on the new, empty Supabase project: users/profiles/roles/
permissions schema per ARCHITECTURE.md §D.4, written with correct RLS from the very first
migration (no `USING (true)` on any table with user data — see SECURITY.md's build checklist).
Also stand up the API skeleton with JWT verification. No prerequisite blocker remains.

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
