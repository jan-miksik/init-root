/**
 * Module-level in-memory cache shared across all composable instances.
 * Lives for the browser session (cleared on hard reload).
 * Use for GET responses that are safe to serve stale within a TTL window.
 */

const STORE = new Map<string, { data: unknown; expiresAt: number }>();

export function useClientCache() {
  function get<T>(key: string): T | null {
    const entry = STORE.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      STORE.delete(key);
      return null;
    }
    return entry.data as T;
  }

  function set<T>(key: string, data: T, ttlMs: number): void {
    STORE.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  /** Exact key deletion */
  function invalidate(key: string): void {
    STORE.delete(key);
  }

  /** Delete all entries whose key starts with prefix */
  function invalidatePrefix(prefix: string): void {
    for (const key of STORE.keys()) {
      if (key.startsWith(prefix)) STORE.delete(key);
    }
  }

  return { get, set, invalidate, invalidatePrefix };
}
