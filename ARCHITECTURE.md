# REKT — Phase 0 Audit & SaaS Migration Plan
*(formerly Nomad — see rebrand note below)*

*Audit performed against `nomad.html`, the single-file production build (6,430 lines, ~370KB). No code was changed to produce this report.*

**Rebrand note:** "Nomad" is retired as the user-facing product name; the product going forward is **REKT**. The codebase this audit describes (`legacy/nomad.html`) is referred to below as "Legacy Nomad V0" — it is a historical reference file only, not a system REKT is built on top of or migrates from. REKT's GitHub repo and Supabase project are both new and unconnected to whatever `nomad.html` once ran against.

**Revision note (this version):** updates the role model to 3 roles (§B.3/§D.3), **removes the community/server tenancy concept entirely** (§D.2 revised — user-based only, no communities/leaderboards-per-server), and adds a global Messaging module (§D.6, new Phase in §F) per the latest direction. Everything else from the original audit stands.

---

## A. Executive Summary

Nomad today is **not** a conventional "user signs up, journals their trades" app. It's a **single-page HTML application** that talks directly to Supabase from the browser, organized around **Discord servers as tenants**. A trader logs in with Discord OAuth; the app then decides at runtime whether they're the platform Superadmin, a Server Admin (community owner), or a Member/Trader, and routes them into one of three separate UI "apps" baked into the same file (`sa-*` superadmin dashboard, `ad-*` admin/community dashboard, `mb-*` member/trader journal). A fourth pseudo-tenant, `nomad-independent`, exists for traders with no Discord community.

This is a clever MVP for a Discord-trading-community niche, and the trade-journal math, streak tracking, and UI are genuinely reusable. But it has three characteristics that block "SaaS-ready":

1. **There is no backend.** Every read/write goes straight from the browser to Supabase's REST API using either the public anon key or the end user's JWT. All authorization currently *has* to live in Postgres Row-Level Security — but the only RLS policy visible in the codebase (`server_memberships`) grants blanket read/write to **any authenticated user**, and the data-fetch patterns for `trades` and `servers` strongly suggest the same permissive pattern was used elsewhere. This means the current system most likely lets any logged-in trader read or write **any other trader's or any other community's data**, and lets a user hand-edit their own role to `server_admin` via a direct REST call.
2. **Identity, tenancy, and authorization are computed in JavaScript, not enforced in the database.** `currentRole`, `adminUserRow`, `mbCurrentServerId` etc. are just variables in the page. The UI hides buttons a "member" shouldn't see, but nothing stops that member from calling the same Supabase endpoints the admin UI calls.
3. **The schema is not version-controlled.** Only one table (`server_memberships`) has its `CREATE TABLE`/RLS statements in the codebase (as a comment); `servers`, `users`, `trades`, `donate_addresses`, `superadmin_config` are all referenced by REST calls with no schema-as-code anywhere. Nobody can currently reproduce the database from source.

None of this is a knock on the prototype — it clearly works, and its trade-calc/UI patterns are worth mining. But it means **REKT is not "add a backend to the existing app."** It's a from-scratch build on new infrastructure (new GitHub repo, new Supabase project, no shared data or connections to whatever the legacy file once ran against) that must not repeat these three failure modes from day one — see §C for the specific findings and §D for the target model that avoids them.

**What Nomad needs to become:** a modular-monolith backend (one deployable service, cleanly separated modules) that owns all writes to Postgres, issues its own short-lived tokens after verifying Supabase Auth sessions, and enforces authorization in application code *and* RLS (defense in depth). Per the latest direction, the Discord-server/"community" tenancy layer is dropped entirely — REKT is user-based only (see §D.2 revision below); the community concept is not carried forward.

---

## B. Existing Architecture

### B.1 Stack (confirmed from code)

| Layer | Technology |
|---|---|
| Frontend | Single static HTML file, vanilla JS (no framework, no bundler) |
| Charts | Chart.js 4.4.0 (stat radars/bars), `lightweight-charts` (equity curve) |
| Auth | Supabase Auth, Discord OAuth provider, PKCE flow |
| Data | Supabase Postgres, accessed via `/rest/v1/*` (PostgREST) directly from the browser |
| Hosting | Cloudflare Pages (referenced explicitly in a code comment re: PKCE vs implicit flow) |
| Client-only state | `localStorage` (theme, superadmin session cache, offline trade cache, rules list) |

There is no build step, no package.json, no server code, and no test suite.

### B.2 Runtime shape

```
                     ┌─────────────────────────────┐
                     │        nomad.html            │
                     │  (one file, three UI "apps") │
                     │                              │
    Discord OAuth ──▶│  sa-* (Superadmin console)   │
    (via Supabase)   │  ad-* (Community Admin app)  │
                     │  mb-* (Member/Trader journal)│
                     └───────────────┬──────────────┘
                                     │ fetch() with anon key
                                     │ or user's Supabase JWT
                                     ▼
                     ┌─────────────────────────────┐
                     │   Supabase (hosted Postgres) │
                     │  PostgREST auto-generated API│
                     │  RLS = the only authz layer  │
                     └─────────────────────────────┘
```

There is no application server between the browser and the database. Every table exposed to PostgREST is exposed to every logged-in browser tab, gated only by whatever RLS policy exists on that table.

### B.3 Tenancy & identity model (as built)

Nomad already implements a tenancy concept — it's just implicit and Discord-shaped rather than explicit:

- **Tenant = "server"** (a Discord guild, represented as a row in a `servers` table with `server_id`, `discord_server_id`, `seed`, `active`).
- **`nomad-independent`** is a synthetic server row used for traders with no Discord community — so even "solo" users are technically a tenant of one.
- **Role resolution on every login** (`_routeSession`, ~line 2340): check `superadmin_config` → check `server_memberships` for `role = server_admin` → else treat as member and match the user's Discord guild list against `servers.discord_server_id`. If a user's guilds match zero or multiple communities, a picker UI appears.
- **RBAC today is exactly three roles**, hardcoded as string literals throughout the code: `superadmin`, `server_admin` (called "admin" in the UI), and `member` (with a secondary `member_role` of `analyst` for promoted top traders). There is no permissions table — every authorization check in the code is a string comparison like `m.role === 'server_admin'`.

> **Target role model (revised):** REKT collapses this to three roles that match the actual product: `superadmin` (you, singular, platform owner), `master_trader` (a trader you've promoted, who can publish signals/analysis and gets a verified badge), and `trader` (everyone else, default on signup). The community-admin/analyst distinction from Legacy Nomad goes away — see §D.3 for the full permission mapping. This is simpler to reason about and matches how you actually intend to run the platform: promotion is curated by you, not self-serve.

### B.4 Data model (reverse-engineered from REST calls; no schema file exists)

| Table (inferred) | Key fields observed | Notes |
|---|---|---|
| `servers` | `server_id`, `discord_server_id`, `server_name`, `seed`, `active`, `owner_discord` | `seed` is a secret used to derive rotating access codes — see Security §F |
| `server_memberships` | `discord_user_id`, `discord_username`, `server_id`, `role`, `member_role`, `analyst_color`, `password_hash` | Only table with schema-as-code (in a comment) |
| `users` | `discord_user_id`, `discord_username`, `role`, `server_id` | Legacy table, superseded by `server_memberships` but still read as a fallback in several places — **two sources of truth for role** |
| `trades` | `id`, `date`, `symbol`, `direction`, `outcome`, `entry`, `stop`, `target`, `exit`, `qty`, `pnl`, `rr`, `emotion`, `notes`, `username`, `discord_username`, `discord_user_id`, `server_id` | Client sets `discord_user_id`/`username`/`server_id` itself on insert — nothing server-side verifies these match the caller |
| `superadmin_config` | `discord_user_id`, `display_name` | Grants platform-wide superadmin |
| `donate_addresses` | `coin`, `address`, `active`, `updated_at` | Public crypto donation addresses, fetched with anon key |

Notably **absent** despite being referenced in the product vision: `journal_entries`, `screenshots`, `strategies`, `watchlists`, `news_events`, `posts`, `signals`. These are not partially built — they don't exist yet. The trade-detail concept (notes, tags, strategy, R) is currently flattened into columns on `trades` itself rather than being separate journal entities.

### B.5 What's genuinely good and worth preserving

- The **win-rate / avg-win / avg-loss / profit-factor / streak** calculation logic (`mb_getStats`, `ad_buildUserStats`) is simple, readable, and correct for what it computes.
- The **three-tier product shape** (platform owner → community owner → trader) was a real, validated distribution model — but per the latest direction it's being dropped in favor of the flatter superadmin/master_trader/trader model (§D.3); the community layer itself is not carried forward.
- The **equity-curve chart** and stat-radar visualizations are decent UI patterns to carry forward.
- The **monthly rotating access code** idea (community-specific join code that changes every month) is a nice low-friction onboarding mechanic for admins to distribute to their community *once it's redesigned to not leak the secret to the client* (see below).

### B.6 Technical debt & duplication

- **Three near-identical dashboards** (`sa-*`, `ad-*`, `mb-*`) each reimplement trade-fetching, stat calculation, and rendering with copy-pasted logic and separate `sbFetch` wrappers (`sa_sbFetch`, `ad_sbFetch`, `mb_sbFetch`) that differ subtly in auth-header handling.
- **Two sources of truth for role** (`users.role` vs `server_memberships.role`), with fallback logic scattered across the auth flow — a classic source of "why does this user have stale permissions" bugs.
- **Client-side SHA-256 password hashing** with no salt (`sa_sha256`, `ad_sha256`) still used for legacy admin password changes and verification, alongside Discord OAuth. Unsalted client-side hashing is not an acceptable password storage scheme even as a fallback path.
- **No automated tests**, no CI, no schema migrations directory, no environment-variable indirection (the Supabase URL and anon key are literal string constants in the shipped file).
- **~6,400 lines in a single file** with no module boundaries — safe, scoped changes (e.g., "fix the win-rate calculation") require reading the whole file to be sure nothing else depends on the code being touched.

---

## C. Security Plan — Findings & Target Model

### C.1 Findings from the legacy reference file, ranked by severity

**Status note:** the findings below were reverse-engineered by reading `legacy/nomad.html` —
they describe patterns in that historical reference file, not an active incident on any system
this project currently runs. `legacy/nomad.html` is not connected to REKT's Supabase project or
GitHub repo, both of which are new and empty. Nothing here is a live-fix task; it's the list of
anti-patterns the target model in §C.2/§D must not repeat, ever, from the very first migration.

**🔴 Critical (as documented in the reference file) — cross-tenant data exposure and privilege escalation**

The only RLS policy present in the legacy codebase's comments is:

```sql
CREATE POLICY "sm_all_authenticated" ON server_memberships
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

This grants **every logged-in user full read/write/delete on every row of `server_memberships`**, across every community — including the `role` column. In practice this means a member can, via a single authenticated REST call (not through the UI — directly against Supabase, e.g. from browser devtools), set their own `role` to `server_admin`, or edit anyone else's row. Combined with the fact that `trades` rows carry a client-supplied `discord_user_id`/`server_id`/`username` with no visible ownership check, and that the platform Superadmin dashboard fetches `trades?order=date.desc&select=*` using nothing more than a normal authenticated session token (implying `trades` SELECT is not scoped to the caller either) — the reference file's own design would let **any signed-in trader read or forge trade data belonging to any other trader or community.**

Concretely, this rules out ever writing `USING (true)` on a table with user data in REKT's new schema — see §C.2 and §D.4 for the corrected pattern.

**🟠 High — Secret-in-client rotating access code**

Each community's `seed` value is used client-side (`sa_generateMonthlyCode`/`ad_generateMonthlyCode`) to derive a 6-character monthly join code via `SHA256(seed + month + year)`. Because the derivation runs entirely in the browser and `seed` is a plain column fetched over the same REST API as everything else, any user who can read a `servers` row (which, per the finding above, may be any authenticated user) can compute every community's current and future codes themselves. A "secret" derivation that runs in JS with the secret shipped to JS isn't a secret.

**🟠 High — Unsalted client-side password hashing**

`password_hash` is still checked against `SHA256(password)` computed in the browser for legacy admin logins. This has no salt, no work factor, and is trivially reversible via rainbow tables if the `server_memberships` table is ever read (which, per the finding above, it currently can be, by anyone).

**🟡 Medium — No backend means no real rate limiting, input validation, or audit log**

Every "backend rule" (only admins can promote members, only your own trades are editable, etc.) is enforced by hiding UI elements. There is no server-side validation of trade payloads (e.g., nothing stops `pnl: 999999999999` or a negative `qty`), no rate limiting on writes, and no audit trail of who changed what.

**🟡 Medium — Financial-data integrity risk on `donate_addresses`**

If write access to `donate_addresses` is anywhere near as permissive as `server_memberships`, any authenticated user could silently redirect donation crypto addresses to their own wallet. This should be locked to service-role/admin-only writes with a public-read-only policy, and verified explicitly.

**🟢 Low — No secrets actually leaked**

The Supabase anon key in the client is fine — it's meant to be public; RLS is supposed to be the control, which is exactly why the RLS gaps above matter so much. No service-role key or other genuine secret appears in the shipped file.

### C.2 Target security model

- **All writes move behind an application backend.** The browser talks to Nomad's own API, not directly to PostgREST. The backend verifies the Supabase Auth JWT, resolves the caller's identity and role from the database (single source of truth), and only then executes a parameterized query.
- **RLS stays on as defense-in-depth**, scoped correctly (`user_id = auth.uid()` style ownership checks, tenant-scoped `SELECT`), even though the app backend is the primary gate — so a bug in application logic doesn't equal an open database.
- **Permission model**, not role string-matching (see §D.3): the backend checks `has_permission(user, 'create_trade')`, not `role === 'server_admin'`.
- **Exchange API keys** (Phase 7+) are encrypted at rest (e.g. envelope encryption via a KMS or `pgsodium`), scoped to trade-only permissions, never withdrawal-capable, and never returned to the client after the initial save.
- **Kill switch, position limits, and webhook signature verification** are designed into the Exchange Adapter module from day one, even though no exchange ships until Phase 7.
- **Rotating access codes**, if kept, are generated **server-side on request** and returned to an authorized admin only — never derived from a value the client already holds.
- **Build checklist for the new schema** (apply from the first migration, not as a later fix):
  1. Every RLS policy on a table with user data is owner-scoped (`user_id = auth.uid()`) or permission-scoped — never `USING (true)`.
  2. Any rotating/derived secret (like the old access-code idea, if it's kept) is generated server-side on request, never derived from a value the client can read.
  3. No password storage scheme other than what Supabase Auth / the chosen OAuth provider handles — no custom client-side hashing, salted or not.

---

## D. Target Architecture

### D.1 Shape: modular monolith, backend-owned data access

```
                         Browser / future mobile
                                   │
                    HTTPS (Nomad's own API, not raw PostgREST)
                                   │
        ┌──────────────────────────────────────────────┐
        │               REKT API (modular monolith)      │
        │                                                │
        │  modules/                                      │
        │    auth/        users/        journal/         │
        │    trades/      analytics/    markets/          │
        │    news/        profiles/     notifications/    │
        │    messaging/   (channels/DMs, P2P signaling)   │
        │    signals/     (master trader publishing)      │
        │    exchange/    (adapter interface, empty impl) │
        │                                                │
        │  shared/  database · validation · security ·   │
        │           logging · errors · permissions        │
        └───────────────────────┬────────────────────────┘
                                 │ service-role Postgres access
                                 ▼
                    Postgres (Supabase or self-hosted)
                     RLS enabled as defense-in-depth
```

This directly matches the modular-monolith structure requested — module boundaries are drawn along the same lines as the long-term product modules, so a module can later be peeled into its own service without a redesign, but nothing is split prematurely.

### D.2 Tenancy model: single-tenant, user-based (revised — no communities)

Per the latest direction, the Discord-server/"community" concept is dropped entirely. REKT is **flat, user-based**: every trader is just a user with a role (`trader`, `master_trader`, `superadmin`). There's no server/guild layer, no per-community membership, no "which community does this trade belong to."

What this simplifies vs. the original plan:
- `trades`, `journal_entries`, etc. are owned by `user_id` only — no nullable `community_id` to worry about.
- No community-scoped leaderboards, no "server admin" concept, no server picker on login, no Discord-guild matching logic (`_routeSession`'s guild-matching branch in Legacy Nomad goes away completely rather than being ported).
- Public/social surfaces (leaderboards, master-trader signal feed, profiles) are just platform-wide, not per-community — one leaderboard, one signal feed, scoped by role/visibility flags rather than by group membership.
- Discord OAuth can still be kept purely as a **login method** (identity provider), same as it works for Google/email elsewhere — it just no longer implies tenancy or guild membership. If you still want Discord sign-in, that's an auth-provider choice, not an architectural one.

This removes an entire migration axis from §D.5 below (no `server_memberships` → `community_memberships` mapping needed) — `server_memberships`/`users.role` simply migrate straight into `users` + `user_roles`, full stop.

### D.3 RBAC: three roles, mapped to permissions (revised)

```
role            permissions
────            ───────────
trader       →  view_own_journal, create_trade, edit_own_trade,
                 view_public_signals, send_message, join_chat_rooms
master_trader →  + publish_signal, publish_analysis, verified_badge,
                  create_chat_channel
superadmin   →  manage_users, promote_to_master_trader,
                 manage_platform, manage_all_data, moderate_any_content
```

Even with only three roles, keep the permission table (`roles`, `permissions`, `role_permissions`, `user_roles`) rather than hardcoding `role === 'master_trader'` checks throughout the code. Two concrete reasons this still matters at three roles:

1. **Promotion/demotion needs to take effect instantly and only from the backend.** Since you're the only superadmin and promotion is a manual, curated action (not self-serve), the promote action should be a single backend call that inserts a `user_roles` row — never a client-writable `role` column the way `server_memberships.role` is today. That closes the exact privilege-escalation gap found in §C.1.
2. **You will want finer control inside "master trader" sooner than you'd expect** — e.g. a master trader you trust for analysis but not yet for signals, or one you want to temporarily mute without fully demoting them. Permission-based checks let you grant/revoke a single capability (`publish_signal`) without touching their role, whereas a role-string check forces an all-or-nothing demotion.

`superadmin` stays a single, hard-gated row (mirroring Legacy Nomad's `superadmin_config` pattern) tied to your account specifically — no code path should be able to create a second one.

### D.6 Messaging (new module, revised — global, not community-scoped)

Design goal: Discord-like channels/DMs, cheap to run, without losing messages sent to offline users. Since there's no community layer, channels are just a flat, platform-wide feature — public channels anyone can join, DMs between two users, and channels a master trader creates for their followers (scoped by membership, not by a community entity).

**Architecture (unchanged reasoning, no community_id anywhere now):**

```
Two users online at once:
  UserA  ⇄  WebRTC data channel  ⇄  UserB      (P2P, no server cost, real-time)
                    │
                    └─ signaling only (who's online, how to connect) via a small server

Message needing durability (either party may be offline):
  UserA → REKT API → messages table (Postgres) → delivered/pulled by UserB when online
                                │
                                └─ IndexedDB cache on each client for instant load + offline scrollback

Media (images shared in chat):
  Always object storage (never peer-hosted) — a screenshot shouldn't disappear
  because the uploader's PC is off
```

**Schema addition:**
```
channels          (id, name, created_by, type['public'|'dm'|'master_trader_room'])
channel_members   (channel_id, user_id)
messages          (id, channel_id, sender_id, body, created_at, edited_at)
message_media     (id, message_id, storage_path)
```

**Why this hits the cost goal without the reliability gap:** text messages are cheap to store centrally at any realistic scale for this product (thousands of messages/day costs cents in Postgres storage) — the "peer-hosted" savings you were picturing mostly come from *not* running a media-heavy real-time infrastructure (voice, video, huge attachment volume), which this design also avoids by keeping media in plain object storage rather than a full Discord-scale CDN/voice stack. The P2P data channel is where you get a genuine, free win: two online users chatting live can bypass your server entirely for the actual message transport, with the server only brokering the initial connection.

**Phasing:** don't build this until the journal core (Phase 1–3) and RBAC are solid — a chat feature sitting on top of an unfixed authorization layer just gives you a second surface with the same cross-tenant exposure found in §C.1. See Phase 6.5 in the roadmap below.

### D.4 Database plan

**Problems with current schema:** no ownership scoping on `trades`; two sources of truth for role (`users` vs `server_memberships`); no schema migrations; secrets (`seed`) stored in a table the client can read; journal detail (tags, strategy, screenshots) flattened into `trades` instead of normalized; server/community concept baked into every table via `server_id` (now being removed, see §D.2).

**Target schema (MVP-only, no community/server tables):**

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

`server_memberships`/`users.role`/`donate_addresses` migrate as follows: `users` → merge into `users`+`profiles`; `server_memberships.role` → a `user_roles` row (`trader`/`master_trader`/`superadmin`) instead of a free string — no `community_memberships` table at all, since there's no community entity to belong to; `donate_addresses` unchanged but RLS locked to admin-write/public-read explicitly verified, not assumed. `trades.server_id` is simply dropped — every trade belongs to exactly one user, full stop.

**Indexing:** `trades(user_id, opened_at desc)` for the dashboard/calendar queries that dominate read volume; `signals(master_trader_id, published_at desc)` for the public signal feed; `channel_members(user_id)` for "which channels am I in" on chat load.

**RLS, correctly scoped this time:**
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

### D.5 Migration plan (monolith → target)

```
Current: nomad.html (browser talks directly to Supabase)
   │
   ├─ 1. Stand up the REKT API skeleton (auth passthrough only —
   │     verify Supabase JWT, no new features yet)
   │
   ├─ 2. Point the EXISTING trade read/write calls at the new API
   │     instead of PostgREST, one call site at a time, keeping
   │     behavior identical (strangler-fig, not a rewrite)
   │
   ├─ 3. Introduce users/profiles/roles/permissions tables;
   │     backfill from users + server_memberships directly into
   │     user_roles (trader/master_trader/superadmin) — no
   │     community_memberships intermediate step needed;
   │     run both old-role-check and new-permission-check in
   │     parallel, log mismatches, don't cut over until they agree
   │
   ├─ 4. Migrate trades → normalized schema (trade + journal_entry
   │     + tags), dropping server_id, backfilling existing
   │     flattened rows against user_id only
   │
   ├─ 5. Lock down RLS to the corrected policies; remove the
   │     client's direct anon-key access to write endpoints
   │
   ├─ 6. Retire server_memberships/users.role/servers table/
   │     client-side password hashing once nothing reads them
   │
   └─ 7. Split the single HTML file into the module structure,
         page by page, starting with the trader journal (mb-*)
         since it's the actual MVP core; the community-admin UI
         (ad-*) is retired rather than migrated — its remaining
         useful bits (member list, promote-to-master-trader
         action) fold into the superadmin console (sa-*) instead
```

User data is never deleted in this sequence — each step adds a new correct path and verifies it against the old one before removing the old one.

---

## E. MVP Scope

```
MUST HAVE                          SHOULD HAVE                LATER                    DO NOT BUILD YET
──────────                         ───────────                ─────                    ────────────────
Auth (Supabase, backend-verified)  Public profile pages        Signals                  Proprietary exchange
Permission-based RBAC              Basic watchlist              Master Trader program    Custodial wallet
Trade CRUD (backend-owned)         News/economic calendar       Subscriptions            P2P sync
Journal entries + tags + strategy  Screenshot upload            Messaging (channels/DMs)  Copy trading
Analytics: win rate, avg W/L,      Trading calendar heatmap     Signals/analysis posts   AI review
  profit factor, expectancy,                                   Multi-exchange terminal   Voice chat
  total R, max drawdown, ROI
Dashboard (own data only)
Fixed RLS + audit log
Master trader promotion (superadmin-only action)
```

Note the analytics list intentionally adds **expectancy, total R, and max drawdown**, which the current app doesn't compute at all despite being basic requirements for a trading journal — this is new work, not a port.

---

## F. Roadmap (sequenced, small milestones)

1. **Phase 0 — Audit (this document) + infra setup.** Legacy findings documented as anti-patterns to avoid (§C.1). New GitHub repo and new Supabase project created; Cloudflare role to be decided when a deployment target is actually needed.
2. **Phase 1 — Foundation.** API skeleton, JWT verification, users/roles/permissions schema, structured logging/error handling, CI, `CLAUDE.md`/`ARCHITECTURE.md` scaffolding.
3. **Phase 2 — Journal core.** Trade CRUD, journal entries, tags, strategies, screenshots (object storage), migrated off direct PostgREST access.
4. **Phase 3 — Analytics.** Deterministic, unit-tested win rate/PF/expectancy/R/drawdown engine; replace the ad-hoc "trader score" formula with named, explained metrics.
5. **Phase 4 — Dashboard + calendar.**
6. **Phase 5 — Markets + news**, both behind an abstracted data-provider interface so the source can change without touching callers.
7. **Phase 6 — Public profiles**, laying the groundwork for the eventual social/signal layer without building it yet.
8. **Phase 6.5 — Messaging** (§D.6): channels schema, backend-relayed durable messages, IndexedDB client cache, then WebRTC P2P data channel for live delivery between online users as an optimization on top of a working durable path — not a replacement for it.
9. **Phase 7 — Exchange adapter**, one exchange, sandbox/testnet first, trade-only API scopes, kill switch and position limits built before any live-money toggle exists.

---

## G. Cost Estimate

Rough monthly infrastructure, assuming Supabase (Postgres + Auth + Storage) and a small managed host (e.g. Fly.io/Render) for the API — fixed costs dominate at low scale, usage-based costs (storage, market/news data, email) grow with users:

| Users | DB/Auth | API hosting | Object storage | Market/News data | Email | Total (approx) |
|---|---|---|---|---|---|---|
| 10 | Free tier | Free/hobby tier | Free tier | Free tier feeds | Free tier | **$0–25** |
| 100 | ~$25 (Supabase Pro) | ~$10–20 | ~$5 | Free/low-cost feed | Free tier | **~$50–75** |
| 1,000 | ~$25–50 | ~$25–50 | ~$10–20 | Paid feed, ~$30–100 | ~$10 | **~$150–250** |
| 10,000 | ~$100–300 (add-ons/read replicas) | ~$100–200 | ~$50–100 | ~$100–300 | ~$30–50 | **~$500–1,000** |
| 100,000 | Custom/dedicated Postgres, likely $1,000+ | Horizontally scaled, $500+ | $300+ | Enterprise data licensing, highly variable | $100+ | **$3,000+** (needs real vendor negotiation) |

These are directional, not quotes — market/news data licensing in particular varies enormously by provider and should be re-priced once a specific vendor is chosen in Phase 5.

---

## H. Documentation to create for AI-assisted development

`CLAUDE.md` (module boundaries, "don't touch X while working on Y" rules), `ARCHITECTURE.md` (this document, kept current), `DATABASE.md` (schema + RLS as version-controlled SQL, not comments in a JS file), `SECURITY.md` (the findings above plus the remediation checklist, updated as items close), `API.md`, `ROADMAP.md`, `CONTRIBUTING.md` with a `feat/<module>` branch-per-module convention so an AI agent's change set stays reviewable and scoped. Reference "REKT" as the product name in all of these; keep "Legacy Nomad V0" only where the doc is specifically describing the pre-migration codebase (e.g. `ARCHITECTURE.md`'s history section).

---

## Immediate next step

Start Phase 1 on the new Supabase project: users/profiles/roles/permissions schema (§D.4), with RLS written correctly from the first migration per §C.1's findings — there is no existing data to migrate and no live system to patch, so there's no reason to ship a table without correct RLS even temporarily.
