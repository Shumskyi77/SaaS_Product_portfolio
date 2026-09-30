// ==========================================================
// lib/supabaseDb.ts — PART 1 of 3: port of lib/firebase.ts to Supabase.
// Covers: infrastructure (auth-uid, mappers, resilience,
// cache/throttling helpers), profiles, search, friends, meal reactions.
// Supabase tables: profiles / meals / diaries / friendships /
// meal_reactions (see supabase/migrations/0001_init.sql).
// NO firebase imports — only Supabase network calls.
// ==========================================================
import { supabase } from '../src/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { MealLog } from '../types/meal';
import type { UserProfile } from '../types/user';
import { getLocalDateString } from './store';

// getLocalDateString will be needed by parts 2-3 (meal/diary date normalization);
// keep the import here so signatures match the original.
// (local reference so builders with noUnusedLocals don't complain)
void getLocalDateString;

// ==========================================================
// Types (same fields as in lib/firebase.ts)
// ==========================================================
export interface FirestoreUser {
  uid: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  avatar?: string;
  friendCode: string;
  targetCalories?: number;
  goal?: string;
  weeklyGoal?: number;
  startWeight?: number;
  currentWeight?: number;
  targetWeight?: number;
  streakDays?: number;
  lastActiveDate?: string;
  targetProtein?: number;
  targetFat?: number;
  targetCarbs?: number;
}

export interface FirestoreFriendship {
  id: string;
  userA: string;
  userB: string;
  users: string[];
  createdAt: string;
}

export interface FirestoreMealReaction {
  id: string;
  mealId: string;
  fromUserId: string;
  emoji: string;
  createdAt: string;
}

// ==========================================================
// Auth uid: supabase.auth.getSession() with ~60s cache.
// setCachedUid — for tests and auth subscription (analogue of the sync
// auth.currentUser from Firebase, which Supabase lacks).
// ==========================================================
let __cachedUid: string | null | undefined;
let __cachedUidAt = 0;
const UID_CACHE_MS = 60_000;

export function setCachedUid(uid: string | null): void {
  __cachedUid = uid;
  __cachedUidAt = Date.now();
}

export async function currentUid(): Promise<string | undefined> {
  try {
    const now = Date.now();
    if (__cachedUid !== undefined && now - __cachedUidAt < UID_CACHE_MS) {
      return __cachedUid ?? undefined;
    }
    const { data } = await supabase.auth.getSession();
    const uid = data?.session?.user?.id ?? undefined;
    __cachedUid = uid ?? null;
    __cachedUidAt = now;
    return uid;
  } catch {
    return __cachedUid ?? undefined;
  }
}

// Session-change subscription — keeps the uid cache fresh without extra getSession.
try {
  supabase.auth.onAuthStateChange((_event, session) => {
    try {
      setCachedUid(session?.user?.id ?? null);
    } catch {}
  });
} catch {}

/**
 * Data owner for write ops: RLS policies require auth.uid().
 * Profile uid may lag (account switch, stale localStorage,
 * guest profile) — using it means writing to the wrong row
 * and silently losing data. Auth wins whenever known.
 * Sync version (from cache) for hot paths; exact one is currentUid().
 */
export function resolveOwnerUid(passedUid?: string | null): string | undefined {
  try {
    if (__cachedUid) return __cachedUid;
    // Only a real UUID: legacy Firebase-uid / guest in uuid columns give 400.
    if (isRealUid(passedUid)) return String(passedUid);
    return undefined;
  } catch {
    return undefined;
  }
}

// ==========================================================
// Profile mappers: camelCase (UserProfile) ↔ snake_case (profiles)
// ==========================================================
function numOrUndef(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function strOrUndef(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v);
  return s ? s : undefined;
}

function objOrUndef(v: unknown): Record<string, any> | undefined {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, any>;
  return undefined;
}

function strArr(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.map(String).filter(Boolean);
  return out;
}

export function profileRowToUserProfile(row: any): UserProfile {
  const r = row || {};
  const out: any = {
    uid: String(r.id ?? r.uid ?? ''),
    name: String(r.name ?? ''),
    email: String(r.email ?? ''),
    avatar: r.avatar ?? r.avatar_url ?? undefined,
    avatarUrl: r.avatar_url ?? r.avatar ?? undefined,
    friendCode: r.friend_code ?? r.friendCode ?? undefined,
    gender: r.gender ?? 'male',
    age: numOrUndef(r.age) ?? 0,
    height: numOrUndef(r.height) ?? 0,
    currentWeight: numOrUndef(r.current_weight ?? r.currentWeight) ?? 0,
    targetWeight: numOrUndef(r.target_weight ?? r.targetWeight) ?? 0,
    weeklyGoal: numOrUndef(r.weekly_goal ?? r.weeklyGoal) ?? 0,
    activityLevel: r.activity_level ?? r.activityLevel ?? 'moderate',
    dietType: r.diet_type ?? r.dietType ?? 'Standard',
    targetCalories: numOrUndef(r.target_calories ?? r.targetCalories) ?? 0,
    targetProtein: numOrUndef(r.target_protein ?? r.targetProtein) ?? 0,
    targetFat: numOrUndef(r.target_fat ?? r.targetFat) ?? 0,
    targetCarbs: numOrUndef(r.target_carbs ?? r.targetCarbs) ?? 0,
    targetFiber: numOrUndef(r.target_fiber ?? r.targetFiber) ?? 0,
    targetWater: numOrUndef(r.target_water ?? r.targetWater) ?? 0,
    streakDays: numOrUndef(r.streak_days ?? r.streakDays) ?? 0,
    createdAt: r.created_at ?? r.createdAt ?? new Date().toISOString(),
  };
  if (r.bmr !== null && r.bmr !== undefined) out.bmr = Number(r.bmr);
  if (r.tdee !== null && r.tdee !== undefined) out.tdee = Number(r.tdee);
  // Extras from the original (lived in users/{uid} next to the profile) — for
  // compatibility we read tolerantly, in memory they travel on as any.
  const cleanCode = r.clean_code ?? r.cleanCode;
  if (cleanCode !== undefined) out.cleanCode = cleanCode;
  const searchKeys = strArr(r.search_keys ?? r.searchKeys);
  if (searchKeys !== undefined) out.searchKeys = searchKeys;
  const startWeight = numOrUndef(r.start_weight ?? r.startWeight);
  if (startWeight !== undefined) out.startWeight = startWeight;
  const calendarMeals = objOrUndef(r.calendar_meals ?? r.calendarMeals);
  if (calendarMeals !== undefined) out.calendarMeals = calendarMeals;
  const dailyLogs = objOrUndef(r.daily_logs ?? r.dailyLogs);
  if (dailyLogs !== undefined) out.dailyLogs = dailyLogs;
  // 0001_init.sql has no last_active_date column — read tolerantly
  // (in-memory only, see userProfileToProfileRow + PROFILE_COLUMNS).
  const lastActiveDate = r.last_active_date ?? r.lastActiveDate ?? r.lastActiveAt;
  if (lastActiveDate !== undefined && lastActiveDate !== null) out.lastActiveDate = String(lastActiveDate);
  const lastMealAt = r.last_meal_at ?? r.lastMealAt;
  if (lastMealAt !== undefined && lastMealAt !== null) out.lastMealAt = String(lastMealAt);
  const lastMealId = r.last_meal_id ?? r.lastMealId;
  if (lastMealId !== undefined && lastMealId !== null) out.lastMealId = String(lastMealId);
  if (r.updated_at ?? r.updatedAt) out.updatedAt = String(r.updated_at ?? r.updatedAt);
  return out as UserProfile;
}

// Allowlist of profiles columns from 0001_init.sql: upsert with a foreign
// key would fail, so clean the row via sanitizeProfileRow before writing.
const PROFILE_COLUMNS = new Set([
  'id',
  'name',
  'email',
  'avatar',
  'avatar_url',
  'friend_code',
  'clean_code',
  'search_keys',
  'gender',
  'age',
  'height',
  'current_weight',
  'target_weight',
  'start_weight',
  'weekly_goal',
  'activity_level',
  'diet_type',
  'target_calories',
  'target_protein',
  'target_fat',
  'target_carbs',
  'target_fiber',
  'target_water',
  'streak_days',
  'bmr',
  'tdee',
  'calendar_meals',
  'daily_logs',
  'last_meal_at',
  'created_at',
  'updated_at',
]);

function sanitizeProfileRow(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of Object.keys(row || {})) {
    if (PROFILE_COLUMNS.has(k) && row[k] !== undefined) out[k] = row[k];
  }
  return out;
}

export function userProfileToProfileRow(profile: UserProfile): Record<string, any> {
  const p: any = profile || {};
  const row: Record<string, any> = {
    id: String(p.uid || ''),
    name: p.name ?? '',
    email: p.email ?? null,
    avatar: p.avatar ?? null,
    avatar_url: p.avatarUrl ?? p.avatar ?? null,
    friend_code: p.friendCode ?? null,
    clean_code: p.cleanCode ?? null,
    search_keys: Array.isArray(p.searchKeys) ? p.searchKeys.map(String) : [],
    gender: p.gender ?? null,
    age: p.age ?? null,
    height: p.height ?? null,
    current_weight: p.currentWeight ?? null,
    target_weight: p.targetWeight ?? null,
    start_weight: p.startWeight ?? null,
    weekly_goal: p.weeklyGoal ?? null,
    activity_level: p.activityLevel ?? null,
    diet_type: p.dietType ?? null,
    target_calories: p.targetCalories ?? null,
    target_protein: p.targetProtein ?? null,
    target_fat: p.targetFat ?? null,
    target_carbs: p.targetCarbs ?? null,
    target_fiber: p.targetFiber ?? null,
    target_water: p.targetWater ?? null,
    streak_days: p.streakDays ?? null,
    bmr: p.bmr ?? null,
    tdee: p.tdee ?? null,
    calendar_meals: p.calendarMeals && typeof p.calendarMeals === 'object' ? p.calendarMeals : {},
    daily_logs: p.dailyLogs && typeof p.dailyLogs === 'object' ? p.dailyLogs : {},
    updated_at: p.updatedAt || new Date().toISOString(),
  };
  if (p.createdAt) row.created_at = p.createdAt;
  if (p.lastMealAt) row.last_meal_at = p.lastMealAt;
  // lastActiveDate: there is no last_active_date column in the schema — deliberately not written
  // (see PROFILE_COLUMNS); in memory the field lives on the profile object.
  return row;
}

// profiles row -> FirestoreUser (friend card / search results).
function profileRowToFirestoreUser(row: any): FirestoreUser {
  const r = row || {};
  const uid = String(r.id ?? r.uid ?? '');
  return {
    uid,
    name: String(r.name ?? 'Friend'),
    email: strOrUndef(r.email),
    avatarUrl: strOrUndef(r.avatar_url ?? r.avatar),
    avatar: strOrUndef(r.avatar ?? r.avatar_url),
    friendCode: String(r.friend_code ?? r.friendCode ?? ''),
    targetCalories: numOrUndef(r.target_calories ?? r.targetCalories),
    goal: strOrUndef((r as any).goal),
    weeklyGoal: numOrUndef(r.weekly_goal ?? r.weeklyGoal),
    startWeight: numOrUndef(r.start_weight ?? r.startWeight),
    currentWeight: numOrUndef(r.current_weight ?? r.currentWeight),
    targetWeight: numOrUndef(r.target_weight ?? r.targetWeight),
    streakDays: numOrUndef(r.streak_days ?? r.streakDays),
    lastActiveDate: strOrUndef(r.last_active_date ?? r.lastActiveDate),
    targetProtein: numOrUndef(r.target_protein ?? r.targetProtein),
    targetFat: numOrUndef(r.target_fat ?? r.targetFat),
    targetCarbs: numOrUndef(r.target_carbs ?? r.targetCarbs),
  };
}

function ghostFriendEntry(uid: string): FirestoreUser {
  return {
    uid,
    name: 'Friend',
    friendCode: `NM-${String(uid).replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase()}`,
  } as FirestoreUser;
}

// ==========================================================
// Meal mappers: MealLog ↔ meals row (reserve for parts 2-3)
// ==========================================================
export function mealRowToMealLog(row: any): MealLog {
  const r = row || {};
  const meal: any = {
    id: String(r.id ?? ''),
    userId: String(r.user_id ?? r.userId ?? ''),
    date: String(r.date ?? '').slice(0, 10),
    type: r.type || 'lunch',
    title: String(r.title ?? 'Dish'),
    calories: numOrUndef(r.calories) ?? 0,
    protein: numOrUndef(r.protein) ?? 0,
    fat: numOrUndef(r.fat) ?? 0,
    carbs: numOrUndef(r.carbs) ?? 0,
    fiber: numOrUndef(r.fiber) ?? 0,
    portionGrams: numOrUndef(r.portion_grams ?? r.portionGrams) ?? 100,
    time: String(r.time ?? ''),
  };
  if (r.image_url ?? r.imageUrl) meal.imageUrl = String(r.image_url ?? r.imageUrl);
  if (Array.isArray(r.ingredients)) meal.ingredients = r.ingredients.filter(Boolean).map(String);
  if (r.ai_analysis !== null && r.ai_analysis !== undefined) {
    meal.aiAnalysis = typeof r.ai_analysis === 'string' ? r.ai_analysis : r.aiAnalysis ?? r.ai_analysis;
    if (typeof meal.aiAnalysis !== 'string') meal.aiAnalysis = r.aiAnalysis ?? undefined;
    if (meal.aiAnalysis === undefined && r.ai_analysis !== undefined) meal.aiAnalysis = r.ai_analysis;
  } else if (r.aiAnalysis !== undefined) {
    meal.aiAnalysis = r.aiAnalysis;
  }
  if (r.confidence !== null && r.confidence !== undefined) meal.confidence = Number(r.confidence);
  if (r.notes) meal.notes = String(r.notes);
  if (r.created_at ?? r.createdAt) meal.createdAt = String(r.created_at ?? r.createdAt);
  if (r.updated_at ?? r.updatedAt) meal.updatedAt = String(r.updated_at ?? r.updatedAt);
  return meal as MealLog;
}

export function mealLogToMealRow(meal: MealLog): Record<string, any> {
  const m: any = meal || {};
  const row: Record<string, any> = {
    id: String(m.id || ''),
    user_id: String(m.userId || ''),
    date: String(m.date || '').slice(0, 10),
    type: m.type || 'lunch',
    title: String(m.title || 'Dish'),
    calories: Math.max(0, Math.round(Number(m.calories) || 0)),
    protein: Math.max(0, Math.round(Number(m.protein) || 0)),
    fat: Math.max(0, Math.round(Number(m.fat) || 0)),
    carbs: Math.max(0, Math.round(Number(m.carbs) || 0)),
    fiber: Math.max(0, Math.round(Number(m.fiber) || 0)),
    portion_grams: Math.max(1, Math.round(Number(m.portionGrams) || 100)),
    time: m.time || '',
    image_url: m.imageUrl ?? null,
    ingredients: Array.isArray(m.ingredients) ? m.ingredients.filter(Boolean) : [],
    ai_analysis: m.aiAnalysis !== undefined ? String(m.aiAnalysis) : null,
    confidence: m.confidence !== undefined && m.confidence !== null ? Number(m.confidence) : null,
    notes: typeof m.notes === 'string' ? m.notes.trim() : null,
    updated_at: (m as any).updatedAt || new Date().toISOString(),
  };
  if ((m as any).createdAt) row.created_at = (m as any).createdAt;
  // MealLog extras without columns (items, barcode, timestamp) deliberately not written.
  return row;
}

// ==========================================================
// Resilience (same names/signatures, texts about Supabase)
// ==========================================================
let firestoreWriteQuotaExhausted = false;
let __quotaBreakerLogged = false;
// When the latch engages: re-probe the limit with a trial write at most once per 15 min.
// Previously the flag stuck until restart — after the limit reset, writes still
// didn't go through, outbox hung forever, retries "never succeed".
let __quotaBlockedAt = 0;
const QUOTA_REPROBE_MS = 15 * 60_000;

export function markFirestoreQuotaExhausted() {
  firestoreWriteQuotaExhausted = true;
  __quotaBlockedAt = Date.now();
  console.info('Notice: Temporary Supabase limit encountered. Using resilient dual-sync.');
}

export function isFirestoreQuotaExhausted(): boolean {
  if (!firestoreWriteQuotaExhausted) return false;
  // Time's up — give the limit a chance: reset the latch, next write will be
  // a trial (on a new failure the latch re-engages via markFirestoreQuotaExhausted).
  if (Date.now() - __quotaBlockedAt > QUOTA_REPROBE_MS) {
    firestoreWriteQuotaExhausted = false;
    __quotaBreakerLogged = false;
    __quotaBlockedAt = 0;
    console.info('Supabase quota latch released for re-probe — trying writes again');
    return false;
  }
  return true;
}

export async function safeFirestoreWrite<T>(writeOp: () => Promise<T>): Promise<T | null> {
  // Circuit breaker: limit exhausted — writes would be rejected anyway, don't spam
  // errors or burn the remainder. Reset by the re-probe window (15 min).
  if (firestoreWriteQuotaExhausted) {
    if (!__quotaBreakerLogged) {
      __quotaBreakerLogged = true;
      console.error('Supabase write limit exhausted — writes paused until limit reset, local-only');
    }
    return null;
  }
  try {
    return await writeOp();
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    const code = String(err?.code || err?.status || '');
    const hay = `${code} ${msg}`;
    __lastWriteError = { code: code || 'unknown', message: msg, at: Date.now() };
    if (
      code === '429' ||
      /rate.?limit|too many requests|quota|exhausted|RESOURCE_EXHAUSTED|resource-exhausted/i.test(hay)
    ) {
      markFirestoreQuotaExhausted();
    } else if (
      code === '42501' ||
      /permission denied|not allowed|row-level security|RLS|policy|PGRST301|JWT|jwt/i.test(hay)
    ) {
      // Most common cause: wrong RLS policies in Supabase Dashboard.
      // Data then does NOT sync to the cloud — friends don't see each other.
      console.error(
        'Supabase RLS policy violation: writes blocked by RLS policies. ' +
          'Open Supabase Dashboard -> Authentication -> Policies, check policies ' +
          'for tables profiles/meals/diaries/friendships/meal_reactions (see supabase/migrations/0001_init.sql) ' +
          'and make sure the user is logged in (auth.uid() = id).'
      );
    } else {
      console.warn('Supabase write warning:', err);
    }
    return null;
  }
}

// Last write error — for human hints in UI (toasts instead of silence)
interface LastWriteError {
  code: string;
  message: string;
  at: number;
}
let __lastWriteError: LastWriteError | null = null;

export function getLastFirestoreWriteError(): LastWriteError | null {
  return __lastWriteError;
}

export function isFirestorePermissionDenied(): boolean {
  if (!__lastWriteError) return false;
  // Hint is fresh for 10 minutes after the error
  if (Date.now() - __lastWriteError.at > 10 * 60_000) return false;
  const hay = `${__lastWriteError.code} ${__lastWriteError.message}`;
  return (
    __lastWriteError.code === '42501' ||
    /permission denied|not allowed|row-level security|RLS|policy|PGRST301|JWT/i.test(hay)
  );
}

// Read block when the limit is exhausted: polls and fetches are skipped, we live
// from cache/local. TTL 30 min — then try again.
let __readQuotaBlockedAt = 0;
const READ_BLOCK_TTL_MS = 30 * 60_000;

export function isFirestoreReadBlocked(): boolean {
  return __readQuotaBlockedAt > 0 && Date.now() - __readQuotaBlockedAt < READ_BLOCK_TTL_MS;
}

export function noteReadError(e: any, where: string): void {
  const msg = String(e?.message || e || '');
  const code = String(e?.code || (e as any)?.status || '');
  const hay = `${code} ${msg}`;
  if (
    code === '429' ||
    /rate.?limit|too many requests|quota|exhausted|RESOURCE_EXHAUSTED|resource-exhausted/i.test(hay)
  ) {
    __readQuotaBlockedAt = Date.now();
    console.error(`Supabase READ limit exhausted (${where}) — reading paused for 30 min, cache/local only`);
  }
}

// Realtime transport failure counter (proxy/VPN/adblock cut websockets):
// REST may still work. After 3 drops in 5 minutes we treat realtime
// as dead and hint the user the cause instead of silence.
const __transportFailureAt: number[] = [];
const TRANSPORT_WINDOW_MS = 5 * 60_000;

function pruneTransportFailures(now: number): void {
  while (__transportFailureAt.length > 0 && now - __transportFailureAt[0] > TRANSPORT_WINDOW_MS) {
    __transportFailureAt.shift();
  }
}

export function noteFirestoreTransportFailure(): void {
  const now = Date.now();
  __transportFailureAt.push(now);
  pruneTransportFailures(now);
}

export function isFirestoreTransportBlocked(): boolean {
  const now = Date.now();
  pruneTransportFailures(now);
  return __transportFailureAt.length >= 3;
}

// Throttling warns about channel drops: the realtime client retries a dead channel,
// each console warn is noise; log at most once per minute per source.
const __snapWarnAt = new Map<string, number>();

/**
 * Unified realtime-subscription error accounting: the transport flag counter gets
 * ANY error except RLS/permission-denied (it has its own flag and fix —
 * policies). Previously a quietly dead channel meant UI silence, and handlers
 * burned reads.
 */
export function noteSnapshotError(err: any, where: string): void {
  try {
    const code = String(err?.code || err?.name || err || '');
    const msg = String(err?.message || '');
    if (code === '42501' || /permission denied|not allowed|row-level security|RLS|policy/i.test(`${code} ${msg}`)) return;
    noteFirestoreTransportFailure();
    const now = Date.now();
    const last = __snapWarnAt.get(where) || 0;
    if (now - last > 60_000) {
      __snapWarnAt.set(where, now);
      console.warn(`Supabase ${where} realtime error:`, code || '?', msg || err);
    }
  } catch {}
}

// ==========================================================
// Quota-saving helpers: TTL cache + concurrent-request dedup
// (shared by parts 1-3 — we save Supabase limits just like the Spark quota)
// ==========================================================
const __readCache = new Map<string, { exp: number; val: any }>();
function cacheGet<T>(key: string): T | null {
  try {
    const e = __readCache.get(key);
    if (!e) return null;
    if (Date.now() > e.exp) {
      __readCache.delete(key);
      return null;
    }
    return e.val as T;
  } catch {
    return null;
  }
}
function cacheSet(key: string, val: any, ttlMs: number): void {
  try {
    if (__readCache.size > 300) {
      const first = __readCache.keys().next().value;
      if (first) __readCache.delete(first);
    }
    __readCache.set(key, { exp: Date.now() + ttlMs, val });
  } catch {}
}
function cacheDel(prefix: string): void {
  try {
    for (const k of Array.from(__readCache.keys())) {
      if (k === prefix || k.startsWith(prefix)) __readCache.delete(k);
    }
  } catch {}
}
const __inflight = new Map<string, Promise<any>>();
function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const cur = __inflight.get(key);
  if (cur) return cur as Promise<T>;
  const p = fn().finally(() => {
    if (__inflight.get(key) === p) __inflight.delete(key);
  });
  __inflight.set(key, p);
  return p;
}
function isTabHidden(): boolean {
  try {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
  } catch {
    return false;
  }
}
// Write throttling: at most once per minIntervalMs per key
const __lastWriteAt = new Map<string, number>();
function shouldWrite(key: string, minIntervalMs: number): boolean {
  const now = Date.now();
  const last = __lastWriteAt.get(key) || 0;
  if (now - last < minIntervalMs) return false;
  __lastWriteAt.set(key, now);
  return true;
}

// How many ms remain until the throttle window ends (0 — can write now)
function getThrottleRemainingMs(key: string, minIntervalMs: number): number {
  const elapsed = Date.now() - (__lastWriteAt.get(key) || 0);
  return elapsed >= minIntervalMs ? 0 : minIntervalMs - elapsed;
}

// Deferred trailing retries: coalesce a burst of calls into one.
// Needed because previously throttled calls were just dropped (return) and
// fresh data never reached the cloud/friends until the next manual save.
const __pendingTrailing = new Map<string, ReturnType<typeof setTimeout>>();
function scheduleTrailing(key: string, delayMs: number, fn: () => void): void {
  try {
    const prev = __pendingTrailing.get(key);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      if (__pendingTrailing.get(key) === t) __pendingTrailing.delete(key);
      try {
        fn();
      } catch {}
    }, Math.max(0, delayMs));
    __pendingTrailing.set(key, t);
  } catch {}
}

function canonicalMealId(raw: string): string {
  const m = String(raw || '').match(/^\d{4}-\d{2}-\d{2}_(.+)$/);
  return m ? m[1] : String(raw || '');
}

// Guest-mode placeholders ('u1', 'user_<ts>'): live locally only.
// Writing them to Supabase is doomed to RLS rejection (policies require auth.uid()).
export function isPlaceholderUid(u?: string | null): boolean {
  if (!u) return true;
  const s = String(u);
  return s === 'u1' || s === 'USER' || /^user_\d+$/.test(s);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Real Supabase Auth uid is a UUID. Everything else (guest 'u1'/'uid_*',
// legacy Firebase-uid from old local profiles, undefined) when querying
// uuid columns gives PostgREST 400 "invalid input syntax for type uuid".
// Check BEFORE any network call.
export function isRealUid(u?: string | null): u is string {
  if (!u || isPlaceholderUid(u)) return false;
  return UUID_RE.test(String(u).trim());
}

let __noAuthCloudWarned = false;
function warnNoAuthOnce(what: string): void {
  if (__noAuthCloudWarned) return;
  __noAuthCloudWarned = true;
  console.info(`${what} — no auth session (guest mode): local-only, no Supabase`);
}
void warnNoAuthOnce;

function notifyCloudDenied(): void {
  try {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('nutrimint:cloud', {
        detail: { state: 'denied', reason: 'permission-denied' },
      })
    );
  } catch {}
}

// Last saved profile snapshot (without updatedAt) — write dedup
const __lastProfileJson = new Map<string, string>();

// ==========================================================
// Profile
// ==========================================================
export async function saveUserProfileToFirestore(profile: UserProfile): Promise<string> {
  const friendCode =
    profile.friendCode || `NM-${String(profile.uid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase()}`;
  try {
    if (!profile.uid) return '';
    const cleanCode = friendCode.replace(/^NM-/, '').toUpperCase();
    const searchKeys = Array.from(
      new Set([
        friendCode.toUpperCase(),
        cleanCode,
        (profile.name || '').toLowerCase(),
        (profile.email || '').toLowerCase(),
        profile.uid.toLowerCase(),
        profile.uid.toUpperCase(),
      ])
    ).filter(Boolean);

    // Calendar snapshots — next to the profile, as in the original.
    // IMPORTANT: snapshot goes WITHOUT base64 photos (stripDataUrlPhotos) — otherwise the row
    // profiles row bloats and the calendar never reaches friends.
    // Dish photos live in Storage (URL) and in per-meal meals rows.
    let calMeals: Record<string, any> = {};
    try {
      const { getStoredCalendarMeals, syncAllLocalMealsWithUid, stripDataUrlPhotos } = await import('./store');
      syncAllLocalMealsWithUid(profile.uid);
      calMeals = stripDataUrlPhotos(getStoredCalendarMeals());
    } catch {}

    const updated: any = {
      ...profile,
      friendCode,
      cleanCode,
      searchKeys,
      calendarMeals: calMeals,
      dailyLogs: calMeals,
      updatedAt: new Date().toISOString(),
    };

    // Dedup: profile is touched often (auth, streak, login) — identical payload
    // is not written at all (updatedAt excluded from comparison). Saves writes.
    // IMPORTANT: mark only AFTER success — otherwise a failed write (denied/
    // limit/offline) seals the dedup and profile+calendar never arrive.
    let skipByDedup = false;
    let profileJson = '';
    try {
      const { updatedAt: _ignore, ...comparable } = updated;
      void _ignore;
      profileJson = JSON.stringify(comparable);
      if (profileJson && __lastProfileJson.get(profile.uid) === profileJson) skipByDedup = true;
    } catch {}
    if (skipByDedup) return friendCode;

    // Rows must live on auth.uid (RLS) — profile uid may
    // lag (account switch, stale localStorage). Writing to someone else's row =
    // quiet RLS rejection + stale calendar for friends. On mismatch
    // do not write at all (honestly), fixed by re-login; searchKeys keep
    // the old uid for search.
    const authUid = await currentUid();
    const effUid = authUid || (!isPlaceholderUid(profile.uid) ? profile.uid : undefined);
    // Non-UUID (guest, legacy Firebase-uid) into a uuid column gives PostgREST 400 —
    // do not even try.
    if (!isRealUid(effUid)) {
      console.warn('Profile cloud sync skipped: no real Supabase uid');
      return friendCode;
    }
    if (effUid !== profile.uid) {
      console.warn(`Profile uid mismatch: profile ${profile.uid} != auth ${effUid} — not writing to cloud, re-login needed`);
      // Self-heal right away: friendships hanging on a stale uid get re-linked
      // to the live auth.uid — otherwise the friend follows a ghost and never sees new meals.
      // Plus a loud event (App shows 'denied'), not a quiet warn.
      void healOwnFriendships(profile.uid, effUid);
      notifyCloudDenied();
      return friendCode;
    }

    // 1. Profile — upsert by id (owner). The original had no friend
    // cache invalidation on friendCode change here either — do not invent it.
    const row = sanitizeProfileRow(userProfileToProfileRow({ ...updated, uid: profile.uid }));
    const w1 = await safeFirestoreWrite(async () => {
      const { error } = await supabase.from('profiles').upsert(row, { onConflict: 'id' });
      if (error) throw error;
      return true;
    });

    // 2. Diary-calendar — mirrors the original (there diaries/{uid}).
    let w2: boolean | null = null;
    if (Object.keys(calMeals).length > 0) {
      w2 = await safeFirestoreWrite(async () => {
        const { error } = await supabase.from('diaries').upsert(
          { user_id: profile.uid, calendar_meals: calMeals, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        );
        if (error) throw error;
        return true;
      });
    }

    // Mark dedup only if ALL attempted writes succeed:
    // partial success (profiles ok, diaries denied) must repeat fully,
    // otherwise the second row stays stale forever.
    const attempted = [w1, ...(Object.keys(calMeals).length > 0 ? [w2] : [])];
    if (attempted.length > 0 && attempted.every((w) => w === true) && profileJson) {
      try {
        __lastProfileJson.set(profile.uid, profileJson);
      } catch {}
    }

    return friendCode;
  } catch (err) {
    console.warn('Failed to save user profile:', err);
    return friendCode;
  }
}

export async function fetchUserProfileFromFirestore(userId: string): Promise<UserProfile | null> {
  try {
    if (!isRealUid(userId)) return null;
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) {
      noteReadError(error, 'profile');
      throw error;
    }
    if (data) return profileRowToUserProfile(data);
    return null;
  } catch (err) {
    console.warn('Failed to fetch user profile:', err);
    return null;
  }
}

export function subscribeToUserProfile(userId: string, callback: (profile: UserProfile) => void): () => void {
  try {
    if (!isRealUid(userId)) return () => {};

    // Immediate call — as in the original (initial fetch).
    fetchUserProfileFromFirestore(userId).then((p) => {
      if (p) callback(p);
    });

    // Realtime listener for the profiles row (instead of onSnapshot).
    let channel: RealtimeChannel | null = null;
    try {
      channel = supabase
        .channel(`profile:${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
          () => {
            fetchUserProfileFromFirestore(userId).then((p) => {
              if (p) callback(p);
            });
          }
        )
        .subscribe((status, err) => {
          if (err || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            noteSnapshotError(err ?? status, 'user-profile');
            // Realtime is dead — pull a fresh profile once, but only while
            // transport is not deemed dead: otherwise each retry burns reads.
            if (!isFirestoreTransportBlocked()) {
              fetchUserProfileFromFirestore(userId).then((p) => {
                if (p) callback(p);
              });
            }
          }
        });
    } catch {}

    return () => {
      try {
        if (channel) void supabase.removeChannel(channel);
      } catch {}
    };
  } catch {
    return () => {};
  }
}

// ==========================================================
// User search (Cyrillic normalization — 1-to-1)
// ==========================================================
export async function searchUsersInFirestore(searchTerm: string, currentUserId: string): Promise<FirestoreUser[]> {
  try {
    const rawInput = searchTerm.trim();
    if (!rawInput) return [];

    let mappedInput = rawInput.toUpperCase();
    mappedInput = mappedInput
      .replace(/^НМ-/, 'NM-')
      .replace(/^HM-/, 'NM-')
      .replace(/^[#@]/, '')
      .replace(/Н/g, 'N')
      .replace(/М/g, 'M')
      .replace(/Т/g, 'T')
      .replace(/О/g, 'O')
      .replace(/Р/g, 'P')
      .replace(/А/g, 'A')
      .replace(/В/g, 'B')
      .replace(/С/g, 'C')
      .replace(/Е/g, 'E')
      .replace(/Х/g, 'X')
      .replace(/К/g, 'K');

    const cleanTerm = mappedInput.replace(/^[#@]/, '');
    const cleanNoPrefix = cleanTerm.replace(/^NM-/, '');
    const friendCodeExact = `NM-${cleanNoPrefix}`;
    const rawLower = rawInput.toLowerCase();

    const results: FirestoreUser[] = [];
    const addedUids = new Set<string>();
    const pushRow = (row: any) => {
      try {
        const u = profileRowToFirestoreUser(row);
        const fullUid = u.uid;
        if (fullUid && fullUid !== currentUserId && !addedUids.has(fullUid)) {
          addedUids.add(fullUid);
          results.push(u);
        }
      } catch {}
    };

    // 1. Direct row lookup by id (with fallback to row id).
    // Search by cleaned input: with #/@ prefixes the row will never match.
    // id column is uuid: non-UUID in eq gives PostgREST 400, skip.
    try {
      const docIdGuess = rawInput.replace(/^[#@]/, '').trim();
      if (isRealUid(docIdGuess)) {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', docIdGuess).maybeSingle();
        if (!error && data) pushRow(data);
      }
    } catch {}

    // 2. Point queries (friendCode, cleanCode, searchKeys, uid, email) —
    // mirror of the 7 original queries; searchKeys via contains (array-contains).
    try {
      const queries = [
        supabase.from('profiles').select('*').eq('friend_code', friendCodeExact),
        supabase.from('profiles').select('*').eq('friend_code', cleanNoPrefix),
        supabase.from('profiles').select('*').eq('clean_code', cleanNoPrefix),
        supabase.from('profiles').select('*').contains('search_keys', [cleanNoPrefix]),
        supabase.from('profiles').select('*').contains('search_keys', [friendCodeExact]),
        // id is a uuid column: plug raw input only if it is a UUID, else 400.
        ...(isRealUid(rawInput)
          ? [supabase.from('profiles').select('*').eq('id', rawInput)]
          : []),
        supabase.from('profiles').select('*').eq('email', rawLower),
      ];

      const snapshots = await Promise.all(
        queries.map((q) => Promise.resolve(q).catch(() => ({ data: null, error: true }) as any))
      );

      snapshots.forEach((snap: any) => {
        ((snap && snap.data) || []).forEach(pushRow);
      });

      if (results.length > 0) return results;
    } catch (e) {
      console.warn('Supabase direct search query error:', e);
    }

    // 3. Partial branch via .or() ilike (name/email/friend_code/clean_code) —
    // limited (limit 20), not a full table scan: a full scan would cost
    // N reads per search and kill the limits.
    try {
      const esc = rawInput.replace(/[%_\\,]/g, '').trim().slice(0, 40);
      if (esc) {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .or(`name.ilike.%${esc}%,email.ilike.%${esc}%,friend_code.ilike.%${esc}%,clean_code.ilike.%${esc}%`)
          .limit(20);
        if (!error) (data || []).forEach(pushRow);
      }
    } catch {}

    return results;
  } catch (err) {
    console.warn('Failed to search users:', err);
    return [];
  }
}

// ==========================================================
// Friends
// ==========================================================
export async function addFriendInFirestore(currentUserId: string, friendUid: string): Promise<boolean> {
  try {
    if (!currentUserId || !friendUid || currentUserId === friendUid) return false;

    // Friendship must hang on auth.uid: profile uid may lag
    // (account switch, stale localStorage). Friendship on ghost-uid = friend
    // subscribed to an empty address: sees old meals (written under ghost),
    // but never the new ones (under auth.uid).
    const authUid = await currentUid();
    const ownerUid = authUid || currentUserId;
    if (!isRealUid(ownerUid) || !isRealUid(friendUid)) return false;
    if (ownerUid === friendUid) return false;
    if (ownerUid !== currentUserId) {
      console.warn(`AddFriend uid rebind: profile ${currentUserId} -> auth ${ownerUid}`);
    }

    // Bidirectional sorted ID (also sort userA/userB — fallback read via
    // split('_') breaks on unsorted pairs).
    const friendshipId = [ownerUid, friendUid].sort().join('_');
    const [userA, userB] = [ownerUid, friendUid].sort();

    // Already exists → true (idempotency, like merge-set in the original).
    try {
      const { data, error } = await supabase.from('friendships').select('id').eq('id', friendshipId).maybeSingle();
      if (!error && data) {
        invalidateFriendsCache(ownerUid);
        if (ownerUid !== currentUserId) invalidateFriendsCache(currentUserId);
        return true;
      }
    } catch {}

    const wrote = await safeFirestoreWrite(async () => {
      const { error } = await supabase
        .from('friendships')
        .upsert({ id: friendshipId, user_a: userA, user_b: userB }, { onConflict: 'id' });
      if (error) throw error;
      return true;
    });

    invalidateFriendsCache(ownerUid);
    if (ownerUid !== currentUserId) invalidateFriendsCache(currentUserId);
    // Honest result: true only if the write really reached Supabase.
    return wrote !== null;
  } catch (err) {
    console.warn('Failed to add friend:', err);
    return false;
  }
}

/**
 * Self-heal for ghost-uid friendships: re-links all friendships holding
 * staleUid onto realUid (insert new row with sorted id + delete
 * the old one). RLS allows friendship writes to participants.
 * Called both by the writer (own stale uid) and the reader (friend ghost
 * found by friendCode). Returns the number of healed friendships.
 */
export async function healOwnFriendships(staleUid: string, realUid: string): Promise<number> {
  try {
    if (!staleUid || !realUid || staleUid === realUid) return 0;
    // Server heal only makes sense uuid->uuid: placeholders and legacy-uid
    // cannot live in uuid columns (FK), and .or() with them gives PostgREST 400.
    if (!isRealUid(staleUid) || !isRealUid(realUid)) return 0;
    const authUid = await currentUid();
    if (!authUid) return 0;
    let rows: any[] = [];
    try {
      const { data, error } = await supabase
        .from('friendships')
        .select('*')
        .or(`user_a.eq.${staleUid},user_b.eq.${staleUid}`);
      if (error) throw error;
      rows = data || [];
    } catch (e) {
      noteReadError(e, 'friendships-heal');
      return 0;
    }
    if (rows.length === 0) return 0;
    let healed = 0;
    for (const f of rows) {
      try {
        const usersArr: string[] = [f.user_a ?? f.userA, f.user_b ?? f.userB].filter(Boolean).map(String);
        if (!usersArr.includes(staleUid) || usersArr.includes(realUid)) continue;
        const nextUsers = usersArr.map((u) => (u === staleUid ? realUid : u));
        const [userA, userB] = [...nextUsers].sort();
        const nextId = [userA, userB].sort().join('_');
        if (nextId === f.id) continue;
        await safeFirestoreWrite(async () => {
          const { error } = await supabase
            .from('friendships')
            .upsert({ id: nextId, user_a: userA, user_b: userB }, { onConflict: 'id' });
          if (error) throw error;
          return true;
        });
        await safeFirestoreWrite(async () => {
          const { error } = await supabase.from('friendships').delete().eq('id', f.id);
          if (error) throw error;
          return true;
        });
        healed += 1;
      } catch {}
    }
    if (healed > 0) {
      try {
        invalidateFriendsCache(staleUid);
        invalidateFriendsCache(realUid);
      } catch {}
    }
    return healed;
  } catch (e) {
    console.warn('Heal friendships error:', e);
    return 0;
  }
}

export async function deleteFriendFromFirestore(currentUserId: string, friendUid: string): Promise<void> {
  try {
    if (!currentUserId || !friendUid) return;

    await safeFirestoreWrite(async () => {
      // Delete both id sort orders — legacy rows may have landed unsorted.
      const ids = Array.from(new Set([`${currentUserId}_${friendUid}`, `${friendUid}_${currentUserId}`]));
      const { error } = await supabase.from('friendships').delete().in('id', ids);
      if (error) throw error;
      return true;
    });
    invalidateFriendsCache(currentUserId);
  } catch (err) {
    console.warn('Failed to delete friend:', err);
  }
}

export async function fetchFriendsFromFirestore(
  currentUserId: string,
  opts?: { force?: boolean }
): Promise<FirestoreUser[]> {
  try {
    if (!isRealUid(currentUserId)) return [];
    __lastFriendsErrorMsg = '';
    if (isFirestoreReadBlocked()) {
      __lastFriendsErrorMsg = 'read quota blocked';
      __lastFriendsErrorAt = Date.now();
      return [];
    }
    // 60s cache: friend list changes rarely (add/remove invalidate).
    // Without cache every polling + every rerender = a burst of friendships + profile reads.
    const cacheKey = `friends:${currentUserId}`;
    if (!opts?.force) {
      const cached = cacheGet<FirestoreUser[]>(cacheKey);
      if (cached) return cached;
    }
    return await dedupe(cacheKey + (opts?.force ? ':force' : ''), async () => {
      if (!opts?.force) {
        const cachedInner = cacheGet<FirestoreUser[]>(cacheKey);
        if (cachedInner) return cachedInner;
      }
      const friendsMap = new Map<string, FirestoreUser>();

      try {
        const { data, error } = await supabase
          .from('friendships')
          .select('*')
          .or(`user_a.eq.${currentUserId},user_b.eq.${currentUserId}`);
        if (error) throw error;

        const friendUids: string[] = [];
        (data || []).forEach((f: any) => {
          const usersArr: string[] = [f.user_a ?? f.userA, f.user_b ?? f.userB].filter(Boolean).map(String);
          const other = usersArr.find((u) => u && u !== currentUserId);
          if (other && !friendUids.includes(other)) {
            friendUids.push(other);
          } else if (!other) {
            const parts = String(f.id || '').split('_');
            const cand = parts.find((p) => p && p !== currentUserId);
            if (cand && !friendUids.includes(cand)) friendUids.push(cand);
          }
        });

        // Profiles in chunks of 30 via .in('id', chunk) instead of one-by-one
        // reads. Non-uuid (ghost placeholders) cannot live in profiles
        // (FK to auth.users) — give them a stub at once to not fail the query with 22P02.
        const uuidRe = /^[0-9a-fA-F-]{36}$/;
        const queryable = friendUids.filter((u) => uuidRe.test(u));
        const ghosts = friendUids.filter((u) => !uuidRe.test(u));
        for (let i = 0; i < queryable.length; i += 30) {
          const chunk = queryable.slice(i, i + 30);
          if (chunk.length === 0) continue;
          try {
            const { data: rows, error: e2 } = await supabase.from('profiles').select('*').in('id', chunk);
            if (e2) throw e2;
            const byId = new Map<string, any>((rows || []).map((r: any) => [String(r.id), r]));
            for (const fUid of chunk) {
              if (!fUid || friendsMap.has(fUid)) continue;
              const row = byId.get(fUid);
              if (row) {
                const full = profileRowToFirestoreUser(row);
                if (full.uid && full.uid !== currentUserId) friendsMap.set(full.uid, full);
              } else {
                friendsMap.set(fUid, ghostFriendEntry(fUid));
              }
            }
          } catch {
            for (const fUid of chunk) {
              if (fUid && !friendsMap.has(fUid)) friendsMap.set(fUid, ghostFriendEntry(fUid));
            }
          }
        }
        for (const g of ghosts) {
          if (g && !friendsMap.has(g)) friendsMap.set(g, ghostFriendEntry(g));
        }
      } catch (e: any) {
        const msg = `friendships query: ${e?.code || e?.message || e}`;
        __lastFriendsErrorMsg = msg;
        __lastFriendsErrorAt = Date.now();
        noteReadError(e, 'friendships');
        console.warn('Supabase fetch friends error:', e);
      }

      const out = Array.from(friendsMap.values());
      cacheSet(cacheKey, out, 60_000);
      return out;
    });
  } catch (err: any) {
    __lastFriendsErrorMsg = `fetch friends: ${err?.code || err?.message || err}`;
    __lastFriendsErrorAt = Date.now();
    noteReadError(err, 'friends');
    console.warn('Failed to fetch friends:', err);
    return [];
  }
}

// Last friends-load error — so UI tells 'no friends' apart from
// 'read failed' and does not wipe the list on a transient error.
let __lastFriendsErrorMsg = '';
let __lastFriendsErrorAt = 0;
const FRIENDS_ERROR_TTL_MS = 120_000;

export function getLastFriendsFetchError(): string | null {
  if (!__lastFriendsErrorMsg) return null;
  if (Date.now() - __lastFriendsErrorAt > FRIENDS_ERROR_TTL_MS) return null;
  return __lastFriendsErrorMsg;
}

export function invalidateFriendsCache(currentUserId?: string): void {
  try {
    if (currentUserId) cacheDel(`friends:${currentUserId}`);
    else cacheDel('friends:');
  } catch {}
}

export function subscribeToFriendships(currentUserId: string, callback: (friends: FirestoreUser[]) => void): () => void {
  try {
    if (!isRealUid(currentUserId)) return () => {};

    // Initial load
    fetchFriendsFromFirestore(currentUserId).then((friends) => {
      callback(friends);
    });

    // Real-time friendships listener (no filter — RLS still cuts
    // foreign rows; membership is re-checked by the refetch itself, which
    // selects only currentUserId friendships).
    // 2s debounce: during active writes events pour in bursts,
    // and each would pull a full friends+profiles refetch.
    let channel: RealtimeChannel | null = null;
    let debounceT: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = (force = false) => {
      if (debounceT) clearTimeout(debounceT);
      debounceT = setTimeout(() => {
        fetchFriendsFromFirestore(currentUserId, force ? { force: true } : undefined).then((friends) => {
          callback(friends);
        });
      }, force ? 0 : 2000);
    };
    try {
      channel = supabase
        .channel(`friendships:${currentUserId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () =>
          scheduleReload(true)
        )
        .subscribe((status, err) => {
          if (err || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            noteSnapshotError(err ?? status, 'friendships');
            // Realtime is dead — pull a fresh list past the cache, but only while
            // transport is not deemed dead (polling insures further).
            if (!isFirestoreTransportBlocked()) scheduleReload(true);
          }
        });
    } catch {}

    // Fallback polling: once per 5 minutes and only with a visible tab.
    // Previously every 45s even in background — the main read eater.
    const pollInterval = setInterval(() => {
      if (isTabHidden()) return;
      if (isFirestoreReadBlocked()) return;
      scheduleReload();
    }, 300_000);

    // Return to the app (unlock/focus): instant list check
    // off the poll schedule, otherwise stale hangs up to 5 minutes after background.
    // 10s throttling against focus storms; returns are user-paced, reads are few.
    let lastFgR = 0;
    const onFgReload = () => {
      try {
        if (isTabHidden() || isFirestoreReadBlocked()) return;
        const now = Date.now();
        if (now - lastFgR < 10_000) return;
        lastFgR = now;
        scheduleReload();
      } catch {}
    };
    try {
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onFgReload);
      if (typeof window !== 'undefined') window.addEventListener('focus', onFgReload);
    } catch {}

    return () => {
      if (debounceT) clearTimeout(debounceT);
      try {
        if (channel) void supabase.removeChannel(channel);
      } catch {}
      clearInterval(pollInterval);
      try {
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onFgReload);
        if (typeof window !== 'undefined') window.removeEventListener('focus', onFgReload);
      } catch {}
    };
  } catch (err) {
    console.warn('Failed to subscribe to friendships:', err);
    return () => {};
  }
}

// ==========================================================
// Meal reactions
// ==========================================================
export async function addMealReactionInFirestore(mealId: string, fromUserId: string, emoji: string): Promise<void> {
  try {
    if (!mealId || !isRealUid(fromUserId) || !emoji) return;
    const cleanMealId = String(mealId);

    void safeFirestoreWrite(async () => {
      const reactionId = `${cleanMealId}_${fromUserId}_${emoji}`;
      const { error } = await supabase.from('meal_reactions').upsert(
        { id: reactionId, meal_id: cleanMealId, from_user_id: fromUserId, emoji },
        { onConflict: 'id' }
      );
      if (error) throw error;
      return true;
    });
    // Invalidate the reactions cache so the next fetch sees the new one
    invalidateReactionsCache(cleanMealId);
  } catch (err) {
    console.warn('Failed to save meal reaction:', err);
  }
}

function invalidateReactionsCache(mealId: string): void {
  try {
    const canon = canonicalMealId(mealId);
    for (const k of Array.from(__readCache.keys())) {
      if (k.startsWith('reactions:') && (k.includes(mealId) || k.includes(canon))) {
        __readCache.delete(k);
      }
    }
  } catch {}
}

export async function removeMealReactionInFirestore(mealId: string, fromUserId: string, emoji: string): Promise<void> {
  try {
    if (!mealId || !isRealUid(fromUserId) || !emoji) return;
    const cleanMealId = String(mealId);
    await safeFirestoreWrite(async () => {
      const { error } = await supabase
        .from('meal_reactions')
        .delete()
        .eq('id', `${cleanMealId}_${fromUserId}_${emoji}`);
      if (error) throw error;
      return true;
    });
    // Legacy id format `${mealId}_${fromUserId}` (no emoji): drop if
    // emoji matched — mirror of the original fallback.
    await safeFirestoreWrite(async () => {
      try {
        const { data, error } = await supabase
          .from('meal_reactions')
          .select('*')
          .eq('id', `${cleanMealId}_${fromUserId}`)
          .maybeSingle();
        if (error) throw error;
        if (data && ((data as any)?.emoji === emoji || (data as any)?.meal_id === cleanMealId)) {
          const { error: e2 } = await supabase
            .from('meal_reactions')
            .delete()
            .eq('id', `${cleanMealId}_${fromUserId}`);
          if (e2) throw e2;
        }
      } catch {}
      return true;
    });
    invalidateReactionsCache(cleanMealId);
  } catch (err) {
    console.warn('Failed to remove meal reaction:', err);
  }
}

export async function fetchMealReactionsFromFirestore(
  mealIds: string[] | string,
  dateById?: Record<string, string>
): Promise<Record<string, string[]>> {
  try {
    const list = Array.isArray(mealIds)
      ? mealIds.filter(Boolean).map(String)
      : typeof mealIds === 'string' && mealIds
        ? [String(mealIds)]
        : [];
    if (list.length === 0) return {};
    // 60s cache: reactions change rarely, and the feed requests them on every update.
    // Dates are part of the key (legacy `date_id` variants depend on them): otherwise the same
    // id list with another date would return a stale cache without legacy rows.
    const datePart = dateById
      ? Object.keys(dateById)
          .sort()
          .map((k) => `${k}=${dateById[k]}`)
          .join(',')
      : '';
    const cacheKey = `reactions:${[...list].sort().join(',')}|${datePart}`;
    const cached = cacheGet<Record<string, string[]>>(cacheKey);
    if (cached) return cached;
    return await dedupe(cacheKey, async () => {
      const cachedInner = cacheGet<Record<string, string[]>>(cacheKey);
      if (cachedInner) return cachedInner;
      const wanted = new Set(list.map(canonicalMealId));
      const result: Record<string, string[]> = {};
      const push = (mealKey: string, emoji: string) => {
        if (!mealKey || !emoji) return;
        const canon = canonicalMealId(mealKey);
        let target: string | null = null;
        if (wanted.has(canon)) {
          for (const w of list) {
            if (canonicalMealId(w) === canon) {
              target = w;
              break;
            }
          }
          target = target || canon;
        } else if (wanted.has(mealKey)) target = mealKey;
        if (!target) return;
        if (!result[target]) result[target] = [];
        if (!result[target].includes(emoji)) result[target].push(emoji);
      };
      // Point queries in chunks of 30 via .in('meal_id', chunk) instead of
      // scanning the WHOLE table: a scan cost N reads per call.
      // Legacy `YYYY-MM-DD_id` keys are backfilled by the same queries: the feed knows
      // the date (dateById), add the variant to the chunk.
      try {
        const uniqClean = Array.from(new Set(list.map(canonicalMealId)));
        const withLegacy: string[] = [];
        uniqClean.forEach((cid) => {
          withLegacy.push(cid);
          let d: string | undefined;
          try {
            d = dateById?.[cid];
            if (!d) {
              const w = list.find((x) => canonicalMealId(x) === cid);
              if (w) d = dateById?.[w];
            }
          } catch {}
          if (d && /^\d{4}-\d{2}-\d{2}$/.test(String(d).slice(0, 10))) {
            withLegacy.push(`${String(d).slice(0, 10)}_${cid}`);
          }
        });
        const uniqAll = Array.from(new Set(withLegacy));
        for (let i = 0; i < uniqAll.length; i += 30) {
          const chunk = uniqAll.slice(i, i + 30);
          if (chunk.length === 0) continue;
          try {
            const { data, error } = await supabase.from('meal_reactions').select('*').in('meal_id', chunk);
            if (error) throw error;
            (data || []).forEach((r: any) => {
              if (r?.meal_id && r?.emoji) push(String(r.meal_id), String(r.emoji));
            });
          } catch (e: any) {
            const hay = String(e?.message || e);
            // Limit/quota — stop here, the next call picks up the rest.
            if (/quota|rate.?limit|exhausted|RESOURCE_EXHAUSTED/i.test(hay) || (e as any)?.code === '429') {
              markFirestoreQuotaExhausted();
              break;
            }
          }
        }
      } catch (e: any) {
        if (/quota|rate.?limit|exhausted|RESOURCE_EXHAUSTED/i.test(String(e?.message || e))) markFirestoreQuotaExhausted();
        else noteReadError(e, 'reactions');
      }
      cacheSet(cacheKey, result, 60_000);
      return result;
    });
  } catch (err) {
    console.warn('Failed to fetch meal reactions:', err);
    return {};
  }
}

/**
 * Light activity 'ping' (1 tiny write): updates last_meal_at in
 * profiles. Friends listen to this row — so they learn about new meals
 * instantly, without waiting for the heavy calendar sync.
 * Does not block the caller (fire-and-forget), skipped on limit/guest.
 *
 * 3s throttling + trailing retry: a burst of saves coalesces into one
 * deferred ping with the latest lastMealId, but no ping is
 * silently dropped anymore — previously dishes 2..N of a burst written within the window
 * after the first did not bump last_meal_at, and the friend did not see them until
 * the next window.
 */
const MEAL_PING_MIN_MS = 3_000;
export function pingUserMealActivity(userId: string, lastMealId?: string): void {
  try {
    if (!isRealUid(userId)) return;
    if (isFirestoreQuotaExhausted()) return;
    const key = `mealping:${userId}`;
    if (!shouldWrite(key, MEAL_PING_MIN_MS)) {
      // Do not drop: defer one coalesced ping to the end of the window.
      // lastMealId has no separate column in the schema — just wait out the window.
      const wait = getThrottleRemainingMs(key, MEAL_PING_MIN_MS) + 300;
      const mealId = lastMealId ? String(lastMealId) : undefined;
      scheduleTrailing(key, wait, () => pingUserMealActivity(userId, mealId));
      return;
    }
    // Owner is auth.uid (RLS): we won't be allowed to update someone else's row anyway.
    void (async () => {
      try {
        const owner = await currentUid();
        if (!owner || owner !== userId) return;
        const now = new Date().toISOString();
        await safeFirestoreWrite(async () => {
          const { error } = await supabase
            .from('profiles')
            .update({ last_meal_at: now, updated_at: now })
            .eq('id', userId);
          if (error) throw error;
          return true;
        });
      } catch {}
    })();
  } catch {}
}

// ==========================================================
// PART 2: meal mechanics (port of lib/firebase.ts:1128-2260+).
// Covers: saveMealToFirestore, synced-ids, cloud-outbox (same
// localStorage keys!), calendar snapshots (profiles+diaries),
// deletion, reading (fetchMeals/fetchFriendCalendarLogs) and live
// subscription subscribeToUserMeals (realtime + polling + focus).
// diagnoseFriendFeed skipped deliberately — it is part 3.
// Reuses part-1 helpers (currentUid/resolveOwnerUid, mappers
// meals, safeFirestoreWrite, cache, throttle, ping, notifyCloudDenied).
// Supabase mapping: meals/{id} -> meals table (upsert by id),
// users/{uid}.calendarMeals -> profiles.calendar_meals/daily_logs,
// diaries/{uid} -> diaries table (user_id, calendar_meals).
// ==========================================================

export async function saveMealToFirestore(meal: MealLog): Promise<boolean> {
  try {
    const authedUid = (await currentUid()) || resolveOwnerUid();
    // Auth is the source of truth for RLS (insert requires user_id == auth.uid()).
    // Profile uid may lag (account switch, stale localStorage) —
    // stamping it would mean a quiet RLS rejection and meals
    // 'not going to the cloud' though locally everything is visible.
    let finalUserId: string | undefined = authedUid || undefined;
    if (!finalUserId && isRealUid(meal.userId)) {
      finalUserId = meal.userId as string;
    }
    if (!finalUserId) {
      console.warn('Cannot save meal: missing userId');
      // Still put into outbox (by meal.id): after login the flusher will finish it,
      // previously this branch lost the dish for retries forever.
      try {
        if (meal?.id) enqueueCloudRetry(String(meal.id));
      } catch {}
      return false;
    }
    if (meal.userId && !isPlaceholderUid(meal.userId) && meal.userId !== finalUserId) {
      console.warn(
        `Meal userId mismatch: local ${meal.userId} != auth ${finalUserId} — stamping auth.uid, otherwise RLS will reject the write`
      );
    }
    const cleanDate = meal.date ? meal.date.slice(0, 10) : getLocalDateString();
    const mealId = String(meal.id || `meal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    let imageUrl = meal.imageUrl && typeof meal.imageUrl === 'string' ? meal.imageUrl : undefined;
    // Size guards: data-URL photos over ~700K chars would crash the write,
    // and outbox would spin it forever. A dish without a photo beats a missing dish.
    if (imageUrl && imageUrl.length > 700_000) {
      console.warn(`Meal photo too big (${(imageUrl.length / 1024).toFixed(0)}KB), stripping to save the dish`);
      imageUrl = undefined;
    }

    // Photo: data-URL is written straight into the per-meal row (Storage option is
    // disabled, see lib/mealPhotos.ts). Calendar snapshots are always
    // stripped (the mirror in diaries below cuts data-URLs) — it was full snapshots
    // that used to bloat the document and crash the sync.
    const cleanMeal: any = {
      id: mealId,
      userId: finalUserId,
      title: String(meal.title || 'Dish'),
      type: meal.type || 'lunch',
      portionGrams: Math.max(1, Math.round(Number(meal.portionGrams) || 100)),
      calories: Math.max(0, Math.round(Number(meal.calories) || 0)),
      protein: Math.max(0, Math.round(Number(meal.protein) || 0)),
      fat: Math.max(0, Math.round(Number(meal.fat) || 0)),
      carbs: Math.max(0, Math.round(Number(meal.carbs) || 0)),
      fiber: Math.max(0, Math.round(Number(meal.fiber) || 0)),
      time: meal.time || new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      date: cleanDate,
    };

    if (imageUrl) {
      cleanMeal.imageUrl = imageUrl;
    }
    if (Array.isArray(meal.ingredients) && meal.ingredients.length > 0) {
      cleanMeal.ingredients = meal.ingredients.filter(Boolean);
    }
    if (meal.aiAnalysis) {
      cleanMeal.aiAnalysis = String(meal.aiAnalysis);
    }
    if (meal.confidence !== undefined && meal.confidence !== null) {
      cleanMeal.confidence = Number(meal.confidence);
    }
    if (meal.notes && typeof meal.notes === 'string') {
      cleanMeal.notes = meal.notes.trim();
    }
    if ((meal as any).createdAt) cleanMeal.createdAt = (meal as any).createdAt;

    // Write — to Supabase only. Without auth RLS will reject the write;
    // guest mode lives locally only.
    // Return write success: the trickle at startup skips already saved ids
    // and does not burn writes on every launch.
    let docSaved = false;
    if (authedUid) {
      const row = mealLogToMealRow(cleanMeal as MealLog);
      const res = await safeFirestoreWrite(async () => {
        const { error } = await supabase.from('meals').upsert(row, { onConflict: 'id' });
        if (error) throw error;
        return true;
      });
      docSaved = res === true;
      if (docSaved) {
        markMealSynced(mealId);
        // Ping friends: new meals are visible instantly via the profile listener
        pingUserMealActivity(finalUserId, mealId);
        // Mirror into diaries.calendar_meals (lean, no data-URL): a friend may
        // read the calendar first — without the mirror they would not see a retried/new dish
        // until the full calendar sync.
        const mirrorOk = await mirrorMealToDiary(finalUserId, cleanMeal);
        if (!mirrorOk) enqueueCloudRetry(mealId);
      }
    } else {
      warnNoAuthOnce('Save meal to Firestore skipped');
    }
    // Invalidate meal caches so the feed sees the new dish at once
    try {
      invalidateMealCaches(finalUserId);
    } catch {}
    // Did not reach the cloud — put into outbox: background finishes with backoff.
    // Previously such a break meant 'local forever' (retry only happened on restart).
    if (!docSaved) enqueueCloudRetry(mealId);
    return docSaved;
  } catch (err) {
    console.warn('Failed to save meal:', err);
    // Outer catch also goes to outbox: otherwise an exception past safeFirestoreWrite
    // meant 'local forever' with no retry.
    // mealId from the try block is out of scope here — take the id from the source dish.
    try {
      const mid = (meal as any)?.id;
      if (mid) enqueueCloudRetry(String(mid));
    } catch {}
    return false;
  }
}

/**
 * Same lean snapshot of one dish in diaries.calendar_meals (read-modify-write).
 * Cut data-URL photos (like stripDataUrlPhotos for imageUrl/photoUrl):
 * the calendar must arrive even with old base64 photos; photos themselves live
 * in the per-meal meals row. Keep https URLs — they are tiny.
 * Returns true if the mirror arrived.
 */
async function mirrorMealToDiary(userId: string, cleanMeal: any): Promise<boolean> {
  try {
    if (!isRealUid(userId) || !cleanMeal?.id) return false;
    const stripped: any = { ...cleanMeal };
    if (typeof stripped.imageUrl === 'string' && stripped.imageUrl.startsWith('data:')) {
      delete stripped.imageUrl;
    }
    if (typeof stripped.photoUrl === 'string' && stripped.photoUrl.startsWith('data:')) {
      delete stripped.photoUrl;
    }
    const dateKey = String(stripped.date || '').slice(0, 10);
    if (!dateKey) return false;
    let dict: Record<string, any> = {};
    try {
      const { data, error } = await supabase
        .from('diaries')
        .select('calendar_meals')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      const cur = (data as any)?.calendar_meals;
      if (cur && typeof cur === 'object' && !Array.isArray(cur)) dict = cur;
    } catch {
      dict = {};
    }
    const curDay = dict[dateKey];
    const arr: any[] = Array.isArray(curDay) ? [...curDay] : Array.isArray(curDay?.meals) ? [...curDay.meals] : [];
    const idx = arr.findIndex((m) => m?.id === stripped.id);
    if (idx >= 0) {
      // A version with a photo is never overwritten by one without a photo.
      const prev = arr[idx];
      if (!stripped.imageUrl && prev?.imageUrl) stripped.imageUrl = prev.imageUrl;
      arr[idx] = stripped;
    } else {
      arr.push(stripped);
    }
    const res = await safeFirestoreWrite(async () => {
      const { error } = await supabase
        .from('diaries')
        .upsert(
          { user_id: userId, calendar_meals: { ...dict, [dateKey]: arr }, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        );
      if (error) throw error;
      return true;
    });
    return res === true;
  } catch {
    return false;
  }
}

// Meal ids already saved to the cloud (localStorage, cap): the trickle at startup
// skips them instead of rewriting everything on every launch.
const SYNCED_MEAL_IDS_KEY = 'nutrimint_synced_meal_ids_v1';
const SYNCED_MEAL_IDS_CAP = 2000;
let __syncedMealIds: Set<string> | null = null;

function getSyncedMealIds(): Set<string> {
  if (__syncedMealIds) return __syncedMealIds;
  __syncedMealIds = new Set<string>();
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(SYNCED_MEAL_IDS_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) arr.forEach((id) => __syncedMealIds!.add(String(id)));
      }
    }
  } catch {}
  return __syncedMealIds;
}

function markMealSynced(mealId: string): void {
  try {
    const set = getSyncedMealIds();
    set.add(String(mealId));
    if (set.size > SYNCED_MEAL_IDS_CAP && typeof window !== 'undefined') {
      const arr = Array.from(set).slice(-SYNCED_MEAL_IDS_CAP);
      __syncedMealIds = new Set(arr);
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem(SYNCED_MEAL_IDS_KEY, JSON.stringify(Array.from(getSyncedMealIds())));
    }
  } catch {}
}

export function isMealSyncedToCloud(mealId: string): boolean {
  try {
    return getSyncedMealIds().has(String(mealId));
  } catch {
    return false;
  }
}

// --- Outbox of undelivered writes: meals must reach the cloud ---
// saveMealToFirestore is called from UI fire-and-forget, and nobody checked the boolean
// result: on a break (network/quota/throttling/background) the dish stayed local
// FOREVER — retry only happened as a trickle on app restart. Outbox fixes it:
// ids of unsent dishes accumulate in localStorage and flush in background with backoff.
// Permanent denial (permission-denied) is not hammered: park and tell honestly in UI.
interface OutboxEntry {
  id: string;
  // Both ops carry timestamps: save then delete of one id before flush — classic
  // 'added then deleted right away'. Apply by timestamp order: del newer → only
  // delete (otherwise the deleted resurrects via a save-flush repeat); save newer → save.
  saveAt?: number;
  delAt?: number;
  userId?: string;
  // Owner at enqueue time: someone else's account does not touch these entries.
  ownerUid?: string;
  attempts: number;
  nextAt: number;
  done?: boolean;
}

const OUTBOX_KEY = 'nutrimint_cloud_outbox_v1';
const OUTBOX_MAX = 500;
// Retry backoff: 15s, 1m, 5m, then hourly. Compressed to deliver
// meals to a friend in ~10 seconds: first attempt almost right after the break.
const OUTBOX_DELAYS = [15_000, 60_000, 5 * 60_000, 60 * 60_000];
let __outboxFlushTimer: ReturnType<typeof setInterval> | null = null;
// 'Flush in progress' flag: nested save/delete must not trigger
// notify/ensureFlusher (otherwise storage churn and toast noise on every failure).
let __inFlush = false;

function getCloudOutbox(): OutboxEntry[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((e) => e && e.id).map((e) => ({
      id: String(e.id),
      saveAt: Number(e.saveAt) || undefined,
      delAt: Number(e.delAt) || undefined,
      userId: e.userId ? String(e.userId) : undefined,
      ownerUid: e.ownerUid ? String(e.ownerUid) : undefined,
      attempts: Number(e.attempts) || 0,
      nextAt: Number(e.nextAt) || 0,
    }));
  } catch {
    return [];
  }
}

function setCloudOutbox(list: OutboxEntry[]): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(list.slice(0, OUTBOX_MAX)));
  } catch {}
}

export function getPendingCloudCount(): number {
  try {
    return getCloudOutbox().length;
  } catch {
    return 0;
  }
}

/**
 * Short human reason why the cloud rejects writes.
 * For toasts/diagnostics instead of silence: denied / quota / no-auth /
 * offline-transport / concrete last-error code.
 */
export function describeCloudBlock(): string | null {
  try {
    // Sync uid cache (session is pulled by the first currentUid): while cache is empty —
    // honestly 'no-auth', the next tick will clarify.
    if (!resolveOwnerUid()) return 'no-auth';
    if (isFirestoreQuotaExhausted()) return 'quota';
    if (isFirestorePermissionDenied()) return 'permission-denied';
    if (isFirestoreTransportBlocked()) return 'transport';
    const last = getLastFirestoreWriteError();
    if (last && Date.now() - last.at < 10 * 60_000 && last.code && last.code !== 'unknown') {
      return last.code;
    }
    return null;
  } catch {
    return null;
  }
}

function notifyCloudStatus(): void {
  try {
    if (typeof window === 'undefined') return;
    const list = getCloudOutbox();
    const kinds = {
      save: list.filter((e) => e.saveAt && !(e.delAt && e.delAt > (e.saveAt as number))).length,
      // Mirrors save: superseded delete (save newer) is not counted as pending.
      del: list.filter((e) => e.delAt && !(e.saveAt && (e.saveAt as number) > (e.delAt as number))).length,
    };
    window.dispatchEvent(
      new CustomEvent('nutrimint:cloud', {
        detail: { state: list.length > 0 ? 'pending' : 'synced', count: list.length, kinds, reason: describeCloudBlock() },
      })
    );
  } catch {}
}

export function enqueueCloudRetry(mealId: string): void {
  try {
    if (!mealId) return;
    const id = String(mealId);
    const now = Date.now();
    const ownerUid = resolveOwnerUid() || undefined;
    const prev = getCloudOutbox().find((e) => e.id === id);
    const list = getCloudOutbox().filter((e) => e.id !== id);
    // Do not reset the existing entry (backoff lives), but update the save stamp
    // and stamp the owner: otherwise a flusher retry would kill backoff, and someone
    // else's account would drag foreign entries. Keep nextAt (clamp +15s) so an edit
    // during backoff does not cause an immediate retry storm.
    list.unshift({
      id,
      saveAt: now,
      delAt: prev?.delAt,
      userId: prev?.userId,
      ownerUid: ownerUid || prev?.ownerUid,
      attempts: prev?.attempts || 0,
      nextAt: prev && prev.nextAt > now ? Math.min(prev.nextAt, now + 15_000) : now,
    });
    setCloudOutbox(list);
    if (!__inFlush) {
      ensureOutboxFlusher();
      notifyCloudStatus();
    }
  } catch {}
}

export function enqueueCloudDelete(mealId: string, userId?: string): void {
  try {
    if (!mealId) return;
    const id = String(mealId);
    const now = Date.now();
    const ownerUid = resolveOwnerUid() || undefined;
    const prev = getCloudOutbox().find((e) => e.id === id);
    const list = getCloudOutbox().filter((e) => e.id !== id);
    list.unshift({
      id,
      saveAt: prev?.saveAt,
      delAt: now,
      userId: userId ? String(userId) : prev?.userId,
      ownerUid: ownerUid || prev?.ownerUid,
      attempts: prev?.attempts || 0,
      nextAt: prev && prev.nextAt > now ? Math.min(prev.nextAt, now + 15_000) : now,
    });
    setCloudOutbox(list);
    if (!__inFlush) {
      ensureOutboxFlusher();
      notifyCloudStatus();
    }
  } catch {}
}

let __outboxNetHooks = false;

function ensureOutboxFlusher(): void {
  try {
    // Kick on network/focus return: a 15s tick would otherwise leave offline
    // late and silently (flush without changed sends no events).
    if (!__outboxNetHooks && typeof window !== 'undefined') {
      __outboxNetHooks = true;
      let lastKick = 0;
      const kick = () => {
        try {
          if (getPendingCloudCount() === 0) return;
          const now = Date.now();
          if (now - lastKick < 10_000) return;
          lastKick = now;
          flushCloudOutbox().catch(() => {});
        } catch {}
      };
      try {
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
          if (!isTabHidden()) kick();
        });
        window.addEventListener('focus', kick);
        window.addEventListener('online', kick);
      } catch {}
    }
    if (__outboxFlushTimer || typeof window === 'undefined') return;
    // 15s tick (was 60s): undelivered meals must arrive within ~10 seconds,
    // per-entry backoff still saves quota.
    __outboxFlushTimer = setInterval(() => {
      flushCloudOutbox().catch(() => {});
    }, 15_000);
    // One quick attempt soon after start (network may be up)
    setTimeout(() => {
      flushCloudOutbox().catch(() => {});
    }, 5_000);
  } catch {}
}

async function flushCloudOutbox(): Promise<void> {
  try {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    // Without a session writes get rejected anyway — quietly wait for login, burn nothing
    const curUid = (await currentUid()) || resolveOwnerUid();
    if (!curUid) return;
    // Quota: latch now re-probes (see isFirestoreQuotaExhausted) —
    // park only until the re-probe window, then try again.
    if (isFirestoreQuotaExhausted()) return;
    let list = getCloudOutbox();
    if (list.length === 0) return;
    // Permanent RLS denial — hammering is pointless, park and tell honestly in UI
    try {
      if (isFirestorePermissionDenied()) {
        notifyCloudDenied();
        return;
      }
    } catch {}
    const now = Date.now();
    const { getAllStoredMealLogs } = await import('./store');
    const byId = new Map<string, MealLog>();
    try {
      getAllStoredMealLogs().forEach((m: any) => {
        if (m && m.id) byId.set(String(m.id), m as MealLog);
      });
    } catch {}
    let changed = false;
    // At least one dish arrived via retry — after the loop pull up calendar
    // snapshots (retry writes only meals + diaries mirror, while the full snapshot
    // profiles a friend may read first).
    let anySaved = false;
    const backoff = (e: OutboxEntry) => {
      e.attempts += 1;
      e.nextAt = now + OUTBOX_DELAYS[Math.min(e.attempts - 1, OUTBOX_DELAYS.length - 1)];
    };
    // Zombie cap: drop entries older than 7 days — otherwise the queue of stale accounts
    // and eternal denied accumulate to OUTBOX_MAX.
    const OUTBOX_TTL_MS = 7 * 24 * 3600_000;
    const bornAt = (e: OutboxEntry) => Math.min(e.saveAt || now, e.delAt || now);
    __inFlush = true;
    try {
    for (const e of list) {
      if (e.nextAt > now) continue;
      // Foreign owner: previously an eternal quiet continue. Now distinguish:
      // entry without owner or with current user userId — the same person
      // after a login switch: restamp the owner and proceed.
      // someone else's userId — still do not touch.
      if (e.ownerUid && curUid && e.ownerUid !== curUid) {
        if (!e.userId || e.userId === curUid) {
          e.ownerUid = curUid;
          changed = true;
        } else {
          continue;
        }
      }
      if (now - bornAt(e) > OUTBOX_TTL_MS) {
        (e as OutboxEntry).done = true;
        changed = true;
        continue;
      }
      // Timestamp tie (same ms) — delete wins: save-then-delete within one ms
      // means 'deleted right after adding'. Reverse order within the same
      // ms is indistinguishable and vanishingly rare (delete requires local removal first).
      const doSave = !!e.saveAt && !(e.delAt && e.delAt >= (e.saveAt as number));
      const doDel = !!e.delAt;
      // Deletion: local dish already removed, only id needed (+uid to clean the calendar).
      // deleteMealFromFirestore appends tombstone and ping itself on success.
      if (doDel) {
        const ok = await deleteMealFromFirestore(e.id, e.userId);
        if (ok) {
          // Successful delete also clears pending saveAt: otherwise the next pass would
          // resurrect what was just removed.
          e.delAt = undefined;
          e.saveAt = undefined;
          (e as OutboxEntry).done = true;
        } else {
          backoff(e);
        }
        changed = true;
        continue;
      }
      if (doSave && !(e as OutboxEntry).done) {
        const meal = byId.get(e.id);
        if (!meal) {
          e.saveAt = undefined; // dish no longer local — clear the stamp
          if (!e.delAt) (e as OutboxEntry).done = true;
        } else {
          const ok = await saveMealToFirestore(meal);
          if (ok) {
            e.saveAt = undefined;
            if (!e.delAt) (e as OutboxEntry).done = true;
            anySaved = true;
          } else {
            backoff(e);
          }
        }
        changed = true;
      }
      if (!e.saveAt && !e.delAt) (e as OutboxEntry).done = true;
    }
    } finally {
      __inFlush = false;
    }
    list = list.filter((e) => !(e as OutboxEntry).done);
    setCloudOutbox(list);
    if (changed) notifyCloudStatus();
    // Calendar after retry: otherwise the per-meal row flew off, but profiles/diaries summaries —
    // not, and a friend reading the calendar first does not see the retried dish.
    if (anySaved && curUid) {
      try {
        void syncUserCalendarToCloud(curUid);
      } catch {}
    }
    if (list.length === 0 && __outboxFlushTimer) {
      clearInterval(__outboxFlushTimer);
      __outboxFlushTimer = null;
    }
  } catch {}
}

/** Call once at app startup: finish undelivered writes from past sessions. */
export function initCloudOutbox(): void {
  try {
    if (getPendingCloudCount() > 0) {
      ensureOutboxFlusher();
      notifyCloudStatus();
    }
  } catch {}
}

/** Manual retry of undelivered writes (button on the cloud toast). */
export function retryCloudOutboxNow(): void {
  try {
    notifyCloudStatus();
    void flushCloudOutbox();
  } catch {}
}

// Last synced calendar snapshot — so we don't write the same thing to the cloud
// on every snapshot (each write = 2 writes, and we save limits).
const __lastCalendarJson = new Map<string, string>();
// Full calendar sync is heavy (2 writes), hence the 15s window + trailing repeat.
// Was 60s with silent drop: a burst of dishes inside the window lost everything but the first.
const CAL_SYNC_MIN_MS = 15_000;

/**
 * Full cleanup of profiles and diaries calendar snapshots:
 * user deleted all dishes — the cloud must become empty too.
 * (In jsonb we just don't write emptied keys — no deleteField merge semantics
 * needed here, the row is rewritten whole.)
 */
export async function clearUserCalendarSnapshots(userId: string): Promise<void> {
  try {
    if (!isRealUid(userId)) return;
    const sessionUid = resolveOwnerUid() || (await currentUid());
    if (!sessionUid) return; // without session RLS will reject
    await safeFirestoreWrite(async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ calendar_meals: {}, daily_logs: {}, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (error) throw error;
      return true;
    });
    await safeFirestoreWrite(async () => {
      const { error } = await supabase
        .from('diaries')
        .update({ calendar_meals: {}, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (error) throw error;
      return true;
    });
    invalidateMealCaches(userId);
  } catch (e) {
    console.warn('Clear user calendar snapshots error:', e);
  }
}

export async function syncUserCalendarToCloud(userId: string, customCalendarMeals?: Record<string, MealLog[]>): Promise<void> {
  try {
    if (!isRealUid(userId)) return;
    // Same resolveOwnerUid as in deletions: the calendar must live on
    // auth-uid, otherwise RLS rejects the write and the friend sees a stale summary forever.
    const resolved = resolveOwnerUid(userId);
    if (resolved && resolved !== userId) {
      console.warn(`Calendar sync uid mismatch: profile ${userId} != auth ${resolved} — syncing to auth.uid`);
      userId = resolved;
    }
    const { getStoredCalendarMeals, syncAllLocalMealsWithUid, stripDataUrlPhotos } = await import('./store');
    syncAllLocalMealsWithUid(userId);
    // Lean snapshot without base64 photos: a full calendar with data-URLs crashed the write
    // (document limit). Photos live in per-meal meals rows.
    const calendarMeals = stripDataUrlPhotos(customCalendarMeals || getStoredCalendarMeals());

    // Empty calendar (all dishes deleted) must CLEAN the cloud, not return:
    // otherwise snapshots keep ghost dishes, and after expiry
    // tombstones (7d) the deleted resurrects for friends.
    if (!calendarMeals || Object.keys(calendarMeals).length === 0) {
      await clearUserCalendarSnapshots(userId);
      try {
        __lastCalendarJson.delete(userId);
      } catch {}
      return;
    }

    // Skip if content unchanged since last sync
    let json = '';
    try {
      json = JSON.stringify(calendarMeals);
    } catch {}
    if (json && __lastCalendarJson.get(userId) === json) return;

    // Throttling: full calendar sync (2 writes) at most once per 15s.
    // Realtime does not suffer: a single dish is always written at once
    // via saveMealToFirestore (meals row + diaries mirror), calendar is just a summary.
    // Update the snapshot ONLY after a real write (below), otherwise fresh
    // data would be marked 'synced' without ever reaching the cloud.
    // IMPORTANT: do not drop a throttled call, defer one
    // coalesced retry to the end of the window — otherwise the second and following dishes
    // of a burst would miss the snapshots, and the friend would see only the first.
    if (!shouldWrite(`calsync:${userId}`, CAL_SYNC_MIN_MS)) {
      const key = `calsync:${userId}`;
      const wait = getThrottleRemainingMs(key, CAL_SYNC_MIN_MS) + 300;
      scheduleTrailing(key, wait, () => {
        void syncUserCalendarToCloud(userId, customCalendarMeals);
      });
      return;
    }

    // Only with a live session: without auth RLS rejects, and a placeholder-uid
    // guest — even more so.
    const sessionUid = resolveOwnerUid() || (await currentUid());

    // 1. profiles (1 combined write for all dates).
    let uw: boolean | null = false;
    if (sessionUid) {
      uw = await safeFirestoreWrite(async () => {
        const { error } = await supabase.from('profiles').upsert(
          {
            id: userId,
            calendar_meals: calendarMeals,
            daily_logs: calendarMeals,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
        if (error) throw error;
        return true;
      });
    } else {
      warnNoAuthOnce('Calendar cloud sync skipped');
    }

    // 2. diaries
    let dw: boolean | null = false;
    if (sessionUid) {
      dw = await safeFirestoreWrite(async () => {
        const { error } = await supabase.from('diaries').upsert(
          {
            user_id: userId,
            calendar_meals: calendarMeals,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );
        if (error) throw error;
        return true;
      });
    }

    // Mark the snapshot synced only if BOTH writes succeed.
    // safeFirestoreWrite does NOT throw on failure (returns null): partial
    // success with a mark would leave the second row stale forever (same class
    // of bug as in profile dedup). Extra rewrite on retry is 1 write.
    if (uw === true && dw === true) {
      try {
        const done = JSON.stringify(calendarMeals);
        if (done) __lastCalendarJson.set(userId, done);
      } catch {}
    }
    // Fresh data — reset read caches so the feed does not serve stale
    try {
      invalidateMealCaches(userId);
    } catch {}
  } catch (e) {
    console.warn('Sync user calendar error:', e);
  }
}

export function invalidateMealCaches(userId?: string): void {
  try {
    if (userId) {
      cacheDel(`meals:${userId}`);
      cacheDel(`cal:${userId}`);
    } else {
      cacheDel('meals:');
      cacheDel('cal:');
    }
  } catch {}
}

export async function syncAllLocalMealsToFirestore(userId: string): Promise<void> {
  try {
    if (!isRealUid(userId)) return;
    // Fast batch sync of the complete calendar
    await syncUserCalendarToCloud(userId);

    // Also gentle trickle of individual meals to the meals table if quota allows.
    // Skip already saved ids — otherwise every launch rewrites all
    // dishes in a row and burns the writes limit.
    if (isFirestoreQuotaExhausted()) return;
    const { getAllStoredMealLogs } = await import('./store');
    const localMeals = getAllStoredMealLogs();
    if (localMeals && localMeals.length > 0) {
      for (const meal of localMeals) {
        if (isFirestoreQuotaExhausted()) break;
        if (!meal || !meal.id || meal.id.startsWith('m_seed_')) continue;
        if (isMealSyncedToCloud(meal.id)) continue;
        const cleanMeal = {
          ...meal,
          userId: userId, // explicitly use the verified user ID
        };
        await saveMealToFirestore(cleanMeal);
      }
    }
  } catch (err) {
    console.warn('Sync all local meals error:', err);
  }
}

function removeMealFromCalendarDict(dict: any, mealId: string): { dict: any; changed: boolean; removedKeys: string[] } {
  // Value shapes: {date: MealLog[]} or {date: {meals: MealLog[], ...}}
  if (!dict || typeof dict !== 'object' || Array.isArray(dict)) return { dict, changed: false, removedKeys: [] };
  let changed = false;
  const out: Record<string, any> = {};
  const removedKeys: string[] = [];
  for (const [dKey, val] of Object.entries(dict)) {
    if (Array.isArray(val)) {
      const filtered = (val as any[]).filter((m) => m?.id !== mealId);
      if (filtered.length !== val.length) {
        changed = true;
        // Drop an emptied day whole: dead dates otherwise bloat
        // towards limits and crash the whole sync. Already-empty days untouched.
        // (rewrite jsonb whole — a dropped key just disappears,
        // no separate deleteField needed.)
        if (filtered.length === 0) {
          removedKeys.push(dKey);
          continue;
        }
      }
      out[dKey] = filtered;
    } else if (val && typeof val === 'object' && Array.isArray((val as any).meals)) {
      const filtered = (val as any).meals.filter((m: any) => m?.id !== mealId);
      if (filtered.length !== (val as any).meals.length) {
        changed = true;
        if (filtered.length === 0) {
          removedKeys.push(dKey);
          continue;
        }
        out[dKey] = {
          ...(val as any),
          meals: filtered,
          totalCalories: filtered.reduce((s: number, x: any) => s + (Number(x?.calories) || 0), 0),
        };
      } else {
        out[dKey] = val;
      }
    } else {
      out[dKey] = val;
    }
  }
  return { dict: out, changed, removedKeys };
}

/**
 * Removes a dish from profiles and diaries calendar snapshots past
 * syncUserCalendarToCloud throttling. Without it the deleted resurrects for friends.
 */
export async function removeMealFromCalendarSnapshots(userId: string, mealId: string): Promise<void> {
  try {
    if (!isRealUid(userId) || !mealId) return;
    const sessionUid = resolveOwnerUid() || (await currentUid());
    if (!sessionUid) return; // without session RLS will reject — don't spam errors
    await safeFirestoreWrite(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('calendar_meals,daily_logs')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return true;
      const patch: Record<string, any> = {};
      let dirty = false;
      for (const field of ['calendar_meals', 'daily_logs']) {
        const cur = (data as any)?.[field];
        if (cur) {
          const { dict, changed } = removeMealFromCalendarDict(cur, mealId);
          if (changed) {
            patch[field] = dict;
            dirty = true;
          }
        }
      }
      if (dirty) {
        patch.updated_at = new Date().toISOString();
        const { error: e2 } = await supabase.from('profiles').update(patch).eq('id', userId);
        if (e2) throw e2;
      }
      return true;
    });
    await safeFirestoreWrite(async () => {
      const { data, error } = await supabase
        .from('diaries')
        .select('calendar_meals')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return true;
      const cur = (data as any)?.calendar_meals;
      if (cur) {
        const { dict, changed } = removeMealFromCalendarDict(cur, mealId);
        if (changed) {
          const { error: e2 } = await supabase
            .from('diaries')
            .update({ calendar_meals: dict, updated_at: new Date().toISOString() })
            .eq('user_id', userId);
          if (e2) throw e2;
        }
      }
      return true;
    });
    invalidateMealCaches(userId);
  } catch (e) {
    console.warn('Remove meal from calendar snapshots error:', e);
  }
}

export async function deleteMealFromFirestore(mealId: string, userId?: string): Promise<boolean> {
  try {
    if (!mealId) return false;

    // Resolve userId for scrub/ping/tombstone via auth (see resolveOwnerUid):
    // profile uid may lag — otherwise we clean someone else's row while the dish
    // stays for friends. Drop the row itself by id (unconditional delete).
    const ownerUid = resolveOwnerUid(userId);
    if (userId && ownerUid && userId !== ownerUid) {
      console.warn(`Delete uid mismatch: profile ${userId} != auth ${ownerUid} — scrub/ping/tombstone go to auth.uid`);
    }
    // 1. Row deletion (only with a live session)
    let docDeleted = false;
    const sessionUid = resolveOwnerUid() || (await currentUid());
    if (sessionUid) {
      const res = await safeFirestoreWrite(async () => {
        const { error } = await supabase.from('meals').delete().eq('id', mealId);
        if (error) throw error;
        return true;
      });
      docDeleted = res === true;
      // Ping friends so the deletion arrives instantly too
      if (docDeleted && ownerUid) pingUserMealActivity(ownerUid);
    } else {
      warnNoAuthOnce('Delete meal in Firestore skipped');
    }
    // 2. Clean calendar snapshots, otherwise the deleted resurrects for friends from
    // profiles.calendar_meals and diaries (ingest reads them first).
    // Past syncUserCalendarToCloud throttling — deletion must arrive at once.
    if (ownerUid) {
      await removeMealFromCalendarSnapshots(ownerUid, mealId);
    }
    // 3. Tombstone to friends (last_meal_at ping rides the same path):
    // without it there is nothing to deliver deletion with — friend merge only adds.
    // Only if the row was really dropped, otherwise the tombstone would lie.
    if (docDeleted && ownerUid) {
      await pushMealTombstone(ownerUid, mealId);
    }
    // userId unknown — clean all meal caches (few of them, two users)
    try {
      invalidateMealCaches();
    } catch {}
    // Did not arrive — to outbox: background finishes with backoff (same path,
    // including tombstone and ping). Previously a break meant 'not deleted in cloud
    // forever', and the dish hung for the friend forever.
    if (!docDeleted) enqueueCloudDelete(mealId, ownerUid);
    return docDeleted;
  } catch (err) {
    console.warn('Failed to delete meal:', err);
    try {
      enqueueCloudDelete(mealId, resolveOwnerUid(userId));
    } catch {}
    return false;
  }
}

export async function fetchMealsFromFirestore(
  userId: string,
  dateStr?: string,
  opts?: { bypassCache?: boolean }
): Promise<MealLog[]> {
  try {
    if (!isRealUid(userId)) return [];
    if (isFirestoreReadBlocked()) return [];
    // 30s cache: polling and parallel feed calls (fetchMeals + fetchFriendCalendarLogs
    // per friend) otherwise triple the reads. Freshness suffers by at most 30s,
    // realtime events on actual changes still arrive separately anyway.
    // Subscriptions (subscribeToUserMeals) pass bypassCache so the first callback
    // and background polling do not return a stale snapshot.
    const mealsCacheKey = `meals:${userId}:${dateStr ? dateStr.slice(0, 10) : 'all'}`;
    if (!opts?.bypassCache) {
      const mealsCached = cacheGet<MealLog[]>(mealsCacheKey);
      if (mealsCached) return mealsCached;
    }

    const mealMap = new Map<string, MealLog>();

    const ingestMealItem = (m: any, overwrite = false) => {
      if (!m || !m.id) return;
      const prev = mealMap.get(String(m.id));
      // A version with a photo is never overwritten by one without: calendar
      // snapshots are now thin (no base64), while per-meal rows carry photos.
      const keepPhoto = (prev as any)?.imageUrl && !m.imageUrl ? (prev as any).imageUrl : undefined;
      if (!prev || overwrite) {
        const item: MealLog = {
          ...m,
          id: String(m.id),
          userId: m.userId || userId,
          date: m.date ? m.date.slice(0, 10) : getLocalDateString(),
          time: m.time || '12:00',
          calories: Math.max(0, Math.round(Number(m.calories) || 0)),
          protein: Math.max(0, Math.round(Number(m.protein) || 0)),
          fat: Math.max(0, Math.round(Number(m.fat) || 0)),
          carbs: Math.max(0, Math.round(Number(m.carbs) || 0)),
          fiber: Math.max(0, Math.round(Number(m.fiber) || 0)),
          portionGrams: Number(m.portionGrams) || 100,
        };
        if (keepPhoto) (item as any).imageUrl = keepPhoto;
        mealMap.set(item.id, item);
      } else if (m.imageUrl && !(prev as any)?.imageUrl) {
        (prev as any).imageUrl = m.imageUrl;
      }
    };

    const ingestCalendarDict = (dict: any) => {
      if (!dict || typeof dict !== 'object') return;
      Object.entries(dict).forEach(([dKey, list]: [string, any]) => {
        if (Array.isArray(list)) {
          list.forEach((m) => ingestMealItem({ ...m, date: m.date || dKey }));
        } else if (list && typeof list === 'object' && Array.isArray(list.meals)) {
          list.meals.forEach((m: any) => ingestMealItem({ ...m, date: m.date || dKey }));
        }
      });
    };

    // 1. Profile (calendar snapshots alongside the profile, like the original users doc)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('calendar_meals,daily_logs')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        if ((data as any).calendar_meals) ingestCalendarDict((data as any).calendar_meals);
        if ((data as any).daily_logs) ingestCalendarDict((data as any).daily_logs);
      }
    } catch {}

    // 2. Diary
    try {
      const { data, error } = await supabase
        .from('diaries')
        .select('calendar_meals')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      if (data && (data as any).calendar_meals) ingestCalendarDict((data as any).calendar_meals);
    } catch {}

    // 3. Direct query of the meals table — the most complete source
    // (photos included): overwrites the thin calendar versions.
    try {
      const { data, error } = await supabase
        .from('meals')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(2000);
      if (error) throw error;
      (data || []).forEach((row: any) => {
        ingestMealItem({ ...mealRowToMealLog(row), id: String(row?.id || '') }, true);
      });
    } catch (e) {
      console.warn('Supabase direct fetch meals error:', e);
    }

    // 4. We do NOT mix in local storage for foreign uids: otherwise, when testing two
    // accounts in one browser, the friend's feed would show my local meals.
    // The exception — fetchFriendCalendarLogs does this explicitly and only by userId.

    let allMeals = Array.from(mealMap.values());

    // Filter by date if specified
    if (dateStr) {
      const cleanDate = dateStr.slice(0, 10);
      allMeals = allMeals.filter((m) => m.date && m.date.slice(0, 10) === cleanDate);
    }

    // Sort descending by date, then time.
    // Normalize time to HH:MM (like normMealTime in FriendsPage): otherwise
    // a bare localeCompare puts 9:05 after 10:00 and feed order diverges.
    const normT = (t: unknown): string => {
      const s = String(t || '00:00');
      const parts = s.split(':');
      return `${(parts[0] || '00').padStart(2, '0')}:${(parts[1] || '00').slice(0, 2).padStart(2, '0')}`;
    };
    allMeals.sort((a, b) => {
      const dateA = a.date ? a.date.slice(0, 10) : '';
      const dateB = b.date ? b.date.slice(0, 10) : '';
      if (dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }
      return normT(b.time).localeCompare(normT(a.time));
    });

    cacheSet(mealsCacheKey, allMeals, 30_000);
    return allMeals;
  } catch (err) {
    noteReadError(err, 'meals');
    console.warn('Failed to fetch meals:', err);
    return [];
  }
}

export async function fetchFriendCalendarLogs(
  friendUid: string,
  opts?: { bypassCache?: boolean }
): Promise<Record<string, any>> {
  const resultLogs: Record<string, any> = {};
  if (!isRealUid(friendUid)) return resultLogs;
  if (isFirestoreReadBlocked()) return resultLogs;
  // 30s cache — the feed calls this for every friend on every refresh
  const calCacheKey = `cal:${friendUid}`;
  if (!opts?.bypassCache) {
    const calCached = cacheGet<Record<string, any>>(calCacheKey);
    if (calCached) return calCached;
  }

  const ingestMealsList = (dateKey: string, meals: any[]) => {
    if (!Array.isArray(meals) || meals.length === 0) return;
    const cleanDate = dateKey.slice(0, 10);
    if (!resultLogs[cleanDate]) {
      resultLogs[cleanDate] = {
        date: cleanDate,
        totalCalories: 0,
        waterMl: 0,
        meals: [],
      };
    }
    meals.forEach((m) => {
      if (!m || !m.id) return;
      const existingIdx = resultLogs[cleanDate].meals.findIndex((em: any) => em.id === m.id);
      const fMeal = {
        id: String(m.id),
        mealType: m.mealType || m.type || 'lunch',
        title: m.title || (m.items && m.items.length > 0 ? m.items.map((i: any) => i.name).join(', ') : 'Meal'),
        time: m.time || '12:00',
        calories: Math.max(0, Math.round(Number(m.calories) || 0)),
        protein: Math.max(0, Math.round(Number(m.protein) || 0)),
        fat: Math.max(0, Math.round(Number(m.fat) || 0)),
        carbs: Math.max(0, Math.round(Number(m.carbs) || 0)),
        portionGrams: Number(m.portionGrams) || 100,
        remarks: m.remarks || m.notes || undefined,
        imageUrl: m.imageUrl || undefined,
        date: cleanDate,
      };
      if (existingIdx >= 0) {
        // Don't lose the photo: a thin calendar version does not overwrite the photo from the per-meal row
        const prevMeal = resultLogs[cleanDate].meals[existingIdx] as any;
        if (!fMeal.imageUrl && prevMeal?.imageUrl) fMeal.imageUrl = prevMeal.imageUrl;
        resultLogs[cleanDate].meals[existingIdx] = fMeal;
      } else {
        resultLogs[cleanDate].meals.push(fMeal);
      }
    });
    resultLogs[cleanDate].totalCalories = resultLogs[cleanDate].meals.reduce((sum: number, x: any) => sum + (x.calories || 0), 0);
  };

  const ingestCalendarDict = (dict: Record<string, any>) => {
    if (!dict || typeof dict !== 'object') return;
    Object.entries(dict).forEach(([dKey, val]) => {
      if (Array.isArray(val)) {
        ingestMealsList(dKey, val);
      } else if (val && typeof val === 'object' && Array.isArray((val as any).meals)) {
        ingestMealsList(dKey, (val as any).meals);
      }
    });
  };

  // 1. Friend's profile (calendar snapshots)
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('calendar_meals,daily_logs')
      .eq('id', friendUid)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      if ((data as any).calendar_meals) ingestCalendarDict((data as any).calendar_meals);
      if ((data as any).daily_logs) ingestCalendarDict((data as any).daily_logs);
    }
  } catch {}

  // 2. Friend's diary
  try {
    const { data, error } = await supabase
      .from('diaries')
      .select('calendar_meals')
      .eq('user_id', friendUid)
      .maybeSingle();
    if (error) throw error;
    if (data && (data as any).calendar_meals) ingestCalendarDict((data as any).calendar_meals);
  } catch {}

  // 3. fetchMealsFromFirestore(friendUid) by dates
  // (includes a direct query of the meals table — the most complete source with photos)
  try {
    const flatMeals = await fetchMealsFromFirestore(friendUid, undefined, opts?.bypassCache ? { bypassCache: true } : undefined);
    flatMeals.forEach((m) => {
      const d = m.date ? m.date.slice(0, 10) : getLocalDateString();
      ingestMealsList(d, [m]);
    });
  } catch {}

  // 4. Local client fallback if testing on the same browser:
  // we mix in ONLY records whose userId is the friend's; my own meals never end up in someone else's feed.
  if (Object.keys(resultLogs).length === 0 && typeof window !== 'undefined') {
    try {
      const { getStoredCalendarMeals } = await import('./store');
      const localCal = getStoredCalendarMeals();
      Object.entries(localCal).forEach(([dKey, list]) => {
        const matches = list.filter((m) => m.userId === friendUid);
        if (matches.length > 0) {
          ingestMealsList(dKey, matches);
        }
      });
    } catch {}
  }

  cacheSet(calCacheKey, resultLogs, 30_000);
  return resultLogs;
}

export interface MealsSubscriptionOpts {
  // Fallback polling, ms. Default 5 min (quota!). The friends tab passes
  // ~15s: while it is open and visible, a friend's food arrives within 15s
  // even if the browser's realtime transport is dead (proxy/VPN/adblock).
  pollMs?: number;
  // Listen to profiles as a "ping" (see pingUserMealActivity): the friend writes
  // last_meal_at on every meal — a row change wakes a full refetch bypassing the cache.
  // Default true. One row listener = events on changes with zero reads.
  listenUserDoc?: boolean;
  // Polling mode: 'full' — full refetch on every tick (expensive: N reads);
  // 'ping' — a tick reads only profiles.last_meal_at (1 read) and does a full
  // refetch only on change. For the friends tab — only 'ping'.
  pollMode?: 'full' | 'ping';
}

// Last known last_meal_at of the friend (for ping-polling)
const __lastSeenMealAt = new Map<string, string>();

// Seen friend tombstones: diffing against them yields new deletions without extra refetches.
// Kept in memory (not localStorage): after a restart the baseline is seeded from the store.
const __seenTombstones = new Map<string, Set<string>>();

// Seen user meal ids (to detect deletions straight from realtime events
// with no extra read): gone from the result set — so it was deleted.
const __seenMealIds = new Map<string, Set<string>>();

function seedMealIds(userId: string, meals: { id?: unknown }[]): void {
  try {
    __seenMealIds.set(
      userId,
      new Set(meals.map((m) => String((m as any)?.id || '')).filter(Boolean))
    );
  } catch {}
}

/**
 * Diffs the result set against the seen ids: returns the ids that disappeared
 * (deleted by the friend) and updates the seen set. Without a tombstone in the cloud this is
 * the only way to notice a deletion from the meals table.
 */
function takeVanishedMealIds(userId: string, currentIds: string[]): string[] {
  try {
    let known = __seenMealIds.get(userId);
    if (!known) {
      known = new Set<string>();
      __seenMealIds.set(userId, known);
    }
    const cur = new Set(currentIds.map(String).filter(Boolean));
    const vanished = Array.from(known).filter((id) => id && !cur.has(id));
    __seenMealIds.set(userId, cur);
    return vanished;
  } catch {
    return [];
  }
}

function seedTombstones(userId: string, ids: string[] | undefined): void {
  try {
    __seenTombstones.set(userId, new Set((ids || []).map(String).filter(Boolean)));
  } catch {}
}

/** Returns only NEW ids (not seen before) and updates the seen set. */
function takeFreshTombstones(userId: string, ids: string[] | undefined): string[] {
  try {
    let known = __seenTombstones.get(userId);
    if (!known) {
      known = new Set<string>();
      __seenTombstones.set(userId, known);
    }
    const fresh = (ids || []).map(String).filter((id) => id && !known!.has(id));
    fresh.forEach((id) => known!.add(id));
    if (known.size > 200) {
      __seenTombstones.set(userId, new Set(Array.from(known).slice(-200)));
    }
    return fresh;
  } catch {
    return [];
  }
}

/** 1 read: the user's last meal stamp (ping for lightweight polling). */
export async function fetchUserLastMealAt(userId: string): Promise<string | null> {
  try {
    const sig = await fetchUserDocSignal(userId);
    return sig.lastMealAt;
  } catch {
    return null;
  }
}

export interface MealsLiveExtra {
  // ids of meals deleted by the friend (tombstones).
  // Merge MUST CUT them out of dailyLogs, not upsert them.
  deletedIds?: string[];
}

export interface UserMealSignal {
  lastMealAt: string | null;
  deletedIds: string[];
}

/**
 * 1 read: last_meal_at + deletion tombstones.
 * Tombstones are a local store (the Supabase schema has no deletedMealIds
 * column, see pushMealTombstone): the last_meal_at ping wakes a full refetch, while the
 * deletion itself shows up as a missing row + vanished-diff. The callback contract
 * (deletedIds) is kept 1-to-1 with the original.
 */
export async function fetchUserDocSignal(userId: string): Promise<UserMealSignal> {
  const empty: UserMealSignal = { lastMealAt: null, deletedIds: [] };
  try {
    if (!isRealUid(userId) || isFirestoreReadBlocked()) return empty;
    let lastMealAt: string | null = null;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('last_meal_at')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      const v = (data as any)?.last_meal_at;
      if (typeof v === 'string' && v) lastMealAt = v;
    } catch (e) {
      noteReadError(e, 'mealSignal');
    }
    return { lastMealAt, deletedIds: readLocalTombstoneIds(userId) };
  } catch {
    return empty;
  }
}

// Tombstones of deleted meals: live LOCALLY (memory + localStorage, 7-day TTL,
// cap 50) — the 0001_init.sql schema has no deletedMealIds column, and an extra
// alter just for deletions is not justified. Delivery of a deletion to the friend goes via a
// last_meal_at ping (same update, zero extra writes): the friend does a full refetch,
// the deleted row is no longer there, plus vanished-diff in the realtime path.
// The friend picks them up via ping-polling / profile listener / foreground refresh.
export interface MealTombstone {
  id: string;
  at: string;
}

const TOMBSTONE_TTL_MS = 7 * 24 * 3600_000;
const TOMBSTONE_CAP = 50;
const TOMBSTONE_LS_KEY = 'nutrimint_meal_tombstones_v1';

let __tombstoneMem: Record<string, MealTombstone[]> | null = null;

function readTombstoneStore(): Record<string, MealTombstone[]> {
  try {
    if (__tombstoneMem) return __tombstoneMem;
    __tombstoneMem = {};
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(TOMBSTONE_LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          __tombstoneMem = parsed as Record<string, MealTombstone[]>;
        }
      }
    }
    return __tombstoneMem || {};
  } catch {
    return __tombstoneMem || {};
  }
}

function writeTombstoneStore(store: Record<string, MealTombstone[]>): void {
  try {
    __tombstoneMem = store;
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOMBSTONE_LS_KEY, JSON.stringify(store));
    }
  } catch {}
}

function readLocalTombstoneIds(userId: string): string[] {
  try {
    const list = readTombstoneStore()[userId] || [];
    const cutoff = Date.now() - TOMBSTONE_TTL_MS;
    return list
      .filter((t) => {
        if (!t?.id) return false;
        const ts = Date.parse(String(t.at || ''));
        return !Number.isFinite(ts) || ts > cutoff;
      })
      .map((t) => String(t.id));
  } catch {
    return [];
  }
}

export async function pushMealTombstone(userId: string, mealId: string): Promise<void> {
  try {
    if (!isRealUid(userId) || !mealId) {
      console.warn('Tombstone skipped: bad/placeholder uid — the deletion will not reach friends');
      return;
    }
    const owner = resolveOwnerUid() || (await currentUid());
    if (!owner || owner !== userId) {
      console.warn(`Tombstone skipped: auth ${owner || 'none'} != doc ${userId} — RLS will reject it, the deletion will not reach friends`);
      return;
    }
    // Race-free write: unshift into the local store (one writer per device).
    const now = new Date().toISOString();
    const store = readTombstoneStore();
    const cutoff = Date.now() - TOMBSTONE_TTL_MS;
    const next = [{ id: String(mealId), at: now }, ...((store[userId] || []).filter((t) => t?.id !== String(mealId)))]
      .filter((t) => {
        const ts = Date.parse(String(t.at || ''));
        return !Number.isFinite(ts) || ts > cutoff;
      })
      .slice(0, TOMBSTONE_CAP);
    store[userId] = next;
    writeTombstoneStore(store);
    // Ping friends through the same path as the write (it also updates last_meal_at):
    // the friend will do a full refetch and see the deletion as a missing row.
    pingUserMealActivity(userId, String(mealId));
  } catch {}
}

export function subscribeToUserMeals(
  userId: string,
  callback: (meals: MealLog[], calendar?: Record<string, any>, extra?: MealsLiveExtra) => void,
  opts?: MealsSubscriptionOpts
): () => void {
  try {
    if (!isRealUid(userId)) return () => {};
    const pollMs = Math.max(10_000, opts?.pollMs ?? 300_000);
    const listenUserDoc = opts?.listenUserDoc ?? true;

    // Initial load — bypassing the cache so the feed's first frame is fresh
    // rather than a 30-second-old snapshot.
    fetchMealsFromFirestore(userId, undefined, { bypassCache: true }).then((meals) => {
      seedMealIds(userId, meals);
      callback(meals);
    });
    // Baseline stamp + baseline tombstones for ping-polling (1 read, in the background).
    // The baseline matters: otherwise the first tick would "discover" old tombstones as new.
    if (opts?.pollMode === 'ping') {
      fetchUserDocSignal(userId).then((sig) => {
        if (sig.lastMealAt) __lastSeenMealAt.set(userId, sig.lastMealAt);
        else if (!__lastSeenMealAt.has(userId)) __lastSeenMealAt.set(userId, '');
        seedTombstones(userId, sig.deletedIds);
      }).catch(() => {});
    }

    // Full refresh bypassing the cache. The callback also carries tombstones (from the same
    // signal read): the friend's merge MUST CUT them out, otherwise the deletion would not show.
    // Plus the calendar snapshots (profiles/diaries.calendar_meals): the realtime channel
    // only listens to the `meals` table, while the friend may have written to the calendar only —
    // without this the ping refetch would never pick up calendar food.
    const refreshFresh = () => {
      try {
        invalidateMealCaches(userId);
      } catch {}
      const p1 = fetchMealsFromFirestore(userId, undefined, { bypassCache: true });
      const p2 = fetchFriendCalendarLogs(userId, { bypassCache: true }).catch(() => null);
      const p3 = fetchUserDocSignal(userId).catch(() => ({ lastMealAt: null, deletedIds: [] as string[] }));
      Promise.all([p1, p2, p3]).then(([meals, cal, sig]) => {
        const s = sig as UserMealSignal;
        seedTombstones(userId, s.deletedIds);
        seedMealIds(userId, meals);
        callback(meals, (cal as Record<string, any>) || undefined, { deletedIds: s.deletedIds || [] });
      }).catch(() => {});
    };
    // Debounce ping refetches: a burst of changes = one refetch.
    // 500ms window (was 1500ms) to deliver a friend's food within ~10 seconds.
    let pingT: ReturnType<typeof setTimeout> | null = null;
    const schedulePingRefresh = () => {
      if (pingT) clearTimeout(pingT);
      pingT = setTimeout(() => {
        pingT = null;
        refreshFresh();
      }, 500);
    };

    // Realtime: meals table events filtered by owner (instead of onSnapshot).
    // An event carries no full snapshot — we pull fresh data bypassing the cache with a debounce.
    let mealChannel: RealtimeChannel | null = null;
    let mealDeb: ReturnType<typeof setTimeout> | null = null;
    try {
      const scheduleMealsRefresh = () => {
        if (mealDeb) clearTimeout(mealDeb);
        mealDeb = setTimeout(() => {
          mealDeb = null;
          fetchMealsFromFirestore(userId, undefined, { bypassCache: true }).then((meals) => {
            // A fresh query — the most up-to-date source for the meals table:
            // we drop the caches so the next fetch does not return a stale snapshot
            // on top of the realtime data.
            try {
              invalidateMealCaches(userId);
            } catch {}
            // Deletions are visible even without a tombstone: diff against the seen ids.
            // Previously the callback went without extra — the friend's merge only added,
            // and the UI never cleaned up a deletion.
            const vanished = takeVanishedMealIds(
              userId,
              meals.map((m) => String(m.id))
            );
            callback(meals, undefined, vanished.length > 0 ? { deletedIds: vanished } : undefined);
          }).catch(() => {});
        }, 500);
      };
      mealChannel = supabase
        .channel(`meals:${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'meals', filter: `user_id=eq.${userId}` },
          () => scheduleMealsRefresh()
        )
        .subscribe((status, err) => {
          // The realtime transport dropped: the client retries on its own, but so the feed
          // does not hang on stale data we pull fresh data bypassing the cache — only while the
          // transport is not considered dead: otherwise every retry turns
          // into a read storm. Polling covers it beyond that.
          noteSnapshotError(err ?? status, `meals:${userId}`);
          if (!isFirestoreTransportBlocked()) {
            fetchMealsFromFirestore(userId, undefined, { bypassCache: true }).then((meals) => {
              callback(meals);
            }).catch(() => {});
          }
        });
    } catch {}

    // Watching profiles as a "ping": pingUserMealActivity updates last_meal_at
    // on every meal write/deletion — the friend learns instantly, without waiting
    // for the heavy calendar sync.
    let pingChannel: RealtimeChannel | null = null;
    if (listenUserDoc) {
      try {
        let firstPing = true;
        pingChannel = supabase
          .channel(`userping:${userId}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
            (payload: any) => {
              const data = (payload && (payload.new || payload.record)) || {};
              // The first event is the initial state (already loaded above):
              // we only seed its tombstones and remember the stamp.
              if (firstPing) {
                firstPing = false;
                try {
                  if (typeof data?.last_meal_at === 'string' && data.last_meal_at) {
                    __lastSeenMealAt.set(userId, data.last_meal_at);
                  } else if (!__lastSeenMealAt.has(userId)) {
                    __lastSeenMealAt.set(userId, '');
                  }
                } catch {}
                try {
                  seedTombstones(userId, readLocalTombstoneIds(userId));
                } catch {}
                return;
              }
              // Tombstones from the store — instantly, with no extra read:
              // a deletion arrives even before the debounce refetch.
              let hasFreshTombstones = false;
              try {
                const fresh = takeFreshTombstones(userId, readLocalTombstoneIds(userId));
                if (fresh.length > 0) {
                  hasFreshTombstones = true;
                  callback([], undefined, { deletedIds: fresh });
                }
              } catch {}
              // Any profiles write (streak, profile) would wake a full refetch —
              // N friends × expensive reads. Refetch only on a last_meal_at change
              // or fresh tombstones.
              const lastMealAt = typeof data?.last_meal_at === 'string' ? data.last_meal_at : null;
              const seen = __lastSeenMealAt.get(userId);
              if (hasFreshTombstones) {
                if (lastMealAt) __lastSeenMealAt.set(userId, lastMealAt);
                schedulePingRefresh();
              } else if (lastMealAt && lastMealAt !== seen) {
                __lastSeenMealAt.set(userId, lastMealAt);
                schedulePingRefresh();
              }
            }
          )
          .subscribe((status, err) => {
            if (err || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              noteSnapshotError(err ?? status, `userdoc:${userId}`);
            }
          });
      } catch {}
    }

    // Fallback polling: only with a visible tab and a live read quota.
    // 'ping' mode (friends tab): a tick = 1 read of last_meal_at, a full refetch
    // only when the stamp changes. 'full' — a full refetch on every tick.
    const pollInterval = setInterval(() => {
      if (isTabHidden()) return;
      if (isFirestoreReadBlocked()) return;
      if (opts?.pollMode === 'ping') {
        fetchUserDocSignal(userId).then((sig) => {
          // Apply deletions right away from the tombstone diff — without waiting for
          // last_meal_at to change (the ping may have been throttled at the moment of deletion). Same read.
          const fresh = takeFreshTombstones(userId, sig.deletedIds);
          if (fresh.length > 0) {
            callback([], undefined, { deletedIds: fresh });
          }
          const last = sig.lastMealAt;
          const seen = __lastSeenMealAt.get(userId);
          if (!last) return;
          if (seen === undefined || seen === '') {
            __lastSeenMealAt.set(userId, last);
            return;
          }
          if (last !== seen) {
            __lastSeenMealAt.set(userId, last);
            refreshFresh();
          }
        }).catch(() => {});
        return;
      }
      fetchMealsFromFirestore(userId, undefined, { bypassCache: true }).then((meals) => {
        callback(meals);
      }).catch(() => {});
    }, pollMs);

    // Returning to the app (unlock/focus): an instant refresh outside the
    // polling schedule — otherwise stale data lingers after backgrounding until the next tick.
    // Throttled to 10s; the refresh is full (meals + tombstones), returns are rare.
    let lastFg = 0;
    const onForeground = () => {
      try {
        if (isTabHidden() || isFirestoreReadBlocked()) return;
        const now = Date.now();
        if (now - lastFg < 10_000) return;
        lastFg = now;
        refreshFresh();
      } catch {}
    };
    try {
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onForeground);
      if (typeof window !== 'undefined') window.addEventListener('focus', onForeground);
    } catch {}

    return () => {
      if (pingT) clearTimeout(pingT);
      if (mealDeb) clearTimeout(mealDeb);
      try {
        if (mealChannel) void supabase.removeChannel(mealChannel);
        if (pingChannel) void supabase.removeChannel(pingChannel);
      } catch {}
      clearInterval(pollInterval);
      try {
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onForeground);
        if (typeof window !== 'undefined') window.removeEventListener('focus', onForeground);
      } catch {}
    };
  } catch (err) {
    console.warn('Failed to subscribe to meals:', err);
    return () => {};
  }
}

// ==========================================================
// PART 3 (final): friend feed diagnostics, weight, workouts
// (port of lib/firebase.ts: diagnoseFriendFeed + tail 2262-2943).
// What was already ported in part 2 (fetchFriendCalendarLogs,
// fetchUserLastMealAt/fetchUserDocSignal/pushMealTombstone +
// tombstone store, subscribeToUserMeals) is NOT duplicated —
// it is reused (tombstone store, safeFirestoreWrite, cache).
// Supabase mapping: users/{uid} -> profiles (id),
// diaries/{uid} -> diaries (user_id), meals -> meals (user_id),
// reactions -> meal_reactions (meal_id), weight -> weight_logs
// (PK user_id+date), workouts -> workouts (id).
// ==========================================================

export type FeedSourceStatus =
  | 'ok' // the source responds and there is food there
  | 'empty' // responds, but there is no food
  | 'denied' // RLS/permission-denied
  | 'quota' // rate-limit/quota
  | 'offline' // network/transport
  | 'missing-route' // 404 of the backend route (old deploy)
  | 'na' // source disabled (backend removed — everything is on Supabase)
  | 'error'; // everything else

export interface FriendFeedDiag {
  usersDoc: FeedSourceStatus;
  diariesDoc: FeedSourceStatus;
  mealsQuery: FeedSourceStatus;
  mealsCount: number;
  backendDiary: FeedSourceStatus;
  backendMeals: FeedSourceStatus;
  tombstones: number;
  /** Human-readable summary: where the food is and what to fix. */
  summary: string;
}

function classifyFeedError(e: any): FeedSourceStatus {
  const code = String((e as any)?.code || (e as any)?.status || '');
  const msg = String((e as any)?.message || e || '');
  const hay = `${code} ${msg}`;
  if (
    code === '42501' ||
    code.includes('permission-denied') ||
    /permission denied|Missing or insufficient permissions|not allowed|row-level security|RLS|policy|PGRST301|JWT/i.test(
      hay
    )
  ) {
    return 'denied';
  }
  if (
    code === '429' ||
    code.includes('resource-exhausted') ||
    code.includes('quota') ||
    /Quota limit exceeded|RESOURCE_EXHAUSTED|resource-exhausted|rate.?limit|too many requests|exhausted/i.test(hay)
  ) {
    return 'quota';
  }
  if (code.includes('unavailable') || /offline|Failed to fetch|fetch failed|network|Load failed/i.test(hay)) {
    return 'offline';
  }
  return 'error';
}

function countCalendarMeals(dict: any): number {
  try {
    if (!dict || typeof dict !== 'object') return 0;
    return Object.values(dict).reduce((s: number, v: any) => {
      if (Array.isArray(v)) return s + v.length;
      if (v && typeof v === 'object' && Array.isArray(v.meals)) return s + v.meals.length;
      return s;
    }, 0);
  } catch {
    return 0;
  }
}

/**
 * Checks the user's food sources in Supabase (the only storage).
 * Call only on demand (an empty friend card, the diagnostics button).
 */
export async function diagnoseFriendFeed(uid: string): Promise<FriendFeedDiag> {
  const d: FriendFeedDiag = {
    usersDoc: 'error',
    diariesDoc: 'error',
    mealsQuery: 'error',
    mealsCount: 0,
    backendDiary: 'na',
    backendMeals: 'na',
    tombstones: 0,
    summary: '',
  };
  if (!isRealUid(uid)) {
    d.summary = 'No friend uid to check';
    return d;
  }
  // 1. Friend's profile (calendar snapshots; the field is named usersDoc for
  // compatibility with the FriendFeedDiag type).
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('calendar_meals,daily_logs')
      .eq('id', uid)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      d.usersDoc = 'empty';
    } else {
      const r = data as any;
      d.usersDoc = countCalendarMeals(r?.calendar_meals || r?.daily_logs) > 0 ? 'ok' : 'empty';
    }
    // Tombstones live in the part-2 tombstone store (the Supabase schema has no
    // deletedMealIds column) — we read the same store as fetchUserDocSignal.
    d.tombstones = readLocalTombstoneIds(uid).length;
  } catch (e) {
    d.usersDoc = classifyFeedError(e);
  }
  // 2. Friend's diary
  try {
    const { data, error } = await supabase.from('diaries').select('calendar_meals').eq('user_id', uid).maybeSingle();
    if (error) throw error;
    if (!data) {
      d.diariesDoc = 'empty';
    } else {
      d.diariesDoc = countCalendarMeals((data as any)?.calendar_meals) > 0 ? 'ok' : 'empty';
    }
  } catch (e) {
    d.diariesDoc = classifyFeedError(e);
  }
  // 3. The meals table (the most complete source, with photos)
  let mealIds: string[] = [];
  try {
    const { data, error } = await supabase.from('meals').select('id').eq('user_id', uid).limit(5);
    if (error) throw error;
    mealIds = (data || []).map((r: any) => String(r?.id || '')).filter(Boolean);
    d.mealsCount = mealIds.length;
    d.mealsQuery = mealIds.length === 0 ? 'empty' : 'ok';
  } catch (e) {
    d.mealsQuery = classifyFeedError(e);
  }
  // 4. Reactions to the friend's food (a best-effort readability probe of the source;
  // FriendFeedDiag has no separate field for it — it only affects the summary when the
  // table is unavailable, otherwise the picture is the same as in the original).
  let reactionsStatus: FeedSourceStatus | null = null;
  if (mealIds.length > 0) {
    try {
      const { error } = await supabase.from('meal_reactions').select('id').in('meal_id', mealIds).limit(1);
      if (error) throw error;
      reactionsStatus = 'ok';
    } catch (e) {
      reactionsStatus = classifyFeedError(e);
    }
  }
  // Backend removed: everything is Supabase-direct. The fields are left as 'na'
  // for FriendFeedDiag type compatibility.
  const all = [d.usersDoc, d.diariesDoc, d.mealsQuery];
  if (all.includes('ok')) {
    d.summary = 'Friend food IS in the cloud — the issue is on this device (cache/login). Refresh the feed.';
  } else if (all.every((s) => s === 'empty')) {
    d.summary =
      'Friend has not saved anything to the cloud yet: all sources are empty. Ask them to add a meal and wait for \"All meals in the cloud\".';
  } else if (all.includes('denied') || reactionsStatus === 'denied') {
    d.summary =
      'Access denied: check the RLS policies in the Supabase Dashboard (see supabase/migrations/0001_init.sql) and log in again.';
  } else if (all.includes('quota') || reactionsStatus === 'quota') {
    d.summary = 'Supabase limit reached: the feed will come back after the limit resets. Cache only for now.';
  } else {
    d.summary = 'No connection to the cloud: check your internet/VPN/adblock.';
  }
  return d;
}

export interface FirestoreWeightEntry {
  id: string;
  userId: string;
  date: string;
  weight: number;
  updatedAt: string;
}

export async function saveWeightLogToFirestore(entry: { userId: string; date: string; weight: number }): Promise<void> {
  try {
    if (!isRealUid(entry.userId)) return;
    const cleanDate = String(entry.date || '').slice(0, 10);
    if (!cleanDate) return;
    const weight = Number(entry.weight);
    if (!Number.isFinite(weight)) return;
    await safeFirestoreWrite(async () => {
      const now = new Date().toISOString();
      const { error } = await supabase.from('weight_logs').upsert(
        { user_id: entry.userId, date: cleanDate, weight, updated_at: now },
        { onConflict: 'user_id,date' }
      );
      if (error) throw error;

      // Mirror current_weight into the profile (like the merge in the original users doc).
      // update, not upsert: a non-existent row silently yields 0 rows instead of a
      // stub profile with an empty name that would later pass itself off as a friend.
      const { error: e2 } = await supabase
        .from('profiles')
        .update({ current_weight: weight, updated_at: now })
        .eq('id', entry.userId);
      if (e2) throw e2;
      return true;
    });
  } catch (err) {
    console.warn('Failed to save weight log to Firestore:', err);
  }
}

export async function deleteWeightLogFromFirestore(userId: string, dateStr: string): Promise<void> {
  try {
    if (!isRealUid(userId)) return;
    await safeFirestoreWrite(async () => {
      const { error } = await supabase
        .from('weight_logs')
        .delete()
        .eq('user_id', userId)
        .eq('date', String(dateStr || '').slice(0, 10));
      if (error) throw error;
      return true;
    });
  } catch (err) {
    console.warn('Failed to delete weight log from Firestore:', err);
  }
}

export async function fetchWeightLogsFromFirestore(
  userId: string
): Promise<{ userId: string; date: string; weight: number }[]> {
  try {
    if (!isRealUid(userId)) return [];
    const { data, error } = await supabase
      .from('weight_logs')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true });
    if (error) throw error;
    const logs: { userId: string; date: string; weight: number }[] = [];
    (data || []).forEach((row: any) => {
      const date = String(row?.date ?? '');
      const weight = Number(row?.weight);
      if (date && Number.isFinite(weight)) {
        logs.push({
          userId: String(row?.user_id ?? row?.userId ?? userId),
          date: date.slice(0, 10),
          weight,
        });
      }
    });
    return logs.sort((a, b) => a.date.localeCompare(b.date));
  } catch (err) {
    noteReadError(err, 'weight');
    console.warn('Failed to fetch weight logs from Firestore:', err);
    return [];
  }
}

// Workout mappers: camelCase (WorkoutLog) ↔ snake_case (workouts).
// Unknown fields of the object go into data (jsonb): the original stored
// the whole document, and a round-trip through fetch must return them.
const WORKOUT_KNOWN_KEYS = new Set([
  'id',
  'userId',
  'user_id',
  'date',
  'title',
  'durationMinutes',
  'duration_minutes',
  'caloriesBurned',
  'calories_burned',
  'time',
  'createdAt',
  'created_at',
  'updatedAt',
  'updated_at',
]);

function workoutToWorkoutRow(workout: any): Record<string, any> {
  const w = workout || {};
  const data: Record<string, any> = {};
  for (const k of Object.keys(w)) {
    if (!WORKOUT_KNOWN_KEYS.has(k)) data[k] = (w as any)[k];
  }
  const row: Record<string, any> = {
    id: String(w.id || ''),
    user_id: String(w.userId ?? w.user_id ?? ''),
    date: String(w.date || '').slice(0, 10),
    title: typeof w.title === 'string' ? w.title : String(w.title ?? 'Workout'),
    duration_minutes: Math.max(0, Math.round(Number(w.durationMinutes ?? w.duration_minutes) || 0)),
    calories_burned: Math.max(0, Math.round(Number(w.caloriesBurned ?? w.calories_burned) || 0)),
    time: w.time || '',
    data,
    updated_at: w.updatedAt || w.updated_at || new Date().toISOString(),
  };
  if (w.createdAt || w.created_at) row.created_at = w.createdAt || w.created_at;
  return row;
}

function workoutRowToWorkout(row: any): any {
  const r = row || {};
  const extra = r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? r.data : {};
  return {
    ...extra,
    id: String(r.id ?? (extra as any).id ?? ''),
    userId: String(r.user_id ?? r.userId ?? (extra as any).userId ?? ''),
    date: String(r.date ?? (extra as any).date ?? '').slice(0, 10),
    title: String(r.title ?? (extra as any).title ?? 'Workout'),
    durationMinutes: Number(r.duration_minutes ?? r.durationMinutes ?? (extra as any).durationMinutes ?? 0),
    caloriesBurned: Number(r.calories_burned ?? r.caloriesBurned ?? (extra as any).caloriesBurned ?? 0),
    time: String(r.time ?? (extra as any).time ?? ''),
  };
}

export async function saveWorkoutToFirestore(workout: any): Promise<void> {
  try {
    if (!workout.id) return;
    const row = workoutToWorkoutRow(workout);
    if (!isRealUid(row.user_id)) return;
    await safeFirestoreWrite(async () => {
      const { error } = await supabase.from('workouts').upsert(row, { onConflict: 'id' });
      if (error) throw error;
      return true;
    });
  } catch (err) {
    console.warn('Failed to save workout to Firestore:', err);
  }
}

export async function deleteWorkoutFromFirestore(workoutId: string): Promise<void> {
  try {
    await safeFirestoreWrite(async () => {
      const { error } = await supabase.from('workouts').delete().eq('id', workoutId);
      if (error) throw error;
      return true;
    });
  } catch (err) {
    console.warn('Failed to delete workout from Firestore:', err);
  }
}

export async function fetchWorkoutsFromFirestore(userId: string, dateStr?: string): Promise<any[]> {
  try {
    if (!isRealUid(userId)) return [];
    const q = dateStr
      ? supabase.from('workouts').select('*').eq('user_id', userId).eq('date', dateStr.slice(0, 10))
      : supabase.from('workouts').select('*').eq('user_id', userId);
    const { data, error } = await q;
    if (error) throw error;
    const list: any[] = [];
    (data || []).forEach((row: any) => {
      list.push(workoutRowToWorkout(row));
    });
    return list;
  } catch (err) {
    noteReadError(err, 'workouts');
    console.warn('Failed to fetch workouts from Firestore:', err);
    return [];
  }
}
