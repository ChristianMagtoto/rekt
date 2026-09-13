import { db } from '../database/client.js';

/**
 * Writes one row to audit_logs. There is deliberately no update/delete
 * counterpart — the table has no UPDATE/DELETE RLS policy for anyone,
 * including superadmin, so this is genuinely append-only (SECURITY.md).
 */
export async function writeAuditLog(entry: {
  actorUserId: string;
  action: string;
  targetTable?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await db.from('audit_logs').insert({
    actor_user_id: entry.actorUserId,
    action: entry.action,
    target_table: entry.targetTable ?? null,
    target_id: entry.targetId ?? null,
    metadata: entry.metadata ?? null,
  });

  if (error) {
    // Deliberately non-fatal: a failed audit write shouldn't roll back the
    // action it was describing, but it must be visible in server logs.
    console.error('audit log write failed', error, entry);
  }
}
