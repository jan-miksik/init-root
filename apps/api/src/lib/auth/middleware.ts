import { parseCookieValue } from './cookies.js';
import { getSession } from './session-store.js';
import type { AnyContext } from './types.js';

export function createAuthMiddleware() {
  return async (c: AnyContext, next: () => Promise<void>): Promise<Response | void> => {
    const cookieHeader = c.req.header('cookie') ?? '';
    const token = parseCookieValue(cookieHeader, 'session');
    if (!token) return c.json({ error: 'Unauthorized' }, 401);

    const session = await getSession(c.env.CACHE, token, c.env.DB);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);

    c.set('userId', session.userId);
    c.set('walletAddress', session.walletAddress);
    await next();
  };
}
