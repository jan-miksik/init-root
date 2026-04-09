import { SESSION_TTL_SECS } from './types.js';

export function buildSessionCookie(token: string, isHttps: boolean): string {
  const parts = [
    `session=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECS}`,
  ];
  if (isHttps) parts.push('Secure');
  return parts.join('; ');
}

export function buildExpiredSessionCookie(): string {
  return 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

export function parseCookieValue(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k?.trim() === name) return rest.join('=').trim();
  }
  return null;
}
