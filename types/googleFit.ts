export interface GoogleFitDailyData {
  date: string; // YYYY-MM-DD
  steps: number;
  stepGoal: number;
  distanceKm: number;
  activeMinutes: number;
  activeCaloriesBurned: number;
  heartRateAvg: number;
  heartRateRest: number;
  sleepHours: number;
  sleepMinutes: number;
  sleepScore: number; // 0 - 100%
  deepSleepMinutes: number;
  remSleepMinutes: number;
  lightSleepMinutes: number;
  bedTime: string; // e.g. "23:15"
  wakeTime: string; // e.g. "07:30"
}

export interface GoogleFitState {
  isConnected: boolean;
  userEmail?: string;
  userName?: string;
  lastSyncedAt?: string;
  accessToken?: string;
  todayData: GoogleFitDailyData;
  history7Days: GoogleFitDailyData[];
}
