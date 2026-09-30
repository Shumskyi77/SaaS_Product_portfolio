import type { NextFunction, Request, Response } from "express";
import { createClient } from "./server";

// NOTE: The Supabase docs snippet for `utils/supabase/middleware.ts` targets
// Next.js middleware (`next/server`). This repo runs Express (server.ts), so
// there is no Next.js middleware layer. This file is the Express equivalent:
// it attaches a request-scoped Supabase client for use in routes.
//
// Usage in server.ts:
//   import { supabaseMiddleware } from "./utils/supabase/middleware";
//   app.use(supabaseMiddleware);

export type SupabaseRequest = Request & {
  supabase?: ReturnType<typeof createClient>;
};

export function supabaseMiddleware(
  req: SupabaseRequest,
  _res: Response,
  next: NextFunction
) {
  try {
    req.supabase = createClient();
  } catch (err) {
    // Don't crash the whole API if Supabase env is missing in dev —
    // routes that need it will throw a clear error when called.
    console.warn("[supabase/middleware] Skipping client attach:", (err as Error).message);
  }
  next();
}
