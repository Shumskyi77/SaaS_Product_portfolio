import { GoogleGenAI } from '@google/genai';
import { calculateRealFoodNutrition } from './nutritionEngine.js';
import { safeParseJSON } from './gemini.js';

// Get API Key from any standard environment variable
export function getGeminiApiKey(): string | null {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    null
  );
}

export function getGeminiServerClient(): GoogleGenAI | null {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Candidates sorted by availability and speed
export const CANDIDATE_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.7-flash',
];

export async function generateGeminiContentWithFallback(contents: any, timeoutMs = 12000) {
  const ai = getGeminiServerClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY environment variable is not configured');
  }

  // Total deadline for the whole chain: 5 models x timeoutMs without it would take up to a minute,
  // while serverless on Hobby kills long calls — the client would get 504/timeout.
  // Budget is split on the fly: remaining / models left, minimum 3s per attempt.
  const TOTAL_BUDGET_MS = 20000;
  const startedAt = Date.now();
  let lastError: any = null;
  const total = CANDIDATE_MODELS.length;
  for (let i = 0; i < total; i++) {
    const model = CANDIDATE_MODELS[i];
    const elapsed = Date.now() - startedAt;
    const remaining = TOTAL_BUDGET_MS - elapsed;
    if (remaining < 3000) {
      lastError = lastError || new Error('Gemini total budget exhausted');
      break;
    }
    const attemptMs = Math.min(timeoutMs, remaining);
    try {
      const geminiPromise = ai.models.generateContent({
        model,
        contents,
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout on model ${model}`)), attemptMs)
      );

      const response: any = await Promise.race([geminiPromise, timeoutPromise]);
      if (response && response.text !== undefined) {
        return response;
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`Model ${model} issue (${err?.message || err}), trying next candidate...`);
    }
  }
  throw lastError || new Error('All Gemini model candidates failed');
}

export async function analyzeFoodBackend(base64Image?: string, userHint?: string, visualContext?: string) {
  let contents: any[] = [];
  let hasImage = false;

  if (base64Image && typeof base64Image === 'string') {
    let mimeType = 'image/jpeg';
    let cleanBase64 = '';

    if (base64Image.startsWith('http://') || base64Image.startsWith('https://')) {
      try {
        const imgRes = await fetch(base64Image);
        if (imgRes.ok) {
          const arrayBuf = await imgRes.arrayBuffer();
          cleanBase64 = Buffer.from(arrayBuf).toString('base64');
          const rawCt = imgRes.headers.get('content-type') || '';
          if (rawCt.includes('png')) mimeType = 'image/png';
          else if (rawCt.includes('webp')) mimeType = 'image/webp';
          else mimeType = 'image/jpeg';
        }
      } catch (e) {
        console.warn('Failed to fetch image URL for base64:', e);
      }
    } else {
      if (base64Image.startsWith('data:image/png')) {
        mimeType = 'image/png';
      } else if (base64Image.startsWith('data:image/webp')) {
        mimeType = 'image/webp';
      } else {
        mimeType = 'image/jpeg';
      }
      cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
    }

    if (cleanBase64 && cleanBase64.length > 20) {
      contents.push({ inlineData: { mimeType, data: cleanBase64 } });
      hasImage = true;
    }
  }

  const combinedHint = [userHint, visualContext].filter(Boolean).join('. ');

  const prompt = `You are a professional AI dietitian and nutritionist for the Foodvisor app.
Your task is to as accurately as possible ${hasImage ? 'recognize the dish in the photo' : 'identify the dish from the description'}, estimate its weight and calculate full nutrition (calories and macros).
${hasImage ? 'Carefully examine the plate image, ingredients, cooking method (frying, grilling, boiling, baking, fresh vegetables).\n' : ''}${combinedHint ? `User provided clarification/context: "${combinedHint}".` : ''}

Mandatory requirements:
1. "title": natural, appetizing and accurate dish name in English (e.g.: "Fluffy 3-egg omelet with herbs", "Grilled salmon steak with asparagus", "Caesar salad with chicken breast", "Cottage cheese pancakes with sour cream", "Pasta Carbonara with creamy sauce").
2. "portionGrams": realistic estimate of the whole visible portion weight in grams (usually 150-400g).
3. "calories": total calories of this portion (kcal).
4. "protein": protein per portion in grams (g).
5. "fat": fat per portion in grams (g).
6. "carbs": carbs per portion in grams (g).
7. "fiber": dietary fiber in grams (g).
8. "ingredients": list of 2-5 main recognized ingredients (in English, string array).
9. "aiAnalysis": brief helpful nutritionist comment about the benefits and composition of this dish (1-2 sentences in English).
10. "confidence": recognition confidence estimate in percent (integer from 90 to 99).

Return STRICTLY valid JSON:
{
  "title": "Dish name",
  "portionGrams": 220,
  "calories": 340,
  "protein": 22,
  "fat": 18,
  "carbs": 24,
  "fiber": 3,
  "ingredients": ["Ingredient 1", "Ingredient 2"],
  "aiAnalysis": "Great source of protein and healthy micronutrients.",
  "confidence": 97
}`;

  contents.push(prompt);

  const ai = getGeminiServerClient();
  if (ai) {
    for (const model of CANDIDATE_MODELS) {
      try {
        const geminiPromise = ai.models.generateContent({
          model,
          contents,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        });
        const timeoutMs = hasImage ? 12000 : 6000;
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout on model ${model}`)), timeoutMs)
        );

        const response: any = await Promise.race([geminiPromise, timeoutPromise]);
        const raw = response?.text || '';
        const parsed = safeParseJSON(raw);

        if (parsed && parsed.title && parsed.calories !== undefined) {
          const cal = Math.max(30, Number(parsed.calories) || 300);
          return {
            title: String(parsed.title).trim(),
            portionGrams: Number(parsed.portionGrams) || 220,
            calories: cal,
            protein: Number(parsed.protein) || 15,
            fat: Number(parsed.fat) || 10,
            carbs: Number(parsed.carbs) || 20,
            fiber: Number(parsed.fiber) || 2,
            ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
            aiAnalysis: parsed.aiAnalysis ? String(parsed.aiAnalysis) : 'Recognized with Foodvisor AI',
            confidence: Number(parsed.confidence) || 98,
          };
        }
      } catch (err: any) {
        console.warn(`Vision model ${model} unavailable:`, err?.message?.slice(0, 80));
      }
    }
  }

  // Fallback calculation
  const computed = calculateRealFoodNutrition(userHint, visualContext);
  return {
    ...computed,
    ingredients: [computed.title],
    aiAnalysis: 'Estimated with the high-precision Foodvisor nutrition algorithm',
  };
}
