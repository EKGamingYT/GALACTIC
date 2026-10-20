// Aktive Feuer/Hitzepunkte der letzten 24 h – offene NASA-FIRMS-CSV (MODIS, ohne MAP_KEY), kompakt. CDN-Cache 1 h.
import { loadFires, send, fail } from './_lib/live.js';
export default async function handler(req, res) {
  try {
    return send(res, 200, await loadFires(), 'public, max-age=600, s-maxage=3600, stale-while-revalidate=7200');
  } catch (e) { return fail(res, e, 'NASA FIRMS'); }
}
