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
const getSessionMock = vi.fn();
const parseCookieValueMock = vi.fn();

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(() => orm),
}));

vi.mock('../src/auth/session.js', () => ({
  createNonce: vi.fn(),
  createSession: createSessionMock,
  getSession: getSessionMock,
  deleteSession: vi.fn(),
  parseCookieValue: parseCookieValueMock,
  buildSessionCookie: buildSessionCookieMock,
  buildExpiredSessionCookie: vi.fn(() => 'session=; Max-Age=0; Path=/'),
  verifySiweAndCreateSession: vi.fn(),
}));

describe('auth routes hardening', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    orm.select.mockReturnValue({
      from: () => ({
        where: async () => [user],
      }),
    });
  });

  it('refuses to exchange and store OpenRouter keys when encryption is not configured', async () => {
    const { default: authRoute } = await import('../src/routes/auth.js');

    parseCookieValueMock.mockReturnValue('session_token');
    getSessionMock.mockResolvedValue({ userId: user.id, walletAddress: user.walletAddress });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await authRoute.request(
      'http://api.test/openrouter/exchange',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'session=session_token',
        },
        body: JSON.stringify({
          code: 'code',
          code_verifier: 'verifier',
        }),
      },
      { DB: {}, CACHE: {} } as any,
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'OpenRouter key storage is not configured' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(orm.update).not.toHaveBeenCalled();
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
