import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../database/client.js';

/**
 * Checks a permission via the `has_permission` SQL function created in
 * migrations/0001_phase1_foundation.sql, rather than comparing role strings —
 * per ARCHITECTURE.md §D.3, this is deliberate so a future finer-grained grant
 * doesn't require an application-code change wherever the role was checked.
 */
export async function hasPermission(userId: string, permissionName: string): Promise<boolean> {
  const { data, error } = await db.rpc('has_permission', {
    check_user_id: userId,
    perm_name: permissionName,
  });

  if (error) {
    throw new Error(`has_permission check failed: ${error.message}`);
  }

  return data === true;
}

/**
 * Fastify preHandler factory: requires the caller to already be authenticated
 * (register after fastify.requireAuth) and to hold the given permission.
 */
export function requirePermission(permissionName: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Missing bearer token' } });
    }

    const allowed = await hasPermission(request.user.id, permissionName);
    if (!allowed) {
      return reply
        .code(403)
        .send({ error: { code: 'FORBIDDEN', message: `Missing permission: ${permissionName}` } });
    }
  };
}
