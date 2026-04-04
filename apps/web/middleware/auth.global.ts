/**
 * Auth guard middleware — redirects unauthenticated users to /connect.
 * Runs on every route navigation in the SPA.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  // Always allow the connect page
  if (to.path === '/connect') return;

  const { isAuthenticated, authResolved, fetchMe } = useAuth();

  // Block protected route rendering until auth restore completes.
  // This prevents transient 401 bursts from page-level API calls.
  if (!authResolved.value) {
    await fetchMe().catch(() => undefined);
  }

  if (!isAuthenticated.value) {
    return navigateTo('/connect', { replace: true });
  }
});
