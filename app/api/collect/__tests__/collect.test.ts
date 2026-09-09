import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '../route';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    website: {
      findUnique: vi.fn(),
    },
    event: {
      create: vi.fn(),
    },
  },
}));

describe('Collector Ingest API Endpoint', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('should return 400 when website id is missing in payload', async () => {
    const req = new Request('http://localhost/api/collect', {
      method: 'POST',
      body: JSON.stringify({ event: 'pageview', url: '/about' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Missing website id');
  });

  test('should return 404 when website is not found in database', async () => {
    vi.mocked(prisma.website.findUnique).mockResolvedValue(null);

    const req = new Request('http://localhost/api/collect', {
      method: 'POST',
      body: JSON.stringify({ website: 'missing-id', event: 'pageview' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Website not found');
  });

  describe('Origin Verification', () => {
    beforeEach(() => {
      vi.mocked(prisma.website.findUnique).mockResolvedValue({
        id: 'website-id',
        name: 'My Web',
        domain: 'mysite.com',
        createdAt: new Date(),
      });
      vi.mocked(prisma.event.create).mockResolvedValue({
        id: 'event-id',
        websiteId: 'website-id',
        sessionId: 'session-id',
        eventName: 'pageview',
        url: '/',
        referrer: null,
        browser: 'Chrome',
        os: 'Windows',
        deviceType: 'desktop',
        createdAt: new Date(),
      });
    });

    test('should return 403 when Origin header does not match registered domain', async () => {
      const req = new Request('http://localhost/api/collect', {
        method: 'POST',
        headers: {
          'Origin': 'https://malicious.com',
        },
        body: JSON.stringify({ website: 'website-id', event: 'pageview' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('Origin not allowed');
    });

    test('should return 403 when Referer header does not match registered domain', async () => {
      const req = new Request('http://localhost/api/collect', {
        method: 'POST',
        headers: {
          'Referer': 'https://malicious.com/some/path',
        },
        body: JSON.stringify({ website: 'website-id', event: 'pageview' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('Origin not allowed');
    });

    test('should return 200 when Origin header matches website domain exactly', async () => {
      const req = new Request('http://localhost/api/collect', {
        method: 'POST',
        headers: {
          'Origin': 'https://mysite.com',
        },
        body: JSON.stringify({ website: 'website-id', event: 'pageview' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(prisma.event.create).toHaveBeenCalled();
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://mysite.com');
      expect(res.headers.get('Vary')).toBe('Origin');
    });

    test('should return 200 when Referer header matches website domain exactly', async () => {
      const req = new Request('http://localhost/api/collect', {
        method: 'POST',
        headers: {
          'Referer': 'https://mysite.com/subpage',
        },
        body: JSON.stringify({ website: 'website-id', event: 'pageview' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    test('should return 200 and bypass verification when domain is localhost or 127.0.0.1', async () => {
      const req = new Request('http://localhost/api/collect', {
        method: 'POST',
        headers: {
          'Origin': 'http://localhost:3000',
        },
        body: JSON.stringify({ website: 'website-id', event: 'pageview' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    test('should return 200 and bypass verification when DISABLE_ORIGIN_VERIFICATION is true', async () => {
      process.env.DISABLE_ORIGIN_VERIFICATION = 'true';
      const req = new Request('http://localhost/api/collect', {
        method: 'POST',
        headers: {
          'Origin': 'https://malicious.com',
        },
        body: JSON.stringify({ website: 'website-id', event: 'pageview' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    test('should return 200 when origin/referer are missing completely (handles privacy browsers)', async () => {
      const req = new Request('http://localhost/api/collect', {
        method: 'POST',
        body: JSON.stringify({ website: 'website-id', event: 'pageview' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
    });
  });
});
