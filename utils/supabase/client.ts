import { createBrowserClient } from "@supabase/ssr";

function getSupabaseEnv(): { url: string; key: string } {
  // Next.js convention (process.env) with Vite fallback (import.meta.env).
  // This repo is Vite + Express, so VITE_* is what reaches the browser.
  // `process` is not defined in the Vite browser bundle — guard it.
  const nodeEnv: Record<string, string | undefined> =
    (typeof process !== "undefined" && process.env) || {};
  const viteEnv =
    (typeof import.meta !== "undefined" &&
      (import.meta as unknown as { env?: Record<string, string | undefined> })
        .env) ||
    {};

  const supabaseUrl =
    nodeEnv.NEXT_PUBLIC_SUPABASE_URL ??
    viteEnv.VITE_SUPABASE_URL ??
    viteEnv.NEXT_PUBLIC_SUPABASE_URL ??
    "";
  const supabaseKey =
    nodeEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    viteEnv.VITE_SUPABASE_PUBLISHABLE_KEY ??
    viteEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    "";

  if (!supabaseUrl || !supabaseKey) {
    console.warn(
      "[supabase] Missing Supabase env vars. Expected VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (Vite) or NEXT_PUBLIC_SUPABASE_* (Next)."
    );
  }

  return { url: supabaseUrl, key: supabaseKey };
}

export const createClient = () => {
  const { url, key } = getSupabaseEnv();
  return createBrowserClient(url, key);
};

// Singleton for convenience in Vite React components:
//   import { supabase } from "@/utils/supabase/client"
// (Only use on the client — never import this in Express routes.)
export const supabase = typeof window !== "undefined" ? createClient() : null as unknown as ReturnType<typeof createClient>;
