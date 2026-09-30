import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import ws from "ws";

// supabase-js needs a WebSocket implementation on Node < 22 (this repo runs
// Node 20). Polyfill it once so `createClient()` doesn't throw at runtime.
if (typeof (globalThis as unknown as { WebSocket?: unknown }).WebSocket === "undefined") {
  (globalThis as unknown as { WebSocket?: unknown }).WebSocket = ws;
}

// NOTE: This repo is Vite + Express, not Next.js — so there is no
// `next/headers` cookieStore here. Server-side Supabase access uses the
// publishable key directly (RLS still applies). For privileged server work,
// use a separate service-role client (never expose it to the browser).

function getSupabaseEnv(): { url: string; key: string } {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    "";
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    "";

  return { url: supabaseUrl, key: supabaseKey };
}

export const createClient = () => {
  const { url, key } = getSupabaseEnv();
  if (!url || !key) {
    throw new Error(
      "[supabase/server] Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local"
    );
  }
  return createSupabaseClient(url, key);
};

// Example usage in an Express route (server.ts):
//   import { createClient } from "./utils/supabase/server";
//   app.get("/api/todos", async (_req, res) => {
//     const supabase = createClient();
//     const { data, error } = await supabase.from("todos").select();
//     if (error) return res.status(500).json({ error: error.message });
//     return res.json(data);
//   });
