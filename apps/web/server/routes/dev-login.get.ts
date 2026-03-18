/**
 * GET /dev-login — dev/test only. Creates a Playwright test session server-side
 * and redirects to the app home page with the session cookie set.
 *
 * Requires ?secret=<PLAYWRIGHT_SECRET> query param.
 * This route is a 404 when PLAYWRIGHT_SECRET is not configured.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const secret = (config as any).playwrightSecret as string | undefined;
  if (!secret) {
    setResponseStatus(event, 404);
    return 'Not Found';
  }

  const { secret: provided, to } = getQuery(event) as { secret?: string; to?: string };
  if (!provided || provided !== secret) {
    setResponseStatus(event, 403);
    return 'Forbidden';
  }

  // Sanitise redirect target — must be a relative path starting with /
  const target = to && String(to).startsWith('/') ? String(to) : '/';

  const base = ((config as any).apiUpstream as string)?.replace(/\/$/, '') || 'http://localhost:8787';
  const res = await fetch(`${base}/api/auth/dev-session`, {
    method: 'POST',
    headers: { 'x-playwright-secret': secret },
  });

  if (!res.ok) {
    setResponseStatus(event, 502);
    return 'dev-session failed';
  }

  // Forward the Set-Cookie header from the API to the browser
  const cookie = res.headers.get('set-cookie');
  if (cookie) {
    appendResponseHeader(event, 'set-cookie', cookie);
  }

  return sendRedirect(event, target, 302);
});
