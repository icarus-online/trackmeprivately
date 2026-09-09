import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const DEFAULT_SESSION_MAX_AGE = 30 * 24 * 60 * 60;
type SessionCookieSameSite = 'lax' | 'strict' | 'none';

// Helper to retrieve the secret key securely, ensuring it's present at runtime in production
export function getSecretKey() {
  if (process.env.NODE_ENV === 'production' && !process.env.NEXTAUTH_SECRET) {
    throw new Error('CRITICAL SECURITY ERROR: NEXTAUTH_SECRET environment variable must be set in production.');
  }
  return new TextEncoder().encode(
    process.env.NEXTAUTH_SECRET || 'dev-fallback-secret-for-privacy-tracker-jwt-key'
  );
}

export function getSessionMaxAge() {
  const rawValue = process.env.SESSION_MAX_AGE;
  if (!rawValue) {
    return DEFAULT_SESSION_MAX_AGE;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.warn('Invalid SESSION_MAX_AGE value. Falling back to 30 days.');
    return DEFAULT_SESSION_MAX_AGE;
  }

  return parsed;
}

export function getSessionSameSite(): SessionCookieSameSite {
  const rawValue = process.env.SESSION_COOKIE_SAME_SITE?.toLowerCase();
  if (!rawValue) {
    return 'lax';
  }

  if (rawValue === 'lax' || rawValue === 'strict' || rawValue === 'none') {
    return rawValue;
  }

  console.warn('Invalid SESSION_COOKIE_SAME_SITE value. Falling back to lax.');
  return 'lax';
}

export function getSessionCookieDomain() {
  const domain = process.env.SESSION_COOKIE_DOMAIN?.trim();
  return domain || undefined;
}

export function getSessionCookieOptions() {
  const sameSite = getSessionSameSite();
  const domain = getSessionCookieDomain();
  const secure = process.env.NODE_ENV === 'production' || sameSite === 'none';

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge: getSessionMaxAge(),
    ...(domain ? { domain } : {}),
  };
}

export interface SessionPayload {
  userId: string;
  username: string;
}

export async function encryptSession(payload: SessionPayload): Promise<string> {
  const secret = getSecretKey();
  const expiresAt = Math.floor(Date.now() / 1000) + getSessionMaxAge();
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret);
}

export async function decryptSession(token: string): Promise<SessionPayload | null> {
  try {
    const secret = getSecretKey();
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return null;
  return await decryptSession(sessionToken);
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = await encryptSession(payload);
  const cookieStore = await cookies();
  cookieStore.set('session_token', token, getSessionCookieOptions());
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set('session_token', '', {
    ...getSessionCookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  });
}

export async function setChallengeCookie(challenge: string, username?: string) {
  const secret = getSecretKey();
  const token = await new SignJWT({ challenge, username: username || '' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m') // challenges expire in 5 minutes
    .sign(secret);
  const cookieStore = await cookies();
  cookieStore.set('auth_challenge', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 300,
  });
}

export async function getChallengeCookie(): Promise<{ challenge: string; username?: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_challenge')?.value;
  if (!token) return null;
  try {
    const secret = getSecretKey();
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    return payload as unknown as { challenge: string; username?: string };
  } catch {
    return null;
  }
}

export async function clearChallengeCookie() {
  const cookieStore = await cookies();
  cookieStore.delete('auth_challenge');
}
