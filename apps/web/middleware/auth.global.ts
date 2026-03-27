/**
 * Auth guard middleware — redirects unauthenticated users to /connect.
 * Runs on every route navigation in the SPA.
 */
export default defineNuxtRouteMiddleware((to) => {
  // Always allow the connect page
  if (to.path === '/connect') return;

  const { isAuthenticated, authResolved, fetchMe } = useAuth();

  // Let app render while auth state is restoring in the background.
  // The bootstrap plugin handles post-restore redirect on first load.
  if (!authResolved.value) {
    void fetchMe();
    return;
  }

  if (!isAuthenticated.value) {
    return navigateTo('/connect');
  }
});
