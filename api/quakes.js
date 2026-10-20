// Erdbeben der letzten 24 h (alle Stärken) bzw. 7 Tage (ab M 2,5) – USGS-GeoJSON, kompakt. CDN-Cache 3 min.
import { loadQuakes, send, fail } from './_lib/live.js';
export default async function handler(req, res) {
  try {
    const d = await loadQuakes(req.query?.range === 'week' ? 'week' : 'day');
    return send(res, 200, d, 'public, max-age=60, s-maxage=180, stale-while-revalidate=600');
  } catch (e) { return fail(res, e, 'USGS'); }
}
