// Kompakte Weltlage für Menschen und (später) Sirius: stärkste Beben, nächste Starts, ISS-Position und nächster
// Überflug für einen optionalen Ort (?lat=&lon=, auf 0,1° gerundet), Anzahl Feuer und Flugzeuge (Flugzeuge nur mit Ort).
// Liegt wie alle /api/* hinter dem Passwortschutz (middleware.js) – Zugang für Sirius siehe docs/ERDE_LIVE.md.
import { loadQuakes, loadFires, loadLaunches, loadAircraft, loadIss, send, num } from './_lib/live.js';

const settle = async (p) => { try { return { ok: true, v: await p }; } catch (e) { return { ok: false, err: String(e?.message || e).slice(0, 80) }; } };

export default async function handler(req, res) {
  const r1 = (v) => Math.round(v * 10) / 10;
  let lat = num(req.query?.lat), lon = num(req.query?.lon);
  const hasLoc = Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  if (hasLoc) { lat = r1(lat); lon = r1(lon); } else { lat = lon = NaN; }
  const [q, f, l, iss, ac] = await Promise.all([
    settle(loadQuakes('day')), settle(loadFires()), settle(loadLaunches()), settle(loadIss(lat, lon)),
    hasLoc ? settle(loadAircraft(lat, lon)) : Promise.resolve(null),
  ]);
  const now = Date.now();
  const out = {
    generated: new Date(now).toISOString(),
    location: hasLoc ? { lat, lon } : null,
    quakes: q.ok ? { count24h: q.v.count, strongest: q.v.quakes.slice(0, 5).map(({ mag, place, time, lat: a, lon: o, depth, tsunami }) =>
      ({ mag, place, time: new Date(time).toISOString(), lat: a, lon: o, depthKm: depth, tsunami: !!tsunami })) } : { error: q.err },
    launches: l.ok ? { next: l.v.launches.filter((x) => Date.parse(x.net) > now - 3600000).slice(0, 5).map((x) =>
      ({ name: x.name, net: x.net, status: x.status, provider: x.provider, pad: x.pad.name, location: x.pad.location })) } : { error: l.err },
    iss: iss.ok ? iss.v : { error: iss.err },
    fires: f.ok ? { count24h: f.v.count, newest: f.v.newest } : { error: f.err },
    aircraft: ac == null ? null : ac.ok ? { withinNm: ac.v.radiusNm, around: ac.v.center, count: ac.v.total } : { error: ac.err },
    sources: ['USGS', 'NASA FIRMS', 'The Space Devs Launch Library 2', 'CelesTrak', 'adsb.lol (ODbL)'],
  };
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=900');
  return res.status(200).json(out);
}
