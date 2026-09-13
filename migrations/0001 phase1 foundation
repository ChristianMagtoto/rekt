-- ══════════════════════════════════════════════════════════════════
-- Phase 1 — Foundation schema
-- users / profiles / roles / permissions / role_permissions /
-- user_roles / audit_logs
--
-- Per ARCHITECTURE.md §D.3–D.4 and SECURITY.md's build checklist:
-- every table with user data gets owner- or permission-scoped RLS in
-- THIS migration, not added later. No USING (true) anywhere.
--
-- Run this whole file in one paste in a fresh project — unlike the
-- old incident-response scripts, there's no live traffic to protect
-- against mid-migration, so it's written as one transaction.
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ──────────────────────────────────────────────────────────────────
-- 1. Core tables
-- ──────────────────────────────────────────────────────────────────

-- users mirrors auth.users 1:1 (id is the same UUID as Supabase Auth's
-- user id) — this is the "single source of truth for identity" the
-- audit called for; no second users table, no discord_user_id-as-PK.
CREATE TABLE public.users (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text NOT NULL,
  discord_user_id text,               -- nullable: Discord is a login method, not identity (§D.2)
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  user_id       uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  display_name  text,
  bio           text,
  public        boolean NOT NULL DEFAULT false,
  avatar_url    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- RBAC core (§D.3) — three roles today, but permission-checked, not
-- string-compared, so adding finer-grained control later never
-- requires a schema change.
CREATE TABLE public.roles (
  id    smallint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name  text UNIQUE NOT NULL
);

CREATE TABLE public.permissions (
  id    smallint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name  text UNIQUE NOT NULL
);

CREATE TABLE public.role_permissions (
  role_id       smallint NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id smallint NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE public.user_roles (
  user_id  uuid     NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_id  smallint NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES public.users(id), -- who promoted them (null for the signup default)
  PRIMARY KEY (user_id, role_id)
);

-- Immutable audit trail — the "no audit log" Medium finding, fixed
-- from Phase 1 rather than bolted on later.
CREATE TABLE public.audit_logs (
  id            bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  actor_user_id uuid REFERENCES public.users(id),
  action        text NOT NULL,
  target_table  text,
  target_id     text,
  metadata      jsonb,
  at            timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────────
-- 2. Seed roles/permissions from ARCHITECTURE.md §D.3's mapping
-- ──────────────────────────────────────────────────────────────────

INSERT INTO public.roles (name) VALUES ('trader'), ('master_trader'), ('superadmin');

INSERT INTO public.permissions (name) VALUES
  ('view_own_journal'), ('create_trade'), ('edit_own_trade'),
  ('view_public_signals'), ('send_message'), ('join_chat_rooms'),
  ('publish_signal'), ('publish_analysis'), ('verified_badge'), ('create_chat_channel'),
  ('manage_users'), ('promote_to_master_trader'), ('manage_platform'),
  ('manage_all_data'), ('moderate_any_content');

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.name = 'trader' AND p.name IN (
  'view_own_journal', 'create_trade', 'edit_own_trade',
  'view_public_signals', 'send_message', 'join_chat_rooms'
);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.name = 'master_trader' AND p.name IN (
  'view_own_journal', 'create_trade', 'edit_own_trade',
  'view_public_signals', 'send_message', 'join_chat_rooms',
  'publish_signal', 'publish_analysis', 'verified_badge', 'create_chat_channel'
);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.name = 'superadmin'; -- superadmin gets every permission, current and future

-- ──────────────────────────────────────────────────────────────────
-- 3. Helper functions (SECURITY DEFINER, used by RLS + the API layer)
-- ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.has_permission(check_user_id uuid, perm_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = check_user_id AND p.name = perm_name
  );
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = check_user_id AND r.name = 'superadmin'
  );
$$;

-- ──────────────────────────────────────────────────────────────────
-- 4. Signup trigger — every new auth.users row gets a users row, a
--    blank profile, and the default 'trader' role. Runs as the
--    definer (bypasses RLS), so the client never inserts these rows
--    directly.
-- ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trader_role_id smallint;
BEGIN
  INSERT INTO public.users (id, email, discord_user_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'provider_id', NULL)
  );

  INSERT INTO public.profiles (user_id) VALUES (NEW.id);

  SELECT id INTO trader_role_id FROM public.roles WHERE name = 'trader';
  INSERT INTO public.user_roles (user_id, role_id) VALUES (NEW.id, trader_role_id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ──────────────────────────────────────────────────────────────────
-- 5. RLS — enabled and scoped on every table, no exceptions.
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- users: read your own row, or any row if you're superadmin. No
-- direct insert/delete from the client (signup trigger + CASCADE
-- handle it). Update is limited to your own row and excludes
-- role-bearing columns because there are none on this table --
-- role lives in user_roles, deliberately, so there is no "role
-- column" for a client update to smuggle a change into.
CREATE POLICY users_select_own_or_superadmin ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_superadmin());

CREATE POLICY users_update_own ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY users_superadmin_delete ON public.users
  FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- profiles: public ones are readable by anyone signed in; your own is
-- always readable/writable by you; superadmin can moderate any.
CREATE POLICY profiles_select_public_or_own_or_superadmin ON public.profiles
  FOR SELECT TO authenticated
  USING (public = true OR user_id = auth.uid() OR public.is_superadmin());

CREATE POLICY profiles_update_own_or_superadmin ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin())
  WITH CHECK (user_id = auth.uid() OR public.is_superadmin());

-- roles/permissions/role_permissions: reference data, world-readable
-- to any signed-in user (knowing the permission list isn't sensitive),
-- write-locked to superadmin only.
CREATE POLICY roles_select_authenticated ON public.roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY roles_superadmin_write ON public.roles
  FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE POLICY permissions_select_authenticated ON public.permissions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY permissions_superadmin_write ON public.permissions
  FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE POLICY role_permissions_select_authenticated ON public.role_permissions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY role_permissions_superadmin_write ON public.role_permissions
  FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- user_roles: you can see your own role assignment; superadmin sees
-- and manages everyone's. Role changes (promotion to master_trader,
-- etc.) are a superadmin-only action per §D.3 — no self-service path.
CREATE POLICY user_roles_select_own_or_superadmin ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin());

CREATE POLICY user_roles_superadmin_write ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- audit_logs: append-only. Any authenticated action can log itself as
-- long as it claims its own user id as actor; only superadmin can
-- read the trail. No UPDATE/DELETE policy exists for anyone —
-- default-deny means the log is immutable even to superadmin.
CREATE POLICY audit_logs_insert_self ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid());

CREATE POLICY audit_logs_select_superadmin ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_superadmin());

-- ──────────────────────────────────────────────────────────────────
-- 6. Indexes
-- ──────────────────────────────────────────────────────────────────

CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_profiles_public ON public.profiles(public) WHERE public = true;
CREATE INDEX idx_audit_logs_actor_at ON public.audit_logs(actor_user_id, at DESC);

COMMIT;

-- ══════════════════════════════════════════════════════════════════
-- After running: create your own superadmin row manually (there is no
-- self-serve path to superadmin by design — §D.3). Sign up normally
-- through the app first so the trigger creates your users/profile/
-- trader role, then run, as the project owner in the SQL editor:
--
--   INSERT INTO public.user_roles (user_id, role_id)
--   SELECT '<your-auth-user-uuid>', id FROM public.roles WHERE name = 'superadmin';
--
-- A user can hold both 'trader' and 'superadmin' rows in user_roles
-- simultaneously (has_permission checks across all of a user's roles),
-- so this doesn't require removing the trader role first.
-- ══════════════════════════════════════════════════════════════════
