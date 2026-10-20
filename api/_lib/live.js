// Gemeinsame Datenlader für „Erde live“ (api/quakes, fires, launches, aircraft, weltlage).
// Jede Quelle: Zeitlimit, kompaktes Ergebnis, kleiner Speicher-Cache je warmer Server-Instanz (zusätzlich zum
// Vercel-CDN-Cache der einzelnen Routen) – so bleiben wir sicher unter den Abruf-Grenzen der Anbieter.
// Keine Schlüssel nötig; nichts Geheimes im Code. Ordner mit „_“ ist für Vercel keine eigene Route.
import { twoline2satrec, propagate, gstime, eciToGeodetic, degreesLat, degreesLong } from 'satellite.js';
import { passesFor } from '../../src/lib/passes.js';

const UA = 'GALACTIC/1.0 (+https://galactic-vert.vercel.app; Bildungsprojekt)';
const memo = new Map(); // key → { t, ttl, value }

async function cached(key, ttlMs, load) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.value;
  try {
    const value = await load();
    memo.set(key, { t: Date.now(), value });
    if (memo.size > 300) memo.delete(memo.keys().next().value);
    return value;
  } catch (e) {
    if (hit && Date.now() - hit.t < ttlMs * 6) return hit.value; // lieber etwas ältere Daten als gar keine
    throw e;
  }
}

async function get(url, { ms = 9000, type = 'json' } = {}) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { 'User-Agent': UA, Accept: type === 'json' ? 'application/json' : 'text/plain, text/csv' } });
  if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
  return type === 'json' ? r.json() : r.text();
}

const r2 = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

// --- Erdbeben (USGS, gemeinfrei) -------------------------------------------------------------------
// day: alle Beben der letzten 24 h · week: ab M 2,5 der letzten 7 Tage
export function loadQuakes(range = 'day') {
  const feed = range === 'week' ? '2.5_week' : 'all_day';
  return cached(`quakes:${feed}`, 120000, async () => {
    const d = await get(`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${feed}.geojson`);
    const list = (d.features || []).filter((f) => f?.geometry?.coordinates && f.properties?.mag != null).map((f) => {
      const [lon, lat, depth] = f.geometry.coordinates;
      const p = f.properties;
      return { id: f.id, mag: r2(p.mag, 1), place: p.place || '', time: p.time, lat: r2(lat, 3), lon: r2(lon, 3), depth: r2(depth ?? 0, 1),
        tsunami: p.tsunami ? 1 : 0, alert: p.alert || null, url: typeof p.url === 'string' && p.url.startsWith('https://earthquake.usgs.gov/') ? p.url : null };
    });
    list.sort((a, b) => b.mag - a.mag);
    return { range: feed, generated: d.metadata?.generated ?? Date.now(), count: list.length, quakes: list.slice(0, 3000) };
  });
}

// --- Waldbrände / Hitzepunkte (NASA FIRMS, offene 24-h-CSV ohne MAP_KEY) ------------------------------
// MODIS C6.1 global 24 h (~1,5 MB, ~18 000 Punkte). Kompakt als Spalten: [lat, lon, frp, confidence, hhmm, D/N]
const FIRMS_URL = 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_24h.csv';
export function loadFires() {
  return cached('fires', 30 * 60000, async () => {
    const csv = await get(FIRMS_URL, { ms: 15000, type: 'text' });
    const lines = csv.split('\n');
    const head = lines[0].split(',');
    const ix = (n) => head.indexOf(n);
    const [iLat, iLon, iFrp, iConf, iTime, iDate, iDn] = ['latitude', 'longitude', 'frp', 'confidence', 'acq_time', 'acq_date', 'daynight'].map(ix);
    if (iLat < 0 || iLon < 0) throw new Error('FIRMS-Format unbekannt');
    const pts = [];
    let newest = '';
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(',');
      if (c.length < head.length) continue;
      const conf = +c[iConf];
      if (!(conf >= 30)) continue; // unsichere Erkennungen weglassen
      const stamp = `${c[iDate]} ${c[iTime]}`;
      if (stamp > newest) newest = stamp;
      pts.push([r2(+c[iLat]), r2(+c[iLon]), Math.round(+c[iFrp] * 10) / 10, conf, c[iDate].slice(5) + ' ' + c[iTime], c[iDn] === 'N' ? 'N' : 'D']);
    }
    return { source: 'NASA FIRMS MODIS C6.1 NRT (24 h)', newest, count: pts.length, cols: ['lat', 'lon', 'frp', 'conf', 'mmdd hhmm UTC', 'D/N'], fires: pts };
  });
}

// --- Raketenstarts (The Space Devs – Launch Library 2, Free-Tier 15 Abrufe/h) ------------------------
export function loadLaunches() {
  return cached('launches', 45 * 60000, async () => {
    const d = await get('https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=25&mode=normal&hide_recent_previous=false', { ms: 12000 });
    const list = (d.results || []).map((l) => ({
      id: l.id, name: l.name, net: l.net, precision: l.net_precision?.abbrev || null,
      status: l.status?.abbrev || '', statusName: l.status?.name || '',
      provider: l.launch_service_provider?.name || '', rocket: l.rocket?.configuration?.full_name || l.rocket?.configuration?.name || '',
      mission: l.mission?.name || '', missionType: l.mission?.type || '', orbit: l.mission?.orbit?.name || '',
      desc: (l.mission?.description || '').slice(0, 400),
      pad: l.pad ? { name: l.pad.name, location: l.pad.location?.name || '', lat: +l.pad.latitude, lon: +l.pad.longitude, country: l.pad.country?.alpha_2_code || '' } : null,
      webcast: !!l.webcast_live,
    })).filter((l) => l.pad && Number.isFinite(l.pad.lat) && Number.isFinite(l.pad.lon));
    return { source: 'The Space Devs – Launch Library 2', count: list.length, launches: list };
  });
}

// --- Flugzeuge (adsb.lol, offene ADS-B-Daten, ODbL) ----------------------------------------------------
// Ausschnitt: Kreis 250 NM um einen auf 2° gerasterten Mittelpunkt (gleiche Rasterzelle ⇒ gleicher Cache-Eintrag).
// adsb.lol erlaubt je IP etwa 1 Abruf/s, 60/min, 500/Tag – darum Raster, CDN-Cache und Speicher-Cache (20 s).
export const snap = (v, step = 2) => Math.round(v / step) * step;
export function loadAircraft(lat, lon, max = 300) {
  const la = Math.max(-88, Math.min(88, snap(lat))), lo = ((snap(lon) + 540) % 360) - 180;
  return cached(`ac:${la}:${lo}`, 20000, async () => {
    const d = await get(`https://api.adsb.lol/v2/point/${la}/${lo}/250`, { ms: 8000 });
    const all = (d.ac || []).filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon));
    all.sort((a, b) => (a.dst ?? 1e9) - (b.dst ?? 1e9));
    const ac = all.slice(0, max).map((a) => {
      const hidden = (a.dbFlags & 4) || (a.dbFlags & 8); // PIA/LADD: Halter wünscht Privatsphäre → keine Kennung zeigen
      return {
        hex: hidden ? null : a.hex, flight: hidden ? null : (a.flight || '').trim() || null, reg: hidden ? null : a.r || null, type: a.t || null,
        lat: r2(a.lat, 3), lon: r2(a.lon, 3), alt: a.alt_baro === 'ground' ? 0 : Number.isFinite(a.alt_baro) ? a.alt_baro : a.alt_geom ?? null,
        ground: a.alt_baro === 'ground', gs: Number.isFinite(a.gs) ? Math.round(a.gs) : null,
        track: Number.isFinite(a.track) ? Math.round(a.track) : Number.isFinite(a.true_heading) ? Math.round(a.true_heading) : null,
        vr: Number.isFinite(a.baro_rate) ? a.baro_rate : null, seen: a.seen_pos ?? a.seen ?? null,
      };
    });
    return { source: 'adsb.lol', center: { lat: la, lon: lo }, radiusNm: 250, total: all.length, count: ac.length, now: d.now ?? Date.now(), aircraft: ac };
  });
}

// --- ISS (CelesTrak-TLE, höchstens alle 2 h abrufen) -----------------------------------------------------
function loadIssTle() {
  return cached('tle:iss', 2 * 3600000, async () => {
    const t = await get('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle', { type: 'text' });
    const l = t.replace(/\r/g, '').split('\n').filter(Boolean);
    const i = l.findIndex((x) => x.startsWith('1 25544'));
    if (i < 0 || !l[i + 1]?.startsWith('2 ')) throw new Error('keine ISS-TLE');
    return [l[i], l[i + 1]];
  });
}

export async function loadIss(lat, lon) {
  const [l1, l2] = await loadIssTle();
  const rec = twoline2satrec(l1, l2);
  const now = new Date();
  const pv = propagate(rec, now);
  const g = eciToGeodetic(pv.position, gstime(now));
  const out = { lat: r2(degreesLat(g.latitude)), lon: r2(degreesLong(g.longitude)), altKm: Math.round(g.height),
    speedKmh: Math.round(Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) * 3600) };
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    const p = passesFor(rec, lat, lon, { hours: 48 });
    out.nextPass = p[0] || null;
    out.nextVisiblePass = p.find((x) => x.visible) || null;
  }
  return out;
}

// --- Antwort-Helfer --------------------------------------------------------------------------------------
export function send(res, status, body, cache) {
  res.setHeader('Cache-Control', cache);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(body);
}
export const fail = (res, e, what) => send(res, e?.status === 429 ? 503 : 502,
  { error: `${what} gerade nicht erreichbar`, detail: e?.name === 'TimeoutError' ? 'Zeitüberschreitung' : String(e?.message || e).slice(0, 80) },
  'public, s-maxage=60');
export const num = (v) => (v == null || v === '' ? NaN : Number(v));
