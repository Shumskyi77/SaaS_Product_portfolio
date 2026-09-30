import { UserProfile, WeightLogEntry } from '../types/user';
import { MealLog } from '../types/meal';
import { getTamagotchiImage } from './tamagotchiAssets';

export interface WorkoutLog {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  title: string;
  durationMinutes: number;
  caloriesBurned: number;
  time: string;
}

const PROFILE_KEY = 'foodvisor_user_profile';
const MEAL_LOGS_KEY = 'foodvisor_meal_logs';
const WEIGHT_LOGS_KEY = 'foodvisor_weight_logs';
const WATER_LOGS_KEY = 'foodvisor_water_logs';
const WORKOUT_LOGS_KEY = 'foodvisor_workout_logs';

export function clearAllUserData() {
  if (typeof window === 'undefined') return;
  // Undelivered outbox + synced-ids survive logout: otherwise logout
  // would silently bury unsynced saves/deletes (they live only in localStorage).
  // After a new login the flusher restamps them onto the fresh auth.uid.
  let outbox: string | null = null;
  let syncedIds: string | null = null;
  try {
    outbox = localStorage.getItem('nutrimint_cloud_outbox_v1');
    syncedIds = localStorage.getItem('nutrimint_synced_meal_ids_v1');
  } catch {}
  const keysToRemove: string[] = [];
  // Loop in try: in private Safari localStorage.length/key throws
  // SecurityError — otherwise the whole logout crashes.
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('foodvisor') || key.startsWith('nutrimint') || key.startsWith('firebase'))) {
        keysToRemove.push(key);
      }
    }
  } catch {}
  try {
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {}
  try {
    if (outbox) localStorage.setItem('nutrimint_cloud_outbox_v1', outbox);
    if (syncedIds) localStorage.setItem('nutrimint_synced_meal_ids_v1', syncedIds);
  } catch {}
}

export function calculateUserGoals(params: {
  gender: 'male' | 'female';
  age: number;
  height: number;
  currentWeight: number;
  targetWeight: number;
  weeklyGoal: number;
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete';
  dietType: string;
}) {
  const { gender, age, height, currentWeight, activityLevel } = params;

  // Mifflin-St Jeor Formula BMR
  let bmr = 10 * currentWeight + 6.25 * height - 5 * age;
  if (gender === 'male') {
    bmr += 5;
  } else {
    bmr -= 161;
  }

  const activityMultipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    athlete: 1.9,
  };

  const multiplier = activityMultipliers[activityLevel] || 1.375;
  const tdee = Math.round(bmr * multiplier);

  // Target Calories based on weight difference / goal
  let calorieAdjustment = 0;
  if (params.targetWeight < params.currentWeight) {
    // Weight loss pace based on weeklyGoal (e.g. -0.5 kg/week = ~550 kcal/day deficit)
    const weeklyKg = Math.abs(params.weeklyGoal) || 0.5;
    calorieAdjustment = -Math.round((weeklyKg * 7700) / 7);
    // Cap deficit so it never exceeds 28% of TDEE for healthy weight loss
    const maxSafeDeficit = Math.round(tdee * 0.28);
    calorieAdjustment = -Math.min(maxSafeDeficit, Math.abs(calorieAdjustment));
  } else if (params.targetWeight > params.currentWeight) {
    // Muscle gain / surplus
    const weeklyKg = Math.abs(params.weeklyGoal) || 0.25;
    calorieAdjustment = Math.round((weeklyKg * 7700) / 7);
    const maxSafeSurplus = Math.round(tdee * 0.25);
    calorieAdjustment = Math.min(maxSafeSurplus, Math.max(250, calorieAdjustment));
  } else {
    calorieAdjustment = 0; // Maintenance
  }

  // Safety floor
  const minCalories = gender === 'female' ? 1200 : 1500;
  const targetCalories = Math.max(minCalories, Math.round(tdee + calorieAdjustment));

  // High-precision Macro Distribution
  let proteinRatio = 0.28; // 28% calories
  let fatRatio = 0.27;     // 27% calories
  let carbsRatio = 0.45;   // 45% calories

  if (params.dietType === 'Keto') {
    proteinRatio = 0.25;
    fatRatio = 0.70;
    carbsRatio = 0.05;
  } else if (params.dietType === 'Low_Carb') {
    proteinRatio = 0.35;
    fatRatio = 0.45;
    carbsRatio = 0.20;
  } else if (params.dietType === 'High_Protein' || params.dietType === 'gain_muscle') {
    proteinRatio = 0.35;
    fatRatio = 0.25;
    carbsRatio = 0.40;
  }

  // Calculate target grams
  let targetProtein = Math.round((targetCalories * proteinRatio) / 4);
  // Ensure optimal protein intake per kg (at least 1.6g/kg if losing weight)
  if (params.targetWeight < params.currentWeight && targetProtein < Math.round(currentWeight * 1.6)) {
    targetProtein = Math.round(currentWeight * 1.6);
  }

  let targetFat = Math.round((targetCalories * fatRatio) / 9);
  targetFat = Math.max(40, targetFat); // Minimum essential fats

  // Remaining calories to carbs
  const remainingCalForCarbs = Math.max(20, targetCalories - (targetProtein * 4 + targetFat * 9));
  const targetCarbs = Math.round(remainingCalForCarbs / 4);

  const targetFiber = Math.min(45, Math.max(25, Math.round((targetCalories / 1000) * 14)));
  const targetWater = Math.max(1800, Math.round(currentWeight * 35)); // 35ml per kg

  return {
    bmr: Math.round(bmr),
    tdee,
    targetCalories,
    targetProtein,
    targetFat,
    targetCarbs,
    targetFiber,
    targetWater,
    calorieAdjustment,
  };
}

/**
 * Formats a Date object to YYYY-MM-DD in local time
 */
export function getLocalDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Safely parses a YYYY-MM-DD string into a local Date object without UTC midnight shifting
 */
export function parseLocalDateString(dateStr?: string): Date {
  if (!dateStr) return new Date();
  const clean = dateStr.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    return new Date(y, m, d, 12, 0, 0); // midday avoids any daylight saving shift
  }
  return new Date();
}

/**
 * Calculates true consecutive active streak days from an array of activity/meal dates (YYYY-MM-DD),
 * purely based on real logged meals without mock or artificially hardcoded numbers.
 */
export function calculateStreakFromMealLogs(datesWithActivity: string[]): number {
  const cleanDates = new Set(
    (datesWithActivity || [])
      .filter((d) => d)
      .map((d) => d.slice(0, 10))
  );

  const now = new Date();
  const todayLocal = getLocalDateString(now);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayLocal = getLocalDateString(yesterday);

  const hasToday = cleanDates.has(todayLocal);
  const hasYesterday = cleanDates.has(yesterdayLocal);

  // If neither today nor yesterday has any meal logs, the active streak is 0
  if (!hasToday && !hasYesterday) {
    return 0;
  }

  let calculatedStreak = 0;
  let checkDate = parseLocalDateString(hasToday ? todayLocal : yesterdayLocal);

  for (let i = 0; i < 365; i++) {
    const localStr = getLocalDateString(checkDate);
    if (cleanDates.has(localStr)) {
      calculatedStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return calculatedStreak;
}

export function getStoredProfile(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function safeLocalStorageSet(key: string, data: any): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err: any) {
    if (err?.name === 'QuotaExceededError' || String(err?.message || '').includes('quota') || String(err || '').includes('Quota')) {
      console.warn(`LocalStorage quota reached when saving "${key}". Optimizing cached storage...`);
      try {
        // Strip heavy base64 strings if present
        if (typeof data === 'object' && data !== null) {
          const stripped = JSON.parse(JSON.stringify(data), (k, v) => {
            if ((k === 'imageUrl' || k === 'photoUrl') && typeof v === 'string' && v.startsWith('data:')) {
              return undefined;
            }
            return v;
          });
          localStorage.setItem(key, JSON.stringify(stripped));
          return;
        }
      } catch {
        try {
          // Free space by clearing legacy redundant keys
          const legacyKeys = ['foodvisor_meal_logs', 'nutrimint_meal_logs', 'foodvisor_meals'];
          legacyKeys.forEach((k) => {
            if (k !== key) localStorage.removeItem(k);
          });
          localStorage.setItem(key, JSON.stringify(data));
        } catch {
          // Silent fallback
        }
      }
    }
  }
}

export function saveStoredProfile(profile: UserProfile): void {
  safeLocalStorageSet(PROFILE_KEY, profile);
}

/**
 * Deep copy of a structure with base64 photos (data: URLs) stripped out.
 * Remote https URLs (from Firebase Storage) are tiny, keep them.
 * Used before writing to Firestore documents (1MB limit) and heavy caches:
 * a friend's calendar must reach the cloud even with old photos.
 */
export function stripDataUrlPhotos<T>(value: T): T {
  if (value === null || value === undefined) return value;
  try {
    return JSON.parse(
      JSON.stringify(value, (k, v) => {
        if (
          (k === 'imageUrl' || k === 'photoUrl') &&
          typeof v === 'string' &&
          v.startsWith('data:')
        ) {
          return undefined;
        }
        return v;
      })
    );
  } catch {
    return value;
  }
}

export function getStoredMealLogs(dateStr: string): MealLog[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(MEAL_LOGS_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    const dayLogs: MealLog[] = parsed[dateStr] || [];
    return dayLogs.filter((m) => m && m.id);
  } catch {
    return [];
  }
}

export function getStoredCalendarMeals(): Record<string, MealLog[]> {
  if (typeof window === 'undefined') return {};
  const result: Record<string, MealLog[]> = {};

  // 1. Primary read from MEAL_LOGS_KEY
  try {
    const raw = localStorage.getItem(MEAL_LOGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        Object.entries(parsed).forEach(([dKey, list]) => {
          if (Array.isArray(list)) {
            const clean = list.filter((m) => m && m.id);
            if (clean.length > 0) {
              result[dKey.slice(0, 10)] = clean.map((m) => ({
                ...m,
                date: dKey.slice(0, 10),
                calories: Math.max(0, Math.round(Number(m.calories) || 0)),
                protein: Math.max(0, Math.round(Number(m.protein) || 0)),
                fat: Math.max(0, Math.round(Number(m.fat) || 0)),
                carbs: Math.max(0, Math.round(Number(m.carbs) || 0)),
                portionGrams: Number(m.portionGrams) || 100,
              }));
            }
          }
        });
      }
    }
  } catch {}

  // 2. Augment with any stray meals from other stored logs
  try {
    const all = getAllStoredMealLogs();
    all.forEach((m) => {
      if (!m || !m.id || false || false) return;
      const d = m.date ? m.date.slice(0, 10) : getLocalDateString();
      if (!result[d]) {
        result[d] = [];
      }
      if (!result[d].some((existing) => existing.id === m.id)) {
        result[d].push({
          ...m,
          date: d,
          calories: Math.max(0, Math.round(Number(m.calories) || 0)),
          protein: Math.max(0, Math.round(Number(m.protein) || 0)),
          fat: Math.max(0, Math.round(Number(m.fat) || 0)),
          carbs: Math.max(0, Math.round(Number(m.carbs) || 0)),
        });
      }
    });
  } catch {}

  return result;
}

export function syncAllLocalMealsWithUid(uid: string): Record<string, MealLog[]> {
  if (typeof window === 'undefined' || !uid) return {};
  const calMeals = getStoredCalendarMeals();
  let changed = false;

  Object.entries(calMeals).forEach(([dateKey, meals]) => {
    meals.forEach((m) => {
      if (!m.userId || m.userId !== uid) {
        m.userId = uid;
        changed = true;
      }
    });
  });

  if (changed) {
    safeLocalStorageSet(MEAL_LOGS_KEY, calMeals);
  }
  return calMeals;
}

export function getAllStoredMealLogs(): MealLog[] {
  if (typeof window === 'undefined') return [];
  const allMap = new Map<string, MealLog>();

  // Check all common storage keys
  const candidateKeys = [
    MEAL_LOGS_KEY,
    'foodvisor_meal_logs',
    'nutrimint_meal_logs',
    'nutrimint_meals',
    'foodvisor_meals',
  ];

  // Explicitly not meals (otherwise the scan below would suck them in as dishes — workouts
  // already flew to friends as "meals" and were written to the meals collection).
  const NON_MEAL_KEYS = new Set([WORKOUT_LOGS_KEY, WEIGHT_LOGS_KEY, WATER_LOGS_KEY]);

  // Also scan all localStorage keys for any meal objects.
  // Scan in try: in private Safari length/key throws — otherwise the whole
  // getAllStoredMealLogs crashes (diary, streak, friends feed).
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.includes('meal') || k.includes('log')) && !candidateKeys.includes(k) && !NON_MEAL_KEYS.has(k)) {
        candidateKeys.push(k);
      }
    }
  } catch {}

  // Marker of a real dish: a WorkoutLog has id+date+title but none of the
  // nutritional fields. Require at least one — otherwise workouts/other junk
  // with ids would turn into "meals" for friends.
  const looksLikeMeal = (m: any): boolean => {
    if (!m || typeof m !== 'object') return false;
    if (typeof m.durationMinutes === 'number' || typeof m.caloriesBurned === 'number') return false;
    return (
      m.type !== undefined ||
      m.mealType !== undefined ||
      m.calories !== undefined ||
      m.protein !== undefined ||
      m.fat !== undefined ||
      m.carbs !== undefined ||
      m.title !== undefined ||
      m.items !== undefined ||
      m.portionGrams !== undefined
    );
  };

  candidateKeys.forEach((key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) {
        parsed.forEach((m) => {
          if (m && m.id && typeof m.id === 'string' && looksLikeMeal(m)) {
            allMap.set(m.id, m);
          }
        });
      } else if (typeof parsed === 'object' && parsed !== null) {
        Object.entries(parsed).forEach(([dateKey, val]) => {
          if (Array.isArray(val)) {
            val.forEach((m) => {
              if (m && m.id && typeof m.id === 'string' && looksLikeMeal(m)) {
                allMap.set(m.id, { ...m, date: m.date || dateKey });
              }
            });
          }
        });
      }
    } catch {}
  });

  return Array.from(allMap.values());
}

export function saveMealLog(meal: MealLog): MealLog[] {
  if (typeof window === 'undefined') return [];
  let store: Record<string, MealLog[]> = {};
  try {
    const raw = localStorage.getItem(MEAL_LOGS_KEY);
    store = raw ? JSON.parse(raw) : {};
  } catch {
    store = {};
  }
  const dateStr = meal.date;
  const currentLogs: MealLog[] = store[dateStr] || [];

  const existingIdx = currentLogs.findIndex((m) => m.id === meal.id);
  if (existingIdx >= 0) {
    currentLogs[existingIdx] = meal;
  } else {
    currentLogs.push(meal);
  }

  store[dateStr] = currentLogs;
  safeLocalStorageSet(MEAL_LOGS_KEY, store);
  return currentLogs;
}

export function saveMealLogsBulk(meals: MealLog[], targetDate?: string): MealLog[] {
  if (typeof window === 'undefined' || !Array.isArray(meals)) return [];
  let store: Record<string, MealLog[]> = {};
  try {
    const raw = localStorage.getItem(MEAL_LOGS_KEY);
    store = raw ? JSON.parse(raw) : {};
  } catch {
    store = {};
  }

  meals.forEach((meal) => {
    // Previously records without id/date were silently dropped locally while the cloud wrote with a fallback id —
    // local/cloud divergence. Now we fix the record instead of dropping it.
    if (!meal) return;
    if (!meal.id) {
      meal = { ...meal, id: `meal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
    }
    if (!meal.date) {
      meal = { ...meal, date: targetDate || getLocalDateString() };
    }
    const dateStr = meal.date;
    if (!store[dateStr]) {
      store[dateStr] = [];
    }
    const list: MealLog[] = store[dateStr];
    const idx = list.findIndex((m) => m.id === meal.id);
    if (idx >= 0) {
      list[idx] = meal;
    } else {
      list.push(meal);
    }
  });

  safeLocalStorageSet(MEAL_LOGS_KEY, store);
  const activeDate = targetDate || (meals[0]?.date) || getLocalDateString();
  return store[activeDate] || [];
}

export function deleteMealLog(mealId: string, dateStr: string): MealLog[] {
  if (typeof window === 'undefined') return [];
  // getItem in try: in private Safari it throws SecurityError.
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(MEAL_LOGS_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const store = JSON.parse(raw);
    // Clean by id across ALL dates: deleting from the wrong date (past date,
    // UTC shift) would otherwise leave the dish, and calendar sync would resurrect the ghost.
    Object.keys(store).forEach((d) => {
      if (Array.isArray(store[d])) {
        store[d] = store[d].filter((m: any) => m?.id !== mealId);
      }
    });
    safeLocalStorageSet(MEAL_LOGS_KEY, store);
    const currentLogs: MealLog[] = store[dateStr] || [];
    return currentLogs;
  } catch {
    return [];
  }
}

export function getStoredWater(dateStr: string): number {
  if (typeof window === 'undefined') return 0;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(WATER_LOGS_KEY);
  } catch {
    return 0;
  }
  if (!raw) return 0;
  try {
    const store = JSON.parse(raw);
    return store[dateStr] ?? 0;
  } catch {
    return 0;
  }
}

export function saveStoredWater(dateStr: string, amount: number): void {
  if (typeof window === 'undefined') return;
  let store: Record<string, number> = {};
  try {
    const raw = localStorage.getItem(WATER_LOGS_KEY);
    store = raw ? JSON.parse(raw) : {};
  } catch {
    store = {};
  }
  store[dateStr] = amount;
  safeLocalStorageSet(WATER_LOGS_KEY, store);
}

export function getStoredWeightLogs(initialCurrentWeight = 75): WeightLogEntry[] {
  if (typeof window === 'undefined') return [];
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(WEIGHT_LOGS_KEY);
  } catch {
    return [];
  }
  if (!raw) {
    const today = getLocalDateString();
    const initialLog: WeightLogEntry[] = [
      { userId: 'u1', date: today, weight: initialCurrentWeight },
    ];
    safeLocalStorageSet(WEIGHT_LOGS_KEY, initialLog);
    return initialLog;
  }
  try {
    const parsed: WeightLogEntry[] = JSON.parse(raw);
    // Drop legacy test fixtures (any entry with test flag or far-future mock weight)
    const isOldMock = parsed.some((item: any) => item?.mock === true);
    if (isOldMock) {
      const today = getLocalDateString();
      const freshLogs: WeightLogEntry[] = [
        { userId: 'u1', date: today, weight: initialCurrentWeight },
      ];
      safeLocalStorageSet(WEIGHT_LOGS_KEY, freshLogs);
      return freshLogs;
    }
    return parsed.sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

export function saveWeightLogsBulk(logs: WeightLogEntry[]): WeightLogEntry[] {
  if (typeof window === 'undefined') return logs;
  const current = getStoredWeightLogs();
  const map = new Map<string, WeightLogEntry>();
  current.forEach((l) => map.set(l.date, l));
  logs.forEach((l) => map.set(l.date, l));
  const merged = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  safeLocalStorageSet(WEIGHT_LOGS_KEY, merged);
  return merged;
}

export function saveWeightLog(entry: WeightLogEntry): WeightLogEntry[] {
  const current = getStoredWeightLogs(entry.weight);
  const existingIdx = current.findIndex((log) => log.date === entry.date);

  let updated: WeightLogEntry[];
  if (existingIdx >= 0) {
    updated = [...current];
    updated[existingIdx] = entry;
  } else {
    updated = [...current, entry];
  }

  updated.sort((a, b) => a.date.localeCompare(b.date));

  safeLocalStorageSet(WEIGHT_LOGS_KEY, updated);
  return updated;
}

export function deleteWeightLog(dateStr: string): WeightLogEntry[] {
  const current = getStoredWeightLogs();
  const updated = current.filter((log) => log.date !== dateStr);
  safeLocalStorageSet(WEIGHT_LOGS_KEY, updated);
  return updated;
}

export function getStoredWorkoutLogs(dateStr: string): WorkoutLog[] {
  if (typeof window === 'undefined') return [];
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(WORKOUT_LOGS_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const store = JSON.parse(raw);
    return store[dateStr] || [];
  } catch {
    return [];
  }
}

export function saveWorkoutLog(workout: WorkoutLog): WorkoutLog[] {
  if (typeof window === 'undefined') return [];
  let store: Record<string, WorkoutLog[]> = {};
  try {
    const raw = localStorage.getItem(WORKOUT_LOGS_KEY);
    store = raw ? JSON.parse(raw) : {};
  } catch {
    store = {};
  }
  const dateStr = workout.date;
  const currentLogs: WorkoutLog[] = store[dateStr] || [];

  const existingIdx = currentLogs.findIndex((w) => w.id === workout.id);
  if (existingIdx >= 0) {
    currentLogs[existingIdx] = workout;
  } else {
    currentLogs.unshift(workout);
  }

  store[dateStr] = currentLogs;
  safeLocalStorageSet(WORKOUT_LOGS_KEY, store);
  return currentLogs;
}

export function deleteWorkoutLog(workoutId: string, dateStr: string): WorkoutLog[] {
  if (typeof window === 'undefined') return [];
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(WORKOUT_LOGS_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const store = JSON.parse(raw);
    const currentLogs: WorkoutLog[] = store[dateStr] || [];
    const filtered = currentLogs.filter((w) => w.id !== workoutId);
    store[dateStr] = filtered;
    safeLocalStorageSet(WORKOUT_LOGS_KEY, store);
    return filtered;
  } catch {
    return [];
  }
}

export function compressImageFile(file: File, maxDimension = 800, quality = 0.82): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        } else {
          resolve((event.target?.result as string) || '');
        }
      };
      img.onerror = () => resolve((event.target?.result as string) || '');
      img.src = event.target?.result as string;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

// ===================== TAMAGOTCHI STORE =====================
import { TamagotchiState, TamagotchiBreed, TamagotchiMood } from '../types/tamagotchi';

const TAMAGOTCHI_KEY = 'foodvisor_tamagotchi_state';

export function getStoredTamagotchi(): TamagotchiState | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(TAMAGOTCHI_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse tamagotchi state:', e);
    return null;
  }
}

export function saveStoredTamagotchi(state: TamagotchiState | null): void {
  if (typeof window === 'undefined') return;
  if (!state) {
    try {
      localStorage.removeItem(TAMAGOTCHI_KEY);
    } catch {}
  } else {
    safeLocalStorageSet(TAMAGOTCHI_KEY, state);
  }
}

export function calculateTamagotchiStats(
  pet: TamagotchiState,
  userTargetCalories: number,
  todayCaloriesEaten: number,
  todayWorkoutsCount = 0,
  mealLogs: MealLog[] = [],
  isToday = true
): {
  limit: number;
  mood: TamagotchiMood;
  satietyPercent: number; // Current live stomach satiety (0-100%)
  dailySatietyPercent: number; // Daily goal progress (0-100%+)
  speechText: string;
  imageSrc: string;
  hungerState: 'full' | 'satisfied' | 'getting_hungry' | 'hungry' | 'starving';
  timeContext: string;
} {
  const limit = Math.max(700, userTargetCalories - 200);
  const dailyRatio = todayCaloriesEaten / limit;
  const dailySatietyPercent = Math.min(150, Math.round(dailyRatio * 100));

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeFraction = currentHour + currentMinute / 60;

  const isNight = currentHour >= 22 || currentHour < 7;
  const isMorning = currentHour >= 7 && currentHour < 12;
  const isNoon = currentHour >= 12 && currentHour < 15;
  const isAfternoon = currentHour >= 15 && currentHour < 18;
  const isEvening = currentHour >= 18 && currentHour < 22;

  let timeContext = 'day';
  if (isNight) timeContext = 'night';
  else if (isMorning) timeContext = 'morning';
  else if (isNoon) timeContext = 'lunch';
  else if (isAfternoon) timeContext = 'afternoon snack';
  else if (isEvening) timeContext = 'evening';

  // Dynamic Live Satiety Decay (hourly food digestion)
  let liveSatiety = 0;
  if (isToday) {
    if (mealLogs && mealLogs.length > 0) {
      let activeFullnessCalories = 0;

      mealLogs.forEach((meal) => {
        let mealHour = 8;
        let mealMin = 0;
        if (meal.time && meal.time.includes(':')) {
          const parts = meal.time.split(':');
          mealHour = parseInt(parts[0], 10) || 8;
          mealMin = parseInt(parts[1], 10) || 0;
        } else {
          if (meal.type === 'breakfast') mealHour = 8.5;
          else if (meal.type === 'lunch') mealHour = 13;
          else if (meal.type === 'snack') mealHour = 16.5;
          else if (meal.type === 'dinner') mealHour = 19.5;
        }

        const mealTimeFraction = mealHour + mealMin / 60;
        // Hours passed since this meal
        const hoursPassed = Math.max(0, currentTimeFraction - mealTimeFraction);
        // Average metabolic burn/digestion rate: ~85 kcal/hour
        const digested = hoursPassed * 85;
        const remaining = Math.max(0, meal.calories - digested);
        activeFullnessCalories += remaining;
      });

      // Target stomach capacity for full satiety is ~380-420 active calories
      liveSatiety = Math.min(100, Math.max(0, Math.round((activeFullnessCalories / 400) * 100)));
    } else {
      // No meals logged today yet
      if (isMorning) liveSatiety = 20;
      else if (isNoon) liveSatiety = 10;
      else if (isAfternoon || isEvening) liveSatiety = 5;
      else liveSatiety = 25;
    }
  } else {
    // Past historical dates
    liveSatiety = Math.min(100, Math.round(dailyRatio * 100));
  }

  // Determine hunger state category
  let hungerState: 'full' | 'satisfied' | 'getting_hungry' | 'hungry' | 'starving' = 'hungry';
  if (liveSatiety >= 80) hungerState = 'full';
  else if (liveSatiety >= 55) hungerState = 'satisfied';
  else if (liveSatiety >= 35) hungerState = 'getting_hungry';
  else if (liveSatiety >= 15) hungerState = 'hungry';
  else hungerState = 'starving';

  // Mood Determination
  let mood: TamagotchiMood = 'happy';
  let speechText = 'I am full of energy and very happy! Woof-woof! ✨';

  if (!pet.isAlive) {
    mood = 'sad';
    speechText = pet.causeOfDeath || 'The pet passed away from malnutrition...';
  } else if (isNight) {
    mood = 'sleepy';
    speechText = 'Z-z-z... Sweet dreams! Remember to eat well tomorrow 🌙';
  } else if (todayCaloriesEaten > limit + 350) {
    mood = 'angry';
    speechText = 'Oops, too much food! Tummy is overloaded, let us take a pause 🛑';
  } else if (todayWorkoutsCount > 0 && liveSatiety >= 50) {
    mood = 'playful';
    speechText = 'Great workout! I have tons of energy, let us play! 🎾';
  } else if (liveSatiety >= 70) {
    mood = 'happy';
    if (isMorning) {
      speechText = 'Great hearty breakfast! Enough energy until lunch ✨';
    } else if (isNoon) {
      speechText = 'M-m-m, what a tasty lunch! I am full of strength and happiness again 💖';
    } else if (isAfternoon) {
      speechText = 'Great afternoon snack! Tummy is happy, running on 🐾';
    } else {
      speechText = 'Wonderful dinner! A great day for our health 🌟';
    }
  } else if (liveSatiety >= 40) {
    // Digested somewhat, getting hungrier
    if (isNoon) {
      mood = 'hungry';
      speechText = 'Breakfast is digested, around lunch I am getting hungry... Time for lunch! 🍲';
    } else if (isAfternoon) {
      mood = 'playful';
      speechText = 'Still have some strength, but soon time for an apple or a snack 🍎';
    } else if (isEvening) {
      mood = 'hungry';
      speechText = 'Evening is here, tummy hints it is time to cook dinner 🥗';
    } else {
      mood = 'hungry';
      speechText = 'Tummy is starting to rumble... Add a meal to your diary! 🍖';
    }
  } else if (liveSatiety >= 20) {
    mood = 'hungry';
    if (isMorning) {
      speechText = 'Good morning! I woke up and really look forward to our tasty breakfast 🥣';
    } else if (isNoon) {
      speechText = 'Lunch time! Tummy is totally empty, let us have lunch soon 🍛';
    } else if (isEvening) {
      speechText = 'It is evening already and I am so hungry! Let us have dinner 🍲';
    } else {
      speechText = 'I am hungry... Remember to feed us on time! 🥺';
    }
  } else {
    mood = 'sad';
    speechText = 'I am very hungry... Please log a meal in your diary! 🥺🍖';
  }

  const imageSrc = getTamagotchiImage(pet.breed, mood);

  return {
    limit,
    mood,
    satietyPercent: liveSatiety,
    dailySatietyPercent,
    speechText,
    imageSrc,
    hungerState,
    timeContext,
  };
}

export interface FriendshipInfo {
  daysTogether: number;
  daysWord: string;
  rankBadge: string;
  rankTitle: string;
  rankDescription: string;
  streakText: string;
  nextMilestoneDays: number;
  progressToNextMilestone: number;
}

export function getTamagotchiFriendship(pet: TamagotchiState | null): FriendshipInfo {
  if (!pet || !pet.adoptedAt) {
    return {
      daysTogether: 1,
      daysWord: 'day',
      rankBadge: '🌱',
      rankTitle: 'First steps',
      rankDescription: 'The start of a strong friendship and healthy habits!',
      streakText: '1 day together',
      nextMilestoneDays: 3,
      progressToNextMilestone: 33,
    };
  }

  const adoptedDate = new Date(pet.adoptedAt).getTime();
  const diffDays = Math.max(1, Math.floor((Date.now() - adoptedDate) / (1000 * 60 * 60 * 24)) + 1);

  // English plural for "day"
  let daysWord = 'days';
  if (diffDays === 1) {
    daysWord = 'day';
  }

  let rankBadge = '🌱';
  let rankTitle = 'New friends';
  let rankDescription = 'You just started the journey — take care of each other!';
  let nextMilestoneDays = 3;
  let prevMilestone = 1;

  if (diffDays >= 30) {
    rankBadge = '👑';
    rankTitle = 'Soulmates';
    rankDescription = 'Legendary bond! You are a model healthy-lifestyle team.';
    nextMilestoneDays = 60;
    prevMilestone = 30;
  } else if (diffDays >= 14) {
    rankBadge = '🏆';
    rankTitle = 'Legendary duo';
    rankDescription = 'Two weeks of care and clean eating with no slip-ups!';
    nextMilestoneDays = 30;
    prevMilestone = 14;
  } else if (diffDays >= 7) {
    rankBadge = '⭐';
    rankTitle = 'Inseparable friends';
    rankDescription = 'A whole week together! The healthy-care habit has stuck.';
    nextMilestoneDays = 14;
    prevMilestone = 7;
  } else if (diffDays >= 3) {
    rankBadge = '🐾';
    rankTitle = 'Loyal buddies';
    rankDescription = 'You understand each other well and keep your diet on track!';
    nextMilestoneDays = 7;
    prevMilestone = 3;
  }

  const progressToNextMilestone = Math.min(
    100,
    Math.max(10, Math.round(((diffDays - prevMilestone) / (nextMilestoneDays - prevMilestone || 1)) * 100))
  );

  return {
    daysTogether: diffDays,
    daysWord,
    rankBadge,
    rankTitle,
    rankDescription,
    streakText: `${diffDays} ${daysWord} together`,
    nextMilestoneDays,
    progressToNextMilestone,
  };
}



