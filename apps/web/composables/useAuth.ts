/**
 * useAuth — authentication state + SIWE sign-in/out.
 *
 * Uses the Interwoven wallet provider for signed session creation and HttpOnly
 * cookie restore. Safe to call from plugins, middleware, and components alike.
 */
import { ref, computed } from 'vue';
import { createSiweMessage } from 'viem/siwe';
import { navigateTo } from '#app';
import { useInterwovenWallet } from './useInterwovenWallet';

// ─── Module-level auth state ──────────────────────────────────────────────────
// Using module scope (not useState) so the ref is the same instance across
// all calls to useAuth() in a single browser session.

export interface AuthUser {
  id: string;
  walletAddress: string;
  email: string | null;
  displayName: string | null;
  authProvider: string;
  avatarUrl: string | null;
  role: string;
  createdAt: string;
  openRouterKeySet: boolean;
}

interface SignInOptions {
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  walletAddress?: string;
}

interface SignOutOptions {
  redirectToConnect?: boolean;
  clearWalletState?: boolean;
}

const authUser = ref<AuthUser | null>(null);
const authLoading = ref(false);
const authResolved = ref(false);
let fetchMePromise: Promise<void> | null = null;

// ─── Composable ───────────────────────────────────────────────────────────────

export function useAuth() {
  const wallet = useInterwovenWallet();
  const runtimeConfig = useRuntimeConfig();
  const isAuthenticated = computed(() => !!authUser.value);

  /** Restore session from the HttpOnly session cookie. Deduplicates concurrent calls. */
  function fetchMe(): Promise<void> {
    if (fetchMePromise) return fetchMePromise;
    fetchMePromise = (async () => {
      try {
        const user = await $fetch<AuthUser>('/api/auth/me', {
          credentials: 'include',
          timeout: 8000,
        });
        authUser.value = user;
      } catch (err: unknown) {
        authUser.value = null;
        // 401 is expected when not signed in — don't log it
        const status = (err as { statusCode?: number })?.statusCode
          ?? (err as { status?: number })?.status;
        if (status !== 401) {
          console.error('[auth] fetchMe failed:', err);
        }
      } finally {
        fetchMePromise = null;
        authResolved.value = true;
      }
    })();
    return fetchMePromise;
  }

  /**
   * SIWE sign-in flow:
   *  1. Fetch one-time nonce from backend
   *  2. Build EIP-4361 message
   *  3. Sign with Interwoven wallet provider
   *  4. Verify with backend → session cookie is set in the response
   *
   * Optional: pass profile fields from email/social logins so they're
   * stored in the users table alongside the wallet address.
   */
  async function signIn(opts?: SignInOptions): Promise<void> {
    let addr = opts?.walletAddress ?? wallet.walletAddress.value ?? await wallet.syncWalletAddress();
    if (!addr) {
      addr = await wallet.connectWallet();
    }
    if (!addr) throw new Error('No wallet connected');
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      throw new Error('Connected wallet did not expose an EVM address for sign-in.');
    }

    authLoading.value = true;
    try {
      // 1. Get a fresh nonce from the backend
      const { nonce } = await $fetch<{ nonce: string }>('/api/auth/nonce');
      const chainId = await wallet.getChainId();
      const fallbackChainId = Number(runtimeConfig.public.initiaEvmChainId || 2178983797612220);

      // 2. Build SIWE message
      const message = createSiweMessage({
        address: addr as `0x${string}`,
        chainId: chainId || fallbackChainId,
        domain: window.location.host,
        nonce,
        uri: window.location.origin,
        version: '1',
        statement: 'Sign in to initRoot',
      });

      // 3. Sign with Interwoven provider.
      const signature = await wallet.signPersonalMessage(message, addr);

      // 4. Send to backend; response sets the session cookie
      const user = await $fetch<AuthUser>('/api/auth/verify', {
        method: 'POST',
        body: { message, signature, authProvider: 'interwoven-wallet', ...opts },
        credentials: 'include',
      });

      authUser.value = user;
      authResolved.value = true;
    } finally {
      authLoading.value = false;
    }
  }

  /** Sign out: invalidate server session + clear local wallet state cache. */
  async function signOut(opts?: SignOutOptions): Promise<void> {
    try {
      await $fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // Still clear local state even if server call fails
    }
    authUser.value = null;
    authResolved.value = true;
    if (opts?.clearWalletState !== false) {
      wallet.clearWalletState();
    }
    if ((opts?.redirectToConnect ?? true) && import.meta.client) {
      await navigateTo('/connect');
    }
  }

  return {
    user: authUser,
    isAuthenticated,
    isLoading: authLoading,
    authResolved,
    fetchMe,
    signIn,
    signOut,
  };
}
