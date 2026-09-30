// Vercel backend: ONE serverless function (Hobby: max 12).
//
// The single cloud data store is Supabase (the client talks to it directly).
// This catch-all remains so that:
// 1. /api/health — deployment diagnostics (which code is actually deployed).
// 2. Shape-correct stubs for legacy data routes: cached clients may still
//    hit /api/meals|friends|users|reactions — we return valid emptiness
//    instead of 404.
//
// Response shapes — as lib/supabaseDb.ts expects:
//   GET lists  -> [] (Array.isArray checks skip empty cleanly)
//   GET single -> {} (empty — the client goes to Supabase)
//   POST/DELETE -> {ok:true} (fire-and-forget callers ignore the body)

function cors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req: any, res: any) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const raw = (req.query as any)?.all;
  const segs: string[] = Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : [];
  const [root = ''] = segs;
  const method = String(req.method || 'GET').toUpperCase();

  // Deployment diagnostics: https://<host>/api/health
  // version helps tell that prod really updated after a push.
  if (root === 'health' && method === 'GET') {
    return res.status(200).json({
      ok: true,
      backend: 'nutrigem-vercel',
      version: 'supabase-direct-1',
      store: 'supabase-direct',
      time: new Date().toISOString(),
    });
  }

  // Data routes are no longer served: everything is in Supabase directly.
  // Empty shape-correct responses instead of 404.
  if (root === 'reactions' && method === 'GET') {
    return res.status(200).json({});
  }
  if (root === 'meals' || root === 'friends' || root === 'users' || root === 'reactions') {
    if (method === 'GET') return res.status(200).json([]);
    return res.status(200).json({ ok: true, source: 'supabase-direct' });
  }

  return res.status(200).json({ ok: true, source: 'supabase-direct' });
}
