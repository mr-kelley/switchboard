import { timingSafeEqual } from 'crypto';

/**
 * Validate a client-provided token against the configured token.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function validateToken(provided: string, expected: string): boolean {
  if (typeof provided !== 'string' || typeof expected !== 'string') {
    return false;
  }
  if (provided.length !== expected.length) {
    return false;
  }
  try {
    const a = Buffer.from(provided, 'utf-8');
    const b = Buffer.from(expected, 'utf-8');
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
