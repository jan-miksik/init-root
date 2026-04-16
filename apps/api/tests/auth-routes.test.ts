import { beforeEach, describe, expect, it, vi } from 'vitest';

const user = {
  id: 'user_playwright',
  walletAddress: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  email: null,
  displayName: 'Playwright Test User',
  authProvider: 'playwright',
  avatarUrl: null,
  role: 'user',
  createdAt: '2026-04-16T00:00:00.000Z',
  updatedAt: '2026-04-16T00:00:00.000Z',
  openRouterKey: null,
};

const orm = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
};

const createSessionMock = vi.fn(async () => 'session_token');
const buildSessionCookieMock = vi.fn(() => 'session=session_token; HttpOnly; Path=/');

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(() => orm),
}));

vi.mock('../src/auth/session.js', () => ({
  createNonce: vi.fn(),
  createSession: createSessionMock,
  getSession: vi.fn(),
  deleteSession: vi.fn(),
  parseCookieValue: vi.fn(),
  buildSessionCookie: buildSessionCookieMock,
  buildExpiredSessionCookie: vi.fn(() => 'session=; Max-Age=0; Path=/'),
  verifySiweAndCreateSession: vi.fn(),
}));

describe('auth routes hardening', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    orm.select.mockReturnValue({
      from: () => ({
        where: async () => [user],
      }),
    });
  });

  it('does not enable hackathon bypass from localhost origin headers alone', async () => {
    const { default: authRoute } = await import('../src/routes/auth.js');

    const response = await authRoute.request(
      'http://api.test/hackathon-session',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
          referer: 'http://localhost:3000/',
        },
        body: JSON.stringify({ walletAddress: user.walletAddress }),
      },
      { HACKATHON_AUTH_BYPASS: 'false' } as any,
    );

    expect(response.status).toBe(404);
  });

  it('rejects malformed hackathon wallet identities before any lookup', async () => {
    const { default: authRoute } = await import('../src/routes/auth.js');

    const response = await authRoute.request(
      'http://api.test/hackathon-session',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ walletAddress: 'not-a-wallet' }),
      },
      { HACKATHON_AUTH_BYPASS: 'true' } as any,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid wallet address.' });
    expect(orm.select).not.toHaveBeenCalled();
  });

  it('keeps the dev-session token in the cookie only', async () => {
    const { default: authRoute } = await import('../src/routes/auth.js');

    const response = await authRoute.request(
      'http://api.test/dev-session',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-playwright-secret': 'test-secret',
        },
      },
      {
        PLAYWRIGHT_SECRET: 'test-secret',
        DB: {},
        CACHE: {},
      } as any,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('session=session_token');
    expect(await response.json()).toEqual({
      ok: true,
      userId: user.id,
      walletAddress: user.walletAddress,
    });
  });
});
