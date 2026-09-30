/// <reference types="vite/client" />

import { calculateRealFoodNutrition } from './nutritionEngine.js';

export interface AnalyzedFoodResult {
  title: string;
  portionGrams: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  confidence: number;
  ingredients: string[];
  aiAnalysis: string;
}

export interface ProfileGoalsAIResult {
  recommendedCalories: number;
  recommendedProtein: number;
  recommendedFat: number;
  recommendedCarbs: number;
  recommendedWater: number;
  bmr: number;
  tdee: number;
  explanation: string;
}

// Active supported models in Google Gemini API
const GEMINI_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.7-flash',
];

/**
 * Universal safe JSON parser that handles code fences, raw responses, trailing commas, and unquoted keys.
 * Never throws an uncaught error in Safari or other browsers.
 */
export function safeParseJSON<T = any>(rawText: any, fallback?: T): T {
  if (!rawText) return (fallback as T);
  if (typeof rawText === 'object') return rawText as T;
  if (typeof rawText !== 'string') return (fallback as T);

  const text = rawText.trim();
  if (!text) return (fallback as T);

  // 1. Direct standard parse
  try {
    return JSON.parse(text);
  } catch {
    // Continue
  }

  // 2. Strip Markdown code fences ```json ... ```
  let cleaned = text
    .replace(/```json/gi, '')
    .replace(/```javascript/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue
  }

  // 3. Extract JSON object {...} or array [...]
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  } else if (firstBracket !== -1 && lastBracket > firstBracket) {
    cleaned = cleaned.slice(firstBracket, lastBracket + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue
  }

  // 4. Sanitize JavaScript-like object format (unquoted keys, single quotes, trailing commas)
  try {
    const sanitized = cleaned
      // Quote unquoted object keys (e.g. title: -> "title":)
      .replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":')
      // Convert single-quoted string values to double quotes
      .replace(/:\s*'([^']*)'/g, ': "$1"')
      // Remove trailing commas in objects or arrays
      .replace(/,\s*([}\]])/g, '$1');

    return JSON.parse(sanitized);
  } catch (err) {
    console.warn('safeParseJSON failed to parse text:', text.slice(0, 80));
  }

  return (fallback as T);
}

/**
 * Get Gemini API Key safely across Vite SPA, Vercel, Node, and browser environments
 */
export function getClientGeminiApiKey(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    if (import.meta.env.VITE_GEMINI_API_KEY) return String(import.meta.env.VITE_GEMINI_API_KEY).trim();
    if (import.meta.env.VITE_API_KEY) return String(import.meta.env.VITE_API_KEY).trim();
  }
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.VITE_GEMINI_API_KEY) return String(process.env.VITE_GEMINI_API_KEY).trim();
    if (process.env.GEMINI_API_KEY) return String(process.env.GEMINI_API_KEY).trim();
    if (process.env.API_KEY) return String(process.env.API_KEY).trim();
  }
  if (typeof window !== 'undefined') {
    try {
      const customKey = localStorage.getItem('user_custom_gemini_api_key');
      if (customKey) return customKey.trim();
    } catch {
      // ignore
    }
  }
  return '';
}

/**
 * Direct REST API request to Google Gemini API (100% Safari & browser compatible)
 */
async function callGeminiRestAPI(contents: any[], systemPrompt?: string, formatJson = true): Promise<string> {
  const apiKey = getClientGeminiApiKey();
  if (!apiKey) {
    throw new Error('NO_API_KEY');
  }

  let lastErr: any = null;

  for (const model of GEMINI_MODELS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const bodyPayload: any = {
        contents,
        generationConfig: {
          temperature: formatJson ? 0.2 : 0.4,
          maxOutputTokens: 1024,
        },
      };

      if (formatJson) {
        bodyPayload.generationConfig.responseMimeType = 'application/json';
      }

      if (systemPrompt) {
        bodyPayload.systemInstruction = {
          parts: [{ text: systemPrompt }],
        };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorText = await res.text();
        console.warn(`Gemini model ${model} HTTP ${res.status}:`, errorText.slice(0, 100));
        lastErr = new Error(`HTTP ${res.status}: ${errorText.slice(0, 80)}`);
        continue;
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text && typeof text === 'string') {
        return text;
      }
    } catch (err: any) {
      lastErr = err;
      console.warn(`Direct Gemini model ${model} attempt failed:`, err?.message || err);
    }
  }

  throw lastErr || new Error('All direct Gemini REST models failed');
}

/**
 * High-accuracy AI Food Analyzer:
 * 1. Direct REST call to Gemini 2.5/3.7 Flash with base64 and prompts
 * 2. Backend endpoint /api/gemini/analyze-food (if running with server)
 * 3. Fallback deterministic English culinary nutrition engine
 */
export async function analyzeFoodWithAI(
  base64OrUrl?: string,
  userHint?: string,
  visualHint?: string,
  userRemarks?: string
): Promise<AnalyzedFoodResult> {
  const combinedUserRemarks = [userRemarks, userHint].filter(Boolean).join('. ');

  // 1. Server API (/api/gemini/analyze-food) - Recommended full-stack path
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35000);

    const res = await fetch('/api/gemini/analyze-food', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64Image: base64OrUrl,
        userHint: userHint || '',
        userRemarks: userRemarks || '',
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (data && data.title && data.calories !== undefined) {
        const portionGrams = Math.max(10, Math.round(Number(data.portionGrams) || 200));
        const calories = Math.max(10, Math.round(Number(data.calories) || 250));
        const protein = Math.max(0, Math.round((Number(data.protein) || 0) * 10) / 10);
        const fat = Math.max(0, Math.round((Number(data.fat) || 0) * 10) / 10);
        const carbs = Math.max(0, Math.round((Number(data.carbs) || 0) * 10) / 10);
        const fiber = Math.max(0, Math.round((Number(data.fiber) || 0) * 10) / 10);

        return {
          title: String(data.title).trim(),
          portionGrams,
          calories,
          protein,
          fat,
          carbs,
          fiber,
          confidence: Math.min(99, Math.max(80, Math.round(Number(data.confidence) || 97))),
          ingredients: Array.isArray(data.ingredients) && data.ingredients.length > 0 ? data.ingredients : [String(data.title).trim()],
          aiAnalysis: data.aiAnalysis || 'Recognized with Foodvisor AI',
        };
      }
    }
  } catch (err) {
    console.warn('Server analyze-food fetch error, trying client/local fallback:', err);
  }

  // 2. Direct client Gemini API if key is available
  const apiKey = getClientGeminiApiKey();
  if (apiKey) {
    try {
      const parts: any[] = [];
      let hasImage = false;

      if (base64OrUrl && base64OrUrl.startsWith('data:')) {
        let mimeType = 'image/jpeg';
        if (base64OrUrl.startsWith('data:image/png')) mimeType = 'image/png';
        else if (base64OrUrl.startsWith('data:image/webp')) mimeType = 'image/webp';

        const cleanBase64 = base64OrUrl.replace(/^data:image\/\w+;base64,/, '');
        if (cleanBase64.length > 20) {
          parts.push({
            inline_data: {
              mime_type: mimeType,
              data: cleanBase64,
            },
          });
          hasImage = true;
        }
      }

      const promptText = `You are an expert AI dietitian and nutritionist for the Foodvisor app.
Your task is to with maximum accuracy ${hasImage ? 'recognize the dish in the photo' : 'identify the dish from the description'}, estimate its weight in grams and calculate calories and macros.
${combinedUserRemarks ? `User notes: "${combinedUserRemarks}". ALWAYS take them into account when calculating portion weight and nutrition.` : ''}

Return STRICTLY valid JSON:
{
  "title": "Dish name in English",
  "portionGrams": 220,
  "calories": 340,
  "protein": 22,
  "fat": 18,
  "carbs": 24,
  "fiber": 3,
  "ingredients": ["Ingredient 1", "Ingredient 2"],
  "aiAnalysis": "Brief nutritionist comment on benefits",
  "confidence": 97
}`;
      parts.push({ text: promptText });

      const rawText = await callGeminiRestAPI([{ parts }], undefined, true);
      const parsed = safeParseJSON(rawText);
      if (parsed && parsed.title && parsed.calories !== undefined) {
        return {
          title: String(parsed.title).trim(),
          portionGrams: Math.max(10, Math.round(Number(parsed.portionGrams) || 200)),
          calories: Math.max(10, Math.round(Number(parsed.calories) || 250)),
          protein: Math.max(0, Math.round((Number(parsed.protein) || 0) * 10) / 10),
          fat: Math.max(0, Math.round((Number(parsed.fat) || 0) * 10) / 10),
          carbs: Math.max(0, Math.round((Number(parsed.carbs) || 0) * 10) / 10),
          fiber: Math.max(0, Math.round((Number(parsed.fiber) || 0) * 10) / 10),
          confidence: Math.min(99, Math.max(80, Math.round(Number(parsed.confidence) || 97))),
          ingredients: Array.isArray(parsed.ingredients) && parsed.ingredients.length > 0 ? parsed.ingredients : [String(parsed.title).trim()],
          aiAnalysis: parsed.aiAnalysis || 'Recognized with Gemini AI',
        };
      }
    } catch (err: any) {
      console.warn('Direct Gemini analyzeFood failed:', err?.message || err);
    }
  }

  // 3. Fast High-Precision Local Nutrition Engine fallback (Zero Latency)
  const computed = calculateRealFoodNutrition(userRemarks || userHint || 'Dish from photo', visualHint);
  return {
    ...computed,
    ingredients: [computed.title],
    aiAnalysis: 'Estimated with the Foodvisor nutritional value cooking algorithm',
  };
}

/**
 * Analyze fridge photo
 */
export async function analyzeFridgePhoto(base64Image: string): Promise<string[]> {
  let mimeType = 'image/jpeg';
  if (base64Image.startsWith('data:image/png')) mimeType = 'image/png';
  const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');

  const parts = [
    {
      inline_data: {
        mime_type: mimeType,
        data: cleanBase64,
      },
    },
    {
      text: 'List 5-8 main products visible in the fridge/in the photo, in English, STRICTLY as a JSON string array: ["Chicken fillet", "Fresh tomatoes", "Hard cheese"]',
    },
  ];

  try {
    const rawText = await callGeminiRestAPI([{ parts }], undefined, true);
    const parsed = safeParseJSON(rawText);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (err: any) {
    if (err?.message !== 'NO_API_KEY') {
      console.warn('Direct Gemini fridge analyze failed:', err?.message || err);
    }
  }

  try {
    const res = await fetch('/api/gemini/analyze-fridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Image }),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.ingredients) && data.ingredients.length > 0) {
        return data.ingredients;
      }
    }
  } catch {
    // ignore
  }

  return ['Chicken fillet', 'Fresh tomatoes', 'Hard cheese', 'Chicken eggs', 'Bell pepper', 'Greens'];
}

/**
 * Generate Recipe with AI
 */
export async function generateRecipeWithAI(params: {
  category: string;
  maxCalories: number;
  ingredients?: string;
  fridgeImageBase64?: string;
}): Promise<any> {
  const prompt = `Create a balanced recipe for a "${params.category}" dish up to ${params.maxCalories} kcal from ingredients: "${params.ingredients || 'any healthy foods'}".
Return STRICTLY valid JSON:
{
  "title": "Recipe name",
  "description": "Brief description",
  "prepTimeMinutes": 10,
  "cookTimeMinutes": 15,
  "servings": 1,
  "calories": 420,
  "protein": 32,
  "fat": 14,
  "carbs": 26,
  "fiber": 5,
  "tags": ["AI Recipe", "${params.category}"],
  "imageUrl": "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80",
  "ingredients": [{"name": "Product", "amount": "100g", "calories": 120}],
  "instructions": ["Step 1", "Step 2", "Step 3"]
}`;

  try {
    const rawText = await callGeminiRestAPI([{ parts: [{ text: prompt }] }], undefined, true);
    const parsed = safeParseJSON(rawText);
    if (parsed && parsed.title) {
      return parsed;
    }
  } catch (err: any) {
    if (err?.message !== 'NO_API_KEY') {
      console.warn('Direct Gemini generateRecipe failed:', err?.message || err);
    }
  }

  try {
    const res = await fetch('/api/gemini/generate-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.title) {
        return data;
      }
    }
  } catch {
    // ignore
  }

  const ingList = params.ingredients
    ? params.ingredients.split(',').map((s) => s.trim())
    : ['Chicken breast', 'Tomatoes', 'Cheese', 'Vegetables'];

  return {
    title: `${params.category}: Signature mix with ${ingList[0] || 'ingredients'}`,
    description: `A balanced healthy dish from your ingredients (${ingList.join(', ')}).`,
    prepTimeMinutes: 10,
    cookTimeMinutes: 15,
    servings: 1,
    calories: Math.min(params.maxCalories, 440),
    protein: 34,
    fat: 14,
    carbs: 28,
    fiber: 6,
    tags: ['AI Recipe', 'From the fridge', params.category],
    imageUrl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80',
    ingredients: ingList.map((ing) => ({
      name: ing,
      amount: '120 g',
      calories: 110,
    })),
    instructions: [
      'Prepare and rinse all fresh ingredients.',
      'Slice the protein and vegetables into even pieces.',
      'Saute in a pan with a drop of olive oil for 8-10 minutes until done.',
      'Serve hot, sprinkled with fresh herbs and spices.',
    ],
  };
}

/**
 * Calculate burned calories for a workout
 */
export async function calculateWorkoutCaloriesWithAI(
  workoutQuery: string,
  userWeightKg: number = 75
): Promise<{ title: string; durationMinutes: number; caloriesBurned: number; summary: string }> {
  const prompt = `The user described their workout: "${workoutQuery}". User weight: ${userWeightKg} kg.
Calculate burned calories.
Return STRICTLY valid JSON:
{
  "title": "Workout name in English",
  "durationMinutes": 30,
  "caloriesBurned": 280,
  "summary": "Brief praise and workout fact"
}`;

  try {
    const rawText = await callGeminiRestAPI([{ parts: [{ text: prompt }] }], undefined, true);
    const parsed = safeParseJSON(rawText);
    if (parsed && parsed.title && parsed.caloriesBurned) {
      return parsed;
    }
  } catch (err: any) {
    if (err?.message !== 'NO_API_KEY') {
      console.warn('Direct Gemini workout calculation failed:', err?.message || err);
    }
  }

  try {
    const res = await fetch('/api/gemini/workout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workoutQuery, userWeightKg }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.title && data.caloriesBurned) {
        return data;
      }
    }
  } catch {
    // ignore
  }

  const text = workoutQuery.toLowerCase();
  let duration = 30;
  const durMatch = text.match(/(\d+)\s*(min|mins|minutes|h|hr|hours)/);
  if (durMatch) {
    const val = parseInt(durMatch[1]);
    if (durMatch[2].startsWith('h')) duration = val * 60;
    else duration = val;
  }

  let burnRatePerMin = 8;
  let title = 'Sports workout';
  if (text.includes('run') || text.includes('jog')) {
    title = 'Outdoor / treadmill run';
    burnRatePerMin = 10.5;
  } else if (text.includes('strength') || text.includes('gym') || text.includes('dumbbell') || text.includes('weight')) {
    title = 'Gym strength workout';
    burnRatePerMin = 7.5;
  } else if (text.includes('swim') || text.includes('pool')) {
    title = 'Swimming in the pool';
    burnRatePerMin = 9;
  } else if (text.includes('walk') || text.includes('step')) {
    title = 'Brisk walk';
    burnRatePerMin = 4.5;
  } else if (text.includes('bike') || text.includes('cycling') || text.includes('bicycle')) {
    title = 'Cycling';
    burnRatePerMin = 8.5;
  }

  const burned = Math.round(duration * burnRatePerMin * (userWeightKg / 70));

  return {
    title,
    durationMinutes: duration,
    caloriesBurned: burned,
    summary: `Great job! In ${duration} min you burned ~${burned} kcal.`,
  };
}

/**
 * Calculate user profile goals with AI
 */
export async function calculateUserProfileGoalsWithAI(params: {
  gender: string;
  age: number;
  height: number;
  currentWeight: number;
  targetWeight: number;
  weeklyGoal: number;
  activityLevel: string;
  dietType: string;
  additionalNotes?: string;
}): Promise<ProfileGoalsAIResult> {
  const isMale = params.gender === 'male';
  const bmr = isMale
    ? 10 * params.currentWeight + 6.25 * params.height - 5 * params.age + 5
    : 10 * params.currentWeight + 6.25 * params.height - 5 * params.age - 161;

  let activityMultiplier = 1.375;
  if (params.activityLevel === 'sedentary') activityMultiplier = 1.2;
  else if (params.activityLevel === 'active') activityMultiplier = 1.55;
  else if (params.activityLevel === 'very_active') activityMultiplier = 1.725;

  const tdee = Math.round(bmr * activityMultiplier);
  const diff = params.targetWeight - params.currentWeight;
  let recCal = tdee;

  if (diff < -1) {
    recCal = Math.round(tdee - 400);
  } else if (diff > 1) {
    recCal = Math.round(tdee + 300);
  }

  const recProt = Math.round(params.currentWeight * 1.8);
  const recFat = Math.round(params.currentWeight * 0.9);
  const recCarbs = Math.round((recCal - recProt * 4 - recFat * 9) / 4);
  const recWater = Math.round(params.currentWeight * 33);

  const fallback: ProfileGoalsAIResult = {
    recommendedCalories: Math.max(1200, recCal),
    recommendedProtein: recProt,
    recommendedFat: recFat,
    recommendedCarbs: Math.max(50, recCarbs),
    recommendedWater: recWater,
    bmr: Math.round(bmr),
    tdee,
    explanation:
      'Personal calculation based on the clinical Mifflin-St Jeor formula with a comfortable deficit to reach your goal.',
  };

  const prompt = `You are a sports dietitian. Calculate personalized daily calorie and macro targets:
- Gender: ${isMale ? 'Male' : 'Female'}, Age: ${params.age}, Height: ${params.height} cm, Weight: ${params.currentWeight} kg, Goal: ${params.targetWeight} kg
- Diet: ${params.dietType}, Activity: ${params.activityLevel}, Notes: ${params.additionalNotes || 'none'}

Return STRICTLY valid JSON:
{
  "recommendedCalories": 1850,
  "recommendedProtein": 135,
  "recommendedFat": 60,
  "recommendedCarbs": 190,
  "recommendedWater": 2300,
  "bmr": 1620,
  "tdee": 2200,
  "explanation": "Nutritionist advice..."
}`;

  try {
    const rawText = await callGeminiRestAPI([{ parts: [{ text: prompt }] }], undefined, true);
    const parsed = safeParseJSON(rawText);
    if (parsed && parsed.recommendedCalories) {
      return {
        recommendedCalories: Number(parsed.recommendedCalories) || fallback.recommendedCalories,
        recommendedProtein: Number(parsed.recommendedProtein) || fallback.recommendedProtein,
        recommendedFat: Number(parsed.recommendedFat) || fallback.recommendedFat,
        recommendedCarbs: Number(parsed.recommendedCarbs) || fallback.recommendedCarbs,
        recommendedWater: Number(parsed.recommendedWater) || fallback.recommendedWater,
        bmr: Number(parsed.bmr) || fallback.bmr,
        tdee: Number(parsed.tdee) || fallback.tdee,
        explanation: parsed.explanation || fallback.explanation,
      };
    }
  } catch (err: any) {
    if (err?.message !== 'NO_API_KEY') {
      console.warn('Direct Gemini calculateUserProfileGoals failed:', err?.message || err);
    }
  }

  try {
    const res = await fetch('/api/gemini/calculate-calories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.recommendedCalories) {
        return data;
      }
    }
  } catch {
    // ignore
  }

  return fallback;
}

export interface NutritionistChatContext {
  userMessage: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  userProfile: {
    name?: string;
    height: number;
    currentWeight: number;
    targetWeight: number;
    age?: number;
    gender?: string;
    targetCalories: number;
    targetProtein: number;
    targetFat: number;
    targetCarbs: number;
    targetWater: number;
  };
  dailySummary: {
    totalCalories: number;
    totalProtein: number;
    totalFat: number;
    totalCarbs: number;
    mealsCount: number;
    mealListString: string;
    waterIntake: number;
    totalBurned?: number;
    effectiveTarget?: number;
    workoutListString?: string;
  };
}

function generateLocalCoachAdvice(context: NutritionistChatContext): string {
  const { userMessage, userProfile, dailySummary } = context;
  const name = userProfile?.name || 'Friend';
  const eaten = dailySummary?.totalCalories || 0;
  const baseTarget = userProfile?.targetCalories || 2000;
  const burned = dailySummary?.totalBurned || 0;
  const effectiveTarget = dailySummary?.effectiveTarget || baseTarget + burned;
  const remaining = Math.max(0, effectiveTarget - eaten);
  const protein = dailySummary?.totalProtein || 0;
  const targetProtein = userProfile?.targetProtein || 140;
  const water = dailySummary?.waterIntake || 0;
  const targetWater = userProfile?.targetWater || 2000;

  const q = userMessage.toLowerCase().trim();

  if (q.includes('hello') || q.includes('hi') || q.includes('hey') || q.includes('good')) {
    return `Hello, ${name}! 🥗\n\nI'm your personal AI coach and nutritionist. I track your food diary, calorie balance and workouts.\n\n• Eaten today: **${eaten} of ${effectiveTarget} kcal** (left **${remaining} kcal**).\n• Water: **${water} / ${targetWater} ml**.\n\nAsk any question about diet, recipes or workouts! 💪`;
  }

  if (q.includes('calor') || q.includes('norm') || q.includes('limit') || q.includes('how much') || q.includes('balance') || q.includes('target')) {
    let advice = `📊 **Your balance for today:**\n• Consumed: **${eaten} kcal**\n• Burned via activity: **+${burned} kcal**\n• Total daily limit: **${effectiveTarget} kcal**\n• Left for today: **${remaining} kcal**\n• Protein: **${protein}g** / ${targetProtein}g\n\n`;
    if (remaining > 400) {
      advice += `💡 *Tip:* You have a great calorie buffer! For a full meal go for protein foods (fish, poultry, eggs, tofu) with slow carbs and fresh greens.`;
    } else if (remaining > 50) {
      advice += `💡 *Tip:* You are almost at your goal. If still hungry — go for a light snack: cottage cheese, cucumber, Greek yogurt or a handful of berries.`;
    } else {
      advice += `💡 *Tip:* You've hit your daily calorie target. Drink more clean water and let your body rest! 💧`;
    }
    return advice;
  }

  if (q.includes('dinner') || q.includes('evening') || q.includes('supper')) {
    return `🌙 **Dinner tips:**\nRemaining daily allowance: **${remaining} kcal**.\n\nIdeal balanced dinner:\n1. **Protein (light):** Salmon steak, white fish or baked chicken fillet (~160g).\n2. **Veggies & Fiber:** Cucumber, tomato and spinach salad with a spoon of olive oil (~200g).\n3. **Carbs:** A small portion of buckwheat or stewed zucchini (~80g).\n\nSuch dinner won't overload digestion and ensures quality sleep! 🥑`;
  }

  if (q.includes('lunch') || q.includes('midday')) {
    return `☀️ **Lunch tips:**\nRemaining calories: **${remaining} kcal**.\n\nFor a filling, energetic day I recommend:\n• **Protein:** Grilled turkey breast / beef steak (180g).\n• **Complex carbs:** Quinoa, brown rice or whole-grain pasta (150g).\n• **Veggies:** Fresh salad with feta or stewed vegetables (150g).\n\nThis gives energy for the whole day without drowsiness! 🥗`;
  }

  if (q.includes('breakfast') || q.includes('morning')) {
    return `🍳 **Breakfast tips:**\nFor a great metabolic start:\n• **Option 1:** Fluffy 3-egg omelet with spinach, tomatoes and whole-grain avocado toast (~380 kcal).\n• **Option 2:** Cottage cheese 5% with berries, a spoon of honey and nuts (~320 kcal).\n• **Option 3:** Oatmeal with milk, apple and cinnamon (~310 kcal).\n\nBe sure to drink a glass of clean water before eating! 💧`;
  }

  if (q.includes('protein')) {
    const deficit = Math.max(0, targetProtein - protein);
    return `🥚 **Protein analysis:**\n• Eaten today: **${protein}g**\n• Your target: **${targetProtein}g**\n• ${deficit > 0 ? `Left to get: **${deficit}g**` : 'Protein target fully completed! 🎉'}\n\nBest quality protein sources:\n- Chicken fillet / turkey (~31g protein per 100g)\n- Salmon / tuna (~22-25g protein)\n- Chicken eggs (~13g protein per 2 pcs)\n- Cottage cheese 5% (~16g protein per 100g)\n- Protein shake or Greek yogurt.`;
  }

  if (q.includes('water') || q.includes('drink') || q.includes('hydrat')) {
    return `💧 **Water balance:**\n• Drunk today: **${water} ml** of **${targetWater} ml** target.\n\nDrink water evenly in small portions throughout the day. It speeds up metabolism, improves digestion and reduces false hunger!`;
  }

  if (q.includes('lose weight') || q.includes('weight loss') || q.includes('deficit') || q.includes('weight')) {
    return `🎯 **Weight-loss strategy:**\nYour current weight: **${userProfile.currentWeight} kg**, goal: **${userProfile.targetWeight} kg**.\n\n3 golden rules:\n1. **Moderate deficit:** Stay within **${effectiveTarget} kcal/day** without harsh starvation.\n2. **Enough protein:** At least **${targetProtein}g/day** to protect muscle mass.\n3. **Activity:** 8-10k steps a day or 3 workouts a week boost calorie burn and speed up results! 🔥`;
  }

  return `Hello, ${name}! 🥗\n\nI analyzed your food diary:\n• Eaten: **${eaten} / ${effectiveTarget} kcal** (left: **${remaining} kcal**).\n• Workouts: ${burned > 0 ? `+${burned} kcal burned` : 'no activity logged yet'}.\n• Protein: **${protein}g** of **${targetProtein}g**.\n\nYou are on the right track! Ask any question — I'm ready to help with dish choices, macro math or workout plans. ✨`;
}

/**
 * Ask AI Nutritionist Coach
 */
export async function askNutritionistWithAI(context: NutritionistChatContext): Promise<string> {
  const systemPrompt = `You are an erudite, certified AI Coach-Nutritionist for the NutriMint app (a Foodvisor analogue).
Your task is to give personal recommendations to the user, referencing their REAL profile, today's food diary data and the FULL CHAT HISTORY IN THIS DIALOG.

User profile: ${JSON.stringify(context.userProfile)}
Today summary: ${JSON.stringify(context.dailySummary)}

Instructions:
- Answer politely, motivationally, professionally and to the point in English.
- Use emojis for accents (🥗, 🥑, 💪, 🔥, 💧).
- Use concrete numbers from the profile and food diary.
- Carefully remember and consider the context of previous messages in this chat.
- Answer length: 1-3 short paragraphs.`;

  try {
    // Build multi-turn contents array with proper role alternating
    const contents: any[] = [];
    if (context.history && context.history.length > 0) {
      context.history.forEach((h, idx) => {
        // Skip first welcoming assistant message if it's at index 0 to ensure valid user-first turn
        if (idx === 0 && h.role === 'assistant') return;
        contents.push({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.content }],
        });
      });
    }

    contents.push({
      role: 'user',
      parts: [{ text: context.userMessage }],
    });

    const rawText = await callGeminiRestAPI(contents, systemPrompt, false);
    if (rawText && rawText.trim()) {
      return rawText.trim();
    }
  } catch (err: any) {
    if (err?.message !== 'NO_API_KEY') {
      console.warn('Direct Gemini coach chat failed:', err?.message || err);
    }
  }

  try {
    const res = await fetch('/api/gemini/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.reply) {
        return data.reply;
      }
    }
  } catch {
    // ignore
  }

  return generateLocalCoachAdvice(context);
}

export interface VoiceParseResult {
  dishes: Array<{
    title: string;
    mealType: string;
    portionGrams: number;
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
    fiber: number;
    ingredients: string[];
    aiComment?: string;
  }>;
  speechSummary?: string;
  localFallback?: boolean;
}

/**
 * Parse a dictated meal phrase into dishes.
 *
 * Chain (same shape as the other helpers in this file, so a static host works):
 *   1. Direct Gemini REST from the browser (needs VITE_GEMINI_API_KEY).
 *   2. Server endpoint /api/gemini/parse-voice (npm run dev / Vercel).
 *   3. Local split-by-conjunction + nutritionEngine — never throws.
 */
export async function parseVoiceMealsWithAI(
  speechText: string,
  preferredMealType?: string
): Promise<VoiceParseResult> {
  const cleanText = String(speechText || '').trim();
  if (!cleanText) throw new Error('Speech text is required');

  const prompt = `You are a highly accurate AI nutritionist. The user dictated: "${cleanText}". Default meal: "${preferredMealType || 'lunch'}". Extract dishes and for each return title, mealType (breakfast/lunch/dinner/snack), portionGrams, calories, protein, fat, carbs, fiber, ingredients (2-4), aiComment. STRICTLY valid JSON: {"dishes":[{...}],"speechSummary":"..."}`;

  // 1. Direct browser → Gemini
  try {
    const rawText = await callGeminiRestAPI([{ parts: [{ text: prompt }] }], undefined, true);
    const parsed = safeParseJSON<any>(rawText);
    if (parsed && Array.isArray(parsed.dishes) && parsed.dishes.length > 0) {
      return { dishes: parsed.dishes, speechSummary: parsed.speechSummary };
    }
  } catch (err: any) {
    if (err?.message !== 'NO_API_KEY') {
      console.warn('Direct Gemini parse-voice failed:', err?.message || err);
    }
  }

  // 2. Server endpoint
  try {
    const res = await fetch('/api/gemini/parse-voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speechText: cleanText, preferredMealType: preferredMealType || 'lunch' }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.dishes) && data.dishes.length > 0) {
        return data;
      }
    }
  } catch {
    // ignore — static host has no /api
  }

  // 3. Local estimate, same splitting heuristic as api/gemini/parse-voice.ts
  const items = cleanText
    .split(/,|\.|\n| and | as well as | with | plus /i)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 2);
  const dishes = (items.length > 0 ? items : [cleanText]).map((item: string) => {
    const nut = calculateRealFoodNutrition(item);
    return {
      title: nut.title,
      mealType: preferredMealType || 'lunch',
      portionGrams: nut.portionGrams,
      calories: nut.calories,
      protein: nut.protein,
      fat: nut.fat,
      carbs: nut.carbs,
      fiber: nut.fiber,
      ingredients: [nut.title],
    };
  });
  return { dishes, speechSummary: 'Local parse without AI', localFallback: true };
}

/**
 * Estimate a product by barcode with Gemini. Mirrors api/gemini/estimate-barcode.ts
 * but works from the browser too, so unknown barcodes still resolve on a static host.
 * Returns null when nothing worked — the caller keeps its own baseline product.
 */
export async function estimateBarcodeWithAI(barcode: string): Promise<any | null> {
  const clean = String(barcode || '').trim().replace(/\D/g, '');
  if (!clean) return null;

  const prompt = `You are a food product database and nutritionist. Barcode "${clean}". Identify the product and nutrition per 100g. STRICTLY JSON: {"barcode":"${clean}","title":"...","brand":"...","portionGrams":100,"caloriesPer100g":150,"proteinPer100g":5,"fatPer100g":3,"carbsPer100g":20,"fiberPer100g":2,"calories":150,"protein":5,"fat":3,"carbs":20,"fiber":2,"ingredients":[]}`;

  // 1. Direct browser → Gemini
  try {
    const rawText = await callGeminiRestAPI([{ parts: [{ text: prompt }] }], undefined, true);
    const parsed = safeParseJSON<any>(rawText);
    if (parsed && parsed.title) return parsed;
  } catch (err: any) {
    if (err?.message !== 'NO_API_KEY') {
      console.warn('Direct Gemini estimate-barcode failed:', err?.message || err);
    }
  }

  // 2. Server endpoint
  try {
    const res = await fetch('/api/gemini/estimate-barcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcode: clean }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.title) return data;
    }
  } catch {
    // ignore — static host has no /api
  }

  return null;
}
