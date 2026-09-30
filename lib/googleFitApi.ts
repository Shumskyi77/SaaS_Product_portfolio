import { GoogleFitDailyData } from '../types/googleFit';
import { generateEmptyGoogleFitData } from './googleFit';

const SCOPES = 'https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/fitness.sleep.read https://www.googleapis.com/auth/fitness.heart_rate.read https://www.googleapis.com/auth/fitness.body.read';

export async function requestGoogleFitToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const win = typeof window !== 'undefined' ? (window as any) : null;
    if (!win || !win.google?.accounts) {
      return reject(new Error('Google Identity Services not loaded'));
    }

    // Google OAuth Client ID: same one configured for Supabase Auth (Google provider).
    // Set via VITE_GOOGLE_CLIENT_ID in .env.local
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

    const client = win.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (response: any) => {
        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response.access_token);
        }
      },
      error_callback: (error: any) => {
        reject(error);
      }
    });

    client.requestAccessToken();
  });
}

export async function fetchGoogleFitProfile(accessToken: string) {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return await res.json();
  } catch (e) {
    console.error('Error fetching profile:', e);
    return null;
  }
}

export async function fetchGoogleFitData(accessToken: string, daysCount = 7): Promise<GoogleFitDailyData[]> {
  const result = generateEmptyGoogleFitData(daysCount);
  const now = new Date();
  
  // Set end time to end of today, start time to start of daysCount days ago
  const endTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysCount + 1, 0, 0, 0, 0);

  const aggregateRequest = {
    aggregateBy: [
      { dataTypeName: 'com.google.step_count.delta' },
      { dataTypeName: 'com.google.calories.expended' },
      { dataTypeName: 'com.google.heart_rate.bpm' },
      { dataTypeName: 'com.google.distance.delta' },
      { dataTypeName: 'com.google.active_minutes' },
    ],
    bucketByTime: { durationMillis: 86400000 },
    startTimeMillis: startTime.getTime(),
    endTimeMillis: endTime.getTime(),
  };

  try {
    const res = await fetch('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(aggregateRequest)
    });

    if (res.ok) {
      const data = await res.json();
      if (data.bucket) {
        data.bucket.forEach((bucket: any, index: number) => {
          if (index < result.length) {
            // Reverse index because result has latest at the end (idx = daysCount-1)
            // bucket is chronological: index 0 is oldest.
            // result is chronological: index 0 is oldest.
            const target = result[index];
            
            bucket.dataset.forEach((dataset: any) => {
              if (dataset.point && dataset.point.length > 0) {
                const point = dataset.point[0];
                const value = point.value[0];
                
                if (dataset.dataSourceId.includes('step_count')) {
                  target.steps = value.intVal || 0;
                  target.distanceKm = Number(((target.steps * 0.75) / 1000).toFixed(2));
                }
                if (dataset.dataSourceId.includes('calories.expended')) {
                  target.activeCaloriesBurned = Math.round(value.fpVal || 0);
                }
                if (dataset.dataSourceId.includes('heart_rate')) {
                  // Usually avg, max, min
                  target.heartRateAvg = Math.round(value.fpVal || 0);
                  if (point.value.length > 2) {
                     target.heartRateRest = Math.round(point.value[2].fpVal || 0);
                  }
                }
                if (dataset.dataSourceId.includes('distance.delta')) {
                   target.distanceKm = Number(((value.fpVal || 0) / 1000).toFixed(2));
                }
                if (dataset.dataSourceId.includes('active_minutes')) {
                   target.activeMinutes = value.intVal || 0;
                }
              }
            });
          }
        });
      }
    }
    
    // Fallback: If no real step data, at least we won't crash
  } catch (e) {
    console.error('Error fetching Fit aggregated data:', e);
  }

  // Next, fetch sleep data using Sessions API
  try {
    const sleepRes = await fetch(`https://www.googleapis.com/fitness/v1/users/me/sessions?startTime=${startTime.toISOString()}&endTime=${endTime.toISOString()}&activityType=72`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (sleepRes.ok) {
      const sleepData = await sleepRes.json();
      if (sleepData.session) {
        // Simple heuristic: Map session to the day it ended on
        sleepData.session.forEach((session: any) => {
          const end = new Date(parseInt(session.endTimeMillis));
          const dateStr = end.toISOString().split('T')[0];
          
          const target = result.find(r => r.date === dateStr);
          if (target) {
            const durationMin = Math.round((parseInt(session.endTimeMillis) - parseInt(session.startTimeMillis)) / 60000);
            target.sleepHours = Math.floor(durationMin / 60);
            target.sleepMinutes = durationMin % 60;
            target.deepSleepMinutes = Math.round(durationMin * 0.22);
            target.remSleepMinutes = Math.round(durationMin * 0.24);
            target.lightSleepMinutes = durationMin - target.deepSleepMinutes - target.remSleepMinutes;
            target.sleepScore = Math.min(98, Math.max(68, Math.round(75 + (durationMin / 480) * 20)));
            target.bedTime = new Date(parseInt(session.startTimeMillis)).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            target.wakeTime = new Date(parseInt(session.endTimeMillis)).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          }
        });
      }
    }
  } catch (e) {
    console.error('Error fetching sleep data:', e);
  }

  return result;
}
