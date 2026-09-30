import { analyzeFoodBackend } from '../../lib/geminiBackend.js';

export default async function handler(req: any, res: any) {
  // CORS: no credentials (otherwise the browser rejects the response with Origin '*').
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { base64Image, userHint, visualContext } = body;
    const result = await analyzeFoodBackend(base64Image, userHint, visualContext);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Vercel API analyze-food error:', error);
    return res.status(500).json({ error: error?.message || 'Failed to analyze food' });
  }
}
