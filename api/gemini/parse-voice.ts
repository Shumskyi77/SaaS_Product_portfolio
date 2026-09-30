import { generateGeminiContentWithFallback } from '../../lib/geminiBackend.js';
import { calculateRealFoodNutrition } from '../../lib/nutritionEngine.js';

function cors(res: any) {
  // No credentials: otherwise the browser rejects the response with Origin '*'.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req: any, res: any) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { speechText, preferredMealType } = body;
    if (!speechText || typeof speechText !== 'string' || !speechText.trim()) {
      return res.status(400).json({ error: 'Speech text is required' });
    }

    const prompt = `You are a highly accurate AI nutritionist. The user dictated: "${speechText}". Default meal: "${preferredMealType || 'lunch'}". Extract dishes and for each return title, mealType (breakfast/lunch/dinner/snack), portionGrams, calories, protein, fat, carbs, fiber, ingredients (2-4), aiComment. STRICTLY valid JSON: {"dishes":[{...}],"speechSummary":"..."}`;

    try {
      const response: any = await generateGeminiContentWithFallback(prompt, 12000);
      const raw = String(response.text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.dishes) && parsed.dishes.length > 0) {
        return res.status(200).json(parsed);
      }
      throw new Error('No dishes extracted');
    } catch (aiErr) {
      console.warn('parse-voice AI failed, local fallback:', aiErr);
      const items = String(speechText).split(/,|\.|\n| and | as well as | with | plus /i).map((s: string) => s.trim()).filter((s: string) => s.length > 2);
      const dishes = (items.length > 0 ? items : [String(speechText)]).map((item: string) => {
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
          // no aiComment -> client shows honest local-estimate badge
        };
      });
      return res.status(200).json({ dishes, speechSummary: 'Local parse without AI', localFallback: true });
    }
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to parse voice' });
  }
}
