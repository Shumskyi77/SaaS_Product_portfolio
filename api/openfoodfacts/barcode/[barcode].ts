// Vercel: GET /api/openfoodfacts/barcode/:barcode -> proxy world.openfoodfacts.org (v2 then v0)
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const barcode = String(req.query?.barcode || '').trim().replace(/\D/g, '');
    if (!barcode || barcode.length < 4) return res.status(400).json({ error: 'Invalid barcode' });

    const userAgent = 'NutriGem - Web - Version 1.0 - dania.szumski@gmail.com';
    for (const url of [
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`,
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
    ]) {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
        if (r.ok) {
          const data: any = await r.json();
          if (data.status === 1 && data.product) return res.status(200).json(data.product);
        }
      } catch (e) {
        console.warn('OFF proxy error:', e);
      }
    }
    return res.status(404).json({ error: 'Product not found in Open Food Facts' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to query Open Food Facts' });
  }
}
