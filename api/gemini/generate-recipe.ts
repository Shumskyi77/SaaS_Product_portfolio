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
  const { category, maxCalories, ingredients } = body;

  try {
    const prompt = `You are a professional AI chef and dietitian.
Create a balanced detailed recipe dish in English.
Parameters:
- Category: ${category}
- Max calories: ${maxCalories} kcal
- Available ingredients: ${ingredients || 'any healthy foods'}

Return STRICTLY valid JSON (no markdown \`\`\`json tags) with the following structure:
{
  "title": "Dish name",
  "description": "Brief description",
  "prepTimeMinutes": 10,
  "cookTimeMinutes": 15,
  "servings": 1,
  "calories": 420,
  "protein": 32,
  "fat": 12,
  "carbs": 35,
  "fiber": 7,
  "tags": ["Quick", "Protein"],
  "imageUrl": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80",
  "ingredients": [
    {"name": "Ingredient 1", "amount": "100g", "calories": 120}
  ],
  "instructions": [
    "Step 1...",
    "Step 2..."
  ]
}`;

    const response = await generateGeminiContentWithFallback(prompt);
    const raw = response.text || '';
    const parsed = safeParseJSON(raw);
    if (parsed && parsed.title) {
      return res.status(200).json(parsed);
    }
    throw new Error('Invalid JSON received');
  } catch (error) {
    console.warn('Vercel Generate Recipe fallback:', error);
    const ingList = ingredients
      ? String(ingredients).split(',').map((s) => s.trim())
      : ['Chicken breast', 'Tomatoes', 'Cheese', 'Vegetables'];

    return res.status(200).json({
      title: `${category || 'Dish'}: Signature mix with ${ingList[0] || 'ingredients'}`,
      description: `A balanced healthy dish made from your ingredients (${ingList.join(', ')}).`,
      prepTimeMinutes: 10,
      cookTimeMinutes: 15,
      servings: 1,
      calories: Math.min(maxCalories || 450, 440),
      protein: 34,
      fat: 14,
      carbs: 28,
      fiber: 6,
      tags: ['AI Recipe', 'From the fridge', category || 'Lunch'],
      imageUrl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80',
      ingredients: ingList.map((ing) => ({
        name: ing,
        amount: '120 g',
        calories: 110,
      })),
      instructions: [
        'Prepare and rinse all fresh ingredients.',
        'Slice the protein component and vegetables into even pieces.',
        'Sear in a pan with a drop of olive oil for 8-10 minutes until done.',
        'Serve hot, sprinkled with fresh herbs and spices.',
      ],
    });
  }
}
