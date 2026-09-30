// Dynamic Streak Engine for Daily Meal Logging
import { getAllStoredMealLogs, getStoredMealLogs } from './store';
import { MealLog } from '../types/meal';

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  isLoggedToday: boolean;
  totalLoggedDays: number;
  loggedDates: Set<string>;
  weeklyDays: {
    date: string;
    dayLabel: string;
    dayNumber: number;
    isLogged: boolean;
    isToday: boolean;
    isFuture: boolean;
  }[];
  nextMilestone: number;
  milestoneProgressPercent: number;
  streakStatusMessage: string;
}

export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function calculateUserStreak(allMeals?: MealLog[]): StreakInfo {
  const isMockMeal = (id: string) => /^meal_[A-Za-z0-9]{6}_\d{4}-\d{2}-\d{2}_\d{4}$/.test(id || '');

  // Collect all unique dates with real logged meals
  const loggedDates = new Set<string>();

  const mealsToScan = allMeals && allMeals.length > 0 ? allMeals : getAllStoredMealLogs();
  if (mealsToScan && mealsToScan.length > 0) {
    mealsToScan.forEach((m) => {
      if (m && m.date && !m.id?.startsWith('m_seed_') && !isMockMeal(m.id)) {
        loggedDates.add(m.date.slice(0, 10));
      }
    });
  } else {
    // Fallback: check past 180 days from localStorage
    const now = new Date();
    for (let i = 0; i < 180; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = getLocalDateString(d);
      const logs = getStoredMealLogs(dateStr);
      if (logs && logs.length > 0) {
        const valid = logs.filter((l) => l && !l.id?.startsWith('m_seed_') && !isMockMeal(l.id));
        if (valid.length > 0) {
          loggedDates.add(dateStr);
        }
      }
    }
  }

  const todayStr = getLocalDateString(new Date());
  const isLoggedToday = loggedDates.has(todayStr);

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterday);
  const isLoggedYesterday = loggedDates.has(yesterdayStr);

  // Calculate current streak
  let currentStreak = 0;

  if (isLoggedToday || isLoggedYesterday) {
    const checkDate = new Date();
    // If today is not logged, start checking consecutively backwards from yesterday
    if (!isLoggedToday) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    while (true) {
      const dateStr = getLocalDateString(checkDate);
      if (loggedDates.has(dateStr)) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
  }

  // Calculate longest streak by scanning sorted dates
  const sortedDates = Array.from(loggedDates).sort();
  let longestStreak = currentStreak;
  let runningStreak = 0;
  let prevDate: Date | null = null;

  for (const ds of sortedDates) {
    const [y, m, d] = ds.split('-').map(Number);
    const curr = new Date(y, m - 1, d);

    if (prevDate) {
      const diffMs = curr.getTime() - prevDate.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        runningStreak++;
      } else {
        runningStreak = 1;
      }
    } else {
      runningStreak = 1;
    }

    if (runningStreak > longestStreak) {
      longestStreak = runningStreak;
    }
    prevDate = curr;
  }

  // Weekly calendar bar (Monday - Sunday)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 is Sunday, 1 is Monday...
  const distanceToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const monday = new Date(now);
  monday.setDate(now.getDate() - distanceToMonday);

  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weeklyDays = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = getLocalDateString(d);
    const isToday = dateStr === todayStr;
    const isFuture = d > now && !isToday;
    const isLogged = loggedDates.has(dateStr);

    weeklyDays.push({
      date: dateStr,
      dayLabel: dayLabels[i],
      dayNumber: d.getDate(),
      isLogged,
      isToday,
      isFuture,
    });
  }

  // Milestones
  const milestones = [3, 7, 14, 21, 30, 60, 100, 365];
  const nextMilestone = milestones.find((m) => m > currentStreak) || currentStreak + 10;
  const prevMilestone = milestones.slice().reverse().find((m) => m <= currentStreak) || 0;
  
  const milestoneSpan = nextMilestone - prevMilestone;
  const milestoneCurrent = currentStreak - prevMilestone;
  const milestoneProgressPercent = Math.min(100, Math.max(0, Math.round((milestoneCurrent / Math.max(1, milestoneSpan)) * 100)));

  let streakStatusMessage = '';
  if (currentStreak === 0) {
    streakStatusMessage = 'Log any dish today to light up your streak!';
  } else if (isLoggedToday) {
    streakStatusMessage = `🔥 Streak burning! You've kept a ${currentStreak} ${getDaysWord(currentStreak)} streak!`;
  } else {
    streakStatusMessage = `⚠️ Log a dish today to keep your ${currentStreak} ${getDaysWord(currentStreak)} streak!`;
  }

  return {
    currentStreak,
    longestStreak,
    isLoggedToday,
    totalLoggedDays: loggedDates.size,
    loggedDates,
    weeklyDays,
    nextMilestone,
    milestoneProgressPercent,
    streakStatusMessage,
  };
}

function getDaysWord(num: number): string {
  const n = Math.abs(num);
  if (n === 1) return 'day';
  return 'days';
}
