// Nächste Raketenstarts – Launch Library 2 (The Space Devs, Free-Tier: 15 Abrufe/h je IP). CDN-Cache 1 h.
import { loadLaunches, send, fail } from './_lib/live.js';
export default async function handler(req, res) {
  try {
    return send(res, 200, await loadLaunches(), 'public, max-age=900, s-maxage=3600, stale-while-revalidate=10800');
  } catch (e) { return fail(res, e, 'Launch Library'); }
}
