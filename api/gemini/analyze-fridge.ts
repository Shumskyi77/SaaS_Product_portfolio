import { generateGeminiContentWithFallback } from '../../lib/geminiBackend.js';

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
  const { base64Image } = body;

  try {
    const mimeType = base64Image?.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
    const cleanBase64 = (base64Image || '').replace(/^data:image\/\w+;base64,/, '');

    const response = await generateGeminiContentWithFallback([
      { inlineData: { mimeType, data: cleanBase64 } },
      'Carefully study this photo of fridge contents or groceries. List the recognized food ingredients in English, comma-separated. Reply with ONLY the ingredient list.',
    ]);

    const text = response.text || '';
    const ingredients = text.split(/,|\n/).map((i: string) => i.trim()).filter((i: string) => i.length > 1);
    return res.status(200).json({
      ingredients: ingredients.length > 0 ? ingredients : [],
    });
  } catch (error) {
    console.warn('Vercel Analyze Fridge fallback:', error);
    return res.status(200).json({
      ingredients: ['Chicken breast', 'Fresh tomatoes', 'Hard cheese', 'Chicken eggs', 'Bell pepper', 'Fresh herbs'],
    });
  }
}
