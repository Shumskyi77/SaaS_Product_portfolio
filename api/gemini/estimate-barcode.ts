import { generateGeminiContentWithFallback } from '../../lib/geminiBackend.js';

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
    const clean = String(body.barcode || '').trim().replace(/\D/g, '');
    if (!clean) return res.status(400).json({ error: 'Barcode required' });

    const prompt = `You are a food product database and nutritionist. Barcode "${clean}". Identify the product and nutrition per 100g. STRICTLY JSON: {"barcode":"${clean}","title":"...","brand":"...","portionGrams":100,"caloriesPer100g":150,"proteinPer100g":5,"fatPer100g":3,"carbsPer100g":20,"fiberPer100g":2,"calories":150,"protein":5,"fat":3,"carbs":20,"fiber":2,"ingredients":[]}`;

    try {
      const aiResponse: any = await generateGeminiContentWithFallback(prompt, 8000);
      const text = String(aiResponse.text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
      return res.status(200).json(JSON.parse(text));
    } catch (err) {
      console.warn('estimate-barcode AI failed:', err);
      return res.status(404).json({ error: 'Unknown barcode', barcode: clean, localFallback: true });
    }
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to estimate barcode' });
  }
}
