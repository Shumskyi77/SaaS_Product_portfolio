import { GoogleFitState, GoogleFitDailyData } from '../types/googleFit';
import { requestGoogleFitToken, fetchGoogleFitData, fetchGoogleFitProfile } from './googleFitApi';

const GOOGLE_FIT_STORAGE_KEY = 'nutrimint_google_fit_state_v1';

// Keeps empty data generation for history
export function generateEmptyGoogleFitData(daysCount = 7): GoogleFitDailyData[] {
  const result: GoogleFitDailyData[] = [];
  const today = new Date();

  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    result.push({
      date: dateStr,
      steps: 0,
      stepGoal: 10000,
      distanceKm: 0,
      activeMinutes: 0,
      activeCaloriesBurned: 0,
      heartRateAvg: 0,
      heartRateRest: 0,
      sleepHours: 0,
      sleepMinutes: 0,
      sleepScore: 0,
      deepSleepMinutes: 0,
      remSleepMinutes: 0,
      lightSleepMinutes: 0,
      bedTime: '--:--',
      wakeTime: '--:--',
    });
  }
  return result;
}

export function getStoredGoogleFitState(): GoogleFitState {
  if (typeof window === 'undefined') {
    const history = generateEmptyGoogleFitData(7);
    return {
      isConnected: false,
      todayData: history[history.length - 1],
      history7Days: history,
    };
  }

  try {
    const saved = localStorage.getItem(GOOGLE_FIT_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as GoogleFitState;
      return parsed;
    }
  } catch (e) {
    console.error('Error reading Google Fit state:', e);
  }

  const history = generateEmptyGoogleFitData(7);
  return {
    isConnected: false,
    todayData: history[history.length - 1],
    history7Days: history,
  };
}

export function saveStoredGoogleFitState(state: GoogleFitState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GOOGLE_FIT_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Error saving Google Fit state:', e);
  }
}

export async function connectGoogleFitAccount(userEmail?: string, userName?: string): Promise<GoogleFitState> {
  try {
    // 1. Request access token
    const token = await requestGoogleFitToken();
    
    // 2. Fetch profile info if missing
    let finalEmail = userEmail;
    let finalName = userName;
    if (!finalEmail) {
       const profile = await fetchGoogleFitProfile(token);
       if (profile) {
         finalEmail = profile.email;
         finalName = profile.name;
       }
    }

    // 3. Fetch real Google Fit Data
    const history = await fetchGoogleFitData(token, 7);
    const todayData = history[history.length - 1];

    const newState: GoogleFitState = {
      isConnected: true,
      userEmail: finalEmail || 'user@gmail.com',
      userName: finalName || 'Google User',
      lastSyncedAt: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      todayData,
      history7Days: history,
    };

    saveStoredGoogleFitState(newState);
    return newState;
  } catch (e) {
    console.error('Google Fit Connection Error:', e);
    throw e;
  }
}

export async function disconnectGoogleFitAccount(): Promise<GoogleFitState> {
  const history = generateEmptyGoogleFitData(7);
  const newState: GoogleFitState = {
    isConnected: false,
    todayData: history[history.length - 1],
    history7Days: history,
  };
  saveStoredGoogleFitState(newState);
  return newState;
}

export async function syncGoogleFitData(): Promise<GoogleFitState> {
  const current = getStoredGoogleFitState();
  if (!current.isConnected) return current;

  try {
    // Must re-auth or get a token (initTokenClient handles cached tokens automatically via popup/silent)
    const token = await requestGoogleFitToken();
    const history = await fetchGoogleFitData(token, 7);
    const todayData = history[history.length - 1];

    const updated: GoogleFitState = {
      ...current,
      lastSyncedAt: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      todayData,
      history7Days: history,
    };

    saveStoredGoogleFitState(updated);
    return updated;
  } catch (e) {
    console.error('Google Fit Sync Error:', e);
    // If sync fails, just return current state
    return current;
  }
}
