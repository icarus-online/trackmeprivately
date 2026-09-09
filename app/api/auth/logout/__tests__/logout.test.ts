import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { GET, POST } from '../route';
import { decryptSession, setSessionCookie } from '@/lib/auth';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

describe('logout contracts and cookie scope', () => {
  let cookieResponse: NextResponse;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXTAUTH_SECRET', 'isolated-logout-test-secret-not-for-runtime');
    vi.stubEnv('SESSION_MAX_AGE', '3600');
    vi.stubEnv('SESSION_COOKIE_DOMAIN', undefined);
    vi.stubEnv('SESSION_COOKIE_SAME_SITE', 'strict');
    cookieResponse = new NextResponse();
    vi.mocked(cookies).mockResolvedValue(cookieResponse.cookies as Awaited<ReturnType<typeof cookies>>);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  test.each([undefined, '', 'not-an-origin', 'https://analytics.example.test',
    'https://one.example.test,https://two.example.test'])('needs no public-origin configuration: %s', async (origin) => {
    vi.stubEnv('ALLOWED_RP_ORIGIN', origin);
    const response = await GET();
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('/login');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(new URL(response.headers.get('location')!, 'https://analytics.example.test/api/auth/logout').href)
      .toBe('https://analytics.example.test/login');
  });

  test.each([undefined, '  .example.test  '])('expires the same scope used at creation: %s', async (domain) => {
    vi.stubEnv('SESSION_COOKIE_DOMAIN', domain);
    await setSessionCookie({ userId: 'synthetic-user', username: 'synthetic-admin' });
    const created = cookieResponse.cookies.get('session_token')!;
    expect(created.path).toBe('/');
    expect(created.domain).toBe(domain?.trim());
    expect(created.maxAge).toBe(3600);

    await GET();
    const expired = cookieResponse.cookies.get('session_token')!;
    expect(expired).toMatchObject({
      value: '', path: created.path, maxAge: 0,
      httpOnly: true, secure: true, sameSite: 'strict',
    });
    expect(expired.domain).toBe(created.domain);
    expect(new Date(expired.expires!).getTime()).toBeLessThanOrEqual(Date.now());
    const serialized = cookieResponse.headers.get('set-cookie')!;
    expect(serialized).toContain('Path=/');
    expect(serialized).toContain('Max-Age=0');
    expect(serialized.includes('Domain=')).toBe(Boolean(domain));

    // Browser expiry is not server-side JWT revocation in this session model.
    expect(await decryptSession(created.value)).toMatchObject({ userId: 'synthetic-user' });
  });

  test('preserves POST JSON success without a redirect and expires the configured domain', async () => {
    vi.stubEnv('SESSION_COOKIE_DOMAIN', '.example.test');
    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(response.headers.get('location')).toBeNull();
    expect(cookieResponse.cookies.get('session_token')).toMatchObject({
      value: '', path: '/', domain: '.example.test', maxAge: 0,
    });
  });
});
