# DATABASE.md — REKT

Schema as version-controlled documentation, not comments in a JS file (that was finding #3
against the legacy app — see ARCHITECTURE.md §A). This file should track the schema as it
actually exists in migrations, not just the target plan. Update it whenever a migration lands.

## Status

`migrations/0001_phase1_foundation.sql` is **written** (this session) — `users`, `profiles`,
`roles`, `permissions`, `role_permissions`, `user_roles`, `audit_logs`, all seeded with the
role/permission mapping from ARCHITECTURE.md §D.3, all with RLS enabled and scoped from this
first migration (no `USING (true)` anywhere — see SECURITY.md's build checklist). **Not yet
confirmed run against the live Supabase project** — that's a human action (paste the file into
the SQL editor); update this line once it's been applied.

Still planned, not yet written: `trades`, `journal_entries`, `strategies`, `journal_tags`,
`trade_tags`, `screenshots`, `watchlists`, `news_events`, `signals`, `channels`,
`channel_members`, `messages` (Phase 2 onward per the roadmap in ARCHITECTURE.md §F).

## Foundation schema (0001 — written, pending confirmation it's been run)

```
users                 (id [=auth.users.id], email, discord_user_id, created_at)
profiles              (user_id, display_name, bio, public, avatar_url, created_at, updated_at)
roles                 (id, name)                          -- trader, master_trader, superadmin
permissions           (id, name)                          -- see ARCHITECTURE.md §D.3 for the list
role_permissions      (role_id, permission_id)
user_roles            (user_id, role_id, granted_at, granted_by)
audit_logs            (id, actor_user_id, action, target_table, target_id, metadata, at)
```

Helper functions: `has_permission(user_id, permission_name)` and `is_superadmin(user_id)`, both
`SECURITY DEFINER`, used by both RLS policies and the API's `requirePermission()` helper so the
two layers can't drift apart. A trigger on `auth.users` (`handle_new_auth_user`) creates the
`users`/`profiles`/default-`trader`-role rows on signup — the client never inserts these directly.

There is deliberately no self-serve path to `superadmin`; see the comment at the bottom of the
migration file for how to grant it manually, once, to the actual platform owner.

## Target schema — everything else (MVP scope, from ARCHITECTURE.md §D.4)

`users`/`profiles`/RBAC are covered above (already written). Remaining tables, still planned:

```
trades                (id, user_id, symbol, direction,
                       entry, stop, target, exit, qty, pnl, r_multiple,
                       outcome, opened_at, closed_at)
journal_entries       (id, trade_id, notes, emotion, strategy_id)
strategies            (id, user_id, name)
journal_tags          (id, user_id, name)
trade_tags            (trade_id, tag_id)
screenshots           (id, trade_id, storage_path)

watchlists            (id, user_id, symbols[])
news_events           (id, currency, event, previous, forecast, actual,
                       impact, released_at)

signals               (id, master_trader_id, symbol, direction, entry, stop,
                       target, r_multiple, notes, published_at)

channels              (id, name, created_by, type)
channel_members       (channel_id, user_id)
messages              (id, channel_id, sender_id, body, created_at)

audit_logs            (id, actor_user_id, action, target_table, target_id, at)
```

## Conceptual mapping from the legacy reference file

No live data migration is happening — `legacy/nomad.html` isn't connected to this project. These
notes exist so the new schema's naming/shape decisions are traceable back to what the reference
file's ad hoc columns were trying to represent:

- Legacy `users` table's fields → represented here by `users` + `profiles`.
- Legacy `server_memberships.role` (a free string) → becomes a real `user_roles` row (`trader`/`master_trader`/`superadmin`). No `community_memberships` table — there's no community entity in REKT.
- Legacy `donate_addresses` shape is reused as-is if REKT adds an equivalent feature, but RLS is admin-write / public-read from its first migration, not added later (see SECURITY.md).
- Legacy `trades.server_id` has no equivalent — every REKT trade belongs to exactly one `user_id`, full stop.
- ARCHITECTURE.md §D.5's "old path / new path" migration sequence describes how to evolve *this* schema safely once REKT has its own users to migrate between internal versions — it does not describe importing data from the legacy file, since there is none to import.

## Indexing

- `trades(user_id, opened_at desc)` — dashboard/calendar queries dominate read volume.
- `signals(master_trader_id, published_at desc)` — public signal feed.
- `channel_members(user_id)` — "which channels am I in" on chat load.

## RLS policies

RLS stays on as defense-in-depth even though the API is the primary authorization gate
(see SECURITY.md for the documented anti-patterns this must avoid).

```sql
-- trades: owner-only, always
CREATE POLICY trades_owner_all ON trades
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- messages: only members of a channel can read/write in it,
-- and only as themselves (writes still go through the backend, RLS is the backstop)
CREATE POLICY messages_channel_member ON messages
  FOR ALL TO authenticated
  USING (channel_id IN (
    SELECT channel_id FROM channel_members WHERE user_id = auth.uid()
  ))
  WITH CHECK (sender_id = auth.uid());
```

Every new table gets an explicit, owner- or permission-scoped policy before it ships. No table
containing user data ever gets `USING (true)` — that was the root cause of the critical finding
in the legacy app (see SECURITY.md).
