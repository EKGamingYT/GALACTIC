// Deep Space Network & Lichtlaufzeit
// 1. Live-Status des NASA Deep Space Network (Feed „DSN Now“, eyes.nasa.gov/dsn)
// 2. Lichtlaufzeit zu Planeten, Monden und (aus dem Feed) Raumsonden
// 3. Link-Budget-Rechner (Freiraumdämpfung, Antennengewinne, C/N0, maximale Datenrate)
//
// Aufruf: const panel = createDsnPanel(container); panel.setActive(true|false)
// Fremddaten (Feed/Konfiguration) werden ausschließlich per textContent/setAttribute ausgegeben.

import './dsn.css';
import { BODIES } from '../../data/bodies.js';
import MOONS from '../../data/moons.json';
import { heliocentricPosition, julianDate } from '../../lib/orbits.js';
import { OBLIQUITY_DEG } from '../../data/solarsystem.js';

/* --- Konstanten ------------------------------------------------------------------------ */
const C_KM_S = 299792.458;        // Lichtgeschwindigkeit (exakt, SI)
const C_M_S = 299792458;
const AU_KM = 149597870.7;        // Astronomische Einheit (IAU 2012, exakt)
const K_BOLTZ = 1.380649e-23;     // Boltzmann-Konstante (exakt, SI 2019)
const MOON_MASS_RATIO = 0.0121505856; // M_Mond / (M_Erde + M_Mond) – Erde ↔ Erde-Mond-Schwerpunkt
const DEG = Math.PI / 180;

const FEED_URL = 'https://eyes.nasa.gov/dsn/data/dsn.xml';
const CONFIG_URL = 'https://eyes.nasa.gov/dsn/config.xml';
const POLL_MS = 8000;      // Feed wird bei der NASA etwa alle 5 s neu geschrieben
const TIMEOUT_MS = 7000;
const MAX_BYTES = 2_000_000;

// Rückfall, falls config.xml nicht abrufbar ist (Werte aus config.xml, Stand 2026-09)
const FALLBACK_SITES = {
  gdscc: { name: 'Goldstone', lon: -116.8895382, lat: 35.2443523 },
  mdscc: { name: 'Madrid', lon: -4.2480085, lat: 40.2413554 },
  cdscc: { name: 'Canberra', lon: 148.9812673, lat: -35.2209189 },
};
const SITE_INFO = {
  gdscc: { region: 'Mojave-Wüste, Kalifornien (USA)', hue: '#ffb86b' },
  mdscc: { region: 'Robledo de Chavela (Spanien)', hue: '#6ea8ff' },
  cdscc: { region: 'Tidbinbilla bei Canberra (Australien)', hue: '#b98cff' },
};
const FALLBACK_DISH_TYPES = { DSS14: '70M', DSS43: '70M', DSS63: '70M', DSS65: '34MHEF' };

const BAND_INFO = {
  S: { label: 'S', down: 2.295, up: 2.115 },
  X: { label: 'X', down: 8.42, up: 7.18 },
  K: { label: 'Ka', down: 26.0, up: 26.0, note: 'Ka-Band für erdnahe Missionen (25,5–27 GHz)' },
  KA: { label: 'Ka', down: 32.0, up: 34.4 },
};

/* --- Formatierung ---------------------------------------------------------------------- */
const NF = new Map();
function fmt(x, d = 0) {
  if (x == null || !Number.isFinite(x)) return '–';
  let f = NF.get(d);
  if (!f) { f = new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }); NF.set(d, f); }
  return f.format(x);
}
function fmtSig(x, digits = 3) {
  if (x == null || !Number.isFinite(x)) return '–';
  const a = Math.abs(x);
  const d = a === 0 ? 0 : Math.max(0, Math.min(6, digits - 1 - Math.floor(Math.log10(a))));
  return fmt(x, d);
}
function fmtDur(s) {
  if (s == null || !Number.isFinite(s) || s < 0) return '–';
  if (s < 60) return `${fmt(s, s < 10 ? 3 : 1)} s`;
  let t = Math.round(s);
  const d = Math.floor(t / 86400); t -= d * 86400;
  const h = Math.floor(t / 3600); t -= h * 3600;
  const m = Math.floor(t / 60); const sec = t - m * 60;
  if (d) return `${d} d ${h} h ${m} min`;
  if (h) return `${h} h ${m} min ${sec} s`;
  return `${m} min ${sec} s`;
}
function fmtKm(km) {
  if (km == null || !Number.isFinite(km) || km <= 0) return '–';
  if (km < 1e6) return `${fmt(km, 0)} km`;
  if (km < 1e9) return `${fmt(km / 1e6, km < 1e7 ? 3 : 2)} Mio. km`;
  return `${fmt(km / 1e9, 3)} Mrd. km`;
}
const fmtAu = (km) => (km > 0 ? `${fmt(km / AU_KM, km / AU_KM < 0.1 ? 5 : 3)} AE` : '–');
function fmtRate(bps) {
  if (bps == null || !Number.isFinite(bps) || bps <= 0) return '–';
  if (bps >= 1e9) return `${fmtSig(bps / 1e9)} Gbit/s`;
  if (bps >= 1e6) return `${fmtSig(bps / 1e6)} Mbit/s`;
  if (bps >= 1e3) return `${fmtSig(bps / 1e3)} kbit/s`;
  return `${fmtSig(bps)} bit/s`;
}
// Sehr kleine Leistungen wissenschaftlich (z. B. 2,85 · 10⁻¹⁹ W)
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
function fmtWatt(w) {
  if (!Number.isFinite(w) || w <= 0) return '–';
  if (w >= 1e-3) return `${fmtSig(w, 3)} W`;
  const e = Math.floor(Math.log10(w));
  return `${fmt(w / 10 ** e, 2)} · 10${String(e).replace(/./g, (c) => SUP[c] ?? c)} W`;
}
const clockFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const utcFmt = new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' });

/* --- DOM-Helfer (nur textContent/Attribute, kein HTML aus Fremddaten) ------------------- */
function h(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c != null && c !== false) n.append(c);
  return n;
}
const SVG_NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs, text) {
  const n = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, String(v));
  if (text != null) n.textContent = text;
  return n;
}

/* =====================================================================================
   1. DSN-Feed
   ===================================================================================== */
async function fetchText(url, outerSignal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('Zeitüberschreitung', 'TimeoutError')), TIMEOUT_MS);
  const onAbort = () => ctrl.abort(outerSignal.reason);
  outerSignal?.addEventListener('abort', onAbort);
  try {
    const r = await fetch(url, { cache: 'no-store', credentials: 'omit', mode: 'cors', referrerPolicy: 'no-referrer', signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const len = Number(r.headers.get('content-length'));
    if (len > MAX_BYTES) throw new Error('Antwort zu groß');
    const text = await r.text();
    if (text.length > MAX_BYTES) throw new Error('Antwort zu groß');
    return text;
  } catch (e) {
    if (ctrl.signal.aborted && !outerSignal?.aborted) throw new Error('Zeitüberschreitung');
    throw e;
  } finally {
    clearTimeout(timer);
    outerSignal?.removeEventListener('abort', onAbort);
  }
}

function parseXml(text, rootName) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement?.nodeName !== rootName) {
    throw new Error('Ungültiges XML');
  }
  return doc.documentElement;
}
const attr = (el, a) => (el.getAttribute(a) ?? '').trim();
function num(el, a) {
  const raw = el.getAttribute(a);
  if (raw == null || raw.trim() === '') return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v : null;
}

// config.xml → Standorte (Koordinaten), Antennentypen, Klarnamen der Raumsonden
function parseConfig(text) {
  const root = parseXml(text, 'config');
  const sites = {}; const dishTypes = {}; const names = new Map();
  for (const site of root.querySelectorAll('sites > site')) {
    const id = attr(site, 'name');
    const lon = num(site, 'longitude'), lat = num(site, 'latitude');
    if (!id || lon == null || lat == null) continue;
    sites[id] = { name: attr(site, 'friendlyName') || id, lon, lat };
    for (const d of site.querySelectorAll('dish')) dishTypes[attr(d, 'name')] = attr(d, 'type');
  }
  for (const sc of root.querySelectorAll('spacecraftMap > spacecraft')) {
    const code = attr(sc, 'name').toLowerCase();
    const friendly = attr(sc, 'friendlyName');
    if (code && friendly && friendly !== 'Testing') names.set(code, friendly);
  }
  return { sites, dishTypes, names };
}

let configPromise = null;
function loadConfig() {
  if (!configPromise) {
    configPromise = fetchText(CONFIG_URL).then(parseConfig).catch((e) => {
      configPromise = null; // beim nächsten Abruf erneut versuchen
      throw e;
    });
  }
  return configPromise;
}

function parseSignal(el) {
  return {
    active: attr(el, 'active') === 'true',
    type: attr(el, 'signalType'),
    rate: num(el, 'dataRate'),
    freq: num(el, 'frequency'),
    band: attr(el, 'band').toUpperCase(),
    power: num(el, 'power'),
    sc: attr(el, 'spacecraft'),
  };
}

function parseFeed(text) {
  const root = parseXml(text, 'dsn');
  const stations = []; let cur = null;
  for (const n of root.children) {
    if (n.nodeName === 'station') {
      cur = { id: attr(n, 'name'), name: attr(n, 'friendlyName'), tz: num(n, 'timeZoneOffset') ?? 0, dishes: [] };
      stations.push(cur);
    } else if (n.nodeName === 'dish' && cur) {
      const ups = [], downs = [], targets = [];
      for (const c of n.children) {
        if (c.nodeName === 'upSignal') ups.push(parseSignal(c));
        else if (c.nodeName === 'downSignal') downs.push(parseSignal(c));
        else if (c.nodeName === 'target') {
          targets.push({ name: attr(c, 'name'), id: num(c, 'id'), up: num(c, 'uplegRange'), down: num(c, 'downlegRange'), rtlt: num(c, 'rtlt') });
        }
      }
      cur.dishes.push({
        name: attr(n, 'name'), az: num(n, 'azimuthAngle'), el: num(n, 'elevationAngle'), wind: num(n, 'windSpeed'),
        activity: attr(n, 'activity'), mspa: attr(n, 'isMSPA') === 'true', array: attr(n, 'isArray') === 'true', ddor: attr(n, 'isDDOR') === 'true',
        ups, downs, targets,
      });
    }
  }
  const ts = root.querySelector('timestamp');
  const stamp = ts ? Number(ts.textContent) : NaN;
  return { stations, timestamp: Number.isFinite(stamp) ? stamp : null };
}

// Verbindungen je Antenne: Ziele mit ihren Signalen zusammenführen
function linksOf(dish) {
  const map = new Map();
  const get = (code) => {
    const key = code.toUpperCase();
    if (!map.has(key)) map.set(key, { code, target: null, ups: [], downs: [] });
    return map.get(key);
  };
  for (const t of dish.targets) if (t.name && t.name.toUpperCase() !== 'DSN') get(t.name).target = t;
  for (const sg of dish.ups) if (sg.sc) get(sg.sc).ups.push(sg);
  for (const sg of dish.downs) if (sg.sc) get(sg.sc).downs.push(sg);
  return [...map.values()].map((l) => {
    const t = l.target;
    const range = t ? [t.down, t.up].find((v) => v != null && v > 0) ?? null : null;
    const rtlt = t && t.rtlt != null && t.rtlt > 0 ? t.rtlt : null;
    const up = l.ups.some((x) => x.active), down = l.downs.some((x) => x.active);
    return { ...l, range, rtlt, up, down, active: up || down };
  });
}

/* =====================================================================================
   2. Ephemeriden für die Lichtlaufzeit
   ===================================================================================== */
// Geozentrische Mondposition, verkürzte Reihe nach Meeus, „Astronomical Algorithms“, Kap. 47
// (Hauptterme; Entfernungsfehler typ. < 300 km). Ergebnis: ekliptikal (des Datums), km.
function moonGeocentricKm(date) {
  const T = (julianDate(date) - 2451545.0) / 36525;
  const Lp = 218.3164477 + 481267.88123421 * T;
  const D = (297.8501921 + 445267.1114034 * T) * DEG;
  const M = (357.5291092 + 35999.0502909 * T) * DEG;
  const Mp = (134.9633964 + 477198.8675055 * T) * DEG;
  const F = (93.272095 + 483202.0175233 * T) * DEG;
  const sl = 6288774 * Math.sin(Mp) + 1274027 * Math.sin(2 * D - Mp) + 658314 * Math.sin(2 * D) + 213618 * Math.sin(2 * Mp)
    - 185116 * Math.sin(M) - 114332 * Math.sin(2 * F) + 58793 * Math.sin(2 * D - 2 * Mp) + 57066 * Math.sin(2 * D - M - Mp)
    + 53322 * Math.sin(2 * D + Mp) + 45758 * Math.sin(2 * D - M) - 40923 * Math.sin(M - Mp) - 34720 * Math.sin(D) - 30383 * Math.sin(M + Mp);
  const sr = -20905355 * Math.cos(Mp) - 3699111 * Math.cos(2 * D - Mp) - 2955968 * Math.cos(2 * D) - 569925 * Math.cos(2 * Mp)
    + 48888 * Math.cos(M) - 3149 * Math.cos(2 * F) + 246158 * Math.cos(2 * D - 2 * Mp) - 152138 * Math.cos(2 * D - M - Mp)
    - 170733 * Math.cos(2 * D + Mp) - 204586 * Math.cos(2 * D - M) - 129620 * Math.cos(M - Mp) + 108743 * Math.cos(D) + 104755 * Math.cos(M + Mp);
  const sb = 5128122 * Math.sin(F) + 280602 * Math.sin(Mp + F) + 277693 * Math.sin(Mp - F) + 173237 * Math.sin(2 * D - F)
    + 55413 * Math.sin(2 * D - Mp + F) + 46271 * Math.sin(2 * D - Mp - F) + 32573 * Math.sin(2 * D + F) + 17198 * Math.sin(2 * Mp + F);
  const lam = (Lp + sl / 1e6) * DEG, bet = (sb / 1e6) * DEG, r = 385000.56 + sr / 1000;
  return [r * Math.cos(bet) * Math.cos(lam), r * Math.cos(bet) * Math.sin(lam), r * Math.sin(bet)];
}

// Monde aus moons.json (mittlere JPL-Elemente) – gleiche Konvention wie views/moons.js
function eqToEcl(raDeg, decDeg) {
  const a = raDeg * DEG, d = decDeg * DEG, e = OBLIQUITY_DEG * DEG;
  const x = Math.cos(d) * Math.cos(a), y = Math.cos(d) * Math.sin(a), z = Math.sin(d);
  return [x, y * Math.cos(e) + z * Math.sin(e), -y * Math.sin(e) + z * Math.cos(e)];
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const ICRS_POLE = eqToEcl(0, 90);
const basisCache = new Map();
function frameBasis(m) {
  if (m.frameCode === 'ecliptic' || !m.framePole) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  if (basisCache.has(m.id)) return basisCache.get(m.id);
  const z = eqToEcl(m.framePole.raDeg, m.framePole.decDeg);
  let x = cross(ICRS_POLE, z); const l = norm(x);
  x = l < 1e-9 ? [1, 0, 0] : x.map((v) => v / l);
  const b = [x, cross(z, x), z];
  basisCache.set(m.id, b);
  return b;
}
function moonOffsetKm(m, date) {
  let M = (m.MDeg + (360 / m.periodDays) * (julianDate(date) - m.epochJd)) * DEG;
  M = Math.atan2(Math.sin(M), Math.cos(M));
  let E = M + m.e * Math.sin(M);
  for (let k = 0; k < 10; k++) E -= (E - m.e * Math.sin(E) - M) / (1 - m.e * Math.cos(E));
  const a = m.aKm, e = m.e, i = m.iDeg * DEG, O = m.nodeDeg * DEG, w = m.periDeg * DEG;
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i);
  const X = (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp;
  const Y = (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp;
  const Z = sw * si * xp + cw * si * yp;
  const [bx, by, bz] = frameBasis(m);
  return [0, 1, 2].map((k) => bx[k] * X + by[k] * Y + bz[k] * Z);
}

const EARTH = BODIES.find((b) => b.id === 'earth');
const helioKm = (body, date) => { const p = heliocentricPosition(body, date); return [p.x * AU_KM, p.y * AU_KM, p.z * AU_KM]; };
// Standish liefert für „Erde“ den Erde-Mond-Schwerpunkt → um den Mondanteil korrigieren
function earthKm(date) {
  const emb = helioKm(EARTH, date), mo = moonGeocentricKm(date);
  return [0, 1, 2].map((k) => emb[k] - MOON_MASS_RATIO * mo[k]);
}

const TARGETS = [];
const TARGET_BY_ID = new Map();
{
  const add = (t) => { TARGETS.push(t); TARGET_BY_ID.set(t.id, t); };
  add({ id: 'sun', name: 'Sonne', group: 'Sonne & Planeten', pos: () => [0, 0, 0] });
  for (const b of BODIES) {
    if (!b.elements || b.id === 'earth') continue;
    add({ id: b.id, name: b.name, group: 'Sonne & Planeten', planet: true, color: b.color, pos: (d) => helioKm(b, d) });
  }
  add({
    id: 'moon', name: 'Mond (Erde)', group: 'Monde', color: '#cfcfcf',
    pos: (d) => { const e = earthKm(d), m = moonGeocentricKm(d); return [e[0] + m[0], e[1] + m[1], e[2] + m[2]]; },
  });
  const parentName = (id) => BODIES.find((b) => b.id === id)?.name ?? id;
  for (const m of MOONS.moons) {
    if (!m.major || m.id === 'moon' || m.parent === 'earth') continue;
    const parent = BODIES.find((b) => b.id === m.parent);
    if (!parent?.elements || !(m.aKm > 0) || !(m.periodDays > 0)) continue;
    add({
      id: `moon:${m.id}`, name: `${m.name} (${parentName(m.parent)})`, group: 'Monde',
      pos: (d) => { const p = helioKm(parent, d), o = moonOffsetKm(m, d); return [p[0] + o[0], p[1] + o[1], p[2] + o[2]]; },
    });
  }
}

// Lichtzeit-korrigierte Entfernung: Signal kommt zum Zeitpunkt `date` auf der Erde an
// und hat den Körper zum Zeitpunkt date − τ verlassen (Iteration, konvergiert nach 2–3 Schritten).
function lightTime(target, date) {
  const E = earthKm(date);
  let tau = 0, dist = 0;
  for (let k = 0; k < 4; k++) {
    const P = target.pos(new Date(date.getTime() - tau * 1000));
    dist = Math.hypot(P[0] - E[0], P[1] - E[1], P[2] - E[2]);
    tau = dist / C_KM_S;
  }
  return { dist, oneWay: tau };
}

/* =====================================================================================
   3. Link-Budget
   ===================================================================================== */
const FREQ_PRESETS = [
  { id: 's-down', label: 'S-Band Downlink · 2,295 GHz', ghz: 2.295 },
  { id: 's-up', label: 'S-Band Uplink · 2,115 GHz', ghz: 2.115 },
  { id: 'x-down', label: 'X-Band Downlink · 8,42 GHz', ghz: 8.42 },
  { id: 'x-up', label: 'X-Band Uplink · 7,18 GHz', ghz: 7.18 },
  { id: 'ka-down', label: 'Ka-Band Downlink (Tiefraum) · 32 GHz', ghz: 32.0 },
  { id: 'ka-up', label: 'Ka-Band Uplink (Tiefraum) · 34,4 GHz', ghz: 34.4 },
  { id: 'ka-near', label: 'Ka-Band erdnah · 26 GHz', ghz: 26.0 },
  { id: 'custom', label: 'Eigene Frequenz', ghz: null },
];
const LINK_PRESETS = [
  {
    id: 'voyager', label: 'Voyager 1 → DSS 43, 70 m (X-Downlink)', band: 'x-down', pt: 20, dt: 3.66, et: 55, dr: 70, er: 60,
    dist: 172, unit: 'au', T: 22, loss: 0.5, ebn0: 2.5, margin: 3,
    note: 'Entfernung ca. 172 AE (Herbst 2026). Real sendet Voyager 1 mit 160 bit/s – die Rechnung zeigt, warum nur noch der 70-m-Spiegel sicher empfängt.',
  },
  {
    id: 'mars-x', label: 'Mars-Orbiter → 34 m (X-Downlink)', band: 'x-down', pt: 100, dt: 3.0, et: 55, dr: 34, er: 65,
    target: 'mars', T: 30, loss: 1, ebn0: 1.0, margin: 3,
    note: 'MRO-ähnlich: 100-W-Wanderfeldröhre, 3-m-Hochgewinnantenne, Turbo-Code (Eb/N0 ≈ 1 dB). Entfernung live aus der Marsbahn.',
  },
  {
    id: 'mars-ka', label: 'Mars-Orbiter → 34 m (Ka-Downlink 32 GHz)', band: 'ka-down', pt: 35, dt: 3.0, et: 50, dr: 34, er: 55,
    target: 'mars', T: 45, loss: 2, ebn0: 1.0, margin: 4,
    note: 'Ka-Band: ~11,6 dB mehr Gewinn je Antenne als X, aber höhere Rausch­temperatur und wetter­empfindlich (Zusatzverlust/Reserve höher).',
  },
  {
    id: 'mars-up', label: 'Uplink: 34 m, 20 kW → Mars-Sonde (X 7,18 GHz)', band: 'x-up', pt: 20000, dt: 34, et: 65, dr: 3.0, er: 55,
    target: 'mars', T: 500, loss: 1, ebn0: 9.6, margin: 3,
    note: 'Kommandostrecke: der Bordempfänger ist viel wärmer (≈ 500 K); unkodiertes BPSK braucht Eb/N0 ≈ 9,6 dB für 10⁻⁵ Bitfehler.',
  },
  {
    id: 'moon-ka', label: 'Mond-Orbiter → 18 m (Ka erdnah 26 GHz)', band: 'ka-near', pt: 40, dt: 0.75, et: 55, dr: 18, er: 60,
    target: 'moon', T: 150, loss: 3, ebn0: 4.0, margin: 3,
    note: 'LRO-ähnlich. Ergebnis ist die leistungsbegrenzte Obergrenze – real begrenzen zugeteilte Bandbreite und Modulator (LRO: 100 Mbit/s).',
  },
];

function linkBudget(p) {
  const f = p.ghz * 1e9;
  const lambda = C_M_S / f;
  const gain = (D, eta) => 10 * Math.log10(eta * (Math.PI * D / lambda) ** 2);
  const Gt = gain(p.dt, p.et), Gr = gain(p.dr, p.er);
  const dM = p.distKm * 1000;
  const fspl = 20 * Math.log10((4 * Math.PI * dM) / lambda);
  const ptDbw = 10 * Math.log10(p.pt);
  const eirp = ptDbw + Gt;
  const prDbw = eirp + Gr - fspl - p.loss;
  const n0 = 10 * Math.log10(K_BOLTZ * p.T);
  const cn0 = prDbw - n0;
  const rDb = cn0 - p.ebn0 - p.margin;
  return {
    lambda, Gt, Gr, fspl, ptDbw, eirp, prDbw, n0, cn0, rDb, rate: 10 ** (rDb / 10),
    beamT: 70 * lambda / p.dt, beamR: 70 * lambda / p.dr, // −3-dB-Halbwertsbreite in Grad (Näherung)
    flux: (p.pt * 10 ** (Gt / 10)) / (4 * Math.PI * dM * dM),
  };
}

/* =====================================================================================
   Weltkarte – Schema der drei Komplexe
   ===================================================================================== */
const MAP_W = 720, MAP_H = 360;
const proj = (lon, lat) => [((lon + 180) / 360) * MAP_W, ((90 - lat) / 180) * MAP_H];

// Subsolarer Punkt (Näherung, Genauigkeit ~0,1°) – für die Tag-/Nachtgrenze
function subsolar(date) {
  const n = julianDate(date) - 2451545.0;
  const L = 280.46 + 0.9856474 * n, g = (357.528 + 0.9856003 * n) * DEG;
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const eps = (23.439 - 4e-7 * n) * DEG;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const gmst = (280.46061837 + 360.98564736629 * n) * DEG;
  let lon = (ra - gmst) / DEG;
  lon = ((lon + 180) % 360 + 360) % 360 - 180;
  return { lat: dec / DEG, lon };
}
function nightPath(date) {
  const sp = subsolar(date);
  let dec = sp.lat; if (Math.abs(dec) < 0.05) dec = 0.05 * Math.sign(dec || 1);
  const td = Math.tan(dec * DEG);
  const pts = [];
  for (let lon = -180; lon <= 180; lon += 3) {
    const lat = Math.atan(-Math.cos((lon - sp.lon) * DEG) / td) / DEG;
    pts.push(proj(lon, lat));
  }
  const edge = dec > 0 ? MAP_H : 0; // Sonne nördlich → Nacht reicht bis zum Südrand
  let d = `M0 ${edge} `;
  for (const [x, y] of pts) d += `L${x.toFixed(1)} ${y.toFixed(1)} `;
  d += `L${MAP_W} ${edge} Z`;
  return { d, sun: proj(sp.lon, sp.lat) };
}

function buildMapSvg() {
  const svg = s('svg', { viewBox: `0 0 ${MAP_W} ${MAP_H}`, class: 'dsn-map', role: 'img', 'aria-label': 'Weltkarte mit den drei DSN-Komplexen und ihren aktiven Verbindungen' });
  const defs = s('defs');
  const grad = s('radialGradient', { id: 'dsnGlow' });
  grad.append(s('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '0.9' }), s('stop', { offset: '1', 'stop-color': '#fff', 'stop-opacity': '0' }));
  defs.append(grad);
  svg.append(defs);
  svg.append(s('rect', { x: 0, y: 0, width: MAP_W, height: MAP_H, class: 'dsn-map-bg' }));
  const grid = s('g', { class: 'dsn-map-grid' });
  for (let lon = -150; lon <= 150; lon += 30) { const [x] = proj(lon, 0); grid.append(s('line', { x1: x, y1: 0, x2: x, y2: MAP_H })); }
  for (let lat = -60; lat <= 60; lat += 30) { const [, y] = proj(0, lat); grid.append(s('line', { x1: 0, y1: y, x2: MAP_W, y2: y, class: lat === 0 ? 'eq' : null })); }
  svg.append(grid);
  const land = s('g', { class: 'dsn-map-land' });
  svg.append(land);
  const night = s('path', { class: 'dsn-map-night' });
  svg.append(night);
  const sun = s('g', { class: 'dsn-map-sun' });
  sun.append(s('circle', { r: 14, fill: 'url(#dsnGlow)', opacity: 0.35 }), s('circle', { r: 4 }));
  svg.append(sun);
  const links = s('g', { class: 'dsn-map-links' });
  const sites = s('g', { class: 'dsn-map-sites' });
  svg.append(links, sites);

  // Ländermittelpunkte als dezentes Punktraster (Natural Earth, gemeinfrei) – nachgeladen
  import('../../data/places/countries.json').then((mod) => {
    const rows = (mod.default ?? mod).f ?? [];
    const frag = document.createDocumentFragment();
    for (const r of rows) {
      const lat = Number(r[0]), lon = Number(r[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const [x, y] = proj(lon, lat);
      frag.append(s('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 1.5 }));
    }
    land.append(frag);
  }).catch(() => {});

  return { svg, night, sun, links, sites };
}

/* =====================================================================================
   Panel
   ===================================================================================== */
const TEMPLATE = `
<div class="dsn-wrap">
  <header class="dsn-head">
    <div>
      <h2 class="dsn-title">Deep Space Network</h2>
      <p class="dsn-sub">Live-Funkverbindungen der NASA-Bodenstationen · Lichtlaufzeit · Link-Budget</p>
    </div>
    <div class="dsn-status" data-k="status" data-state="idle" role="status" aria-live="polite">
      <span class="dsn-dot" aria-hidden="true"></span><span data-k="statusText">Wartet auf Aktivierung</span>
    </div>
  </header>

  <div class="dsn-tabs" role="tablist" aria-label="Bereiche">
    <button type="button" role="tab" data-tab="live" aria-selected="true">Live-Status</button>
    <button type="button" role="tab" data-tab="light" aria-selected="false">Lichtlaufzeit</button>
    <button type="button" role="tab" data-tab="link" aria-selected="false">Link-Budget</button>
  </div>

  <section class="dsn-panel" data-panel="live" role="tabpanel">
    <div class="dsn-card dsn-mapcard">
      <div class="dsn-card-h">
        <h3>Drei Komplexe, 120° auseinander</h3>
        <div class="dsn-legend">
          <span><i class="lg down"></i>Downlink</span><span><i class="lg up"></i>Uplink</span><span><i class="lg night"></i>Nachtseite</span>
        </div>
      </div>
      <div class="dsn-mapbox" data-k="map"></div>
      <p class="dsn-hint">Jeder Strahl ist eine aktive Antenne: Richtung = Azimut, Länge wächst mit sinkender Elevation (am Horizont am längsten).
        Weil die Komplexe rund 120° Länge auseinanderliegen, sieht immer mindestens einer jede Raumsonde fern der Erde, während die Erde sich dreht.</p>
    </div>
    <div class="dsn-kpis" data-k="kpis"></div>
    <div class="dsn-complexes" data-k="complexes"></div>
  </section>

  <section class="dsn-panel" data-panel="light" role="tabpanel" hidden>
    <div class="dsn-grid2">
      <div class="dsn-card">
        <h3>Lichtlaufzeit-Rechner</h3>
        <label class="dsn-field"><span class="dsn-field-l">Ziel</span><select class="dsn-select" data-k="ltTarget"></select></label>
        <div class="dsn-readout" data-k="ltOut"></div>
        <details class="dsn-formula">
          <summary>So wird gerechnet</summary>
          <div class="dsn-formula-b">
            <p>Licht und Funk laufen mit <b>c = 299 792,458 km/s</b> – exakt, denn seit 1983 ist der Meter über c definiert.
              Die Einweg-Lichtlaufzeit ist <code>τ = d / c</code>, die Hin-und-zurück-Zeit (Round-Trip Light Time, RTLT) <code>≈ 2·τ</code>.
              1 AE = 149 597 870,7 km entspricht 499,005 s ≈ 8 min 19 s.</p>
            <p>Planeten: Keplerbahnen nach Standish (JPL), wie im Rest der App. Erde = Erde-Mond-Schwerpunkt minus Mondanteil
              (<code>M<sub>Mond</sub>/(M<sub>Erde</sub>+M<sub>Mond</sub>) ≈ 0,01215</code>).
              Erdmond: verkürzte Mondtheorie nach Meeus (Kap. 47). Andere Monde: mittlere JPL-Bahnelemente relativ zum Planeten.</p>
            <p>Die Entfernung ist lichtzeitkorrigiert: das heute eintreffende Signal hat den Körper zur Zeit <code>t − τ</code> verlassen,
              deshalb wird <code>d = |r<sub>Körper</sub>(t − τ) − r<sub>Erde</sub>(t)|</code> iteriert. Für Raumsonden stammen Entfernung und RTLT direkt aus dem DSN-Feed
              (gemessen über Ranging/Doppler), sobald eine Antenne die Sonde verfolgt.</p>
          </div>
        </details>
      </div>
      <div class="dsn-card">
        <h3>Sonnensystem – jetzt</h3>
        <div class="dsn-tablewrap"><table class="dsn-table" data-k="ltTable">
          <thead><tr><th>Ziel</th><th>Entfernung</th><th>Einweg</th><th>Hin &amp; zurück</th></tr></thead><tbody></tbody>
        </table></div>
        <h4>Raumsonden (aus dem DSN-Feed)</h4>
        <div class="dsn-tablewrap"><table class="dsn-table" data-k="scTable">
          <thead><tr><th>Sonde</th><th>Entfernung</th><th>Einweg</th><th>RTLT</th></tr></thead><tbody></tbody>
        </table></div>
        <p class="dsn-hint" data-k="scHint"></p>
      </div>
    </div>
  </section>

  <section class="dsn-panel" data-panel="link" role="tabpanel" hidden>
    <div class="dsn-grid2">
      <div class="dsn-card">
        <h3>Link-Budget</h3>
        <label class="dsn-field"><span class="dsn-field-l">Beispiel laden</span><select class="dsn-select" data-k="lbPreset"></select></label>
        <p class="dsn-hint" data-k="lbNote"></p>
        <h4>Frequenz</h4>
        <div class="dsn-row">
          <label class="dsn-field grow"><span class="dsn-field-l">Band</span><select class="dsn-select" data-k="lbBand"></select></label>
          <label class="dsn-field"><span class="dsn-field-l">f (GHz)</span><input class="dsn-in" data-k="lbF" inputmode="decimal" autocomplete="off"></label>
        </div>
        <p class="dsn-hint">Tiefraum-Ka nutzt 31,8–32,3 GHz (Downlink) und 34,2–34,7 GHz (Uplink). Die 26 GHz, die die App an anderer Stelle nennt,
          sind das Ka-Band für erdnahe Missionen (25,5–27 GHz, z. B. Mond-Orbiter) – beides ist „Ka“.</p>
        <h4>Sender</h4>
        <div class="dsn-row">
          <label class="dsn-field"><span class="dsn-field-l">Leistung P<sub>t</sub> (W)</span><input class="dsn-in" data-k="lbPt" inputmode="decimal" autocomplete="off"></label>
          <label class="dsn-field"><span class="dsn-field-l">Antenne Ø (m)</span><input class="dsn-in" data-k="lbDt" inputmode="decimal" autocomplete="off"></label>
          <label class="dsn-field"><span class="dsn-field-l">Wirkungsgrad η (%)</span><input class="dsn-in" data-k="lbEt" inputmode="decimal" autocomplete="off"></label>
        </div>
        <h4>Empfänger</h4>
        <div class="dsn-row">
          <label class="dsn-field"><span class="dsn-field-l">Antenne Ø (m)</span><input class="dsn-in" data-k="lbDr" inputmode="decimal" autocomplete="off"></label>
          <label class="dsn-field"><span class="dsn-field-l">Wirkungsgrad η (%)</span><input class="dsn-in" data-k="lbEr" inputmode="decimal" autocomplete="off"></label>
          <label class="dsn-field"><span class="dsn-field-l">Rauschtemp. T<sub>sys</sub> (K)</span><input class="dsn-in" data-k="lbT" inputmode="decimal" autocomplete="off"></label>
        </div>
        <h4>Strecke &amp; Anforderung</h4>
        <div class="dsn-row">
          <label class="dsn-field grow"><span class="dsn-field-l">Entfernung</span><input class="dsn-in" data-k="lbD" inputmode="decimal" autocomplete="off"></label>
          <label class="dsn-field"><span class="dsn-field-l">Einheit</span><select class="dsn-select" data-k="lbUnit">
            <option value="km">km</option><option value="mkm">Mio. km</option><option value="au">AE</option></select></label>
          <label class="dsn-field grow"><span class="dsn-field-l">Entfernung von</span><select class="dsn-select" data-k="lbFrom"><option value="">– manuell –</option></select></label>
        </div>
        <div class="dsn-row">
          <label class="dsn-field"><span class="dsn-field-l">Zusatzverluste (dB)</span><input class="dsn-in" data-k="lbL" inputmode="decimal" autocomplete="off"></label>
          <label class="dsn-field"><span class="dsn-field-l">nötiges E<sub>b</sub>/N<sub>0</sub> (dB)</span><input class="dsn-in" data-k="lbEb" inputmode="decimal" autocomplete="off"></label>
          <label class="dsn-field"><span class="dsn-field-l">Reserve (dB)</span><input class="dsn-in" data-k="lbM" inputmode="decimal" autocomplete="off"></label>
        </div>
      </div>
      <div class="dsn-card">
        <h3>Ergebnis</h3>
        <div class="dsn-big" data-k="lbRate"></div>
        <dl class="dsn-dl" data-k="lbOut"></dl>
        <details class="dsn-formula">
          <summary>Formeln</summary>
          <div class="dsn-formula-b">
            <p><b>Wellenlänge</b> <code>λ = c / f</code></p>
            <p><b>Antennengewinn</b> (Parabolspiegel) <code>G = η · (π·D / λ)²</code>, in dBi: <code>10·log₁₀(G)</code>.
              Halbwertsbreite ≈ <code>70° · λ / D</code>.</p>
            <p><b>Freiraumdämpfung</b> <code>L<sub>FS</sub> = (4π·d / λ)²</code>, in dB: <code>20·log₁₀(4π·d / λ)</code> – sie ist kein Absorptionsverlust,
              sondern die Verteilung der Leistung auf eine Kugelfläche 4πd², bezogen auf die Wirkfläche einer isotropen Antenne λ²/4π.</p>
            <p><b>Empfangsleistung</b> <code>P<sub>r</sub> = P<sub>t</sub> + G<sub>t</sub> + G<sub>r</sub> − L<sub>FS</sub> − L<sub>zus</sub></code> (alles in dB/dBW).
              EIRP = <code>P<sub>t</sub> + G<sub>t</sub></code>; dBm = dBW + 30.</p>
            <p><b>Rauschleistungsdichte</b> <code>N<sub>0</sub> = k · T<sub>sys</sub></code> mit k = 1,380649·10⁻²³ J/K, in dBW/Hz: <code>−228,6 + 10·log₁₀(T)</code>.</p>
            <p><b>Träger-Rausch-Dichte</b> <code>C/N<sub>0</sub> = P<sub>r</sub> − N<sub>0</sub></code> (dB-Hz).</p>
            <p><b>Maximale Datenrate</b> aus <code>E<sub>b</sub>/N<sub>0</sub> = (C/N<sub>0</sub>) / R</code>:
              <code>R<sub>max</sub> = 10^((C/N<sub>0</sub> − E<sub>b</sub>/N<sub>0</sub> − Reserve) / 10)</code> bit/s.
              Typische Schwellen für 10⁻⁵…10⁻⁶ Bitfehler: unkodiert BPSK ≈ 9,6 dB, Faltungs-/Reed-Solomon-Code ≈ 2,5 dB, Turbo/LDPC ≈ 1 dB
              (Shannon-Grenze −1,6 dB).</p>
            <p class="dsn-muted">Nicht modelliert: Polarisations- und Pointingverluste im Detail, Regendämpfung (Ka), Trägerleistungsanteil (Modulationsindex), Bandbreitengrenzen.</p>
          </div>
        </details>
      </div>
    </div>
  </section>

  <p class="dsn-src">Live-Daten: NASA/JPL „DSN Now“ (eyes.nasa.gov/dsn), öffentlicher Feed, etwa alle 5 s aktualisiert; Nutzung nach den NASA Media Usage Guidelines.
    Bahnen: JPL (Standish; Satellite Mean Elements), Mond nach Meeus. Ländermittelpunkte: Natural Earth (gemeinfrei).</p>
</div>`;

export function createDsnPanel(container) {
  const root = document.createElement('div');
  root.className = 'dsn';
  root.innerHTML = TEMPLATE; // statisches Gerüst ohne Fremddaten
  container.append(root);
  const $ = (k) => root.querySelector(`[data-k="${k}"]`);

  /* --- Zustand --- */
  let active = false;
  let tab = 'live';
  let pollTimer = 0, tickTimer = 0, abort = null, failures = 0;
  let feed = null, config = null, lastOk = 0, lastError = '';
  let scKey = '';

  const sitesOf = () => config?.sites ?? FALLBACK_SITES;
  const dishType = (name) => config?.dishTypes?.[name] || FALLBACK_DISH_TYPES[name] || '34M';
  const scName = (code) => config?.names?.get(code.toLowerCase()) || code;
  const dishLabel = (name) => name.replace(/^DSS(\d+)$/i, 'DSS $1');
  function dishSize(name) {
    const t = dishType(name);
    const m = /^(\d+)M(.*)$/i.exec(t);
    if (!m) return t;
    const kind = m[2] === 'HEF' ? ' HEF' : m[1] === '34' ? ' BWG' : '';
    return `${m[1]} m${kind}`;
  }

  /* --- Tabs --- */
  const tabs = [...root.querySelectorAll('[data-tab]')];
  function showTab(name) {
    tab = name;
    for (const b of tabs) b.setAttribute('aria-selected', String(b.dataset.tab === name));
    for (const p of root.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== name;
    if (name === 'light') renderLight();
    if (name === 'link') computeLink();
  }
  root.querySelector('.dsn-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) showTab(b.dataset.tab);
  });
  root.querySelector('.dsn-tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = tabs.findIndex((b) => b.dataset.tab === tab);
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    showTab(n.dataset.tab); n.focus();
  });

  /* --- Karte --- */
  const map = buildMapSvg();
  $('map').append(map.svg);

  function renderMap() {
    const { d, sun } = nightPath(new Date());
    map.night.setAttribute('d', d);
    map.sun.setAttribute('transform', `translate(${sun[0].toFixed(1)} ${sun[1].toFixed(1)})`);
    const sites = sitesOf();
    map.sites.replaceChildren(); map.links.replaceChildren();
    const placed = Object.values(sites).flatMap((v) => { const [px, py] = proj(v.lon, v.lat); return [{ x: px - 36, y: py + 30, w: 72 }, { x: px - 24, y: py + 43, w: 48 }, { x: px - 8, y: py + 8, w: 16 }]; });
    for (const [id, site] of Object.entries(sites)) {
      const [x, y] = proj(site.lon, site.lat);
      const hue = SITE_INFO[id]?.hue ?? '#6ea8ff';
      const st = feed?.stations.find((v) => v.id === id);
      const nActive = st ? st.dishes.filter((dd) => linksOf(dd).some((l) => l.active)).length : 0;
      const g = s('g', { class: 'dsn-site', transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})`, style: `--c:${hue}` });
      g.append(s('circle', { r: 16, class: 'pulse' }), s('circle', { r: 5.5, class: 'core' }));
      const label = s('text', { y: 30, class: 'name', 'text-anchor': 'middle' }, site.name);
      const sub = s('text', { y: 43, class: 'sub', 'text-anchor': 'middle' }, feed ? `${nActive} aktiv` : '');
      g.append(label, sub);
      map.sites.append(g);
      if (!st) continue;
      let k = 0;
      for (const dish of st.dishes) {
        const ls = linksOf(dish).filter((l) => l.active);
        if (!ls.length || dish.az == null || dish.el == null) continue;
        const az = dish.az * DEG, len = 26 + 74 * Math.cos(Math.max(0, Math.min(90, dish.el)) * DEG);
        const dx = Math.sin(az), dy = -Math.cos(az);
        const x2 = x + dx * len, y2 = y + dy * len;
        const up = ls.some((l) => l.up), down = ls.some((l) => l.down);
        const cls = `ray ${up && down ? 'both' : up ? 'up' : 'down'}`;
        const ray = s('g', { class: cls, style: `--c:${hue}; --d:${(k++ * 0.37) % 1.6}s` });
        ray.append(s('line', { x1: x.toFixed(1), y1: y.toFixed(1), x2: x2.toFixed(1), y2: y2.toFixed(1), class: 'base' }));
        if (down) ray.append(s('line', { x1: x2.toFixed(1), y1: y2.toFixed(1), x2: x.toFixed(1), y2: y.toFixed(1), class: 'flow down' }));
        if (up) ray.append(s('line', { x1: x.toFixed(1), y1: y.toFixed(1), x2: x2.toFixed(1), y2: y2.toFixed(1), class: 'flow up' }));
        ray.append(s('circle', { cx: x2.toFixed(1), cy: y2.toFixed(1), r: 2.6, class: 'tip' }));
        const names = ls.map((l) => scName(l.code));
        const short = names.map((n) => (n.length > 18 ? `${n.slice(0, 17)}…` : n)).join(' · ');
        const anchor = dx > 0.25 ? 'start' : dx < -0.25 ? 'end' : 'middle';
        const lx = x2 + dx * 5;
        let ly = y2 + dy * 5 + (dy > 0.3 ? 8 : dy < -0.3 ? -2 : 3);
        // einfache Kollisionsvermeidung: Beschriftungen ähnlicher Richtung übereinander stapeln
        const w = short.length * 4.9 + 4, x0 = anchor === 'start' ? lx : anchor === 'end' ? lx - w : lx - w / 2;
        const step = dy < -0.3 ? -11 : 11;
        for (let k2 = 0; k2 < 12 && placed.some((b) => x0 < b.x + b.w && x0 + w > b.x && ly - 9 < b.y && ly > b.y - 9); k2++) ly += step;
        placed.push({ x: x0, y: ly, w });
        const tx = s('text', { x: lx.toFixed(1), y: ly.toFixed(1), 'text-anchor': anchor, class: 'sc' }, short);
        const title = s('title', null, `${dishLabel(dish.name)} → ${names.join(', ')} · Az ${fmt(dish.az, 0)}°, El ${fmt(dish.el, 0)}°`);
        ray.append(tx, title);
        map.links.append(ray);
      }
    }
  }

  /* --- Live-Ansicht --- */
  function signalChip(sg, dir) {
    const bandKey = sg.band === 'KA' ? 'KA' : sg.band;
    const bi = BAND_INFO[bandKey];
    const band = bi ? bi.label : sg.band || '?';
    const parts = [];
    const ghz = sg.freq > 0 ? sg.freq / 1e9 : bi ? (dir === 'up' ? bi.up : bi.down) : null;
    parts.push(`${band}-Band${ghz ? ` · ${sg.freq > 0 ? fmt(ghz, 4) : `≈${fmt(ghz, ghz < 10 ? 1 : 0)}`} GHz` : ''}`);
    if (dir === 'down') {
      if (sg.rate > 0) parts.push(fmtRate(sg.rate));
      if (sg.power != null && sg.power > -300) parts.push(`${fmt(sg.power, 0)} dBm`);
    } else {
      if (sg.power != null && sg.power > 0) parts.push(`${fmtSig(sg.power, 2)} kW`);
      if (sg.rate > 0) parts.push(fmtRate(sg.rate));
    }
    const chip = h('span', { class: `dsn-chip ${dir}${sg.active ? '' : ' off'}`, title: `${dir === 'up' ? 'Uplink (Erde → Sonde)' : 'Downlink (Sonde → Erde)'}${sg.active ? '' : ' – nicht aktiv'}${bi?.note ? ` · ${bi.note}` : ''}${sg.type && sg.type !== 'none' ? ` · Signal: ${sg.type}` : ''}` });
    chip.append(h('b', { 'aria-hidden': 'true', text: dir === 'up' ? '▲' : '▼' }), h('span', { class: 'sr', text: dir === 'up' ? 'Uplink: ' : 'Downlink: ' }), parts.join(' · '));
    return chip;
  }

  function renderLive() {
    const sites = sitesOf();
    const box = $('complexes');
    if (!feed) {
      if (!box.firstChild) box.append(h('div', { class: 'dsn-card dsn-empty', text: lastError ? `DSN-Daten nicht verfügbar: ${lastError}` : 'Lade DSN-Daten …' }));
      else if (lastError && box.querySelector('.dsn-empty')) box.querySelector('.dsn-empty').textContent = `DSN-Daten nicht verfügbar: ${lastError}`;
      return;
    }
    const frag = document.createDocumentFragment();
    let nLinks = 0, nDishes = 0, nBusy = 0, maxRate = 0, maxRateSc = '', far = 0, farSc = '';
    const scSet = new Set();
    const order = ['gdscc', 'mdscc', 'cdscc'];
    const stations = [...feed.stations].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    for (const st of stations) {
      const info = SITE_INFO[st.id] ?? { region: '', hue: '#6ea8ff' };
      const site = sites[st.id];
      const card = h('article', { class: 'dsn-card dsn-complex', style: `--c:${info.hue}` });
      const local = new Date(Date.now() + st.tz);
      const activeDishes = st.dishes.filter((d) => linksOf(d).some((l) => l.active)).length;
      card.append(h('header', { class: 'dsn-cx-h' },
        h('div', null, h('h3', { text: st.name || site?.name || st.id }), h('p', { class: 'dsn-cx-r', text: info.region })),
        h('div', { class: 'dsn-cx-m' },
          h('span', { class: 'dsn-cx-time', 'data-tz': String(st.tz), text: utcFmt.format(local) }),
          h('span', { class: 'dsn-cx-n', text: `${activeDishes}/${st.dishes.length} Antennen aktiv` })),
      ));
      const list = h('div', { class: 'dsn-dishes' });
      for (const dish of st.dishes) {
        nDishes++;
        const links = linksOf(dish);
        const isActive = links.some((l) => l.active);
        if (isActive) nBusy++;
        const big = dishType(dish.name).startsWith('70');
        const flags = [dish.array && 'Antennen-Array', dish.mspa && 'MSPA (mehrere Sonden je Antenne)', dish.ddor && 'Delta-DOR'].filter(Boolean);
        const el = h('div', { class: `dsn-dish${isActive ? ' on' : links.length ? ' busy' : ' idle'}${big ? ' big' : ''}` });
        el.append(h('div', { class: 'dsn-dish-h' },
          h('span', { class: 'dsn-dish-n', text: dishLabel(dish.name) }),
          h('span', { class: 'dsn-dish-t', text: dishSize(dish.name) }),
          h('span', { class: 'dsn-dish-a', text: dish.activity || (links.length ? 'belegt' : 'frei') }),
          h('span', { class: 'dsn-dish-ae', title: 'Azimut / Elevation der Antenne' + (dish.wind != null ? ` · Wind ${fmt(dish.wind, 0)} km/h` : ''), text: dish.az != null && dish.el != null ? `Az ${fmt(dish.az, 0)}° · El ${fmt(dish.el, 0)}°` : '' }),
        ));
        if (flags.length) el.append(h('div', { class: 'dsn-flags', text: flags.join(' · ') }));
        for (const l of links) {
          if (l.active) { nLinks++; scSet.add(l.code.toUpperCase()); }
          const name = scName(l.code);
          for (const sg of l.downs) if (sg.active && sg.rate > maxRate) { maxRate = sg.rate; maxRateSc = name; }
          if (l.range && l.range > far) { far = l.range; farSc = name; }
          const row = h('div', { class: `dsn-link${l.active ? ' on' : ''}` });
          row.append(h('div', { class: 'dsn-link-h' },
            h('span', { class: 'dsn-sc', text: name }),
            name !== l.code ? h('span', { class: 'dsn-code', text: l.code }) : null));
          const chips = h('div', { class: 'dsn-chips' });
          for (const sg of l.downs) chips.append(signalChip(sg, 'down'));
          for (const sg of l.ups) chips.append(signalChip(sg, 'up'));
          if (chips.childNodes.length) row.append(chips);
          if (l.range || l.rtlt) {
            row.append(h('div', { class: 'dsn-link-m' },
              h('span', { text: `Entfernung ${fmtKm(l.range)}` }),
              h('span', { text: `RTLT ${fmtDur(l.rtlt)}` })));
          }
          el.append(row);
        }
        list.append(el);
      }
      card.append(list);
      frag.append(card);
    }
    box.replaceChildren(frag);

    const kpi = (v, k, sub) => h('div', { class: 'dsn-kpi' }, h('span', { class: 'v', text: v }), h('span', { class: 'k', text: k }), sub ? h('span', { class: 's', text: sub }) : null);
    $('kpis').replaceChildren(
      kpi(fmt(nLinks), 'aktive Verbindungen'),
      kpi(fmt(scSet.size), 'Raumsonden in Kontakt'),
      kpi(`${nBusy}/${nDishes}`, 'Antennen aktiv'),
      kpi(fmtRate(maxRate), 'höchste Downlink-Rate', maxRateSc),
      kpi(far ? fmtDur((2 * far) / C_KM_S) : '–', 'längste RTLT', farSc ? `${farSc} · ${fmtKm(far)}` : 'keine Entfernung im Feed'),
    );
  }

  function tickClocks() {
    for (const el of root.querySelectorAll('.dsn-cx-time')) el.textContent = utcFmt.format(new Date(Date.now() + Number(el.dataset.tz)));
  }

  /* --- Status --- */
  function setStatus(state, text) {
    const st = $('status');
    st.dataset.state = state;
    $('statusText').textContent = text;
  }
  function updateStatusAge() {
    if (!feed) return;
    const stamp = feed.timestamp ?? lastOk;
    const age = Math.max(0, Math.round((Date.now() - stamp) / 1000));
    const ageTxt = age < 90 ? `${age} s` : `${Math.round(age / 60)} min`;
    if (!active) setStatus('paused', `Pausiert · Stand vor ${ageTxt}`);
    else if (lastError) setStatus('warn', `Verbindungsproblem (${lastError}) · Stand vor ${ageTxt}`);
    else setStatus(age > 60 ? 'warn' : 'live', `Live · Stand vor ${ageTxt}`);
  }

  /* --- Abruf --- */
  async function poll() {
    pollTimer = 0;
    if (!active) return;
    abort?.abort();
    const ctrl = new AbortController(); abort = ctrl;
    if (!config) loadConfig().then((c) => { config = c; if (feed) renderAll(); }).catch(() => {});
    try {
      const text = await fetchText(`${FEED_URL}?r=${Math.floor(Date.now() / 5000)}`, ctrl.signal);
      if (ctrl.signal.aborted) return;
      feed = parseFeed(text);
      lastOk = Date.now(); lastError = ''; failures = 0;
      renderAll();
    } catch (e) {
      if (ctrl.signal.aborted) return;
      failures++;
      lastError = e?.message || 'Netzwerkfehler';
      if (!feed) { setStatus('error', `DSN-Daten nicht erreichbar (${lastError}) – neuer Versuch läuft`); renderLive(); }
    } finally {
      if (abort === ctrl) abort = null;
    }
    updateStatusAge();
    if (active) pollTimer = setTimeout(poll, failures ? Math.min(60000, POLL_MS * 2 ** Math.min(failures, 3)) : POLL_MS);
  }

  function renderAll() {
    renderLive();
    renderMap();
    refreshSpacecraftOptions();
    if (tab === 'light') renderLight();
  }

  /* --- Lichtlaufzeit --- */
  const ltSel = $('ltTarget');
  const lbFrom = $('lbFrom');
  const spacecraftList = () => {
    if (!feed) return [];
    const best = new Map();
    for (const st of feed.stations) for (const d of st.dishes) for (const l of linksOf(d)) {
      if (!(l.range > 0) && !(l.rtlt > 0)) continue;
      const key = l.code.toUpperCase();
      const prev = best.get(key);
      if (!prev || (l.range ?? 0) > (prev.range ?? 0)) best.set(key, { code: l.code, name: scName(l.code), range: l.range, rtlt: l.rtlt, dish: dishLabel(d.name), site: st.name });
    }
    return [...best.values()].sort((a, b) => (b.range ?? 0) - (a.range ?? 0));
  };

  function fillTargetSelect(sel, withManual) {
    const keep = sel.value;
    sel.replaceChildren();
    if (withManual) sel.append(h('option', { value: '', text: '– manuell –' }));
    const groups = new Map();
    for (const t of TARGETS) {
      if (!groups.has(t.group)) { const g = h('optgroup', { label: t.group }); groups.set(t.group, g); sel.append(g); }
      groups.get(t.group).append(h('option', { value: t.id, text: t.name }));
    }
    const scs = spacecraftList();
    if (scs.length) {
      const g = h('optgroup', { label: 'Raumsonden (DSN live)' });
      for (const sc of scs) g.append(h('option', { value: `sc:${sc.code.toUpperCase()}`, text: sc.name }));
      sel.append(g);
    }
    if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
  }
  function refreshSpacecraftOptions() {
    const key = spacecraftList().map((s) => s.code).join(',');
    if (key === scKey) return;
    scKey = key;
    fillTargetSelect(ltSel, false);
    fillTargetSelect(lbFrom, true);
  }
  fillTargetSelect(ltSel, false);
  fillTargetSelect(lbFrom, true);
  ltSel.value = 'mars';

  // Entfernung (km) + Einweg-Zeit für eine Auswahl
  function resolveTarget(id, date = new Date()) {
    if (!id) return null;
    if (id.startsWith('sc:')) {
      const sc = spacecraftList().find((v) => v.code.toUpperCase() === id.slice(3));
      if (!sc) return null;
      const oneWay = sc.rtlt ? sc.rtlt / 2 : sc.range / C_KM_S;
      return { name: sc.name, dist: sc.range ?? oneWay * C_KM_S, oneWay, rtlt: sc.rtlt ?? 2 * oneWay, live: true, via: `${sc.dish}, ${sc.site}` };
    }
    const t = TARGET_BY_ID.get(id);
    if (!t) return null;
    const r = lightTime(t, date);
    return { name: t.name, dist: r.dist, oneWay: r.oneWay, rtlt: 2 * r.oneWay };
  }

  function renderLight() {
    const now = new Date();
    const r = resolveTarget(ltSel.value, now);
    const out = $('ltOut');
    if (!r) {
      out.replaceChildren(h('p', { class: 'dsn-muted', text: 'Für diese Sonde liegt gerade keine Entfernung im Feed vor.' }));
    } else {
      const arrive = new Date(now.getTime() + r.oneWay * 1000);
      const back = new Date(now.getTime() + r.rtlt * 1000);
      out.replaceChildren(
        h('div', { class: 'dsn-lt-main' },
          h('span', { class: 'v', text: fmtDur(r.oneWay) }), h('span', { class: 'k', text: 'Einweg-Lichtlaufzeit' })),
        h('dl', { class: 'dsn-dl' },
          h('dt', { text: 'Hin und zurück' }), h('dd', { text: fmtDur(r.rtlt) }),
          h('dt', { text: 'Entfernung' }), h('dd', { text: `${fmtKm(r.dist)} · ${fmtAu(r.dist)}` }),
          h('dt', { text: 'Jetzt gesendet, kommt an' }), h('dd', { text: r.oneWay < 86400 ? clockFmt.format(arrive) : arrive.toLocaleString('de-DE') }),
          h('dt', { text: 'Antwort frühestens' }), h('dd', { text: r.rtlt < 86400 ? clockFmt.format(back) : back.toLocaleString('de-DE') }),
          h('dt', { text: 'In Lichtminuten' }), h('dd', { text: `${fmt(r.oneWay / 60, r.oneWay < 600 ? 3 : 1)} min` }),
          r.live ? h('dt', { text: 'Quelle' }) : null, r.live ? h('dd', { text: `DSN-Feed (${r.via})` }) : null),
      );
    }
    const tb = $('ltTable').tBodies[0];
    const rows = document.createDocumentFragment();
    for (const t of TARGETS) {
      if (t.group !== 'Sonne & Planeten' && t.id !== 'moon') continue;
      const v = lightTime(t, now);
      const tr = h('tr', { class: t.id === ltSel.value ? 'sel' : null, 'data-id': t.id },
        h('th', null, h('i', { class: 'sw', style: `background:${t.color ?? '#ffcc55'}` }), t.name),
        h('td', { text: v.dist < 1e7 ? fmtKm(v.dist) : fmtAu(v.dist) }), h('td', { text: fmtDur(v.oneWay) }), h('td', { text: fmtDur(2 * v.oneWay) }));
      rows.append(tr);
    }
    tb.replaceChildren(rows);
    const sb = $('scTable').tBodies[0];
    const scs = spacecraftList();
    const srows = document.createDocumentFragment();
    for (const sc of scs) {
      const oneWay = sc.rtlt ? sc.rtlt / 2 : sc.range / C_KM_S;
      srows.append(h('tr', { 'data-id': `sc:${sc.code.toUpperCase()}`, class: ltSel.value === `sc:${sc.code.toUpperCase()}` ? 'sel' : null },
        h('th', { text: sc.name }), h('td', { text: sc.range ? (sc.range < 1e7 ? fmtKm(sc.range) : fmtAu(sc.range)) : '–' }),
        h('td', { text: fmtDur(oneWay) }), h('td', { text: fmtDur(sc.rtlt ?? 2 * oneWay) })));
    }
    sb.replaceChildren(srows);
    $('scHint').textContent = !feed
      ? 'DSN-Feed noch nicht geladen.'
      : scs.length ? 'Entfernung/RTLT melden nur Antennen, die gerade messen (Ranging) – die Liste wechselt daher laufend.'
        : 'Gerade meldet keine Antenne Entfernungsdaten (passiert z. B. während reiner Telemetrie oder Wartung).';
  }
  ltSel.addEventListener('change', renderLight);
  root.querySelector('[data-panel="light"]').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr || ![...ltSel.options].some((o) => o.value === tr.dataset.id)) return;
    ltSel.value = tr.dataset.id; renderLight();
  });

  /* --- Link-Budget --- */
  const lb = Object.fromEntries(['lbPreset', 'lbBand', 'lbF', 'lbPt', 'lbDt', 'lbEt', 'lbDr', 'lbEr', 'lbT', 'lbD', 'lbUnit', 'lbL', 'lbEb', 'lbM', 'lbOut', 'lbRate', 'lbNote'].map((k) => [k, $(k)]));
  lb.lbPreset.append(h('option', { value: '', text: '– eigene Werte –' }), ...LINK_PRESETS.map((p) => h('option', { value: p.id, text: p.label })));
  lb.lbBand.append(...FREQ_PRESETS.map((p) => h('option', { value: p.id, text: p.label })));
  const UNIT_KM = { km: 1, mkm: 1e6, au: AU_KM };
  const parseNum = (input) => {
    const v = Number(String(input.value).trim().replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(v) ? v : NaN;
  };
  const setNum = (input, v, d = 4) => { input.value = Number.isFinite(v) ? String(+v.toFixed(d)).replace('.', ',') : ''; };

  function setDistanceKm(km) {
    const unit = km >= 0.05 * AU_KM ? 'au' : km >= 1e6 ? 'mkm' : 'km';
    lb.lbUnit.value = unit;
    setNum(lb.lbD, km / UNIT_KM[unit], unit === 'km' ? 0 : 4);
  }
  function applyPreset(id) {
    const p = LINK_PRESETS.find((v) => v.id === id);
    lb.lbNote.textContent = p?.note ?? '';
    if (!p) return;
    lb.lbBand.value = p.band;
    setNum(lb.lbF, FREQ_PRESETS.find((f) => f.id === p.band).ghz);
    setNum(lb.lbPt, p.pt); setNum(lb.lbDt, p.dt); setNum(lb.lbEt, p.et); setNum(lb.lbDr, p.dr); setNum(lb.lbEr, p.er);
    setNum(lb.lbT, p.T); setNum(lb.lbL, p.loss); setNum(lb.lbEb, p.ebn0); setNum(lb.lbM, p.margin);
    if (p.target) {
      lbFrom.value = p.target;
      const r = resolveTarget(p.target);
      if (r) setDistanceKm(r.dist);
    } else {
      lbFrom.value = '';
      lb.lbUnit.value = p.unit; setNum(lb.lbD, p.dist);
    }
  }
  lb.lbPreset.addEventListener('change', () => { applyPreset(lb.lbPreset.value); computeLink(); });
  lb.lbBand.addEventListener('change', () => {
    const f = FREQ_PRESETS.find((v) => v.id === lb.lbBand.value);
    if (f?.ghz) setNum(lb.lbF, f.ghz);
    computeLink();
  });
  lbFrom.addEventListener('change', () => {
    const r = resolveTarget(lbFrom.value);
    if (r) setDistanceKm(r.dist);
    computeLink();
  });
  root.querySelector('[data-panel="link"]').addEventListener('input', (e) => {
    if (e.target === lb.lbF) {
      const v = parseNum(lb.lbF);
      const m = FREQ_PRESETS.find((f) => f.ghz != null && Math.abs(f.ghz - v) < 1e-9);
      lb.lbBand.value = m ? m.id : 'custom';
    }
    if (e.target === lb.lbD || e.target === lb.lbUnit) lbFrom.value = '';
    if (e.target.matches('input')) lb.lbPreset.value = '';
    computeLink();
  });

  function computeLink() {
    const fields = {
      ghz: [lb.lbF, (v) => v > 0.01 && v < 1000], pt: [lb.lbPt, (v) => v > 0], dt: [lb.lbDt, (v) => v > 0], et: [lb.lbEt, (v) => v > 0 && v <= 100],
      dr: [lb.lbDr, (v) => v > 0], er: [lb.lbEr, (v) => v > 0 && v <= 100], T: [lb.lbT, (v) => v > 0], dist: [lb.lbD, (v) => v > 0],
      loss: [lb.lbL, (v) => v >= 0], ebn0: [lb.lbEb, (v) => v > -1.6], margin: [lb.lbM, (v) => v >= 0],
    };
    const p = {}; let ok = true;
    for (const [k, [input, valid]] of Object.entries(fields)) {
      const v = parseNum(input);
      const good = Number.isFinite(v) && valid(v);
      input.classList.toggle('bad', !good);
      input.setAttribute('aria-invalid', String(!good));
      ok &&= good; p[k] = v;
    }
    const out = lb.lbOut;
    if (!ok) {
      lb.lbRate.replaceChildren(h('span', { class: 'v', text: '–' }), h('span', { class: 'k', text: 'Bitte alle Felder gültig ausfüllen (Ebn0 > −1,6 dB, η ≤ 100 %)' }));
      out.replaceChildren();
      return;
    }
    p.et /= 100; p.er /= 100;
    p.distKm = p.dist * UNIT_KM[lb.lbUnit.value];
    const r = linkBudget(p);
    const okLink = r.rDb > 0 && Number.isFinite(r.rate);
    lb.lbRate.replaceChildren(
      h('span', { class: `v${okLink && r.rate >= 1 ? '' : ' bad'}`, text: r.rate >= 1 ? fmtRate(r.rate) : 'keine Verbindung' }),
      h('span', { class: 'k', text: `maximale Datenrate bei Eb/N0 = ${fmt(p.ebn0, 1)} dB und ${fmt(p.margin, 1)} dB Reserve` }),
    );
    const row = (k, v, hint) => [h('dt', { text: k, title: hint ?? null }), h('dd', { text: v })];
    out.replaceChildren(...[
      row('Wellenlänge λ', r.lambda >= 0.1 ? `${fmt(r.lambda * 100, 1)} cm` : `${fmt(r.lambda * 1000, 2)} mm`),
      row('Sendeleistung', `${fmt(r.ptDbw, 2)} dBW (${fmt(r.ptDbw + 30, 2)} dBm)`),
      row('Gewinn Sender Gₜ', `${fmt(r.Gt, 2)} dBi · Halbwertsbreite ${fmtSig(r.beamT, 3)}°`),
      row('EIRP', `${fmt(r.eirp, 2)} dBW`),
      row('Freiraumdämpfung', `${fmt(r.fspl, 2)} dB`),
      row('Zusatzverluste', `${fmt(p.loss, 2)} dB`),
      row('Gewinn Empfänger Gᵣ', `${fmt(r.Gr, 2)} dBi · Halbwertsbreite ${fmtSig(r.beamR, 3)}°`),
      row('Empfangsleistung Pᵣ', `${fmt(r.prDbw, 2)} dBW = ${fmt(r.prDbw + 30, 2)} dBm`),
      row('… das sind', fmtWatt(10 ** (r.prDbw / 10))),
      row('Leistungsflussdichte', `${fmtSig(10 * Math.log10(r.flux), 4)} dBW/m²`),
      row('Rauschdichte N₀', `${fmt(r.n0, 2)} dBW/Hz`),
      row('C/N₀', `${fmt(r.cn0, 2)} dB-Hz`),
      row('Lichtlaufzeit', fmtDur(p.distKm / C_KM_S)),
    ].flat());
  }
  lb.lbPreset.value = 'voyager';
  applyPreset('voyager');

  /* --- Takt --- */
  function tick() {
    tickClocks();
    updateStatusAge();
    if (tab === 'light') renderLight();
    if ((Date.now() / 1000 | 0) % 60 === 0) renderMap(); // Tag-/Nachtgrenze wandert langsam
  }

  function onVisibility() { setActive(active, true); }

  function setActive(on, fromVisibility = false) {
    const want = !!on;
    if (!fromVisibility) active = want;
    const run = active && !document.hidden;
    root.classList.toggle('is-active', active);
    if (run) {
      if (!tickTimer) tickTimer = setInterval(tick, 1000);
      if (!pollTimer && !abort) {
        const due = feed ? Math.max(0, POLL_MS - (Date.now() - lastOk)) : 0;
        pollTimer = setTimeout(poll, due);
      }
      if (tab === 'link') computeLink();
      if (tab === 'light') renderLight();
      if (!feed && !lastError) setStatus('loading', 'Lade DSN-Daten …');
    } else {
      clearInterval(tickTimer); tickTimer = 0;
      clearTimeout(pollTimer); pollTimer = 0;
      abort?.abort(); abort = null;
      if (feed) updateStatusAge(); else setStatus('paused', 'Pausiert');
    }
  }
  document.addEventListener('visibilitychange', onVisibility);

  renderMap();
  renderLive();
  computeLink();

  return { setActive: (on) => setActive(on) };
}
