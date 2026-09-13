import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { verifySupabaseJwt, type AuthenticatedUser } from './jwt.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * Registers `fastify.requireAuth` as a preHandler for any route that needs a
 * verified caller. The API never trusts a client-supplied user id — identity
 * always comes from a verified JWT, resolved here, once, at the edge.
 */
export default fp(async function authenticatePlugin(fastify: FastifyInstance) {
  fastify.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Missing bearer token' } });
    }

    const token = header.slice('Bearer '.length);
    try {
      request.user = verifySupabaseJwt(token);
    } catch {
      return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired token' } });
    }
  });
});
