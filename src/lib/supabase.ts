import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Canonical browser client for the Vite React app.
// Reads VITE_* vars (with NEXT_PUBLIC_* fallback for compat with .env.local).
// Guarded: import.meta.env exists only under Vite — under Node (tsx/tests)
// fall back to process.env so module import never crashes.
const metaEnv: Record<string, string | undefined> =
  (typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env) ||
  {};
const nodeEnv: Record<string, string | undefined> =
  (typeof process !== "undefined" && process.env) || {};

const supabaseUrl =
  metaEnv.VITE_SUPABASE_URL ??
  metaEnv.NEXT_PUBLIC_SUPABASE_URL ??
  nodeEnv.VITE_SUPABASE_URL ??
  nodeEnv.NEXT_PUBLIC_SUPABASE_URL ??
  "";
const supabaseKey =
  metaEnv.VITE_SUPABASE_PUBLISHABLE_KEY ??
  metaEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  nodeEnv.VITE_SUPABASE_PUBLISHABLE_KEY ??
  nodeEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "";

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseKey);
}

// Guest-only build: the app no longer needs Supabase (auth/cloud sync removed),
// so a missing config is informational, not an error.
if (!isSupabaseConfigured() && typeof window !== "undefined") {
  console.info(
    "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY not set — " +
      "guest mode is fully local (localStorage). Cloud sync and social features are disabled."
  );
}

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  if (!isSupabaseConfigured()) {
    throw new Error(
      "[supabase] Supabase is not configured: set VITE_SUPABASE_URL and " +
        "VITE_SUPABASE_PUBLISHABLE_KEY (locally in .env.local; on Vercel in " +
        "Project Settings → Environment Variables, then redeploy)."
    );
  }
  _client = createClient(supabaseUrl, supabaseKey);
  return _client;
}

// Lazy singleton: creating the real client at module load would throw
// "supabaseUrl is required" and take down the whole app when env vars are
// missing (e.g. a production build deployed without Vercel env vars).
// The proxy defers creation until the first actual API use, so local-only
// and guest flows keep working and the failure is a clear message.
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getClient() as unknown as Record<PropertyKey, unknown>;
    const value = client[prop];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value;
  },
});

// Example usage in a component:
//   import { supabase } from "./lib/supabase";
//   const { data: todos } = await supabase.from("todos").select();
