import jwt from 'jsonwebtoken';

export interface AuthenticatedUser {
  id: string; // matches public.users.id / auth.users.id
  email?: string;
}

const jwtSecret = process.env.SUPABASE_JWT_SECRET;

/**
 * Verifies a Supabase Auth access token and returns the caller's identity.
 * Throws on any invalid/expired/malformed token — callers must catch and 401.
 *
 * ASSUMPTION: the project uses HS256 JWTs signed with a shared secret
 * (Project Settings > API > JWT Settings > JWT Secret). If the project has been
 * switched to Supabase's newer asymmetric signing keys, this needs to fetch the
 * project's JWKS and verify with the matching public key instead — check that
 * setting before shipping this to production.
 */
export function verifySupabaseJwt(token: string): AuthenticatedUser {
  if (!jwtSecret) {
    throw new Error('SUPABASE_JWT_SECRET is not set (see .env.example)');
  }

  const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as {
    sub: string;
    email?: string;
  };

  if (!decoded.sub) {
    throw new Error('Token has no subject (sub) claim');
  }

  return { id: decoded.sub, email: decoded.email };
}
