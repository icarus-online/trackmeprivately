import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ success: true });
}

export async function GET() {
  await clearSessionCookie();
  // A relative Location keeps navigation on the browser's public origin,
  // without reflecting the internal upstream URL or trusting proxy headers.
  return new NextResponse(null, {
    status: 307,
    headers: { Location: '/login', 'Cache-Control': 'no-store' },
  });
}
