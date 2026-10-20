// Überflugberechnung (SGP4 via satellite.js) – gemeinsam für Browser (Erde live → Überflüge) und Server (api/weltlage).
import { propagate, gstime, eciToEcf, ecfToLookAngles } from 'satellite.js';

const RAD = Math.PI / 180;
// Sonnenrichtung (ECI, Einheitsvektor) – einfache Näherung, für Sichtbarkeit völlig ausreichend
export function sunEci(date) {
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const L = (280.46 + 0.9856474 * n) * RAD, g = (357.528 + 0.9856003 * n) * RAD;
  const lam = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD, eps = (23.439 - 4e-7 * n) * RAD;
  return { x: Math.cos(lam), y: Math.cos(eps) * Math.sin(lam), z: Math.sin(eps) * Math.sin(lam) };
}

// Überflüge über einem Ort (Elevation > minEl) in den nächsten `hours` Stunden, inkl. Sichtbarkeit mit bloßem Auge
export function passesFor(rec, lat, lon, { hours = 24, minEl = 10, start = new Date() } = {}) {
  const obs = { latitude: lat * RAD, longitude: lon * RAD, height: 0 };
  const out = [];
  let cur = null;
  const step = 20000;
  for (let t = start.getTime(); t < start.getTime() + hours * 3600000; t += step) {
    const d = new Date(t);
    const pv = propagate(rec, d);
    if (!pv?.position || typeof pv.position === 'boolean') continue;
    const gmst = gstime(d);
    const la = ecfToLookAngles(obs, eciToEcf(pv.position, gmst));
    const el = la.elevation / RAD;
    if (el >= minEl) {
      if (!cur) cur = { start: t, maxEl: el, maxAt: t, az0: la.azimuth / RAD, visible: false };
      if (el > cur.maxEl) { cur.maxEl = el; cur.maxAt = t; }
      cur.end = t; cur.az1 = la.azimuth / RAD;
      // sichtbar: Satellit im Sonnenlicht, Beobachter in der Dämmerung/Nacht (Sonne < −6°)
      const s = sunEci(d), p = pv.position, r = Math.hypot(p.x, p.y, p.z);
      const dot = (p.x * s.x + p.y * s.y + p.z * s.z);
      const sunlit = dot > 0 || Math.sqrt(r * r - dot * dot) > 6371;
      const sunEcf = eciToEcf({ x: s.x * 1.496e8, y: s.y * 1.496e8, z: s.z * 1.496e8 }, gmst);
      const sunEl = ecfToLookAngles(obs, sunEcf).elevation / RAD;
      if (sunlit && sunEl < -6) cur.visible = true;
    } else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out.map((p) => ({ start: new Date(p.start).toISOString(), end: new Date(p.end).toISOString(), maxAt: new Date(p.maxAt).toISOString(),
    maxEl: Math.round(p.maxEl), azStart: Math.round(p.az0), azEnd: Math.round(p.az1), visible: p.visible }));
}
