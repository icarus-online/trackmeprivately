import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { UAParser } from 'ua-parser-js';

function parseOrigin(value: string, isOriginHeader = false): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (isOriginHeader && value !== url.origin) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function matchesWebsite(origin: string, domain: string): boolean {
  const expected = parseOrigin(domain.includes('://') ? domain : `https://${domain}`);
  if (!expected) return false;
  const url = new URL(expected);
  const alias = new URL(expected);
  alias.hostname = url.hostname.startsWith('www.')
    ? url.hostname.slice(4) : `www.${url.hostname}`;
  return origin === expected || origin === alias.origin;
}

function developmentBypass(origin: string): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.DISABLE_ORIGIN_VERIFICATION === 'true'
    || ['localhost', '127.0.0.1'].includes(new URL(origin).hostname);
}

function corsHeaders(origin?: string): Record<string, string> {
  return {
    'Vary': 'Origin',
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
  };
}

function generateSessionId(ip: string, userAgent: string, websiteId: string) {
  const dateSalt = new Date().toISOString().split('T')[0];
  const hash = crypto.createHash('sha256');
  hash.update(`${ip}-${userAgent}-${websiteId}-${dateSalt}`);
  return hash.digest('hex');
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { event, url, referrer, width, website } = body;

    if (!website) {
      return NextResponse.json({ error: 'Missing website id' }, { status: 400 });
    }

    // Verify website exists
    const dbWebsite = await prisma.website.findUnique({
      where: { id: website }
    });

    if (!dbWebsite) {
      return NextResponse.json({ error: 'Website not found' }, { status: 404 });
    }

    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || '';

    // Security: Request Origin Verification (Anti-Spoofing)
    const origin = req.headers.get('origin');
    const referer = req.headers.get('referer');
    const requestSource = origin ?? referer;
    if (requestSource !== null) {
      const sourceOrigin = parseOrigin(requestSource, origin !== null);
      if (!sourceOrigin || (!matchesWebsite(sourceOrigin, dbWebsite.domain) && !developmentBypass(sourceOrigin))) {
        return NextResponse.json({ error: 'Origin not allowed' }, {
          status: 403, headers: corsHeaders(),
        });
      }
    }

    const sessionId = generateSessionId(ip, userAgent, website);

    const parser = new UAParser(userAgent);
    const browser = parser.getBrowser().name || 'Unknown';
    const os = parser.getOS().name || 'Unknown';
    
    let deviceType = 'desktop';
    if (width && width < 768) {
      deviceType = 'mobile';
    } else if (width && width >= 768 && width < 1024) {
      deviceType = 'tablet';
    }

    await prisma.event.create({
      data: {
        websiteId: website,
        sessionId,
        eventName: event || 'pageview',
        url: url || '/',
        referrer: referrer || null,
        browser,
        os,
        deviceType,
      },
    });

    return new NextResponse(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(origin ?? undefined),
      }
    });
  } catch (error) {
    console.error('Error tracking event:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function OPTIONS(req: Request) {
  const origin = parseOrigin(req.headers.get('origin') ?? '', true);
  const method = req.headers.get('access-control-request-method');
  const headers = (req.headers.get('access-control-request-headers') ?? '')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  const vary = 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers';
  if (!origin || method !== 'POST' || headers.some(header => header !== 'content-type')) {
    return new NextResponse(null, { status: 403, headers: { Vary: vary } });
  }
  try {
    const websites = await prisma.website.findMany({ select: { domain: true } });
    if (!developmentBypass(origin) && !websites.some(site => matchesWebsite(origin, site.domain))) {
      return new NextResponse(null, { status: 403, headers: { Vary: vary } });
    }
    return new NextResponse(null, {
      status: 204,
      headers: {
        ...corsHeaders(origin),
        Vary: vary,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch {
    return new NextResponse(null, { status: 503, headers: { Vary: vary } });
  }
}
