import { generateId } from '../utils.js';
import {
  NONCE_TTL_SECS,
  SESSION_HOT_CACHE_MAX_ENTRIES,
  SESSION_HOT_CACHE_TTL_MS,
  SESSION_TTL_SECS,
  type SessionData,
} from './types.js';

type SessionHotCacheEntry = {
  session: SessionData;
  cachedUntil: number;
};

const sessionHotCache = new Map<string, SessionHotCacheEntry>();
let sessionHotCacheLastCleanupMs = 0;
let authTablesReady = false;
let authTablesInitPromise: Promise<void> | null = null;

function cleanupSessionHotCache(nowMs: number): void {
  if (nowMs - sessionHotCacheLastCleanupMs < 10_000) return;
  sessionHotCacheLastCleanupMs = nowMs;

  for (const [key, entry] of sessionHotCache) {
    if (entry.cachedUntil <= nowMs || entry.session.expiresAt <= nowMs) {
      sessionHotCache.delete(key);
    }
  }

  if (sessionHotCache.size > SESSION_HOT_CACHE_MAX_ENTRIES) {
    let toDelete = sessionHotCache.size - SESSION_HOT_CACHE_MAX_ENTRIES;
    for (const key of sessionHotCache.keys()) {
      sessionHotCache.delete(key);
      toDelete--;
      if (toDelete <= 0) break;
    }
  }
}

async function ensureAuthTables(db: D1Database): Promise<void> {
  if (authTablesReady) return;
  if (!authTablesInitPromise) {
    authTablesInitPromise = (async () => {
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS auth_sessions (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            wallet_address TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          )`
        )
        .run();
      await db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at
           ON auth_sessions (expires_at)`
        )
        .run();

      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS auth_nonces (
            nonce TEXT PRIMARY KEY,
            expires_at INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          )`
        )
        .run();
      await db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_auth_nonces_expires_at
           ON auth_nonces (expires_at)`
        )
        .run();
      authTablesReady = true;
    })().catch((err) => {
      authTablesInitPromise = null;
      throw err;
    });
  }
  await authTablesInitPromise;
}

async function persistSessionDb(db: D1Database, token: string, session: SessionData): Promise<void> {
  await ensureAuthTables(db);
  await db
    .prepare(
      `INSERT OR REPLACE INTO auth_sessions (token, user_id, wallet_address, expires_at)
       VALUES (?, ?, ?, ?)`
    )
    .bind(token, session.userId, session.walletAddress, session.expiresAt)
    .run();
}

async function readSessionDb(db: D1Database, token: string): Promise<SessionData | null> {
  await ensureAuthTables(db);
  const row = await db
    .prepare(
      `SELECT user_id AS userId, wallet_address AS walletAddress, expires_at AS expiresAt
       FROM auth_sessions
       WHERE token = ?`
    )
    .bind(token)
    .first<SessionData>();
  return row ?? null;
}

async function deleteSessionDb(db: D1Database, token: string): Promise<void> {
  await ensureAuthTables(db);
  await db.prepare(`DELETE FROM auth_sessions WHERE token = ?`).bind(token).run();
}

async function persistNonceDb(db: D1Database, nonce: string, expiresAt: number): Promise<void> {
  await ensureAuthTables(db);
  await db
    .prepare(
      `INSERT OR REPLACE INTO auth_nonces (nonce, expires_at)
       VALUES (?, ?)`
    )
    .bind(nonce, expiresAt)
    .run();
}

async function consumeNonceDb(db: D1Database, nonce: string): Promise<boolean> {
  await ensureAuthTables(db);
  const now = Date.now();
  const result = await db
    .prepare(
      `DELETE FROM auth_nonces
       WHERE nonce = ? AND expires_at >= ?`
    )
    .bind(nonce, now)
    .run();
  const changes = Number(result.meta.changes ?? 0);
  return changes > 0;
}

export async function createNonce(cache: KVNamespace, db: D1Database): Promise<string> {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const expiresAt = Date.now() + NONCE_TTL_SECS * 1000;
  await persistNonceDb(db, nonce, expiresAt);

  try {
    await cache.put(`nonce:${nonce}`, '1', { expirationTtl: NONCE_TTL_SECS });
  } catch {
    // KV is optional acceleration only.
  }

  return nonce;
}

export async function consumeNonce(cache: KVNamespace, db: D1Database, nonce: string): Promise<boolean> {
  const consumed = await consumeNonceDb(db, nonce);

  try {
    await cache.delete(`nonce:${nonce}`);
  } catch {
    // KV is optional acceleration only.
  }

  return consumed;
}

export async function createSession(
  cache: KVNamespace,
  userId: string,
  walletAddress: string,
  db?: D1Database
): Promise<string> {
  const token = generateId();
  const session: SessionData = {
    userId,
    walletAddress,
    expiresAt: Date.now() + SESSION_TTL_SECS * 1000,
  };
  const key = `session:${token}`;
  let persisted = false;

  if (db) {
    try {
      await persistSessionDb(db, token, session);
      persisted = true;
    } catch (err) {
      console.error('[auth] failed to persist session in D1:', err);
    }
  }

  try {
    await cache.put(key, JSON.stringify(session), {
      expirationTtl: SESSION_TTL_SECS,
    });
    persisted = true;
  } catch {
    // KV is optional acceleration only.
  }

  if (!persisted) {
    throw new Error('Unable to persist session');
  }

  sessionHotCache.set(key, {
    session,
    cachedUntil: Math.min(session.expiresAt, Date.now() + SESSION_HOT_CACHE_TTL_MS),
  });
  return token;
}

export async function getSession(cache: KVNamespace, token: string, db?: D1Database): Promise<SessionData | null> {
  if (!token || token.length < 16 || token.length > 128 || !/^[0-9a-f]+$/.test(token)) return null;

  const now = Date.now();
  cleanupSessionHotCache(now);

  const key = `session:${token}`;
  const hot = sessionHotCache.get(key);
  if (hot && hot.cachedUntil > now && hot.session.expiresAt > now) {
    return hot.session;
  }
  if (hot) sessionHotCache.delete(key);

  try {
    const raw = await cache.get(key, 'text');
    if (raw) {
      const session = JSON.parse(raw) as SessionData;
      if (session.expiresAt < now) {
        await cache.delete(key).catch(() => {});
        if (db) await deleteSessionDb(db, token).catch(() => {});
        sessionHotCache.delete(key);
        return null;
      }
      sessionHotCache.set(key, {
        session,
        cachedUntil: Math.min(session.expiresAt, now + SESSION_HOT_CACHE_TTL_MS),
      });
      return session;
    }
  } catch {
    // KV unavailable; try durable fallback.
  }

  if (!db) return null;

  try {
    const session = await readSessionDb(db, token);
    if (!session) return null;
    if (session.expiresAt < now) {
      await deleteSessionDb(db, token).catch(() => {});
      await cache.delete(key).catch(() => {});
      sessionHotCache.delete(key);
      return null;
    }
    sessionHotCache.set(key, {
      session,
      cachedUntil: Math.min(session.expiresAt, now + SESSION_HOT_CACHE_TTL_MS),
    });
    return session;
  } catch {
    return null;
  }
}

export async function deleteSession(cache: KVNamespace, token: string, db?: D1Database): Promise<void> {
  const key = `session:${token}`;
  sessionHotCache.delete(key);
  await Promise.all([
    cache.delete(key).catch(() => {}),
    db ? deleteSessionDb(db, token).catch(() => {}) : Promise.resolve(),
  ]);
}
