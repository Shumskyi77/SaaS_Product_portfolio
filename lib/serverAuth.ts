/**
 * Server-side Supabase JWT verification.
 *
 * Usage (server.ts express — API compatible):
 *   const uid = await getRequestUid(req);
 *   if (!uid) return res.status(401).json({ error: 'Unauthorized' });
 *   if (uid !== String(body.userId)) return res.status(403).json({ error: 'Forbidden' });
 *
 * Client sends `Authorization: Bearer <accessToken>` (see getAccessToken in
 * lib/supabaseAuth.ts). Without a token — local-only mode.
 * Verified tokens are cached for 5 minutes to avoid hitting the Auth API
 * on every request.
 */

import { createClient } from '../utils/supabase/server';

// Verified-token cache: token -> { uid, exp }. TTL 5 minutes.
const TOKEN_CACHE_MS = 5 * 60_000;
const verifiedTokens = new Map<string, { uid: string; exp: number }>();

function pruneTokenCache(now: number): void {
  for (const [token, entry] of verifiedTokens) {
    if (now >= entry.exp) verifiedTokens.delete(token);
  }
  // Safety bound: drop oldest entries if the map grows unbounded
  // (e.g. many distinct invalid-but-once-valid tokens).
  if (verifiedTokens.size > 5000) {
    const overflow = verifiedTokens.size - 5000;
    const it = verifiedTokens.keys();
    for (let i = 0; i < overflow; i++) {
      const key = it.next().value;
      if (typeof key === 'string') verifiedTokens.delete(key);
      else break;
    }
  }
}

function getBearerToken(req: any): string | null {
  try {
    const headers = req?.headers as Record<string, unknown> | undefined;
    if (!headers) return null;
    const raw = headers['authorization'] ?? headers['Authorization'];
    if (!raw || typeof raw !== 'string') return null;
    const m = raw.match(/^Bearer\s+(.+)$/i);
    if (!m) return null;
    const token = m[1].trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

/**
 * Verifies a Supabase access token via the Auth API, returns user.id or null.
 * Checks are delegated to `supabase.auth.getUser(token)` (signature, exp, aud).
 */
export async function verifySupabaseToken(accessToken: string): Promise<string | null> {
  try {
    if (!accessToken || typeof accessToken !== 'string') return null;
    const now = Date.now();
    const cached = verifiedTokens.get(accessToken);
    if (cached) {
      if (now < cached.exp) return cached.uid;
      verifiedTokens.delete(accessToken);
    }
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return null;
    }
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data?.user?.id) return null;
    const uid = data.user.id;
    verifiedTokens.set(accessToken, { uid, exp: now + TOKEN_CACHE_MS });
    if (verifiedTokens.size % 100 === 0) pruneTokenCache(now);
    return uid;
  } catch {
    return null;
  }
}

/** Extracts and verifies the Bearer token from the request. null = anonymous/invalid. */
export async function getRequestUid(req: any): Promise<string | null> {
  try {
    const token = getBearerToken(req);
    if (!token) return null;
    return await verifySupabaseToken(token);
  } catch {
    return null;
  }
}
