// Flugzeuge um einen Punkt (?lat=&lon=) – adsb.lol (offene ADS-B-Daten, ODbL). Mittelpunkt auf 2° gerastert,
// Radius 250 NM, höchstens 300 Flugzeuge (die nächsten). CDN-Cache 20 s je Rasterzelle.
import { loadAircraft, send, fail, num, snap } from './_lib/live.js';
export default async function handler(req, res) {
  const lat = num(req.query?.lat), lon = num(req.query?.lon);
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return send(res, 400, { error: 'lat/lon fehlen' }, 'no-store');
  // Ungerasterte Anfrage → auf die Rasterzelle umleiten, damit das CDN alle Besucher einer Zelle zusammenfasst
  if (String(snap(lat)) !== String(req.query.lat) || String(snap(lon)) !== String(req.query.lon)) {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Location', `/api/aircraft?lat=${snap(lat)}&lon=${snap(lon)}`);
    return res.status(307).end();
  }
  try {
    return send(res, 200, await loadAircraft(lat, lon), 'public, max-age=10, s-maxage=20, stale-while-revalidate=20');
  } catch (e) { return fail(res, e, 'adsb.lol'); }
}
