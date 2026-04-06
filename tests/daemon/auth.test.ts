import { describe, it, expect } from 'vitest';
import { validateToken } from '../../src/daemon/auth';

describe('auth', () => {
  it('returns true for matching tokens', () => {
    expect(validateToken('abc123', 'abc123')).toBe(true);
  });

  it('returns false for non-matching tokens', () => {
    expect(validateToken('abc123', 'xyz789')).toBe(false);
  });

  it('returns false for different length tokens', () => {
    expect(validateToken('short', 'muchlongertoken')).toBe(false);
  });

  it('returns false for empty string vs non-empty', () => {
    expect(validateToken('', 'token')).toBe(false);
  });

  it('returns true for empty strings', () => {
    expect(validateToken('', '')).toBe(true);
  });

  it('returns false for non-string inputs', () => {
    expect(validateToken(null as any, 'token')).toBe(false);
    expect(validateToken('token', undefined as any)).toBe(false);
    expect(validateToken(123 as any, 456 as any)).toBe(false);
  });

  it('handles long tokens correctly', () => {
    const longToken = 'a'.repeat(1000);
    expect(validateToken(longToken, longToken)).toBe(true);
    expect(validateToken(longToken, 'b'.repeat(1000))).toBe(false);
  });
});
