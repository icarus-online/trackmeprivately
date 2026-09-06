import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { POST, OPTIONS } from '../route';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    website: { findUnique: vi.fn(), findMany: vi.fn() },
    event: { create: vi.fn() },
  },
}));

const website = { id: 'website-id', name: 'My Web', domain: 'mysite.com', createdAt: new Date() };

function post(origin?: string) {
  return POST(new Request('http://localhost/api/collect', {
    method: 'POST', headers: origin === undefined ? {} : { Origin: origin },
    body: JSON.stringify({ website: website.id }),
  }));
}

function preflight(origin: string, method = 'POST', headers = 'content-type') {
  return OPTIONS(new Request('http://localhost/api/collect', {
    method: 'OPTIONS', headers: {
      Origin: origin,
      'Access-Control-Request-Method': method,
      'Access-Control-Request-Headers': headers,
    },
  }));
}

describe('Collection origin isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(prisma.website.findUnique).mockResolvedValue(website);
    vi.mocked(prisma.website.findMany).mockResolvedValue([website]);
  });
  afterEach(() => vi.unstubAllEnvs());

  test.each(['https://mysite.com', 'https://www.mysite.com'])('allows registered origin %s', async (origin) => {
    const pre = await preflight(origin);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(pre.headers.get('Vary')).toContain('Origin');
    expect(pre.headers.has('Access-Control-Allow-Credentials')).toBe(false);
    const res = await post(origin);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(prisma.event.create).toHaveBeenCalledOnce();
  });

  test.each(['null', 'not-a-url', '', 'https://mysite.com/path', 'http://mysite.com', 'https://mysite.com:8443', 'https://mysite.com.evil.test', 'https://user@mysite.com', 'https://evil.test'])('rejects invalid or unrelated origin %s without writes', async (origin) => {
    for (const res of [await preflight(origin), await post(origin)]) {
      expect(res.status).toBe(403);
      expect(res.headers.has('Access-Control-Allow-Origin')).toBe(false);
    }
    expect(prisma.event.create).not.toHaveBeenCalled();
  });

  test('checks the selected website after preflight for another registered site', async () => {
    vi.mocked(prisma.website.findMany).mockResolvedValue([website, { ...website, domain: 'other.test' }]);
    expect((await preflight('https://other.test')).status).toBe(204);
    expect((await post('https://other.test')).status).toBe(403);
    expect(prisma.event.create).not.toHaveBeenCalled();
  });

  test('production ignores development bypasses', async () => {
    vi.stubEnv('DISABLE_ORIGIN_VERIFICATION', 'true');
    for (const origin of ['http://localhost:3000', 'https://evil.test']) {
      expect((await post(origin)).status).toBe(403);
      expect((await preflight(origin)).status).toBe(403);
    }
    expect(prisma.event.create).not.toHaveBeenCalled();
  });

  test('preserves headerless privacy clients without granting browser CORS', async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(res.headers.has('Access-Control-Allow-Origin')).toBe(false);
  });

  test('rejects unsupported methods and headers', async () => {
    expect((await preflight('https://mysite.com', 'DELETE')).status).toBe(403);
    expect((await preflight('https://mysite.com', 'POST', 'authorization')).status).toBe(403);
  });

  test('fails closed when registered domains cannot be read', async () => {
    vi.mocked(prisma.website.findMany).mockRejectedValue(new Error('unavailable'));
    const res = await preflight('https://mysite.com');
    expect(res.status).toBe(503);
    expect(res.headers.has('Access-Control-Allow-Origin')).toBe(false);
  });
});
