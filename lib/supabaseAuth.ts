/**
 * Client-side Auth layer on Supabase (Vite + React).
 *
 * Usage:
 *   import { signInWithGoogle, signInWithEmail, signUpWithEmail,
 *            signOutUser, subscribeToAuthChanges, getCurrentUser,
 *            getAccessToken } from './supabaseAuth';
 *
 * The access token from `getAccessToken()` is sent to the Express API as
 * `Authorization: Bearer <token>` (verified server-side in lib/serverAuth.ts).
 */

import { supabase } from '../src/lib/supabase';

export interface AuthUser {
  id: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  provider?: string;
}

/** Minimal Supabase-User shape this helper accepts (real User is assignable). */
type UserLike = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
} | null;

function metaString(meta: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!meta) return null;
  const v = meta[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function toAuthUser(u: UserLike): AuthUser | null {
  if (!u) return null;
  const meta = (u.user_metadata ?? null) as Record<string, unknown> | null;
  const appMeta = (u.app_metadata ?? null) as Record<string, unknown> | null;
  const displayName = metaString(meta, 'full_name') ?? metaString(meta, 'name');
  const avatarUrl = metaString(meta, 'avatar_url');
  const providerRaw = appMeta ? appMeta['provider'] : undefined;
  const provider = typeof providerRaw === 'string' && providerRaw.length > 0 ? providerRaw : undefined;
  return {
    id: u.id,
    email: u.email ?? null,
    displayName: displayName ?? null,
    avatarUrl: avatarUrl ?? null,
    ...(provider ? { provider } : {}),
  };
}

export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) throw new Error(error.message);
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string,
): Promise<{ user: AuthUser | null; error?: string }> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      ...(displayName ? { options: { data: { full_name: displayName } } } : {}),
    });
    if (error) return { user: null, error: error.message };
    return { user: toAuthUser(data.user) };
  } catch (e) {
    return { user: null, error: e instanceof Error ? e.message : 'Sign up failed' };
  }
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<{ user: AuthUser | null; error?: string }> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { user: null, error: error.message };
    return { user: toAuthUser(data.user) };
  } catch (e) {
    return { user: null, error: e instanceof Error ? e.message : 'Sign in failed' };
  }
}

export async function signOutUser(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export function subscribeToAuthChanges(cb: (user: AuthUser | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(toAuthUser(session?.user ?? null));
  });
  return () => {
    data.subscription.unsubscribe();
  };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const { data } = await supabase.auth.getUser();
  return toAuthUser(data.user);
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
