import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getSecretKey,
  getSessionMaxAge,
  getSessionSameSite,
  getSessionCookieDomain,
  getSessionCookieOptions,
  encryptSession,
  decryptSession,
} from '../auth';

describe('Auth Utilities', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('getSecretKey', () => {
    test('should throw error in production if NEXTAUTH_SECRET is not set', () => {
      vi.stubEnv('NODE_ENV', 'production');
      delete process.env.NEXTAUTH_SECRET;
      expect(() => getSecretKey()).toThrowError(/NEXTAUTH_SECRET/);
    });

    test('should return key in production if NEXTAUTH_SECRET is set', () => {
      vi.stubEnv('NODE_ENV', 'production');
      process.env.NEXTAUTH_SECRET = 'my-secret-key';
      const key = getSecretKey();
      expect(key).toBeInstanceOf(Uint8Array);
    });

    test('should return default fallback key in development if NEXTAUTH_SECRET is not set', () => {
      vi.stubEnv('NODE_ENV', 'development');
      delete process.env.NEXTAUTH_SECRET;
      const key = getSecretKey();
      expect(key).toBeInstanceOf(Uint8Array);
    });
  });

  describe('getSessionMaxAge', () => {
    test('should return default 30 days when unset', () => {
      delete process.env.SESSION_MAX_AGE;
      expect(getSessionMaxAge()).toBe(30 * 24 * 60 * 60);
    });

    test('should return parsed integer value when valid', () => {
      process.env.SESSION_MAX_AGE = '3600';
      expect(getSessionMaxAge()).toBe(3600);
    });

    test('should fallback to 30 days when value is non-integer or negative', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      process.env.SESSION_MAX_AGE = 'invalid';
      expect(getSessionMaxAge()).toBe(30 * 24 * 60 * 60);

      process.env.SESSION_MAX_AGE = '-100';
      expect(getSessionMaxAge()).toBe(30 * 24 * 60 * 60);

      process.env.SESSION_MAX_AGE = '123.45';
      expect(getSessionMaxAge()).toBe(30 * 24 * 60 * 60);
      
      expect(consoleWarnSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('getSessionSameSite', () => {
    test('should default to lax when unset', () => {
      delete process.env.SESSION_COOKIE_SAME_SITE;
      expect(getSessionSameSite()).toBe('lax');
    });

    test('should accept lax, strict, and none (case insensitive)', () => {
      process.env.SESSION_COOKIE_SAME_SITE = 'STRICT';
      expect(getSessionSameSite()).toBe('strict');

      process.env.SESSION_COOKIE_SAME_SITE = 'none';
      expect(getSessionSameSite()).toBe('none');

      process.env.SESSION_COOKIE_SAME_SITE = 'Lax';
      expect(getSessionSameSite()).toBe('lax');
    });

    test('should fallback to lax and log warning for invalid values', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      process.env.SESSION_COOKIE_SAME_SITE = 'invalid';
      expect(getSessionSameSite()).toBe('lax');
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  describe('getSessionCookieDomain', () => {
    test('should return undefined when unset or empty', () => {
      delete process.env.SESSION_COOKIE_DOMAIN;
      expect(getSessionCookieDomain()).toBeUndefined();

      process.env.SESSION_COOKIE_DOMAIN = '  ';
      expect(getSessionCookieDomain()).toBeUndefined();
    });

    test('should return trimmed domain name when set', () => {
      process.env.SESSION_COOKIE_DOMAIN = '  example.com  ';
      expect(getSessionCookieDomain()).toBe('example.com');
    });
  });

  describe('getSessionCookieOptions', () => {
    test('should set secure flag in production or when SameSite is none', () => {
      vi.stubEnv('NODE_ENV', 'production');
      delete process.env.SESSION_COOKIE_SAME_SITE;
      expect(getSessionCookieOptions().secure).toBe(true);

      vi.stubEnv('NODE_ENV', 'development');
      process.env.SESSION_COOKIE_SAME_SITE = 'none';
      expect(getSessionCookieOptions().secure).toBe(true);

      vi.stubEnv('NODE_ENV', 'development');
      delete process.env.SESSION_COOKIE_SAME_SITE;
      expect(getSessionCookieOptions().secure).toBe(false);
    });

    test('should conditionally include domain if configured', () => {
      delete process.env.SESSION_COOKIE_DOMAIN;
      expect(getSessionCookieOptions().domain).toBeUndefined();

      process.env.SESSION_COOKIE_DOMAIN = 'example.com';
      expect(getSessionCookieOptions().domain).toBe('example.com');
    });
  });

  describe('encryptSession and decryptSession', () => {
    test('should encrypt and decrypt payloads successfully', async () => {
      process.env.NEXTAUTH_SECRET = 'test-secret-value-longer-size-for-jwt-key';
      const payload = { userId: '123', username: 'admin' };
      
      const token = await encryptSession(payload);
      expect(token).toBeTypeOf('string');

      const decrypted = await decryptSession(token);
      expect(decrypted).not.toBeNull();
      expect(decrypted?.userId).toBe('123');
      expect(decrypted?.username).toBe('admin');
    });

    test('should return null for expired or invalid tokens', async () => {
      process.env.NEXTAUTH_SECRET = 'test-secret-value-longer-size-for-jwt-key';
      
      const decryptedInvalid = await decryptSession('invalid-token');
      expect(decryptedInvalid).toBeNull();
    });
  });
});
