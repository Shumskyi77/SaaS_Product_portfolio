'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UserProfile } from '../types/user';
import { motion, AnimatePresence } from 'motion/react';
import { calculateStreakFromMealLogs, getLocalDateString, parseLocalDateString, stripDataUrlPhotos } from '../lib/store';
import {
  fetchFriendsFromFirestore,
  searchUsersInFirestore,
  addFriendInFirestore,
  deleteFriendFromFirestore,
  fetchFriendCalendarLogs,
  subscribeToUserMeals,
  subscribeToFriendships,
  addMealReactionInFirestore,
  removeMealReactionInFirestore,
  fetchMealReactionsFromFirestore,
  fetchUserDocSignal,
  diagnoseFriendFeed,
  getPendingCloudCount,
  resolveOwnerUid,
  healOwnFriendships,
  FirestoreUser,
  FriendFeedDiag,
  FeedSourceStatus,
} from '../lib/supabaseDb';

// Single reaction key — a clean meal.id.
// Legacy `YYYY-MM-DD_mealId` entries are read as a fallback.
export function getReactionList(
  reactions: Record<string, string[]> | undefined,
  mealId: string,
  dateStr?: string
): string[] {
  if (!reactions) return [];
  const direct = reactions[mealId];
  if (direct && direct.length > 0) return direct;
  if (dateStr) {
    const legacy = reactions[`${dateStr}_${mealId}`];
    if (legacy && legacy.length > 0) return legacy;
  }
  return [];
}

/**
 * Upsert a friend's meal into the day's list. The photo is never lost: the slim calendar
 * version (no base64 — see stripDataUrlPhotos) does not overwrite the photo from the per-meal
 * document or the Storage URL.
 */
export function upsertFriendMeal(list: FriendMeal[], meal: FriendMeal): void {
  const idx = list.findIndex((em) => em.id === meal.id);
  if (idx >= 0) {
    const prev = list[idx];
    list[idx] = { ...meal, imageUrl: meal.imageUrl || prev.imageUrl };
  } else {
    list.push(meal);
  }
}

/**
 * Merge two sets of dailyLogs PER MEAL, not by replacing the whole day.
 * Otherwise a partial fresh (stale cache, failed source) downgrades a rich
 * day to the slim version.
 */
export function mergeFriendDailyLogs(
  prevLogs: Record<string, FriendDailyLog> | undefined,
  freshLogs: Record<string, FriendDailyLog> | undefined
): Record<string, FriendDailyLog> {
  const merged: Record<string, FriendDailyLog> = {};
  const dates = new Set([...Object.keys(prevLogs || {}), ...Object.keys(freshLogs || {})]);
  dates.forEach((d) => {
    const prevDay = (prevLogs || {})[d];
    const freshDay = (freshLogs || {})[d];
    const meals: FriendMeal[] = [...(prevDay?.meals || [])];
    (freshDay?.meals || []).forEach((m) => upsertFriendMeal(meals, m));
    meals.sort((a, b) => normMealTime(b.time).localeCompare(normMealTime(a.time)));
    // waterMl: a slim calendar fresh always carries 0 — `??` keeps it
    // and kills prev. Treat 0 as "no data" rather than a value.
    const freshWater = freshDay?.waterMl;
    merged[d] = {
      date: d,
      meals,
      totalCalories: meals.reduce((s, x) => s + (x.calories || 0), 0),
      waterMl: freshWater ? freshWater : (prevDay?.waterMl ?? 0),
    };
  });
  return merged;
}

/**
 * Stripping deleted meals (tombstones from users/{uid}.deletedMealIds).
 * Merge only adds — without this there is no way to show a friend's deletion:
 * neither snapshots, nor polling, nor a full load erase anything on their own.
 */
export function stripTombstonedMeals(
  logs: Record<string, FriendDailyLog> | undefined,
  ids: string[] | undefined
): Record<string, FriendDailyLog> {
  if (!ids || ids.length === 0 || !logs) return logs || {};
  const gone = new Set(ids.map(String));
  const out: Record<string, FriendDailyLog> = {};
  Object.entries(logs).forEach(([d, day]) => {
    const meals = (day?.meals || []).filter((m) => !gone.has(String(m.id)));
    out[d] = {
      date: day?.date || d,
      meals,
      totalCalories: meals.reduce((s, x) => s + (x.calories || 0), 0),
      waterMl: day?.waterMl ?? 0,
    };
  });
  return out;
}

/** Normalize time to HH:MM: otherwise localeCompare sorts 9:05 after 10:00. */
export function normMealTime(t: unknown): string {
  const s = String(t || '12:00');
  const parts = s.split(':');
  const h = (parts[0] || '12').padStart(2, '0');
  const m = (parts[1] || '00').slice(0, 2).padStart(2, '0');
  return `${h}:${m}`;
}
import {
  Users,
  UserPlus,
  Search,
  Flame,
  Sparkles,
  Check,
  ChevronRight,
  ChevronLeft,
  Copy,
  Coffee,
  Sun,
  Moon,
  Cookie,
  Utensils,
  Award,
  Calendar,
  MessageCircle,
  TrendingUp,
  X,
  Scale,
  Trash2,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from 'recharts';

export interface FriendMeal {
  id: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  title: string;
  time: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  portionGrams?: number;
  remarks?: string;
  imageUrl?: string;
  date?: string;
}

export interface FriendDailyLog {
  date: string; // YYYY-MM-DD
  meals: FriendMeal[];
  weight?: number;
  totalCalories: number;
  waterMl: number;
}

export interface RealFriend {
  id: string;
  name: string;
  avatar: string;
  tag: string; // e.g. @vitta or NM-1234
  goal: string; // e.g. Lose weight
  targetCalories: number;
  startWeight: number;
  currentWeight: number;
  targetWeight: number;
  streakDays: number;
  addedAt: string;
  dailyLogs: Record<string, FriendDailyLog>; // date -> FriendDailyLog
  reactions: Record<string, string[]>; // mealId or date -> reaction keys
}

export interface FriendFeed {
  logs: Record<string, FriendDailyLog>;
  mealIds: string[];
  mealDateById: Record<string, string>;
  tombstones: string[];
}

/**
 * SINGLE friend-feed loader (one fan-out instead of three duplicated places).
 * fetchFriendCalendarLogs already includes flat meals from all sources, so
 * there is no separate parallel fetchMeals (it doubled reads and caused races).
 * Returns a FULL day snapshot (full-replace at the caller): tombstones are already
 * stripped and the totals are recalculated.
 */
export async function loadFriendFeed(uid: string): Promise<FriendFeed> {
  const [calendarLogs, sig] = await Promise.all([
    fetchFriendCalendarLogs(uid, { bypassCache: true }),
    fetchUserDocSignal(uid).catch(() => ({ lastMealAt: null, deletedIds: [] as string[] })),
  ]);
  const logs: Record<string, FriendDailyLog> = { ...(calendarLogs as Record<string, FriendDailyLog>) };
  Object.values(logs).forEach((dLog) => {
    dLog.totalCalories = (dLog.meals || []).reduce((sum, item) => sum + (item.calories || 0), 0);
  });
  const tombstones = ((sig as any)?.deletedIds || []).map(String);
  const stripped = stripTombstonedMeals(logs, tombstones);
  const mealIds: string[] = [];
  const mealDateById: Record<string, string> = {};
  Object.entries(stripped).forEach(([d, day]) => {
    (day?.meals || []).forEach((m) => {
      if (m?.id) {
        mealIds.push(String(m.id));
        mealDateById[String(m.id)] = d;
      }
    });
  });
  return { logs: stripped, mealIds, mealDateById, tombstones };
}

/** Days with meals (for the streak — empty days after strip do not inflate it). */
export function feedMealDates(logs: Record<string, FriendDailyLog> | undefined): string[] {
  if (!logs) return [];
  return Object.keys(logs).filter((d) => (logs[d]?.meals?.length || 0) > 0);
}

const PRESET_REACTIONS = [
  { key: 'fire', emoji: '🔥', label: 'On fire!', color: 'text-amber-500 bg-amber-50 border-amber-200' },
  { key: 'muscle', emoji: '💪', label: 'Strong!', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { key: 'salad', emoji: '🥗', label: 'Clean eats!', color: 'text-green-600 bg-green-50 border-green-200' },
  { key: 'heart', emoji: '❤️', label: 'Super!', color: 'text-rose-500 bg-rose-50 border-rose-200' },
  { key: 'trophy', emoji: '🏆', label: 'Hero!', color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
];

const MEAL_TYPE_CONFIG = {
  breakfast: { label: 'Breakfast', icon: Coffee, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  lunch: { label: 'Lunch', icon: Sun, color: 'text-orange-600 bg-orange-50 border-orange-200' },
  dinner: { label: 'Dinner', icon: Moon, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
  snack: { label: 'Snack', icon: Cookie, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
};

const STORAGE_KEY_FRIENDS = 'nutrimint_real_friends_v3';

// Throttling of friends-cache writes (per uid) — otherwise realtime updates write
// megabytes to localStorage for every meal and hit the quota.
const __friendsCacheSavedAt = new Map<string, number>();
// Trailing flush of missed cache burst writes (see the effect below).
const __friendsCacheTrailing = new Map<string, ReturnType<typeof setTimeout>>();
// The full date history is kept in the cache; the limit is only an emergency guard against a quota loop
const FRIENDS_CACHE_MAX_BYTES = 4_000_000;

interface FriendsPageProps {
  userProfile?: UserProfile;
}

export const FriendsPage: React.FC<FriendsPageProps> = ({ userProfile }) => {
  const userTagId = userProfile?.friendCode || (userProfile?.uid ? `NM-${userProfile.uid.slice(0, 6).toUpperCase()}` : '#NUTRI-8492');
  const todayLocalDate = getLocalDateString();
  // Yesterday — for the quick day-picker buttons in the friend card
  const yesterdayLocalDate = (() => {
    const d = parseLocalDateString(todayLocalDate);
    d.setDate(d.getDate() - 1);
    return getLocalDateString(d);
  })();

  const [friendsList, setFriendsList] = useState<RealFriend[]>(() => {
    // Per-uid cache only — and only once the uid is known. On the first render
    // the uid is still undefined (the profile loads asynchronously): reading the global key
    // showed SOMEONE ELSE'S friends when switching accounts in the same browser.
    // Without a uid we start empty; the effect below pulls in our cache, then the cloud.
    if (typeof window !== 'undefined' && userProfile?.uid) {
      const saved = localStorage.getItem(`nutrimint_real_friends_${userProfile.uid}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            return parsed.filter((f) => f.id && f.id !== userProfile?.uid);
          }
        } catch {
          // fallback
        }
      }
    }
    return [];
  });

  // Own per-uid cache — an instant first frame once the uid appears.
  // Fill only an empty list: never overwrite live data.
  useEffect(() => {
    const uid = userProfile?.uid;
    if (!uid || typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(`nutrimint_real_friends_${uid}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setFriendsList((prev) => (prev.length === 0 ? parsed.filter((f) => f.id && f.id !== uid) : prev));
        }
      }
    } catch {}
  }, [userProfile?.uid]);

  const [searchQuery, setSearchQuery] = useState('');
  const [isAddFriendModalOpen, setIsAddFriendModalOpen] = useState(false);
  const [newFriendInput, setNewFriendInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  // Feed source diagnostics: friendId -> diagnoseFriendFeed result.
  // Show WHY it is empty instead of a silent emptiness.
  const [feedDiag, setFeedDiag] = useState<Record<string, FriendFeedDiag>>({});
  const [feedDiagLoading, setFeedDiagLoading] = useState<Record<string, boolean>>({});
  // Self-diagnostics of uploads (are my meals in the cloud?) + a visible panel.
  const [ownDiag, setOwnDiag] = useState<(FriendFeedDiag & { pending: number }) | null>(null);
  const [isOwnDiagLoading, setIsOwnDiagLoading] = useState(false);
  const [isOwnDiagOpen, setIsOwnDiagOpen] = useState(false);

  // Friend Detail View State
  const [selectedFriend, setSelectedFriend] = useState<RealFriend | null>(null);
  const [friendModalTab, setFriendModalTab] = useState<'calendar' | 'progress'>('calendar');
  const [selectedFriendDate, setSelectedFriendDate] = useState<string>(todayLocalDate);
  const [friendViewYear, setFriendViewYear] = useState<number>(() => new Date().getFullYear());
  const [friendViewMonth, setFriendViewMonth] = useState<number>(() => new Date().getMonth());
  const [isFriendCalendarExpanded, setIsFriendCalendarExpanded] = useState<boolean>(true);
  const [expandedPhoto, setExpandedPhoto] = useState<{
    url: string;
    title: string;
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
    time: string;
    portionGrams?: number;
    remarks?: string;
  } | null>(null);

  // Helper to get friend daily log for chosen date
  const getFriendLogForDate = (friend: RealFriend, dateKey: string): FriendDailyLog => {
    if (friend.dailyLogs && friend.dailyLogs[dateKey]) {
      return friend.dailyLogs[dateKey];
    }
    return {
      date: dateKey,
      waterMl: 0,
      totalCalories: 0,
      meals: [],
    };
  };

  // Save to local storage for quick offline / startup access.
  // A diet against the quota loop: at most once every 5s, stripping
  // base64 photos first (the full date history is kept, photos come from the cloud),
  // and when the payload is >4MB we skip the write with a warn instead of endless quota errors.
  // The trailing flush catches up missed bursts (otherwise the newest meals
  // never made it into the cache and a restart rolled the feed back).
  // Trailing writes through a REF to the latest list: a friendsList closure
  // from the render where the throttle fired is stale and rolled the feed back on restart.
  const friendsListRef = useRef<RealFriend[]>([]);
  friendsListRef.current = friendsList;
  useEffect(() => {
    if (typeof window !== 'undefined' && userProfile?.uid) {
      const uid = userProfile.uid;
      const now = Date.now();
      if (now - (__friendsCacheSavedAt.get(uid) || 0) < 5000) {
        const prevT = __friendsCacheTrailing.get(uid);
        if (prevT) clearTimeout(prevT);
        __friendsCacheTrailing.set(
          uid,
          setTimeout(() => {
            __friendsCacheTrailing.delete(uid);
            __friendsCacheSavedAt.set(uid, Date.now());
            try {
              const light = stripDataUrlPhotos(friendsListRef.current.filter((f) => f.id !== uid));
              const json = JSON.stringify(light);
              if (json.length <= FRIENDS_CACHE_MAX_BYTES) {
                localStorage.setItem(`nutrimint_real_friends_${uid}`, json);
              }
            } catch {}
          }, 1500)
        );
        return;
      }
      __friendsCacheSavedAt.set(uid, now);
      const storageKey = `nutrimint_real_friends_${uid}`;
      try {
        const light = stripDataUrlPhotos(friendsList.filter((f) => f.id !== uid));
        const json = JSON.stringify(light);
        if (json.length > FRIENDS_CACHE_MAX_BYTES) {
          console.warn(
            `Friends cache too big (${(json.length / 1048576).toFixed(1)}MB), skipping local save`
          );
          return;
        }
        localStorage.setItem(storageKey, json);
      } catch {
        // Quota/private mode — nothing is cached, the feed lives off the cloud
      }
    }
  }, [friendsList, userProfile?.uid]);

  // Core function to pull and sync all friends and their meals
  const loadFriendsAndMeals = useCallback(async (currentUid: string, showToastOnSuccess = false) => {
    try {
      setIsRefreshing(true);
      const fUsers = await fetchFriendsFromFirestore(
        currentUid,
        showToastOnSuccess ? { force: true } : undefined
      );
      if (!fUsers || fUsers.length === 0) {
        // Distinguish "no friends" from "the read failed": on error we do NOT wipe the list,
        // otherwise a transient failure erases the UI and the localStorage cache.
        try {
          const { getLastFriendsFetchError, isFirestorePermissionDenied, isFirestoreTransportBlocked, isFirestoreReadBlocked } =
            await import('../lib/supabaseDb');
          if (
            getLastFriendsFetchError() ||
            isFirestorePermissionDenied() ||
            isFirestoreTransportBlocked() ||
            (typeof isFirestoreReadBlocked === 'function' && isFirestoreReadBlocked())
          ) {
            if (isFirestorePermissionDenied()) {
              showToast('⛔ Database access blocked (permission-denied): check the RLS policies in the Supabase Dashboard');
            } else if (isFirestoreTransportBlocked()) {
              showToast('📡 The browser blocks the database connection (VPN/adblock/extensions) — tap Refresh later');
            } else {
              showToast('⚠️ Could not load friends. Tap Refresh.');
            }
            return;
          }
        } catch {}
        // Auto-loads NEVER wipe the list: an empty response without an error may
        // be a stale error TTL or a race — the truth shows up on a manual
        // "Refresh". Wipe only on an explicit user request.
        if (!showToastOnSuccess) return;
        // Clear the stale cache, otherwise deleted friends stay on screen
        setFriendsList([]);
        if (showToastOnSuccess) {
          showToast('The friends list is empty. Add friends by their ID or code!');
        }
        return;
      }

      const userFriendsOnly = fUsers.filter((fu) => fu.uid && fu.uid !== currentUid);
      // The same wipe guard as above: auto-loads do not wipe, only manual ones.
      if (userFriendsOnly.length === 0) {
        if (!showToastOnSuccess) return;
        setFriendsList([]);
        return;
      }

      // Fetch meals and calendar diaries for all friends in parallel —
      // with the single loadFriendFeed loader (a full snapshot per friend).
      const friendsWithLogs: RealFriend[] = await Promise.all(
        userFriendsOnly.map(async (fu) => {
          const feed = await loadFriendFeed(fu.uid);
          let logsByDate = feed.logs;

          // ghost-uid self-healing: the feed is empty everywhere, but the friend has an NM code —
          // look up the real uid by the code. If another uid with food is found, we take
          // its feed and fix the friendship. One-shot per session (to save quota).
          // ghost symptom: old food (under the ghost uid) is visible, new food never is.
          if (feedMealDates(logsByDate).length === 0 && !healTriedRef.current.has(fu.uid)) {
            healTriedRef.current.add(fu.uid);
            try {
              const code = String((fu as any).tag || fu.friendCode || '').replace(/^@/, '').trim();
              if (/^NM-[A-Za-z0-9]{4,}$/i.test(code)) {
                const found = await searchUsersInFirestore(code, currentUid);
                const real = (found || []).find(
                  (u: any) => u?.uid && u.uid !== fu.uid && u.uid !== currentUid
                );
                if (real?.uid) {
                  const realFeed = await loadFriendFeed(String(real.uid));
                  if (feedMealDates(realFeed.logs).length > 0) {
                    logsByDate = mergeFriendDailyLogs(logsByDate, realFeed.logs);
                    realFeed.mealIds.forEach((id) => {
                      if (!feed.mealIds.includes(id)) feed.mealIds.push(id);
                    });
                    Object.assign(feed.mealDateById, realFeed.mealDateById);
                    void healOwnFriendships(fu.uid, String(real.uid)).then((n) => {
                      if (n > 0) showToast(`🔗 Fixed the link with ${fu.name || 'your friend'}: their meals are visible now`);
                    });
                  }
                }
              }
            } catch {}
          }

          // The streak counts only days WITH meals: empty days (after strip)
          // would otherwise inflate the streak.
          const computedStreak = calculateStreakFromMealLogs(feedMealDates(logsByDate));

          // Fetch reactions for this friend's meals.
          // Request both clean ids and legacy `date_id` keys, normalize everything to a clean meal.id
          const mealIds = feed.mealIds;
          const mealDateById = feed.mealDateById;
          let friendReactions: Record<string, string[]> = {};
          if (mealIds.length > 0) {
            try {
              const rawReactions = await fetchMealReactionsFromFirestore(mealIds, mealDateById);
              const normalized: Record<string, string[]> = {};
              const canonicalBySuffix = new Map<string, string>();
              mealIds.forEach((id) => {
                const sid = String(id);
                canonicalBySuffix.set(sid, sid);
              });
              Object.entries(rawReactions || {}).forEach(([k, v]) => {
                const key = String(k);
                let canonical = canonicalBySuffix.get(key);
                if (!canonical) {
                  const m = key.match(/^\d{4}-\d{2}-\d{2}_(.+)$/);
                  if (m && canonicalBySuffix.has(m[1])) {
                    canonical = m[1];
                  } else {
                    for (const id of mealIds) {
                      if (key === id || key.endsWith(`_${id}`)) {
                        canonical = String(id);
                        break;
                      }
                    }
                  }
                }
                if (!canonical) canonical = key;
                const arr = Array.isArray(v) ? v : [v].filter(Boolean);
                if (!normalized[canonical]) normalized[canonical] = [];
                arr.forEach((emoji) => {
                  if (emoji && !normalized[canonical].includes(emoji as string)) {
                    normalized[canonical].push(emoji as string);
                  }
                });
              });
              friendReactions = normalized;
            } catch {
              friendReactions = {};
            }
          }

          return {
            id: fu.uid,
            name: fu.name || 'Friend',
            avatar: fu.avatarUrl || fu.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
            tag: fu.friendCode || `@${(fu.name || 'user').toLowerCase().replace(/\s+/g, '_')}`,
            goal: fu.goal || (fu.weeklyGoal ? 'Weight loss' : 'Maintaining weight'),
            targetCalories: Number(fu.targetCalories) || 2000,
            startWeight: Number(fu.startWeight || fu.currentWeight || 70),
            currentWeight: Number(fu.currentWeight || 70),
            targetWeight: Number(fu.targetWeight || 65),
            streakDays: computedStreak || (fu as any).streakDays || 0,
            addedAt: (fu as any).createdAt || new Date().toISOString(),
            dailyLogs: logsByDate,
            reactions: friendReactions || {},
          };
        })
      );

      // We only get here after a successful friendships read (read errors
      // return earlier with the wipe guard). So fresh is the reliable truth:
      // ids missing from it are legitimately deleted friends, so we evict them.
      // An explicit load bypasses the cache (bypassCache) — we REPLACE dailyLogs
      // entirely instead of merging: merging resurrected tombstoned meals from the stale cache.
      // Incremental realtime updates keep being merged by the subscription below.
      const freshIds = new Set(friendsWithLogs.map((f) => f.id));
      setFriendsList((prev) => {
        const prevMap = new Map<string, RealFriend>(prev.map((f) => [f.id, f]));
        friendsWithLogs.forEach((f) => {
          const existing = prevMap.get(f.id);
          prevMap.set(f.id, {
            ...f,
            dailyLogs: f.dailyLogs,
            reactions: {
              ...(existing?.reactions || {}),
              ...(f.reactions || {}),
            },
          });
        });
        prev.forEach((f) => {
          if (f?.id && !freshIds.has(f.id)) prevMap.delete(f.id);
        });
        return Array.from(prevMap.values());
      });

      // If selected friend is open, update selected friend state too.
      // A deleted friend (absent from fresh) — close the card instead of hanging on a ghost.
      // Full-replace: the fresh load is authoritative (see above).
      setSelectedFriend((prev) => {
        if (!prev) return null;
        const fresh = friendsWithLogs.find((f) => f.id === prev.id);
        if (!fresh) return null;
        return {
          ...fresh,
          dailyLogs: fresh.dailyLogs,
          reactions: {
            ...(prev.reactions || {}),
            ...(fresh.reactions || {}),
          },
        };
      });

      if (showToastOnSuccess) {
        showToast('✅ Friends data and diaries updated successfully!');
      }
    } catch (err) {
      console.warn('Failed to load friends and meals:', err);
      if (showToastOnSuccess) {
        let hint = '⚠️ Could not refresh the data. Check your internet connection.';
        try {
          const { isFirestorePermissionDenied, isFirestoreTransportBlocked } = await import('../lib/supabaseDb');
          if (isFirestorePermissionDenied()) {
            hint = '⛔ Database access blocked (permission-denied): check the RLS policies in the Supabase Dashboard';
          } else if (isFirestoreTransportBlocked()) {
            hint = '📡 The browser blocks the database connection (VPN/adblock/extensions) — disable them for this site';
          }
        } catch {}
        showToast(hint);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [todayLocalDate]);

  // Load initial friends
  // Load by effUid (auth.uid): the profile uid may lag after an account
  // switch — friendships and food live under auth.uid, a ghost uid gives an empty feed.
  useEffect(() => {
    if (userProfile && userProfile.uid) {
      const effUid = resolveOwnerUid(userProfile.uid) || userProfile.uid;
      loadFriendsAndMeals(effUid);

      // Realtime subscription to friendship changes
      const unsubscribeFriendships = subscribeToFriendships(effUid, () => {
        const eff = resolveOwnerUid(userProfile.uid) || userProfile.uid;
        loadFriendsAndMeals(eff);
      });

      return () => {
        unsubscribeFriendships();
      };
    }
  }, [userProfile?.uid, loadFriendsAndMeals]);

  // Real-time listener for ALL friends' meals to keep the Feed updated.
  // The key is sorted and stripped of empty ids: otherwise any reordering
  // of the list (optimistic add, merge) would recreate all onSnapshot subscriptions.
  const friendIdsString = friendsList
    .map((f) => f.id)
    .filter(Boolean)
    .sort()
    .join(',');

  // Subscriptions live in a ref map and are updated by DIFF (add/remove), not by tearing down
  // all of them: previously adding 1 friend tore down and brought up all onSnapshot +
  // initial bypassCache fetches on all friends = a read storm.
  // selectedFriend/selectedDate are read through refs — the callback stays stable.
  const subsRef = useRef(new Map<string, () => void>());
  const prevIdsRef = useRef<Set<string>>(new Set());
  const selFriendRef = useRef<RealFriend | null>(null);
  selFriendRef.current = selectedFriend;
  const selDateRef = useRef(selectedFriendDate);
  selDateRef.current = selectedFriendDate;

  const subsUidRef = useRef<string | undefined>(undefined);

  // All subscriptions are torn down only when the tab unmounts.
  useEffect(
    () => () => {
      subsRef.current.forEach((unsub) => {
        try {
          unsub();
        } catch {}
      });
      subsRef.current.clear();
      prevIdsRef.current = new Set();
      subsUidRef.current = undefined;
    },
    []
  );

  useEffect(() => {
    // Account switch without unmounting: foreign subscriptions must die,
    // otherwise an onSnapshot for A's uids keeps writing setFriendsList under B.
    const effUid = userProfile?.uid;
    if (subsUidRef.current !== effUid) {
      subsRef.current.forEach((unsub) => {
        try {
          unsub();
        } catch {}
      });
      subsRef.current.clear();
      prevIdsRef.current = new Set();
      subsUidRef.current = effUid;
    }
    if (!friendIdsString) {
      subsRef.current.forEach((unsub) => {
        try {
          unsub();
        } catch {}
      });
      subsRef.current.clear();
      prevIdsRef.current = new Set();
      return;
    }
    // DIFF instead of tearing all down: unsubscribe gone ids, subscribe new ones,
    // leave live ones alone (recreating them = N teardowns + N initial fetches).
    const nextIds = new Set(friendIdsString.split(',').filter(Boolean));
    const prevIds = prevIdsRef.current;
    prevIds.forEach((oldId) => {
      if (!nextIds.has(oldId)) {
        try {
          subsRef.current.get(oldId)?.();
        } catch {}
        subsRef.current.delete(oldId);
      }
    });
    prevIdsRef.current = nextIds;

    nextIds.forEach((friendId) => {
      if (subsRef.current.has(friendId)) return;
      // pollMs 10s + pollMode 'ping': while the friends tab is open a tick costs
      // 1 read (lastMealAt), a full refetch only on new food. Even with a dead
      // realtime transport, food arrives within ~10s at most; with a live transport
      // changes arrive instantly via snapshots (meals + user-doc ping).
      subsRef.current.set(
        friendId,
        subscribeToUserMeals(friendId, (freshMeals, liveCal, extra) => {
        // extra.deletedIds — tombstones: the friend deleted meals. The merge must
        // STRIP them (below), otherwise the deletion is only visible after a reinstall.
        const tombstoned = extra?.deletedIds && extra.deletedIds.length > 0 ? extra.deletedIds : null;
        if (freshMeals || tombstoned || liveCal) {
          // IMPORTANT: onSnapshot only listens to the `meals` collection, and the friend's
          // calendar entries (diary/calendarMeals) are not there.
          // So we do NOT replace dailyLogs entirely; we merge the fresh meals
          // into the existing logs (upsert by id), otherwise the feed goes empty.
          // liveCal — calendar snapshots from the ping refetch (see refreshFresh):
          // without them the friend's calendar-only food never arrived at all.
          const freshByDate: Record<string, FriendMeal[]> = {};

          (freshMeals || []).forEach((m) => {
            // No date — skip: never dump it into today, it would bloat someone's "today".
            if (!m?.id || !m?.date) return;
            const d = m.date.slice(0, 10);
            if (!freshByDate[d]) freshByDate[d] = [];
            freshByDate[d].push({
              id: m.id,
              mealType: ((m as any).mealType as any) || (m.type as any) || 'lunch',
              title: m.title || (m.items && m.items.length > 0 ? m.items.map((i) => i.name).join(', ') : 'Meal'),
              time: normMealTime(m.time),
              calories: Number(m.calories) || 0,
              protein: Number(m.protein) || 0,
              fat: Number(m.fat) || 0,
              carbs: Number(m.carbs) || 0,
              portionGrams: (m as any).portionGrams || (m.items && (m.items[0] as any)?.weight) || undefined,
              remarks: (m as any).remarks || (m as any).notes || undefined,
              imageUrl: m.imageUrl,
              date: d,
            });
          });

          const mergeLogs = (
            prevLogs: Record<string, FriendDailyLog> | undefined
          ): Record<string, FriendDailyLog> => {
            const merged: Record<string, FriendDailyLog> = { ...(prevLogs || {}) };
            Object.entries(freshByDate).forEach(([d, freshList]) => {
              const prevDay = merged[d];
              const prevMeals = prevDay?.meals || [];
              const prevMap = new Map(prevMeals.map((em) => [em.id, em]));
              freshList.forEach((fm) => {
                // The fresh version from the meals collection usually has a photo, but if it
                // does not, we do not overwrite what is there (from the slim calendar, conversely,
                // no photo comes either, so the guard is two-way via upsert).
                const prevMeal = prevMap.get(fm.id);
                prevMap.set(fm.id, {
                  ...fm,
                  imageUrl: fm.imageUrl || prevMeal?.imageUrl,
                });
              });
              const meals = Array.from(prevMap.values());
              meals.sort((a, b) => normMealTime(b.time).localeCompare(normMealTime(a.time)));
              merged[d] = {
                date: d,
                meals,
                totalCalories: meals.reduce((s, x) => s + (x.calories || 0), 0),
                waterMl: prevDay?.waterMl || 0,
              };
            });
            // Calendar snapshots from the ping refetch — with the same merge helper
            // (upsert by id, the photo is not overwritten).
            if (liveCal && typeof liveCal === 'object') {
              return mergeFriendDailyLogs(merged, liveCal as Record<string, FriendDailyLog>);
            }
            return merged;
          };

          setFriendsList((prev) =>
            prev.map((f) =>
              f.id === friendId
                ? { ...f, dailyLogs: stripTombstonedMeals(mergeLogs(f.dailyLogs), tombstoned || undefined), reactions: f.reactions || {} }
                : f
            )
          );

          setSelectedFriend((prev) => {
            if (prev && prev.id === friendId) {
              return {
                ...prev,
                dailyLogs: stripTombstonedMeals(mergeLogs(prev.dailyLogs), tombstoned || undefined),
                reactions: prev.reactions || {},
              };
            }
            return prev;
          });

          // The card is open on an empty date while fresh data arrived for another one:
          // jump to the fresh one (as on open), otherwise "no entries"
          // with live food. Forward only, only from an empty current date — and only
          // if the current one is "recent": we do not yank a user
          // browsing a deep archive.
          const open = selFriendRef.current;
          const calDates =
            liveCal && typeof liveCal === 'object'
              ? Object.keys(liveCal).filter((d) => ((liveCal as any)[d]?.meals?.length || 0) > 0)
              : [];
          const freshDates = Array.from(
            new Set([
              ...Object.keys(freshByDate).filter((d) => freshByDate[d].length > 0),
              ...calDates,
            ])
          );
          if (open && open.id === friendId && freshDates.length > 0) {
            const curr = selDateRef.current;
            const recentThreshold = getLocalDateString(new Date(Date.now() - 2 * 86400000));
            const currEmpty = !(open.dailyLogs?.[curr]?.meals?.length) && !(freshByDate[curr]?.length);
            const latest = freshDates.sort().reverse()[0];
            if (currEmpty && latest > curr && curr >= recentThreshold) {
              setSelectedFriendDate(latest);
              const [yy, mm] = latest.split('-');
              if (yy && mm) {
                setFriendViewYear(parseInt(yy, 10));
                setFriendViewMonth(parseInt(mm, 10) - 1);
              }
            }
          }
        }
      }, { pollMs: 10_000, pollMode: 'ping' }));
    });
    // Deliberately no cleanup: subscriptions survive list changes
    // (teardown happens in the unmount effect and in the list-clear above).
  }, [friendIdsString, userProfile?.uid]);

  // Account switch: a foreign trailing cache must not be written into a foreign key.
  useEffect(() => {
    __friendsCacheTrailing.forEach((t) => {
      try {
        clearTimeout(t);
      } catch {}
    });
    __friendsCacheTrailing.clear();
  }, [userProfile?.uid]);

  // Dedicated fetch when selectedFriend is opened to ensure full historical dates are populated from Firestore & backend diary.
  // Single loader + full-replace (authoritative fresh data).
  // If the result is empty we run source diagnostics (once per friend),
  // to show WHY instead of "no entries" (rules/quota/backend).
  const diagDoneRef = useRef<Set<string>>(new Set());
  // The ghost-uid heal was already tried (one-shot per session, to save search quota).
  const healTriedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!selectedFriend?.id) return;
    const friendId = selectedFriend.id;

    loadFriendFeed(friendId).then((feed) => {
      const logsByDate = feed.logs;
      const computedStreak = calculateStreakFromMealLogs(feedMealDates(logsByDate));

      // Check if selected date has meals; if not and there are recorded dates, switch to the latest
      const recorded = Object.keys(logsByDate)
        .filter((d) => (logsByDate[d]?.meals?.length || 0) > 0)
        .sort()
        .reverse();

      if (recorded.length > 0) {
        setSelectedFriendDate((currDate) => {
          if ((logsByDate[currDate]?.meals?.length || 0) === 0) {
            const latest = recorded[0];
            const [y, m] = latest.split('-');
            if (y && m) {
              setFriendViewYear(parseInt(y, 10));
              setFriendViewMonth(parseInt(m, 10) - 1);
            }
            return latest;
          }
          return currDate;
        });
      } else if (!diagDoneRef.current.has(friendId)) {
        // Empty everywhere — run source diagnostics once, with the result shown in a banner.
        diagDoneRef.current.add(friendId);
        setFeedDiagLoading((prev) => ({ ...prev, [friendId]: true }));
        diagnoseFriendFeed(friendId)
          .then((dg) => setFeedDiag((prev) => ({ ...prev, [friendId]: dg })))
          .catch(() => {})
          .finally(() => setFeedDiagLoading((prev) => ({ ...prev, [friendId]: false })));
      }

      setSelectedFriend((prev) => {
        if (prev && prev.id === friendId) {
          return {
            ...prev,
            dailyLogs: logsByDate,
            streakDays: computedStreak || prev.streakDays,
          };
        }
        return prev;
      });

      setFriendsList((prev) =>
        prev.map((f) =>
          f.id === friendId
            ? {
                ...f,
                dailyLogs: logsByDate,
                streakDays: computedStreak || f.streakDays,
              }
            : f
        )
      );
    }).catch((err) => {
      console.warn('Failed to load selected friend calendar:', friendId, err);
    });
  }, [selectedFriend?.id, todayLocalDate]);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 2800);
  };

  const handleCopyMyCode = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(userTagId);
      setCopiedId(true);
      showToast(`📋 Your personal ID code ${userTagId} has been copied!`);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };
  const handleCopyMyId = handleCopyMyCode;

  const handleRefreshClick = () => {
    if (userProfile?.uid) {
      loadFriendsAndMeals(resolveOwnerUid(userProfile.uid) || userProfile.uid, true);
    } else {
      showToast('⚠️ Sign in to your account to sync');
    }
  };

  const handleAddFriendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFriendInput.trim() || isSearching) return;

    const inputVal = newFriendInput.trim();
    const cleanInput = inputVal.replace(/^#/, '').replace(/^@/, '').trim();

    if (userProfile?.uid) {
      if (
        cleanInput === userProfile.uid ||
        cleanInput === userProfile.friendCode ||
        (userProfile.email && cleanInput.toLowerCase() === userProfile.email.toLowerCase())
      ) {
        showToast(`❌ You cannot add yourself as a friend!`);
        return;
      }

      setIsSearching(true);
      try {
        // Search by the cleaned input: #/@ prefixes break a direct document lookup
        const searchRes = await searchUsersInFirestore(cleanInput || inputVal, userProfile.uid);
        if (searchRes.length > 0) {
          // An exact match by friendCode/uid comes first: a name search can
          // return N matches, and [0] would add someone else's uid.
          const normWant = (cleanInput || inputVal).replace(/^#/, '').replace(/^@/, '').trim().toLowerCase();
          const exact =
            searchRes.find((u) => (u.friendCode || '').toLowerCase() === normWant) ||
            searchRes.find((u) => (u.uid || '').toLowerCase() === normWant);
          const found = exact || searchRes[0];
          // A combined toast: the ambiguity warning would otherwise be overwritten
          // by the success toast (a single toastMessage + timer).
          const ambiguousNote =
            !exact && searchRes.length > 1 ? ` (${searchRes.length} matches by name — make sure this is the right person)` : '';

          if (found.uid === userProfile.uid) {
            showToast(`❌ You cannot add yourself as a friend!`);
            setIsSearching(false);
            return;
          }

          // Dedupe strictly by uid: the tag can be synthetic (@name / NM-<truncated>),
          // comparing by tag gives false positives and misses
          if (friendsList.some((f) => f.id === found.uid)) {
            showToast(`ℹ️ ${found.name} is already in your friends list!`);
            setIsSearching(false);
            setIsAddFriendModalOpen(false);
            setNewFriendInput('');
            return;
          }

          // 1. Optimistic add immediately to state & localStorage
          const newFriendObj: RealFriend = {
            id: found.uid,
            name: found.name || 'Friend',
            tag: found.friendCode || `@${(found.name || 'user').toLowerCase().replace(/\s+/g, '_')}`,
            avatar:
              found.avatarUrl ||
              found.avatar ||
              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
            goal: found.goal || 'Weight loss',
            targetCalories: Number(found.targetCalories) || 2000,
            startWeight: Number(found.startWeight || found.currentWeight || 70),
            currentWeight: Number(found.currentWeight || 70),
            targetWeight: Number(found.targetWeight || 65),
            streakDays: 0,
            addedAt: new Date().toISOString(),
            dailyLogs: {},
            reactions: {},
          };

          setFriendsList((prev) => [newFriendObj, ...prev.filter((f) => f.id !== found.uid)]);
          setNewFriendInput('');
          setIsAddFriendModalOpen(false);
          showToast(`🎉 ${found.name} added as a friend!${ambiguousNote}`);

          // 2. Load full meals across all days for this friend immediately from calendar & cloud.
          // The calendar already includes flat meals — a second parallel fetchMeals
          // only doubled the reads (see loadFriendsAndMeals).
          fetchFriendCalendarLogs(found.uid, { bypassCache: true }).then((calendarLogs) => {
            const logsByDate: Record<string, FriendDailyLog> = { ...calendarLogs };
            Object.values(logsByDate).forEach((dLog) => {
              dLog.totalCalories = dLog.meals.reduce((sum, item) => sum + (item.calories || 0), 0);
            });

            const mealDates = Object.keys(logsByDate).filter(
              (d) => (logsByDate[d]?.meals?.length || 0) > 0
            );
            const computedStreak = calculateStreakFromMealLogs(mealDates);

            setFriendsList((prev) =>
              prev.map((f) =>
                f.id === found.uid
                  ? {
                      ...f,
                      dailyLogs: mergeFriendDailyLogs(f.dailyLogs, logsByDate),
                      streakDays: computedStreak || f.streakDays,
                    }
                  : f
              )
            );
          }).catch((err) => {
            console.warn('Failed to load new friend calendar:', found.uid, err);
          });

          // 3. Persist friendship in Firestore & backend.
          // The optimistic add above already showed the friend; here we check with the server:
          // on success we quietly pull the server truth (merge-safe),
          // on failure we honestly warn that the friend is only visible locally.
          addFriendInFirestore(userProfile.uid, found.uid).then((ok) => {
            if (ok === false) {
              showToast('⚠️ Friend added locally, but the server did not confirm it. Check your internet.');
            } else {
              loadFriendsAndMeals(resolveOwnerUid(userProfile.uid) || userProfile.uid);
            }
          }).catch((err) => {
            console.warn('Friendship sync error:', err);
            showToast('⚠️ Friend added locally, but the server did not confirm it. Check your internet.');
          });
          return;
        } else {
          showToast(`❌ User not found. Check the tag or name.`);
          return;
        }
      } catch (err) {
        showToast(`❌ Search error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setIsSearching(false);
      }
    } else {
      showToast(`❌ Please sign in to add friends.`);
    }
  };

  const handleDeleteFriend = async (friendId: string, friendName: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setFriendsList((prev) => prev.filter((f) => f.id !== friendId));
    if (selectedFriend?.id === friendId) {
      setSelectedFriend(null);
    }
    if (userProfile?.uid) {
      deleteFriendFromFirestore(userProfile.uid, friendId);
    }
    showToast(`Removed from friends: ${friendName}`);
  };

  const handleToggleReactionForFriend = (friendId: string, mealId: string, reactionKey: string, dateStr?: string) => {
    // mealId — the canonical clean meal id (without the date prefix)
    const legacyKey = dateStr ? `${dateStr}_${mealId}` : null;
    const readList = (reactions: Record<string, string[]> | undefined): string[] =>
      getReactionList(reactions, mealId, dateStr);

    const isCurrentlyActive = (reactions: Record<string, string[]> | undefined) =>
      readList(reactions).includes(reactionKey);

    // Determine whether it was active BEFORE the click (from the current state)
    let wasActive = false;
    const fr = friendsList.find((f) => f.id === friendId);
    if (fr) {
      wasActive = isCurrentlyActive(fr.reactions);
    } else if (selectedFriend && selectedFriend.id === friendId) {
      wasActive = isCurrentlyActive(selectedFriend.reactions);
    }

    if (userProfile?.uid) {
      if (wasActive) {
        removeMealReactionInFirestore(mealId, userProfile.uid, reactionKey).catch(() => {});
        if (legacyKey && legacyKey !== mealId) {
          removeMealReactionInFirestore(legacyKey, userProfile.uid, reactionKey).catch(() => {});
        }
      } else {
        addMealReactionInFirestore(mealId, userProfile.uid, reactionKey).catch(() => {});
      }
    }

    const applyToggle = (reactions: Record<string, string[]> | undefined): Record<string, string[]> => {
      const current = readList(reactions);
      const hasReacted = current.includes(reactionKey);
      const updated = hasReacted ? current.filter((r) => r !== reactionKey) : [...current, reactionKey];
      const next = { ...(reactions || {}) };
      next[mealId] = updated;
      if (legacyKey && legacyKey !== mealId) {
        next[legacyKey] = updated;
      }
      return next;
    };

    setFriendsList((prev) =>
      prev.map((f) => {
        if (f.id !== friendId) return f;
        const updatedReactions = applyToggle(f.reactions);
        const presetObj = PRESET_REACTIONS.find((p) => p.key === reactionKey);
        if (!wasActive && presetObj) {
          showToast(`${presetObj.emoji} You sent a reaction "${presetObj.label}" to ${f.name}!`);
        }
        return { ...f, reactions: updatedReactions };
      })
    );

    // Update selected friend state if open
    if (selectedFriend && selectedFriend.id === friendId) {
      setSelectedFriend((prev) => {
        if (!prev) return null;
        return { ...prev, reactions: applyToggle(prev.reactions) };
      });
    }
  };

  const filteredFriends = friendsList.filter(
    (f) =>
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.tag.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="px-4 pt-2 pb-20 space-y-4 font-sans bg-slate-50/50 min-h-screen">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-[120] bg-slate-900 text-white text-xs font-black px-4 py-3 rounded-full shadow-2xl border border-slate-700 flex items-center space-x-2 backdrop-blur-md"
          >
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 animate-pulse" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Header Card */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-[#0A3D31] text-white p-5 sm:p-6 rounded-[28px] shadow-lg relative overflow-hidden space-y-4">
        {/* Category Pill Badge & Actions */}
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[11px] font-black uppercase tracking-wider">
            <Users className="w-3.5 h-3.5" />
            <span>Friends & Community</span>
          </div>

          <button
            onClick={handleRefreshClick}
            disabled={isRefreshing}
            className="flex items-center space-x-1 text-xs text-emerald-300 hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-xl font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            title="Refresh friends' diaries"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>

        {/* Title and Add Button Row */}
        <div className="flex items-center justify-between gap-3 relative z-10">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Friends</h1>
            <p className="text-xs text-slate-300 mt-1 max-w-xs leading-relaxed">
              Open a friend's card and pick a day in the calendar to see everything they ate.
            </p>
          </div>

          <button
            onClick={() => setIsAddFriendModalOpen(true)}
            className="px-3.5 py-2.5 bg-[#0AB68B] text-white font-extrabold rounded-xl shadow-md hover:bg-[#08a27b] active:scale-95 transition-all flex items-center space-x-1.5 cursor-pointer shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span className="text-xs font-bold">Add</span>
          </button>
        </div>

        {/* Copy Personal ID */}
        <div className="pt-3 border-t border-slate-700/60 flex items-center justify-between text-xs text-slate-300 gap-2">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400 text-[11px]">Your ID:</span>
            <span className="font-mono font-black text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded-lg border border-emerald-800 text-[11px]">
              {userTagId}
            </span>
          </div>
          <button
            onClick={handleCopyMyCode}
            className="flex items-center space-x-1 text-emerald-400 hover:text-emerald-300 font-bold text-[11px] active:scale-95 transition-transform cursor-pointer px-2 py-1 rounded-lg hover:bg-emerald-900/30"
          >
            {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedId ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* FRIENDS LIST */}
      <div className="space-y-3">
          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or tag..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0AB68B] shadow-2xs"
            />
          </div>

          <div className="flex justify-between items-center text-xs font-black text-slate-800 px-1">
            <span>Friends list ({filteredFriends.length})</span>
            {friendsList.length === 0 && (
              <span className="text-slate-400 font-normal">The list is empty</span>
            )}
          </div>

          {friendsList.length === 0 ? (
            <div className="bg-white rounded-[24px] p-8 text-center border border-slate-100 shadow-2xs space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-[#0AB68B] flex items-center justify-center mx-auto">
                <UserPlus className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-extrabold text-slate-900">You have no friends added yet</h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Tap "Add" to enter a friend name or ID and browse their meals day by day.
              </p>
              <button
                onClick={() => setIsAddFriendModalOpen(true)}
                className="px-4 py-2.5 bg-[#0AB68B] text-white text-xs font-extrabold rounded-2xl shadow-sm hover:bg-[#08a27b] transition-colors inline-flex items-center space-x-1.5 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Add friend</span>
              </button>
            </div>
          ) : (
            filteredFriends.map((friend, fIdx) => {
              const todayLog = friend.dailyLogs ? friend.dailyLogs[todayLocalDate] : undefined;
              const hasTodayMeals = (todayLog?.meals?.length || 0) > 0;
              // Show the friend's latest food, not just today's:
              // otherwise yesterday's food looks like "ate nothing".
              const latestDate = hasTodayMeals
                ? todayLocalDate
                : Object.keys(friend.dailyLogs || {})
                    .filter((d) => (friend.dailyLogs[d]?.meals?.length || 0) > 0)
                    .sort()
                    .reverse()[0];
              const displayLog = hasTodayMeals
                ? todayLog
                : latestDate
                  ? friend.dailyLogs[latestDate]
                  : undefined;
              const displayDate = hasTodayMeals ? todayLocalDate : latestDate;
              const isShowingLatest = !hasTodayMeals && !!latestDate;
              const dateLabel = !displayDate
                ? ''
                : displayDate === todayLocalDate
                  ? 'Today'
                  : displayDate === yesterdayLocalDate
                    ? 'Yesterday'
                    : displayDate;
              const consumedCals = displayLog ? displayLog.totalCalories : 0;
              const displayMealsCount = displayLog ? displayLog.meals.length : 0;
              const targetCals = friend.targetCalories || 2000;
              const pct = Math.min(Math.round((consumedCals / targetCals) * 100), 100);

              const translateGoal = (goalStr: string) => {
                const lower = (goalStr || '').toLowerCase();
                if (lower.includes('lose')) return 'Weight loss';
                if (lower.includes('gain') || lower.includes('muscle')) return 'Muscle gain';
                if (lower.includes('maintain')) return 'Maintenance';
                return goalStr;
              };

              return (
                <motion.div
                  key={`friend-card-${friend.id}-${fIdx}`}
                  onClick={() => {
                    setSelectedFriend(friend);
                    const recorded = Object.keys(friend.dailyLogs || {})
                      .filter((d) => (friend.dailyLogs[d]?.meals?.length || 0) > 0)
                      .sort()
                      .reverse();
                    const hasTodayMeals = (friend.dailyLogs?.[todayLocalDate]?.meals?.length || 0) > 0;
                    const initialDate = hasTodayMeals ? todayLocalDate : recorded[0] || todayLocalDate;
                    setSelectedFriendDate(initialDate);
                    const [y, m] = initialDate.split('-');
                    if (y && m) {
                      setFriendViewYear(parseInt(y, 10));
                      setFriendViewMonth(parseInt(m, 10) - 1);
                    }
                  }}
                  whileHover={{ y: -2 }}
                  className="bg-white rounded-[22px] p-3.5 sm:p-4 border border-slate-100 shadow-2xs hover:shadow-md hover:border-[#00C29A]/40 transition-all cursor-pointer space-y-3 group"
                >
                  {/* Top Header Row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-3 overflow-hidden min-w-0">
                      <div className="relative shrink-0">
                        <img
                          src={friend.avatar}
                          alt={friend.name}
                          className="w-11 h-11 rounded-2xl object-cover ring-2 ring-[#00C29A]/20 shadow-2xs"
                          referrerPolicy="no-referrer"
                        />
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white shadow-2xs" />
                      </div>

                      <div className="min-w-0 overflow-hidden">
                        <div className="flex items-center space-x-1.5">
                          <h3 className="text-sm font-black text-slate-900 tracking-tight truncate">
                            {friend.name}
                          </h3>
                          <span className="text-[10px] text-slate-400 font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded-md shrink-0">
                            {friend.tag}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                          Weight: <span className="font-extrabold text-slate-700">{friend.currentWeight} kg</span>
                        </p>
                      </div>
                    </div>

                    {/* Streak & Delete */}
                    <div className="flex items-center space-x-2 shrink-0">
                      <div className="flex flex-col items-end">
                        {friend.streakDays > 0 ? (
                          <span className="inline-flex items-center space-x-1 text-[11px] font-black text-amber-600 bg-amber-50 border border-amber-200/90 px-2.5 py-1 rounded-xl shadow-2xs whitespace-nowrap">
                            <Flame className="w-3.5 h-3.5 fill-amber-500 text-amber-500 animate-pulse" />
                            <span>{friend.streakDays} day streak</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-slate-400 bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-xl whitespace-nowrap">
                            <span>🌱 0 d.</span>
                          </span>
                        )}
                      </div>

                      <button
                        onClick={(e) => handleDeleteFriend(friend.id, friend.name, e)}
                        className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors cursor-pointer rounded-xl hover:bg-rose-50"
                        title="Remove from friends"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Goals & Calorie Targets Row */}
                  <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                    <span className="inline-flex items-center space-x-1 font-bold text-slate-600 bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-xl whitespace-nowrap">
                      <span>🎯 {translateGoal(friend.goal)}</span>
                    </span>
                    <span className="inline-flex items-center space-x-1 font-extrabold text-[#00C29A] bg-emerald-50/80 border border-emerald-200/60 px-2.5 py-1 rounded-xl whitespace-nowrap">
                      <span>⚡ {friend.targetCalories} kcal/day</span>
                    </span>
                  </div>

                  {/* Quick Daily Meal Progress Section */}
                  <div className="bg-slate-50/90 group-hover:bg-[#E6F9F5]/60 rounded-2xl p-3 border border-slate-100 group-hover:border-[#00C29A]/30 transition-all space-y-2">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <div className="flex items-center space-x-2 min-w-0">
                        <div className="w-6 h-6 rounded-lg bg-[#00C29A]/10 text-[#00C29A] flex items-center justify-center shrink-0">
                          <Calendar className="w-3.5 h-3.5" />
                        </div>
                        <div className="truncate">
                          <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">
                            {displayLog
                              ? isShowingLatest
                                ? `Last: ${dateLabel} (${displayMealsCount} meals)`
                                : `Eaten today (${displayMealsCount} meals)`
                              : 'No entries yet'}
                          </span>
                          <span className="font-extrabold text-slate-900 text-xs truncate block">
                            {displayLog && displayMealsCount > 0 ? `${consumedCals} / ${targetCals} kcal` : 'Your friend has not shared any meals yet'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1 text-xs font-bold text-[#00C29A] bg-white group-hover:bg-[#00C29A] group-hover:text-white px-2.5 py-1 rounded-xl shadow-2xs border border-emerald-100/80 transition-all shrink-0 whitespace-nowrap">
                        <span>Diary</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    {/* Calorie Progress Line */}
                    {displayLog && displayMealsCount > 0 && (
                      <div className="space-y-1 pt-0.5">
                        <div className="w-full h-1.5 bg-slate-200/70 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#0AB68B] to-emerald-400 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 px-0.5">
                          <span>{isShowingLatest ? `For ${dateLabel.toLowerCase()}` : 'Daily progress'}</span>
                          <span className="text-[#0AB68B] font-extrabold">{pct}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
      </div>

      {/* FRIEND DETAIL MODAL (Calendar, Diary & Progress View) */}
      <AnimatePresence>
        {selectedFriend && (
          <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 font-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-lg bg-white rounded-[32px] p-5 text-slate-800 space-y-4 shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              {/* Header inside modal */}
              <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-3">
                  <img
                    src={selectedFriend.avatar}
                    alt={selectedFriend.name}
                    className="w-12 h-12 rounded-full object-cover border-2 border-[#0AB68B]"
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <h3 className="text-sm font-black text-slate-900 flex items-center space-x-1.5">
                      <span>{selectedFriend.name}</span>
                      <span className="text-xs text-slate-400 font-normal">{selectedFriend.tag}</span>
                    </h3>
                    <p className="text-xs text-[#0AB68B] font-bold">
                      Goal: {selectedFriend.goal} ({selectedFriend.targetCalories} kcal/day)
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedFriend(null)}
                  className="p-2 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Friend Streak & Consistency Banner */}
              <div className={`flex items-center space-x-2.5 px-3.5 py-2.5 rounded-2xl shadow-2xs border ${
                selectedFriend.streakDays > 0
                  ? 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200/90'
                  : 'bg-slate-50 border-slate-200/80'
              }`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  selectedFriend.streakDays > 0 ? 'bg-amber-500/15 text-amber-600' : 'bg-slate-200/70 text-slate-400'
                }`}>
                  {selectedFriend.streakDays > 0 ? (
                    <Flame className="w-5 h-5 fill-amber-500 text-amber-500 animate-pulse" />
                  ) : (
                    <span className="text-base">🌱</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-black text-slate-900 flex items-center justify-between">
                    <span>
                      {selectedFriend.streakDays > 0
                        ? `Consistency streak: ${selectedFriend.streakDays} days in a row`
                        : 'Activity streak: 0 days'}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-black ${
                      selectedFriend.streakDays > 0
                        ? 'bg-amber-200/70 text-amber-950'
                        : 'bg-slate-200 text-slate-600'
                    }`}>
                      {selectedFriend.streakDays > 0 ? 'Active 🔥' : 'Waiting for entries ⏳'}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium truncate">
                    {selectedFriend.streakDays > 0
                      ? 'Keeps the diet on track and logs the diary consistently!'
                      : 'No entries in the last few days. Send a reaction to motivate your friend!'}
                  </div>
                </div>
              </div>

              {/* Subtabs: Calendar / Progress */}
              <div className="flex bg-slate-100 p-1 rounded-2xl text-xs font-extrabold text-slate-600">
                <button
                  onClick={() => setFriendModalTab('calendar')}
                  className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                    friendModalTab === 'calendar'
                      ? 'bg-white text-slate-900 shadow-2xs font-black'
                      : 'hover:text-slate-900'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5 text-[#0AB68B]" />
                  <span>Calendar & Diary</span>
                </button>

                <button
                  onClick={() => setFriendModalTab('progress')}
                  className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                    friendModalTab === 'progress'
                      ? 'bg-white text-slate-900 shadow-2xs font-black'
                      : 'hover:text-slate-900'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5 text-sky-500" />
                  <span>Progress chart</span>
                </button>
              </div>

              {/* TAB 1: CALENDAR & DIARY OF FRIEND */}
              {friendModalTab === 'calendar' && (() => {
                const friendLog = getFriendLogForDate(selectedFriend, selectedFriendDate);
                const totalCals = friendLog.totalCalories;
                const targetCals = selectedFriend.targetCalories || 2000;
                const calorieDiff = targetCals - totalCals;

                const totalProtein = (friendLog.meals || []).reduce((acc, m) => acc + (m.protein || 0), 0);
                const totalFat = (friendLog.meals || []).reduce((acc, m) => acc + (m.fat || 0), 0);
                const totalCarbs = (friendLog.meals || []).reduce((acc, m) => acc + (m.carbs || 0), 0);

                const targetProtein = Math.round((targetCals * 0.3) / 4);
                const targetFat = Math.round((targetCals * 0.25) / 9);
                const targetCarbs = Math.round((targetCals * 0.45) / 4);

                // parseLocalDateString, not new Date('YYYY-MM-DD'): the latter is
                // UTC midnight and shows the previous day in UTC- time zones.
                const formattedFriendDate = parseLocalDateString(selectedFriendDate).toLocaleDateString('ru-RU', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                });

                // Generate 7 days around selectedFriendDate
                const getFriend7DaysWindow = () => {
                  const selObj = parseLocalDateString(selectedFriendDate);
                  const result = [];
                  for (let i = -3; i <= 3; i++) {
                    const d = new Date(selObj);
                    d.setDate(d.getDate() + i);
                    const dStr = getLocalDateString(d);
                    const dayName = d.toLocaleDateString('ru-RU', { weekday: 'short' });
                    const dayNum = d.getDate();
                    const log = getFriendLogForDate(selectedFriend, dStr);
                    result.push({ dateStr: dStr, dayName, dayNum, cals: log.totalCalories });
                  }
                  return result;
                };
                const friendWeekWindow = getFriend7DaysWindow();

                const recordedDates = Object.keys(selectedFriend.dailyLogs || {})
                  .filter((d) => (selectedFriend.dailyLogs[d]?.meals?.length || 0) > 0)
                  .sort()
                  .reverse();

                const stepFriendDate = (delta: number) => {
                  const d = parseLocalDateString(selectedFriendDate);
                  d.setDate(d.getDate() + delta);
                  setSelectedFriendDate(getLocalDateString(d));
                };

                const monthNames = [
                  'January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'
                ];
                const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

                const handleFriendPrevMonth = () => {
                  if (friendViewMonth === 0) {
                    setFriendViewMonth(11);
                    setFriendViewYear(friendViewYear - 1);
                  } else {
                    setFriendViewMonth(friendViewMonth - 1);
                  }
                };

                const handleFriendNextMonth = () => {
                  if (friendViewMonth === 11) {
                    setFriendViewMonth(0);
                    setFriendViewYear(friendViewYear + 1);
                  } else {
                    setFriendViewMonth(friendViewMonth + 1);
                  }
                };

                // Generate full days grid for friend calendar
                const getFriendMonthDays = () => {
                  const firstDay = new Date(friendViewYear, friendViewMonth, 1);
                  const lastDay = new Date(friendViewYear, friendViewMonth + 1, 0);
                  let startDayOfWeek = firstDay.getDay() - 1;
                  if (startDayOfWeek === -1) startDayOfWeek = 6;
                  const totalDaysInMonth = lastDay.getDate();

                  const days = [];
                  const prevMonthLast = new Date(friendViewYear, friendViewMonth, 0).getDate();
                  for (let i = startDayOfWeek - 1; i >= 0; i--) {
                    const pDay = prevMonthLast - i;
                    const pDate = new Date(friendViewYear, friendViewMonth - 1, pDay, 12);
                    days.push({
                      dayNumber: pDay,
                      dateStr: getLocalDateString(pDate),
                      isCurrentMonth: false,
                    });
                  }

                  for (let d = 1; d <= totalDaysInMonth; d++) {
                    const mStr = String(friendViewMonth + 1).padStart(2, '0');
                    const dStr = String(d).padStart(2, '0');
                    const dateStr = `${friendViewYear}-${mStr}-${dStr}`;
                    days.push({
                      dayNumber: d,
                      dateStr,
                      isCurrentMonth: true,
                    });
                  }

                  const remainingCells = (7 - (days.length % 7)) % 7;
                  for (let i = 1; i <= remainingCells; i++) {
                    const nDate = new Date(friendViewYear, friendViewMonth + 1, i, 12);
                    days.push({
                      dayNumber: i,
                      dateStr: getLocalDateString(nDate),
                      isCurrentMonth: false,
                    });
                  }
                  return days;
                };

                const friendMonthDays = getFriendMonthDays();

                return (
                  <div className="space-y-4">
                    {/* Month Calendar Card (Mirroring main Diary Calendar) with Collapsible / Expandable toggle */}
                    <div className="bg-slate-50/80 rounded-2xl p-3 border border-slate-200/70 space-y-2.5 transition-all">
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => setIsFriendCalendarExpanded(!isFriendCalendarExpanded)}
                          className="flex items-center space-x-1.5 hover:opacity-80 transition cursor-pointer text-left"
                          title={isFriendCalendarExpanded ? "Collapse calendar" : "Expand calendar"}
                        >
                          <div className="w-6 h-6 rounded-lg bg-[#E6F9F5] text-[#0AB68B] flex items-center justify-center">
                            <Calendar className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex items-center space-x-1">
                            <span className="font-extrabold text-xs text-slate-900">
                              Friend's food calendar
                            </span>
                            {isFriendCalendarExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </div>
                        </button>

                        <div className="flex items-center space-x-1">
                          {isFriendCalendarExpanded ? (
                            <>
                              <button
                                onClick={handleFriendPrevMonth}
                                className="p-1 rounded-lg hover:bg-white text-slate-700 hover:text-[#0AB68B] transition-colors shadow-2xs cursor-pointer"
                                title="Previous month"
                              >
                                <ChevronLeft className="w-3.5 h-3.5" />
                              </button>
                              <span className="font-extrabold text-xs text-slate-800 px-1.5">
                                {monthNames[friendViewMonth]} {friendViewYear}
                              </span>
                              <button
                                onClick={handleFriendNextMonth}
                                className="p-1 rounded-lg hover:bg-white text-slate-700 hover:text-[#0AB68B] transition-colors shadow-2xs cursor-pointer"
                                title="Next month"
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setIsFriendCalendarExpanded(true)}
                              className="text-[11px] font-extrabold text-[#0AB68B] hover:underline cursor-pointer flex items-center space-x-1 px-1 py-0.5"
                            >
                              <span>Expand ({monthNames[friendViewMonth]})</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Collapsible Month Grid */}
                      {isFriendCalendarExpanded && (
                        <div className="space-y-2 pt-1 border-t border-slate-200/60">
                          {/* Weekday headers */}
                          <div className="grid grid-cols-7 text-center text-[10px] font-extrabold text-slate-400">
                            {weekDays.map((wd) => (
                              <div key={`friend-wd-${wd}`} className="py-0.5">{wd}</div>
                            ))}
                          </div>

                          {/* Month Days Grid */}
                          <div className="grid grid-cols-7 gap-1 text-center">
                            {friendMonthDays.map((item, idx) => {
                              const isSelected = item.dateStr === selectedFriendDate;
                              const isToday = item.dateStr === todayLocalDate;
                              const dayLog = selectedFriend.dailyLogs?.[item.dateStr];
                              const hasMeals = (dayLog?.meals?.length || 0) > 0;
                              const dayCals = dayLog?.totalCalories || 0;

                              return (
                                <button
                                  key={`f-grid-${item.dateStr}-${idx}`}
                                  onClick={() => setSelectedFriendDate(item.dateStr)}
                                  className={`py-1.5 rounded-xl text-[11px] font-bold transition-all flex flex-col items-center justify-center relative cursor-pointer ${
                                    isSelected
                                      ? 'bg-[#0AB68B] text-white shadow-md shadow-[#0AB68B]/30 font-black scale-105 z-10'
                                      : isToday
                                      ? 'bg-amber-100/70 text-amber-900 border border-amber-300/80 font-black'
                                      : item.isCurrentMonth
                                      ? hasMeals
                                        ? 'bg-emerald-50 text-emerald-950 hover:bg-emerald-100 font-black border border-emerald-200/60'
                                        : 'text-slate-700 hover:bg-slate-200/60'
                                      : 'text-slate-300 hover:bg-slate-100/50'
                                  }`}
                                  title={`${item.dateStr}: ${hasMeals ? `${dayCals} kcal (${dayLog.meals.length} meals)` : 'no entries'}`}
                                >
                                  <span>{item.dayNumber}</span>

                                  {/* Indicator dot */}
                                  {hasMeals && !isSelected && (
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full absolute bottom-0.5 ${
                                        dayCals > targetCals
                                          ? 'bg-rose-500'
                                          : dayCals >= targetCals * 0.8
                                          ? 'bg-[#0AB68B]'
                                          : 'bg-amber-500'
                                      }`}
                                    />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Date Selector & Quick Jumper Ribbons */}
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                          Quick date pick:
                        </label>
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => stepFriendDate(-1)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors font-bold text-xs cursor-pointer"
                            title="Previous day"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="date"
                            value={selectedFriendDate}
                            onChange={(e) => setSelectedFriendDate(e.target.value)}
                            className="text-xs bg-slate-100 hover:bg-[#E6F9F5] border border-slate-200/80 rounded-xl px-2.5 py-1 font-bold text-slate-800 outline-none cursor-pointer"
                          />
                          <button
                            onClick={() => stepFriendDate(1)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors font-bold text-xs cursor-pointer"
                            title="Next day"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Quick Date Jumper Buttons */}
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar text-xs">
                        <button
                          onClick={() => setSelectedFriendDate(todayLocalDate)}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                            selectedFriendDate === todayLocalDate
                              ? 'bg-[#0AB68B] text-white border-[#0AB68B]'
                              : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          Today 🔥
                        </button>
                        <button
                          onClick={() => setSelectedFriendDate(yesterdayLocalDate)}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                            selectedFriendDate === yesterdayLocalDate
                              ? 'bg-[#0AB68B] text-white border-[#0AB68B]'
                              : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          Yesterday
                        </button>
                        {(() => {
                          const twoDaysAgo = new Date();
                          twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
                          const twoDaysAgoStr = getLocalDateString(twoDaysAgo);
                          return (
                            <button
                              onClick={() => setSelectedFriendDate(twoDaysAgoStr)}
                              className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                                selectedFriendDate === twoDaysAgoStr
                                  ? 'bg-[#0AB68B] text-white border-[#0AB68B]'
                                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                              }`}
                            >
                              Day before yesterday
                            </button>
                          );
                        })()}
                      </div>

                      {/* 7-Day Quick Ribbon */}
                      <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
                        {friendWeekWindow.map((w, wIdx) => {
                          const isSelected = w.dateStr === selectedFriendDate;
                          const isToday = w.dateStr === todayLocalDate;

                          return (
                            <button
                              key={`f-week-ribbon-${w.dateStr}-${wIdx}`}
                              onClick={() => setSelectedFriendDate(w.dateStr)}
                              className={`flex-1 min-w-[55px] py-1.5 px-1 rounded-xl border text-center transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-[#0AB68B] text-white border-[#0AB68B] shadow-sm font-black'
                                  : isToday
                                  ? 'bg-amber-50 text-amber-800 border-amber-200 font-bold'
                                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 font-bold'
                              }`}
                            >
                              <div className="text-[9px] uppercase opacity-80">{w.dayName}</div>
                              <div className="text-xs font-black">{w.dayNum}</div>
                              <div className="text-[8px] mt-0.5 opacity-90 truncate">
                                {w.cals > 0 ? `${w.cals} kcal` : '0'}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* All Days With Records (Scrollable Chips) */}
                    {Object.keys(selectedFriend.dailyLogs || {}).filter(k => (selectedFriend.dailyLogs?.[k]?.meals?.length || 0) > 0).length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block px-1">
                          All days with diary entries:
                        </label>
                        <div className="flex flex-wrap gap-1.5 max-h-[90px] overflow-y-auto custom-scrollbar pb-1 px-1">
                          {Object.keys(selectedFriend.dailyLogs || {})
                            .filter(dateKey => (selectedFriend.dailyLogs?.[dateKey]?.meals?.length || 0) > 0)
                            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
                            .map((dateKey) => (
                              <button
                                key={`history-chip-${dateKey}`}
                                onClick={() => {
                                  setSelectedFriendDate(dateKey);
                                  const [y, m] = dateKey.split('-');
                                  setFriendViewYear(parseInt(y, 10));
                                  setFriendViewMonth(parseInt(m, 10) - 1);
                                  setIsFriendCalendarExpanded(true); // Reveal context
                                }}
                                className={`px-2 py-1 text-[10px] font-extrabold rounded-lg border transition-all cursor-pointer ${
                                  selectedFriendDate === dateKey
                                    ? 'bg-[#0AB68B] text-white border-[#0AB68B] shadow-sm'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-800'
                                }`}
                              >
                                {dateKey === todayLocalDate ? 'Today' : dateKey === yesterdayLocalDate ? 'Yesterday' : dateKey}
                              </button>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Friend Daily Nutrition & Macro Summary Card */}
                    <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80 space-y-3">
                      <div className="flex justify-between items-center text-xs font-black text-slate-900 border-b border-slate-200/80 pb-2">
                        <span className="capitalize">{formattedFriendDate}</span>
                        <span className="text-[#0AB68B] font-black">{totalCals} / {targetCals} kcal</span>
                      </div>

                      {/* Calorie Progress Bar */}
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            totalCals > targetCals ? 'bg-rose-500' : 'bg-[#0AB68B]'
                          }`}
                          style={{ width: `${Math.min(100, Math.round((totalCals / targetCals) * 100))}%` }}
                        />
                      </div>

                      {/* Status Banner */}
                      <div className="flex items-center space-x-2 text-xs font-bold">
                        {totalCals === 0 ? (
                          <div className="text-slate-400 font-medium py-0.5 text-[11px]">
                            This friend has no meals logged for this date yet.
                          </div>
                        ) : calorieDiff > 100 ? (
                          <div className="flex items-center space-x-1.5 text-amber-700 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200/80 w-full text-[11px]">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                            <span>Still missing <strong className="font-extrabold text-amber-900">{calorieDiff} kcal</strong></span>
                          </div>
                        ) : calorieDiff < -100 ? (
                          <div className="flex items-center space-x-1.5 text-rose-700 bg-rose-50 px-2.5 py-1 rounded-xl border border-rose-200/80 w-full text-[11px]">
                            <Flame className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                            <span>Over the goal by <strong className="font-extrabold text-rose-900">{Math.abs(calorieDiff)} kcal</strong></span>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200/80 w-full text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                            <span>The daily intake is perfect and within the target!</span>
                          </div>
                        )}
                      </div>

                      {/* Macros Breakdown */}
                      {totalCals > 0 && (
                        <div className="grid grid-cols-3 gap-1.5 text-[10px] font-extrabold text-center pt-0.5">
                          <div className="bg-rose-50 text-rose-900 p-2 rounded-xl border border-rose-200/60">
                            <div className="text-[9px] uppercase text-rose-500 font-bold">Protein</div>
                            <div className="text-xs font-black">{totalProtein}g / {targetProtein}g</div>
                          </div>
                          <div className="bg-amber-50 text-amber-900 p-2 rounded-xl border border-amber-200/60">
                            <div className="text-[9px] uppercase text-amber-500 font-bold">Fat</div>
                            <div className="text-xs font-black">{totalFat}g / {targetFat}g</div>
                          </div>
                          <div className="bg-teal-50 text-teal-900 p-2 rounded-xl border border-teal-200/60">
                            <div className="text-[9px] uppercase text-teal-500 font-bold">Carbs</div>
                            <div className="text-xs font-black">{totalCarbs}g / {targetCarbs}g</div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Food Meals list for the selected date */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-xs font-black text-slate-800">
                        <span>Meals ({(friendLog.meals || []).length})</span>
                        <span className="text-[#0AB68B] text-[11px]">
                          Total: {friendLog.totalCalories} / {selectedFriend.targetCalories} kcal
                        </span>
                      </div>

                      {(friendLog.meals || []).length === 0 ? (
                        <div className="p-6 text-center bg-slate-50 rounded-2xl border border-slate-100 text-slate-500 text-xs space-y-2.5">
                          <div>No meals logged for the selected date ({formattedFriendDate}).</div>
                          {Object.keys(selectedFriend.dailyLogs || {}).filter((k) => (selectedFriend.dailyLogs?.[k]?.meals?.length || 0) > 0).length > 0 && (
                            <div>
                              <button
                                onClick={() => {
                                  const recorded = Object.keys(selectedFriend.dailyLogs || {})
                                    .filter((k) => (selectedFriend.dailyLogs?.[k]?.meals?.length || 0) > 0)
                                    .sort()
                                    .reverse();
                                  if (recorded.length > 0) {
                                    const latest = recorded[0];
                                    setSelectedFriendDate(latest);
                                    const [y, m] = latest.split('-');
                                    if (y && m) {
                                      setFriendViewYear(parseInt(y, 10));
                                      setFriendViewMonth(parseInt(m, 10) - 1);
                                    }
                                  }
                                }}
                                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#0AB68B] text-white rounded-xl font-bold text-xs hover:bg-[#099975] transition shadow-2xs cursor-pointer"
                              >
                                <Calendar className="w-3.5 h-3.5" />
                                <span>Jump to the friend's latest entry</span>
                              </button>
                            </div>
                          )}
                          {/* Why it is empty: diagnoseFriendFeed was computed before but never rendered */}
                          {feedDiagLoading[selectedFriend.id] ? (
                            <div className="flex items-center justify-center space-x-2 text-[11px] text-slate-400 font-bold pt-1">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Checking where the friend's meals are...</span>
                            </div>
                          ) : feedDiag[selectedFriend.id]?.summary ? (
                            <div className="bg-amber-50/80 border border-amber-200/70 rounded-xl p-2.5 text-[11px] text-amber-900 text-left leading-relaxed">
                              <span className="font-extrabold block mb-0.5">Why it is empty:</span>
                              {feedDiag[selectedFriend.id].summary}
                            </div>
                          ) : (
                            <div>
                              <button
                                onClick={() => {
                                  const fid = selectedFriend.id;
                                  setFeedDiagLoading((prev) => ({ ...prev, [fid]: true }));
                                  diagnoseFriendFeed(fid)
                                    .then((dg) => setFeedDiag((prev) => ({ ...prev, [fid]: dg })))
                                    .catch(() => {})
                                    .finally(() => setFeedDiagLoading((prev) => ({ ...prev, [fid]: false })));
                                }}
                                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white text-slate-600 rounded-xl font-bold text-[11px] border border-slate-200 hover:bg-slate-100 transition cursor-pointer"
                              >
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>Why is it empty? Check</span>
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        (friendLog.meals || []).map((meal, mIdx) => {
                          const config = MEAL_TYPE_CONFIG[meal.mealType] || MEAL_TYPE_CONFIG.snack;
                          const MealIcon = config.icon;
                          const mealIdKey = meal.id;
                          const currentReactions = getReactionList(
                            selectedFriend?.reactions,
                            mealIdKey,
                            selectedFriendDate
                          );

                          return (
                            <div
                              key={`friend-meal-${meal.id || mIdx}-${mIdx}`}
                              className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-2xs space-y-2.5"
                            >
                              <div className="flex justify-between items-start gap-2">
                                <div className="space-y-1">
                                  <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                                    <div className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${config.color}`}>
                                      <MealIcon className="w-3 h-3" />
                                      <span>{config.label} • {meal.time}</span>
                                    </div>
                                    {meal.portionGrams && (
                                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                                        ⚖️ {meal.portionGrams} g
                                      </span>
                                    )}
                                  </div>
                                  <h4 className="text-xs font-black text-slate-900">{meal.title}</h4>
                                  <div className="text-[11px] font-extrabold text-[#0AB68B]">
                                    +{meal.calories} kcal
                                  </div>
                                </div>

                                {meal.imageUrl ? (
                                  <div
                                    onClick={() =>
                                      setExpandedPhoto({
                                        url: meal.imageUrl!,
                                        title: meal.title,
                                        calories: meal.calories,
                                        protein: meal.protein,
                                        fat: meal.fat,
                                        carbs: meal.carbs,
                                        time: meal.time,
                                        portionGrams: meal.portionGrams,
                                        remarks: meal.remarks,
                                      })
                                    }
                                    className="relative group cursor-pointer shrink-0"
                                    title="Tap to enlarge the photo"
                                  >
                                    <img
                                      src={meal.imageUrl}
                                      alt={meal.title}
                                      className="w-16 h-16 rounded-2xl object-cover border border-slate-200 group-hover:scale-105 transition-transform"
                                      referrerPolicy="no-referrer"
                                    />
                                    <div className="absolute inset-0 bg-black/20 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[9px] font-bold">
                                      🔍 Photo
                                    </div>
                                  </div>
                                ) : (
                                  <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center text-[10px] text-slate-400 font-bold p-1 text-center shrink-0">
                                    <Utensils className="w-4 h-4 mb-0.5 text-slate-400" />
                                    <span>No photo</span>
                                  </div>
                                )}
                              </div>

                              {/* Macros Breakdown */}
                              <div className="grid grid-cols-3 gap-1.5 text-[10px] font-extrabold text-slate-700">
                                <div className="bg-rose-50/70 text-rose-800 p-1.5 rounded-xl text-center border border-rose-100">
                                  Protein: {meal.protein}g
                                </div>
                                <div className="bg-amber-50/70 text-amber-800 p-1.5 rounded-xl text-center border border-amber-100">
                                  Fat: {meal.fat}g
                                </div>
                                <div className="bg-teal-50/70 text-teal-800 p-1.5 rounded-xl text-center border border-teal-100">
                                  Carbs: {meal.carbs}g
                                </div>
                              </div>

                              {/* Remarks Note */}
                              {meal.remarks && (
                                <div className="bg-amber-50/80 border border-amber-200/70 rounded-xl p-2 text-[11px] text-amber-900 flex items-start space-x-1.5">
                                  <MessageCircle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                                  <div className="space-y-0.5 min-w-0">
                                    <span className="font-extrabold text-[10px] uppercase text-amber-700 block">Meal note:</span>
                                    <p className="font-medium italic leading-relaxed text-amber-950">"{meal.remarks}"</p>
                                  </div>
                                </div>
                              )}

                              {/* PRESET REACTIONS BAR FOR THIS MEAL */}
                              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                                <span className="text-[10px] font-extrabold text-slate-400">React with:</span>

                                <div className="flex items-center space-x-1">
                                  {PRESET_REACTIONS.map((preset, pIdx) => {
                                    const isActive = currentReactions.includes(preset.key);

                                    return (
                                      <button
                                        key={`reaction-${preset.key}-${pIdx}`}
                                        onClick={() =>
                                          handleToggleReactionForFriend(
                                            selectedFriend.id,
                                            mealIdKey,
                                            preset.key,
                                            selectedFriendDate
                                          )
                                        }
                                        className={`px-2 py-1 rounded-xl text-[11px] border transition-all cursor-pointer active:scale-90 ${
                                          isActive
                                            ? 'bg-[#0AB68B] text-white border-[#0AB68B] shadow-2xs font-bold'
                                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                        }`}
                                        title={preset.label}
                                      >
                                        <span>{preset.emoji}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* TAB 2: PROGRESS OF FRIEND (Exact Metrics, Macros & Journey) */}
              {friendModalTab === 'progress' && (() => {
                const exactTarget = selectedFriend.targetCalories || 2000;

                // 7-day calorie chart data
                const chartData = [];
                const selObj = parseLocalDateString(selectedFriendDate);
                for (let i = 6; i >= 0; i--) {
                  const d = new Date(selObj);
                  d.setDate(d.getDate() - i);
                  const dStr = getLocalDateString(d);
                  const dayName = d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' });
                  const log = getFriendLogForDate(selectedFriend, dStr);
                  chartData.push({
                    date: dayName,
                    calories: log.totalCalories,
                  });
                }

                const maxChartCal = Math.max(exactTarget * 1.2, ...chartData.map((c) => c.calories), 2500);
                const sWeight = Number(selectedFriend.startWeight || selectedFriend.currentWeight || 70);
                const cWeight = Number(selectedFriend.currentWeight || 70);
                const tWeight = Number(selectedFriend.targetWeight || cWeight);
                const weightDiff = Math.abs(sWeight - cWeight);
                const totalDiff = Math.max(1, Math.abs(sWeight - tWeight));
                const progressPct = Math.min(100, Math.max(5, Math.round((weightDiff / totalDiff) * 100)));

                return (
                  <div className="space-y-4">
                    {/* A. WEIGHT DYNAMICS & STATS */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                      <div className="flex justify-between items-center text-xs font-black text-slate-900">
                        <span className="flex items-center space-x-1.5">
                          <Scale className="w-4 h-4 text-[#0AB68B]" />
                          <span>Weight trend</span>
                        </span>
                        <span className="text-[11px] text-slate-400 font-bold">Goal: {selectedFriend.targetWeight} kg</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="bg-white p-2.5 rounded-xl border border-slate-200/70 shadow-2xs">
                          <div className="font-black text-slate-700">{selectedFriend.startWeight} kg</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Start</div>
                        </div>
                        <div className="bg-white p-2.5 rounded-xl border border-slate-200/70 shadow-2xs">
                          <div className="font-black text-slate-900">{selectedFriend.currentWeight} kg</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Current</div>
                        </div>
                        <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 shadow-2xs">
                          <div className="font-black text-[#0AB68B]">{selectedFriend.targetWeight} kg</div>
                          <div className="text-[10px] text-emerald-700 mt-0.5">Goal</div>
                        </div>
                      </div>

                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#0AB68B] rounded-full transition-all duration-500"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>

                    {/* B. 7-DAY CALORIE TIMELINE */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 space-y-2">
                      <div className="flex justify-between items-center">
                        <h4 className="text-xs font-black text-slate-900">Weekly calorie trend</h4>
                        <span className="text-[10px] font-bold text-slate-400">Target: {exactTarget} kcal</span>
                      </div>

                      <div className="h-44 w-full pt-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={chartData}
                            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                          >
                            <defs>
                              <linearGradient id="friendCalGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#0AB68B" stopOpacity={0.35} />
                                <stop offset="95%" stopColor="#0AB68B" stopOpacity={0.0} />
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                            <YAxis domain={[0, maxChartCal]} tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                            <Tooltip formatter={(value: any) => [`${value} kcal`, 'Calories']} />
                            <ReferenceLine
                              y={exactTarget}
                              stroke="#94a3b8"
                              strokeDasharray="3 3"
                              label={{ value: 'Goal', position: 'top', fill: '#94a3b8', fontSize: 9 }}
                            />
                            <Area
                              type="monotone"
                              dataKey="calories"
                              stroke="#0AB68B"
                              strokeWidth={2.5}
                              fill="url(#friendCalGrad)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ADD FRIEND MODAL */}
      <AnimatePresence>
        {isAddFriendModalOpen && (
          <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 font-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-md bg-white rounded-[32px] p-6 text-slate-800 space-y-4 shadow-2xl relative overflow-y-auto max-h-[85vh]"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2">
                  <UserPlus className="w-5 h-5 text-[#0AB68B]" />
                  <h3 className="font-extrabold text-slate-900 text-sm">Add friend</h3>
                </div>
                <button
                  onClick={() => setIsAddFriendModalOpen(false)}
                  className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddFriendSubmit} className="space-y-3">
                <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-emerald-800 uppercase block">Your friend ID code:</span>
                    <span className="text-xs font-mono font-black text-emerald-950 truncate block">{userTagId}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyMyId}
                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold transition-colors shrink-0 flex items-center space-x-1 cursor-pointer"
                  >
                    {copiedId ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedId ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                <label className="text-xs font-bold text-slate-700 block">
                  Username or ID code:
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={newFriendInput}
                    onChange={(e) => setNewFriendInput(e.target.value)}
                    placeholder="Example: NM-XXXXXX or your friend's ID code"
                    className="flex-1 px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0AB68B]"
                  />
                  <button
                    type="submit"
                    disabled={isSearching || !newFriendInput.trim()}
                    className="px-4 py-2.5 bg-[#0AB68B] text-white text-xs font-extrabold rounded-xl hover:bg-[#08a27b] transition-colors cursor-pointer disabled:opacity-50 flex items-center space-x-1"
                  >
                    {isSearching ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Searching...</span>
                      </>
                    ) : (
                      <span>Add</span>
                    )}
                  </button>
                </div>

                {/* ID instructions */}
                <div className="pt-2 border-t border-slate-100 flex items-start space-x-2.5 text-slate-500 bg-slate-50 p-3 rounded-2xl">
                  <span className="text-sm">🔑</span>
                  <div className="text-[11px] leading-relaxed">
                    <span className="font-bold text-slate-700 block mb-0.5">Adding real friends by ID</span>
                    Ask your friend to copy their personal ID code (shown above in the green block) and paste it into the field above to add them instantly.
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* EXPANDED PHOTO LIGHTBOX MODAL */}
      <AnimatePresence>
        {expandedPhoto && (
          <div
            onClick={() => setExpandedPhoto(null)}
            className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 font-sans cursor-pointer"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl overflow-hidden max-w-sm w-full p-4 space-y-3 relative shadow-2xl border border-slate-700"
            >
              <button
                onClick={() => setExpandedPhoto(null)}
                className="absolute top-6 right-6 p-2 rounded-full bg-black/60 text-white hover:bg-black transition-colors cursor-pointer z-10"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-100">
                <img
                  src={expandedPhoto.url}
                  alt={expandedPhoto.title}
                  className="w-full h-64 object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute bottom-2 left-2 right-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl text-white text-xs font-bold flex justify-between items-center">
                  <span className="truncate pr-2">{expandedPhoto.title}</span>
                  <span className="text-[#0AB68B] font-black shrink-0">{expandedPhoto.calories} kcal</span>
                </div>
              </div>

              {expandedPhoto.portionGrams && (
                <div className="flex items-center justify-between text-xs font-bold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                  <span>Portion size:</span>
                  <span className="font-black text-slate-900">{expandedPhoto.portionGrams} g</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 text-center text-xs font-black pt-1">
                <div className="bg-rose-50 p-2 rounded-xl text-rose-800 border border-rose-200">
                  Protein: {expandedPhoto.protein}g
                </div>
                <div className="bg-amber-50 p-2 rounded-xl text-amber-800 border border-amber-200">
                  Fat: {expandedPhoto.fat}g
                </div>
                <div className="bg-teal-50 p-2 rounded-xl text-teal-800 border border-teal-200">
                  Carbs: {expandedPhoto.carbs}g
                </div>
              </div>

              {expandedPhoto.remarks && (
                <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-2.5 text-xs text-amber-900 space-y-1">
                  <span className="font-extrabold text-[10px] uppercase text-amber-700 block">Meal note:</span>
                  <p className="font-medium italic leading-relaxed text-amber-950">"{expandedPhoto.remarks}"</p>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
