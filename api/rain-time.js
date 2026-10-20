// Jüngster Zeitpunkt der NASA-GIBS-Niederschlagsebene (IMERG, 30 min) für feste Kachel-URLs. CDN-Cache 20 min.
import { loadRainTime, send, fail } from './_lib/live.js';
export default async function handler(req, res) {
  try {
    return send(res, 200, await loadRainTime(), 'public, max-age=300, s-maxage=1200, stale-while-revalidate=3600');
  } catch (e) { return fail(res, e, 'NASA GIBS'); }
}
