# DATABASE.md — REKT

Schema as version-controlled documentation, not comments in a JS file (that was finding #3
against the legacy app — see ARCHITECTURE.md §A). This file should track the schema as it
actually exists in migrations, not just the target plan. Update it whenever a migration lands.

## Status

Target schema below is the plan from ARCHITECTURE.md §D.4. No migrations have been written yet
(Phase 1 not started as of this writing — see PROGRESS.md). Once migrations exist, this section
should say which tables are live vs. still planned.

## Target schema (MVP scope, no community/server tables)

```
users                 (id, email, discord_user_id, created_at)
profiles              (user_id, display_name, bio, public, avatar_url)
roles / permissions / role_permissions / user_roles      -- RBAC core: trader / master_trader / superadmin

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

## Migration notes from legacy

- `users` (legacy) → merges into `users` + `profiles`.
- `server_memberships.role` → becomes a `user_roles` row (`trader`/`master_trader`/`superadmin`), a real value not a free string. No `community_memberships` table — there's no community entity anymore.
- `donate_addresses` → schema unchanged, but RLS must be locked to admin-write / public-read and explicitly verified (see SECURITY.md).
- `trades.server_id` → dropped entirely. Every trade belongs to exactly one `user_id`, full stop.
- User data is never deleted during migration — each step in ARCHITECTURE.md §D.5 adds a new correct path and verifies it against the old one before removing the old one.

## Indexing

- `trades(user_id, opened_at desc)` — dashboard/calendar queries dominate read volume.
- `signals(master_trader_id, published_at desc)` — public signal feed.
- `channel_members(user_id)` — "which channels am I in" on chat load.

## RLS policies

RLS stays on as defense-in-depth even though the API is the primary authorization gate
(see SECURITY.md for the current live-policy audit status).

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
