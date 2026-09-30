import { generateGeminiContentWithFallback } from '../../lib/geminiBackend.js';
import { safeParseJSON } from '../../lib/gemini.js';

export default async function handler(req: any, res: any) {
  // CORS: no credentials (otherwise the browser rejects the response with Origin '*').
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body: any = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch {
    body = {};
  }
  const { workoutQuery, userWeightKg } = body;

  try {
    const prompt = `The user described their workout: "${workoutQuery}".
User weight: ${userWeightKg || 70} kg.
Calculate burned calories.
Return STRICTLY valid JSON without markdown:
{
  "title": "Short workout name in English",
  "durationMinutes": 30,
  "caloriesBurned": 280,
  "summary": "Brief praise and calculation"
}`;

    const response = await generateGeminiContentWithFallback(prompt);
    const raw = response.text || '';
    const parsed = safeParseJSON(raw);
    if (parsed && parsed.title && parsed.caloriesBurned) {
      return res.status(200).json(parsed);
    }
    throw new Error('Invalid JSON received');
  } catch (error) {
    console.warn('Vercel Workout fallback:', error);
    const text = (workoutQuery || '').toLowerCase();
    let duration = 30;
    const durMatch = text.match(/(\d+)\s*(min|mins|minutes|h|hr|hrs|hour|hours)/);
    if (durMatch) {
      const val = parseInt(durMatch[1]);
      if (durMatch[2].startsWith('h')) duration = val * 60;
      else duration = val;
    }

    let burnRatePerMin = 8;
    let title = 'Athletic workout';
    if (text.includes('run') || text.includes('jog')) {
      title = 'Outdoor / treadmill run';
      burnRatePerMin = 10.5;
    } else if (text.includes('strength') || text.includes('gym') || text.includes('lift')) {
      title = 'Gym strength workout';
      burnRatePerMin = 7.5;
    } else if (text.includes('swim') || text.includes('pool')) {
      title = 'Pool swim';
      burnRatePerMin = 9;
    }

    const burned = Math.round(duration * burnRatePerMin * ((userWeightKg || 70) / 70));
    return res.status(200).json({
      title,
      durationMinutes: duration,
      caloriesBurned: burned,
      summary: `Great activity! You burned ~${burned} kcal.`,
    });
  }
}
