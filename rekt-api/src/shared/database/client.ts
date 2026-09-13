import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example). ' +
      'The service role key bypasses RLS — it must never reach the client, only this server.'
  );
}

// Server-side client only. This key bypasses RLS entirely, which is fine here because
// every query this API makes is on behalf of an already-authenticated, already-authorized
// request (see shared/security/jwt.ts + shared/permissions) — the app layer is the primary
// gate per ARCHITECTURE.md §C.2, RLS is the backstop for anything that talks to Postgres
// directly (which, after Phase 1, should be nothing from the browser).
export const db = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
