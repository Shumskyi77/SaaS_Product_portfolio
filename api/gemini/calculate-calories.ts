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
  const { gender, age, height, currentWeight, targetWeight, weeklyGoal, activityLevel, dietType, additionalNotes } = body;

  try {
    const prompt = `You are a highly qualified sports dietitian and nutritionist.
The user asks to jointly calculate a personal daily calorie and macro norm.

User data:
- Gender: ${gender === 'male' ? 'Male' : 'Female'}
- Age: ${age || 25} years
- Height: ${height || 175} cm
- Current weight: ${currentWeight || 70} kg
- Target weight: ${targetWeight || 65} kg
- Activity level: ${activityLevel || 'moderate'}
- Diet type: ${dietType || 'Standard'}
- Additional notes: ${additionalNotes || 'none'}

Tasks:
1. Compute BMR (basal metabolic rate) and TDEE (daily calorie expenditure accounting for activity).
2. Calculate the target calorie norm (recommendedCalories) with a safe deficit for weight loss or surplus for weight gain.
3. Calculate optimal protein (recommendedProtein in grams), fat (recommendedFat in grams), carbs (recommendedCarbs in grams) and water (recommendedWater in ml).
4. Write a friendly, competent and motivating advice explanation (explanation) in English (2-3 sentences) breaking down the calculations.

Return the result STRICTLY as valid JSON (no markdown \`\`\`json tags):
{
  "recommendedCalories": 1850,
  "recommendedProtein": 135,
  "recommendedFat": 60,
  "recommendedCarbs": 190,
  "recommendedWater": 2300,
  "bmr": 1620,
  "tdee": 2200,
  "explanation": "Detailed nutritionist advice..."
}`;

    const response = await generateGeminiContentWithFallback(prompt);
    const raw = response.text || '';
    const parsed = safeParseJSON(raw);
    if (parsed && parsed.recommendedCalories) {
      return res.status(200).json(parsed);
    }
    throw new Error('Invalid JSON received');
  } catch (error) {
    console.warn('Vercel Calculate Calories fallback:', error);
    const isMale = gender === 'male';
    const bmr = isMale
      ? 10 * (currentWeight || 70) + 6.25 * (height || 175) - 5 * (age || 25) + 5
      : 10 * (currentWeight || 60) + 6.25 * (height || 165) - 5 * (age || 25) - 161;
    const tdee = Math.round(bmr * 1.375);
    const recCal = Math.round(tdee - 300);

    return res.status(200).json({
      recommendedCalories: Math.max(1200, recCal),
      recommendedProtein: Math.round((currentWeight || 70) * 1.8),
      recommendedFat: Math.round((currentWeight || 70) * 0.9),
      recommendedCarbs: Math.round((recCal - (currentWeight || 70) * 1.8 * 4 - (currentWeight || 70) * 0.9 * 9) / 4),
      recommendedWater: Math.round((currentWeight || 70) * 33),
      bmr: Math.round(bmr),
      tdee,
      explanation: 'Personal calculation based on the Mifflin-St Jeor formula with a comfortable deficit to reach your goal.',
    });
  }
}
