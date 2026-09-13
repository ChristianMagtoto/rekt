import type { FastifyInstance } from 'fastify';
import { db } from '../../shared/database/client.js';

export default async function authRoutes(fastify: FastifyInstance) {
  // GET /auth/me — the canonical "who am I, what can I do" endpoint.
  // Every other module's authorization should be checkable through the same
  // has_permission() path this exercises; this route exists partly as a
  // smoke test that JWT verification + the RBAC schema actually agree.
  fastify.get('/auth/me', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const userId = request.user!.id;

    const { data: userRow, error: userError } = await db
      .from('users')
      .select('id, email, discord_user_id, created_at')
      .eq('id', userId)
      .single();

    if (userError || !userRow) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User record not found' } });
    }

    const { data: profile } = await db
      .from('profiles')
      .select('display_name, bio, public, avatar_url')
      .eq('user_id', userId)
      .single();

    const { data: roleRows } = await db
      .from('user_roles')
      .select('roles(name)')
      .eq('user_id', userId);

    const roles = (roleRows ?? []).map((r: any) => r.roles?.name).filter(Boolean);

    const { data: permissionRows } = await db
      .from('user_roles')
      .select('roles(role_permissions(permissions(name)))')
      .eq('user_id', userId);

    const permissions = Array.from(
      new Set(
        (permissionRows ?? []).flatMap((r: any) =>
          (r.roles?.role_permissions ?? []).map((rp: any) => rp.permissions?.name).filter(Boolean)
        )
      )
    );

    return reply.send({
      user: userRow,
      profile: profile ?? null,
      roles,
      permissions,
    });
  });
}
