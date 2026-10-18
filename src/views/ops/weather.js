/* =====================================================================================
   Betrieb › Weltraumwetter – Live-Daten von NOAA SWPC (gemeinfrei, US-Regierungswerk)
   und optional NASA DONKI (CMEs).

   Einbindung:   const wx = createWeatherPanel(container);  wx.setActive(true|false);
   Auswertung:   import { missionRisk, getLatestRiskInputs } from './views/ops/weather.js';

   Alle Quellen senden „Access-Control-Allow-Origin: *“ → direkter Abruf aus dem Browser,
   kein Proxy nötig. CSP connect-src braucht: https://services.swpc.noaa.gov https://api.nasa.gov
   Texte aus den Quellen werden ausschließlich per textContent gesetzt.
   ===================================================================================== */

import './weather.css';

const SWPC = 'https://services.swpc.noaa.gov';
const SRC = {
  scales: '/products/noaa-scales.json',
  kp: '/products/noaa-planetary-k-index-forecast.json', // 7 Tage beobachtet + geschätzt + 3 Tage Vorhersage
  kp1m: '/json/planetary_k_index_1m.json',
  wind: '/json/rtsw/rtsw_wind_1m.json', // Echtzeit-Sonnenwind L1 (alle Sonden, Feld „active“ = operative Quelle)
  mag: '/json/rtsw/rtsw_mag_1m.json',
  xray: '/json/goes/primary/xrays-1-day.json',
  proton: '/json/goes/primary/integral-protons-1-day.json',
  flares: '/json/goes/primary/xray-flares-7-day.json',
  alerts: '/products/alerts.json',
};
// NASA DONKI über api.nasa.gov: DEMO_KEY ist stark begrenzt (laut Header 10 Anfragen/h pro IP,
// offiziell 30/h bzw. 50/Tag) → höchstens alle 30 min und nur, solange das Modul aktiv ist.
const DONKI_CME = 'https://api.nasa.gov/DONKI/CME';
const DONKI_KEY = 'DEMO_KEY';
const DONKI_EVERY_MS = 30 * 60 * 1000;
const REFRESH_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 25 * 1000;
const H = 3600 * 1000;

// =========================================================================================================
// Kleine DOM-Helfer (Texte nur per textContent)
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
}
const SVGNS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs = {}) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, String(v));
  return n;
}
function clear(n) { while (n.firstChild) n.firstChild.remove(); }
let uid = 0;
const nextId = (p) => `wx-${p}-${++uid}`;

// =========================================================================================================
// Formatierung
const pad = (n) => String(n).padStart(2, '0');
const fmtUTC = (t) => { const d = new Date(t); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
const fmtDateUTC = (t) => { const d = new Date(t); return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.`; };
const fmtDT = (t) => `${fmtDateUTC(t)} ${fmtUTC(t)} UTC`;
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const nf = (v, d = 0) => (v == null || !Number.isFinite(v) ? '–' : v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));
function fmtSci(v) {
  if (v == null || !Number.isFinite(v) || v <= 0) return '–';
  const e = Math.floor(Math.log10(v));
  const m = v / 10 ** e;
  return `${m.toLocaleString('de-DE', { maximumFractionDigits: 1 })}·10${sup(e)}`;
}
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (e) => String(e).split('').map((c) => SUP[c] ?? c).join('');
function fmtFlux(v) { // Teilchenfluss (pfu): kleine Werte mit Nachkommastellen, große gerundet
  if (v == null || !Number.isFinite(v)) return '–';
  if (v >= 1000) return fmtSci(v);
  return nf(v, v < 1 ? 2 : v < 10 ? 1 : 0);
}
// SWPC-Zeitstempel ohne Zone sind UTC
function parseT(s) {
  if (!s) return NaN;
  let x = String(s).trim().replace(' ', 'T');
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(x)) x += 'Z';
  return Date.parse(x);
}
const num = (v) => (v == null || v === '' ? null : Number.isFinite(+v) ? +v : null);

// Röntgen-Flare-Klasse aus Fluss 0,1–0,8 nm (W/m²)
export function flareClass(flux) {
  if (!(flux > 0)) return '–';
  const L = [['X', 1e-4], ['M', 1e-5], ['C', 1e-6], ['B', 1e-7], ['A', 1e-8]];
  for (const [c, b] of L) if (flux >= b) return `${c}${(flux / b).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
  return `A${(flux / 1e-8).toLocaleString('de-DE', { maximumFractionDigits: 1 })}`;
}
// NOAA-Skalen aus Messwerten (offizielle Schwellen, https://www.swpc.noaa.gov/noaa-scales-explanation)
const levelFrom = (v, th) => { if (v == null || !Number.isFinite(v)) return null; let l = 0; for (const t of th) if (v >= t) l++; return l; };
export const scaleFromKp = (kp) => levelFrom(kp, [5, 6, 7, 8, 9]); // G1–G5 (Kp 9- zählt als G5: wir runden ab 8,67)
export const scaleFromXray = (f) => levelFrom(f, [1e-5, 5e-5, 1e-4, 1e-3, 2e-3]); // R1 M1 · R2 M5 · R3 X1 · R4 X10 · R5 X20
export const scaleFromProton = (p) => levelFrom(p, [10, 100, 1e3, 1e4, 1e5]); // S1–S5 (pfu, ≥10 MeV)

// =========================================================================================================
// Missionsrisiko – einfache, nachvollziehbare Schwellenregeln
//
// Eingabe (alle Felder optional; fehlende Werte → Faktor „keine Daten“, wird nicht gewertet):
//   kp            aktueller (geschätzter) planetarer Kp-Index 0–9
//   kpMax24h      höchster Kp der letzten 24 h
//   kpForecastMax höchster vorhergesagter Kp der nächsten 72 h (nur als Hinweis „Trend“)
//   bz            aktuelles IMF Bz (GSM, nT; negativ = Süd)
//   bzMin3h       niedrigstes Bz der letzten 3 h (nT)
//   speed         Sonnenwindgeschwindigkeit (km/s)
//   density       Protonendichte (cm⁻³)
//   xray          aktueller GOES-Röntgenfluss 0,1–0,8 nm (W/m²)
//   xrayMax24h    Maximum der letzten 24 h (W/m²)
//   p10, p100     GOES integraler Protonenfluss ≥10 MeV bzw. ≥100 MeV (pfu = 1/(cm²·s·sr))
//
// Jede Regel: Messgröße → Stufe 0–3 (niedrig/erhöht/hoch/kritisch) über drei Schwellen.
// Stufe eines Missionsbereichs = höchste Stufe seiner Faktoren; Gesamtstufe = höchste Bereichsstufe.
// Die Schwellen orientieren sich an den NOAA-Skalen (G/S/R) und gängigen Betriebsgrenzen; sie sind
// Lehr-/Planungsrichtwerte, keine operative Freigabe.
export const RISK_LEVELS = [
  { level: 0, label: 'Niedrig', color: '#3ddc84' },
  { level: 1, label: 'Erhöht', color: '#f2d64b' },
  { level: 2, label: 'Hoch', color: '#ff9a3c' },
  { level: 3, label: 'Kritisch', color: '#ff5a5a' },
];

/** Dynamischer Druck des Sonnenwinds in nPa (n in cm⁻³, v in km/s; Protonenmasse). */
export function dynPressure(n, v) {
  if (!(n > 0) || !(v > 0)) return null;
  return 1.6726e-6 * n * v * v;
}
/** Abstand der subsolaren Magnetopause in Erdradien nach Shue et al. (1998). */
export function magnetopauseRe(n, v, bz) {
  const p = dynPressure(n, v);
  if (p == null || bz == null || !Number.isFinite(bz)) return null;
  return (10.22 + 1.29 * Math.tanh(0.184 * (bz + 8.14))) * p ** (-1 / 6.6);
}

const XRAY_COMMS = { id: 'comms', label: 'Funk / Navigation', input: 'Röntgenfluss 0,1–0,8 nm (aktuell)', unit: 'W/m²', thresholds: [1e-5, 1e-4, 1e-3], fmt: fmtSci,
  why: 'Flares ionisieren die Tagseiten-Ionosphäre: ab M1 (R1) kurze HF-Störungen, ab X1 (R3) großflächiger HF-Ausfall und GNSS-Fehler, ab X10 (R4) stundenlang.',
  value: (d) => d.xray };

export const MISSION_RISK_RULES = [
  {
    id: 'leo', name: 'LEO / ISS', desc: '≈ 300–600 km, innerhalb der Magnetosphäre',
    factors: [
      { id: 'drag', label: 'Luftwiderstand (Drag)', input: 'Kp, Maximum aus aktuell und letzten 24 h', unit: 'Kp', thresholds: [5, 7, 8], fmt: (v) => nf(v, 1),
        why: 'Geomagnetische Stürme heizen die Thermosphäre auf: höhere Dichte → schnellerer Bahnabfall, ungenauere Bahnvorhersagen und Kollisionswarnungen (G1 ab Kp 5, G3 ab 7, G4 ab 8).',
        value: (d) => maxOf(d.kp, d.kpMax24h) },
      { id: 'radiation', label: 'Strahlung (EVA, Polarabschnitte, SAA)', input: 'Protonen ≥10 MeV', unit: 'pfu', thresholds: [10, 1e3, 1e4], fmt: fmtFlux,
        why: 'Die Magnetosphäre schirmt größtenteils ab; auf hoch geneigten Bahnabschnitten steigt die Dosis. S1 (10 pfu) beobachten, S3 (1000 pfu): EVA vermeiden, S4: Schutzbereiche.',
        value: (d) => d.p10 },
      { id: 'hard', label: 'Harte Protonen', input: 'Protonen ≥100 MeV', unit: 'pfu', thresholds: [1, 10, 100], fmt: fmtFlux,
        why: '≥100-MeV-Protonen durchdringen Raumanzug und Wände – maßgeblich für EVA-Entscheidungen und Einzelereignis-Effekte (SEU) in der Elektronik.',
        value: (d) => d.p100 },
      XRAY_COMMS,
    ],
  },
  {
    id: 'geo', name: 'GEO', desc: '≈ 35 786 km, am Rand der Magnetosphäre',
    factors: [
      { id: 'charging', label: 'Oberflächenaufladung', input: 'Kp (aktuell)', unit: 'Kp', thresholds: [4, 6, 8], fmt: (v) => nf(v, 1),
        why: 'Substurm-Injektionen heißer Elektronen laden Oberflächen auf (Entladungen, Phantombefehle). Risiko steigt ab Kp 4 deutlich, bei G2+ Betriebsvorsicht.',
        value: (d) => d.kp },
      { id: 'bz', label: 'Südliches IMF', input: 'niedrigstes Bz der letzten 3 h', unit: 'nT', thresholds: [-10, -20, -30], lowerIsWorse: true, fmt: (v) => nf(v, 1),
        why: 'Anhaltend südliches Bz koppelt den Sonnenwind an die Magnetosphäre (Rekonnexion) und treibt Substürme – Vorbote steigender Aufladung.',
        value: (d) => d.bzMin3h },
      { id: 'magnetopause', label: 'Magnetopausen-Kompression', input: 'Magnetopausenabstand nach Shue (1998)', unit: 'Rₑ', thresholds: [9, 8, 6.6], lowerIsWorse: true, fmt: (v) => nf(v, 1),
        why: 'Hoher Sonnenwinddruck drückt die Magnetopause nach innen. Unter 6,6 Erdradien liegen GEO-Satelliten auf der Tagseite direkt im Sonnenwind (Lageregelung, Magnetometer, Aufladung).',
        value: (d) => magnetopauseRe(d.density, d.speed, d.bz) },
      { id: 'sep', label: 'Solare Protonen', input: 'Protonen ≥10 MeV', unit: 'pfu', thresholds: [10, 100, 1e4], fmt: fmtFlux,
        why: 'GEO ist kaum abgeschirmt: SEU in der Elektronik ab S1, Degradation der Solarzellen und Sternsensor-Störungen ab S2, S4: Ausfälle möglich.',
        value: (d) => d.p10 },
      XRAY_COMMS,
    ],
  },
  {
    id: 'deep', name: 'Mond- / Mars-Transit', desc: 'außerhalb der Magnetosphäre – kein Magnetfeldschutz',
    factors: [
      { id: 'dose', label: 'Strahlendosis Crew', input: 'Protonen ≥10 MeV', unit: 'pfu', thresholds: [1, 10, 100], fmt: fmtFlux,
        why: 'Ohne Magnetosphäre wirkt der volle Teilchenfluss. Über ≈1 pfu beginnt ein Teilchenereignis (Hintergrund ≈0,2–0,4), ab 10 (S1) Schutzraum vorbereiten, ab 100 (S2) aufsuchen.',
        value: (d) => d.p10 },
      { id: 'hard', label: 'Harte Protonen', input: 'Protonen ≥100 MeV', unit: 'pfu', thresholds: [1, 10, 100], fmt: fmtFlux,
        why: 'Hochenergetische Protonen durchdringen auch Abschirmung – entscheidend für Dosis, EVA auf dem Mond und Elektronik.',
        value: (d) => d.p100 },
      { id: 'flare', label: 'Flare-Vorwarnung', input: 'Röntgen-Maximum der letzten 24 h', unit: 'W/m²', thresholds: [5e-5, 1e-4, 1e-3], fmt: (v) => `${flareClass(v)} (${fmtSci(v)})`,
        why: 'Große Flares (ab M5, besonders X) gehen oft solaren Protonenereignissen voraus – die Teilchen folgen nach Minuten bis Stunden.',
        value: (d) => maxOf(d.xrayMax24h, d.xray) },
      { id: 'shock', label: 'Schneller Sonnenwind / CME', input: 'Sonnenwindgeschwindigkeit an L1', unit: 'km/s', thresholds: [600, 800, 1000], fmt: (v) => nf(v),
        why: 'Sehr schneller Wind zeigt einen CME-Durchgang bzw. Schock an (L1-Messung, gilt nahe der Erdbahn) – häufig mit erhöhten Teilchenflüssen verbunden.',
        value: (d) => d.speed },
    ],
  },
];

function maxOf(...v) { const x = v.filter((a) => a != null && Number.isFinite(a)); return x.length ? Math.max(...x) : null; }
function ruleLevel(rule, v) {
  if (v == null || !Number.isFinite(v)) return null;
  let l = 0;
  for (const t of rule.thresholds) if (rule.lowerIsWorse ? v <= t : v >= t) l++;
  return l;
}

/**
 * Missionsrisiko aus aktuellen Weltraumwetterdaten.
 * @param {object} data siehe Kommentar oben (kp, kpMax24h, bz, bzMin3h, speed, density, xray, xrayMax24h, p10, p100 …)
 * @returns {{ level: number|null, label: string, color: string, regimes: Array<{id,name,desc,level,label,color,factors:Array}>, trend: string|null }}
 */
export function missionRisk(data = {}) {
  const d = data || {};
  const regimes = MISSION_RISK_RULES.map((r) => {
    const factors = r.factors.map((f) => {
      const value = f.value(d);
      const level = ruleLevel(f, value);
      return { id: f.id, label: f.label, input: f.input, unit: f.unit, thresholds: f.thresholds, lowerIsWorse: !!f.lowerIsWorse, why: f.why,
        value, valueText: value == null ? 'keine Daten' : f.id === 'flare' ? f.fmt(value) : `${f.fmt(value)} ${f.unit}`, level };
    });
    const known = factors.filter((f) => f.level != null);
    const level = known.length ? Math.max(...known.map((f) => f.level)) : null;
    return { id: r.id, name: r.name, desc: r.desc, level, ...levelInfo(level), factors };
  });
  const known = regimes.filter((r) => r.level != null);
  const level = known.length ? Math.max(...known.map((r) => r.level)) : null;
  let trend = null;
  if (d.kpForecastMax != null && d.kpForecastMax >= 5) {
    const g = scaleFromKp(d.kpForecastMax);
    trend = `Vorhersage: bis Kp ${nf(d.kpForecastMax, 1)} (G${g}) in den nächsten 3 Tagen – Drag und Aufladung können steigen.`;
  }
  return { level, ...levelInfo(level), regimes, trend };
}
function levelInfo(level) {
  if (level == null) return { label: 'Keine Daten', color: '#8a97b5' };
  return { label: RISK_LEVELS[level].label, color: RISK_LEVELS[level].color };
}

// Letzte vom Panel ermittelte Eingabewerte (für andere Module, z. B. Stationsplanung)
let latestInputs = null;
export function getLatestRiskInputs() { return latestInputs ? { ...latestInputs } : null; }

// =========================================================================================================
// Abruf
async function getJSON(url, signal) {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

// --- Aufbereitung -------------------------------------------------------------------------------------
// RTSW: Datensätze mehrerer Sonden (ACE, DSCOVR/SWFO, IMAP …); „active“ markiert die operative Quelle.
function pickRtsw(rows) {
  if (!Array.isArray(rows)) return { src: null, rows: [] };
  let sel = rows.filter((r) => r && r.active === true);
  if (!sel.length) { // keine aktive Quelle markiert → Sonde mit dem jüngsten Datensatz
    let best = null; let bt = -Infinity;
    for (const r of rows) { const t = parseT(r?.time_tag); if (t > bt) { bt = t; best = r.source; } }
    sel = rows.filter((r) => r?.source === best);
  }
  const out = sel.map((r) => ({ ...r, t: parseT(r.time_tag) })).filter((r) => Number.isFinite(r.t)).sort((a, b) => a.t - b.t);
  const dedup = [];
  for (const r of out) if (!dedup.length || dedup[dedup.length - 1].t !== r.t) dedup.push(r);
  const srcs = [...new Set(dedup.map((r) => r.source).filter(Boolean))];
  return { src: srcs.join(' / ') || null, rows: dedup };
}
function seriesOf(rows, key, { positive = false } = {}) {
  const s = [];
  for (const r of rows) {
    const v = num(r[key]);
    if (v == null || (positive && !(v > 0))) continue;
    s.push({ t: r.t, v });
  }
  return s;
}
function goesSeries(rows, energy) {
  if (!Array.isArray(rows)) return [];
  const s = [];
  for (const r of rows) {
    if (r?.energy !== energy) continue;
    const v = num(r.flux); const t = parseT(r.time_tag);
    if (v == null || !(v > 0) || !Number.isFinite(t)) continue;
    s.push({ t, v });
  }
  return s.sort((a, b) => a.t - b.t);
}
const last = (s) => (s && s.length ? s[s.length - 1] : null);
function meanSince(s, t0) {
  const v = s.filter((p) => p.t >= t0).map((p) => p.v);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : last(s)?.v ?? null;
}
function minSince(s, t0) { const v = s.filter((p) => p.t >= t0).map((p) => p.v); return v.length ? Math.min(...v) : null; }
function maxSince(s, t0) { const v = s.filter((p) => p.t >= t0).map((p) => p.v); return v.length ? Math.max(...v) : null; }

function parseKp(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({ t: parseT(r.time_tag), kp: num(r.kp ?? r.Kp), kind: String(r.observed || 'observed') }))
    .filter((r) => Number.isFinite(r.t) && r.kp != null).sort((a, b) => a.t - b.t);
}

// Erste aussagekräftige Zeile einer SWPC-Meldung als Titel
function parseAlert(a) {
  const msg = String(a?.message ?? '').replace(/\r/g, '');
  const lines = msg.split('\n').map((l) => l.trim()).filter(Boolean);
  const head = lines.find((l) => /^(ALERT|WARNING|WATCH|SUMMARY|EXTENDED WARNING|CANCEL\w*|CONTINUED ALERT)\b/i.test(l)) || lines.find((l) => !/^(Space Weather Message Code|Serial Number|Issue Time)/i.test(l)) || 'Meldung';
  const kindM = head.match(/^(EXTENDED WARNING|CONTINUED ALERT|ALERT|WARNING|WATCH|SUMMARY|CANCEL\w*)/i);
  const kind = kindM ? kindM[1].toUpperCase() : 'INFO';
  const title = head.replace(/^(EXTENDED WARNING|CONTINUED ALERT|ALERT|WARNING|WATCH|SUMMARY|CANCEL\w*)\s*:\s*/i, '');
  return { id: String(a?.product_id ?? ''), t: parseT(a?.issue_datetime), kind, title, text: msg.trim() };
}
const KIND_DE = { ALERT: 'Alarm', 'CONTINUED ALERT': 'Alarm (Forts.)', WARNING: 'Warnung', 'EXTENDED WARNING': 'Warnung (verl.)', WATCH: 'Vorwarnung', SUMMARY: 'Zusammenfassung', INFO: 'Info' };

// =========================================================================================================
// Farben
const SCALE_COLORS = ['#3ddc84', '#f2d64b', '#ffcc55', '#ff9a3c', '#ff5a5a', '#e0408a'];
const SCALE_WORD = ['keine', 'gering', 'mäßig', 'stark', 'schwer', 'extrem'];
function kpColor(kp) {
  if (kp == null) return '#8a97b5';
  if (kp < 4) return '#3ddc84';
  if (kp < 5) return '#c6e05a';
  return SCALE_COLORS[Math.min(5, scaleFromKp(kp))];
}

// =========================================================================================================
// Diagramme (eigenes, leichtgewichtiges SVG)
function niceStep(range, n = 4) {
  const raw = range / n; const p = 10 ** Math.floor(Math.log10(raw)); const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}
function timeTicks(t0, t1, px = 600) {
  const span = t1 - t0;
  const maxTicks = Math.max(2, Math.floor(px / 58)); // ≈ 58 px je Beschriftung
  const step = [0.25, 0.5, 1, 2, 3, 6, 12, 24, 48].map((h) => h * H).find((st) => span / st <= maxTicks) ?? 48 * H;
  const out = [];
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) out.push(t);
  return { ticks: out, step };
}
function timeLabel(t, step) {
  const d = new Date(t);
  if (step >= 24 * H || (d.getUTCHours() === 0 && d.getUTCMinutes() === 0)) return fmtDateUTC(t);
  return fmtUTC(t);
}
// Je Pixelspalte Minimum und Maximum behalten (Spitzen bleiben sichtbar)
function decimate(pts, x, width) {
  if (pts.length <= width * 2) return pts;
  const out = []; let col = null; let mn = null; let mx = null;
  const flush = () => { if (!mn) return; if (mn.t < mx.t) out.push(mn, mx); else if (mn === mx) out.push(mn); else out.push(mx, mn); };
  for (const p of pts) {
    const c = Math.round(x(p.t));
    if (c !== col) { flush(); col = c; mn = p; mx = p; } else { if (p.v < mn.v) mn = p; if (p.v > mx.v) mx = p; }
  }
  flush();
  return out;
}
function bisect(pts, t) {
  let lo = 0; let hi = pts.length - 1;
  if (hi < 0) return -1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].t < t) lo = m; else hi = m; }
  return Math.abs(pts[lo].t - t) <= Math.abs(pts[hi].t - t) ? lo : hi;
}

/**
 * Zeitreihen-Diagramm.
 * opts: { height, log, yMin, yMax, minSpan, unit, fmt, series:[{key,label,color}], bands:[{v,label,color}],
 *         labels:[{v0,v1,text}] (Bereichs-Beschriftung rechts), zero, negFill (Farbe für Werte < 0 der Serie negFillKey),
 *         gapMs, onHover(t|null) }
 */
function createChart(opts) {
  const o = { height: 170, gapMs: 6 * 60 * 1000, fmt: (v) => nf(v, 1), ...opts };
  const wrap = el('div', { class: 'wx-chart' });
  const svg = sv('svg', { class: 'wx-svg', role: 'img', 'aria-label': o.aria || o.title || 'Diagramm' });
  const tip = el('div', { class: 'wx-tip', hidden: true });
  const empty = el('div', { class: 'wx-chart-empty', hidden: true, text: 'Keine Daten im Zeitraum' });
  wrap.append(svg, tip, empty);
  let data = {}; let range = null; let geo = null; let hoverT = null;
  const clipId = nextId('clip');

  function render() {
    clear(svg);
    const W = Math.max(260, Math.round(wrap.clientWidth || 600));
    const Hh = o.height;
    svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
    svg.setAttribute('width', W); svg.setAttribute('height', Hh);
    if (!range) { geo = null; return; }
    const m = { l: 48, r: o.labels ? 30 : 12, t: o.unitLabel ? 18 : 8, b: 22 };
    const iw = W - m.l - m.r; const ih = Hh - m.t - m.b;
    const [t0, t1] = range;
    const x = (t) => m.l + ((t - t0) / (t1 - t0)) * iw;

    const inRange = {}; let lo = Infinity; let hi = -Infinity;
    for (const s of o.series) {
      const pts = (data[s.key] || []).filter((p) => p.t >= t0 - 60000 && p.t <= t1 + 60000);
      inRange[s.key] = pts;
      for (const p of pts) { if (o.log && !(p.v > 0)) continue; if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; }
    }
    const hasData = Number.isFinite(lo);
    empty.hidden = hasData;
    let y; let yTicks = [];
    if (o.log) {
      let a = o.yMin ?? 1e-9; let b = o.yMax ?? 1e-3;
      if (hasData) { a = Math.min(a, 10 ** Math.floor(Math.log10(lo))); b = Math.max(b, 10 ** Math.ceil(Math.log10(hi))); }
      const la = Math.log10(a); const lb = Math.log10(b);
      y = (v) => m.t + ih - ((Math.log10(Math.max(v, a)) - la) / (lb - la)) * ih;
      for (let e = Math.ceil(la); e <= lb; e++) yTicks.push(10 ** e);
    } else {
      let a = hasData ? lo : 0; let b = hasData ? hi : 1;
      if (o.yMin != null) a = Math.min(a, o.yMin);
      if (o.yMax != null) b = Math.max(b, o.yMax);
      if (o.zero) { a = Math.min(a, 0); b = Math.max(b, 0); }
      if (o.symmetric) { const k = Math.max(Math.abs(a), Math.abs(b)); a = -k; b = k; }
      if (b - a < (o.minSpan ?? 1e-9)) { const c = (a + b) / 2; a = c - (o.minSpan ?? 1) / 2; b = c + (o.minSpan ?? 1) / 2; }
      const step = niceStep(b - a, 4);
      a = Math.floor(a / step) * step; b = Math.ceil(b / step) * step;
      if (o.floor != null) a = Math.max(a, o.floor);
      y = (v) => m.t + ih - ((v - a) / (b - a)) * ih;
      for (let v = a; v <= b + step * 1e-6; v += step) yTicks.push(+v.toFixed(10));
    }
    geo = { x, y, t0, t1, m, iw, ih, W, inRange };

    // Gitter + Achsen
    const g = sv('g', { class: 'wx-grid' });
    for (const v of yTicks) {
      const yy = y(v);
      g.append(sv('line', { x1: m.l, x2: m.l + iw, y1: yy, y2: yy }));
      const tx = sv('text', { x: m.l - 6, y: yy + 3.5, 'text-anchor': 'end', class: 'wx-ax' });
      tx.textContent = o.log ? `10${sup(Math.round(Math.log10(v)))}` : o.tickFmt ? o.tickFmt(v) : nf(v, Math.abs(v) < 10 && v % 1 ? 1 : 0);
      g.append(tx);
    }
    const { ticks, step } = timeTicks(t0, t1, iw);
    for (const t of ticks) {
      const xx = x(t);
      g.append(sv('line', { x1: xx, x2: xx, y1: m.t, y2: m.t + ih, class: 'v' }));
      const tx = sv('text', { x: xx, y: Hh - 6, 'text-anchor': 'middle', class: 'wx-ax' });
      tx.textContent = timeLabel(t, step);
      g.append(tx);
    }
    svg.append(g);
    if (o.unitLabel) { const u = sv('text', { x: m.l - 6, y: 11, 'text-anchor': 'end', class: 'wx-ax wx-unit' }); u.textContent = o.unitLabel; svg.append(u); }

    // Schwellen + Bereichsbeschriftung
    for (const b of o.bands || []) {
      const yy = y(b.v); if (yy < m.t - 0.5 || yy > m.t + ih + 0.5) continue;
      svg.append(sv('line', { x1: m.l, x2: m.l + iw, y1: yy, y2: yy, class: 'wx-band', stroke: b.color || 'rgba(255,255,255,.35)' }));
      if (b.label) { const tx = sv('text', { x: m.l + iw - 4, y: yy - 3, 'text-anchor': 'end', class: 'wx-band-l', fill: b.color || '#c3cde6' }); tx.textContent = b.label; svg.append(tx); }
    }
    for (const L of o.labels || []) {
      const y0 = y(L.v0); const y1 = y(L.v1);
      if (Math.max(y0, y1) < m.t || Math.min(y0, y1) > m.t + ih) continue;
      const yy = (Math.min(Math.max(y0, m.t), m.t + ih) + Math.min(Math.max(y1, m.t), m.t + ih)) / 2;
      const tx = sv('text', { x: m.l + iw + 10, y: yy + 4, class: 'wx-cls', fill: L.color || '#c3cde6' }); tx.textContent = L.text; svg.append(tx);
    }
    if (o.zero && !o.log) { const yy = y(0); svg.append(sv('line', { x1: m.l, x2: m.l + iw, y1: yy, y2: yy, class: 'wx-zero' })); }

    // Linien
    const defs = sv('defs'); svg.append(defs);
    for (const s of o.series) {
      const pts = decimate(inRange[s.key], x, iw);
      if (!pts.length) continue;
      let d = ''; let prev = null;
      for (const p of pts) {
        if (o.log && !(p.v > 0)) { prev = null; continue; }
        const cmd = !prev || p.t - prev.t > o.gapMs ? 'M' : 'L';
        d += `${cmd}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
        prev = p;
      }
      if (o.negFill && s.key === o.negFillKey && !o.log) {
        // Fläche unter 0 (z. B. Bz Süd) hervorheben: Fläche Linie↔Nulllinie, auf den Bereich < 0 beschnitten
        const y0 = y(0);
        const cp = sv('clipPath', { id: clipId });
        cp.append(sv('rect', { x: m.l, y: y0, width: iw, height: Math.max(0, m.t + ih - y0) }));
        defs.append(cp);
        let area = ''; let seg = [];
        const flushSeg = () => {
          if (seg.length > 1) area += `M${x(seg[0].t).toFixed(1)},${y0}` + seg.map((p) => `L${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('') + `L${x(seg[seg.length - 1].t).toFixed(1)},${y0}Z`;
          seg = [];
        };
        let pv = null;
        for (const p of pts) { if (pv && p.t - pv.t > o.gapMs) flushSeg(); seg.push(p); pv = p; }
        flushSeg();
        if (area) svg.append(sv('path', { d: area, fill: o.negFill, 'clip-path': `url(#${clipId})`, class: 'wx-negfill' }));
      }
      svg.append(sv('path', { d, class: 'wx-line', stroke: s.color, 'stroke-width': s.width || 1.6 }));
    }

    // Hover-Ebene
    const cross = sv('line', { class: 'wx-cross', y1: m.t, y2: m.t + ih, x1: -10, x2: -10 });
    const dots = o.series.map((s) => sv('circle', { r: 3.2, fill: s.color, class: 'wx-dot', cx: -10, cy: -10 }));
    svg.append(cross, ...dots);
    const hit = sv('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent', class: 'wx-hit' });
    svg.append(hit);
    geo.cross = cross; geo.dots = dots;
    hit.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      const t = t0 + ((px - m.l) / iw) * (t1 - t0);
      show(t); o.onHover?.(t);
    });
    hit.addEventListener('pointerleave', () => { hide(); o.onHover?.(null); });
    if (hoverT != null) show(hoverT);
  }

  function show(t) {
    hoverT = t;
    if (!geo) return;
    const { x, y, inRange, cross, dots, W } = geo;
    let any = false; const rows = [];
    let tt = null;
    o.series.forEach((s, i) => {
      const pts = inRange[s.key] || [];
      const k = bisect(pts, t);
      if (k < 0 || Math.abs(pts[k].t - t) > 10 * 60 * 1000) { dots[i].setAttribute('cx', -10); return; }
      const p = pts[k]; any = true; tt = tt ?? p.t;
      dots[i].setAttribute('cx', x(p.t)); dots[i].setAttribute('cy', y(p.v));
      rows.push([s, p.v]);
    });
    if (!any) { hide(true); return; }
    const xx = x(tt);
    cross.setAttribute('x1', xx); cross.setAttribute('x2', xx);
    clear(tip);
    tip.append(el('div', { class: 'wx-tip-t', text: fmtDT(tt) }));
    for (const [s, v] of rows) tip.append(el('div', { class: 'wx-tip-r' }, el('i', { style: `background:${s.color}` }), el('span', { text: `${s.label}: ` }), el('b', { text: `${o.fmt(v, s)}${o.unit ? ` ${o.unit}` : ''}` })));
    tip.hidden = false;
    const frac = (xx / W);
    tip.style.left = `${frac * 100}%`;
    tip.classList.toggle('flip', frac > 0.6);
  }
  function hide(keepT) {
    if (!keepT) hoverT = null;
    tip.hidden = true;
    if (geo) { geo.cross.setAttribute('x1', -10); geo.cross.setAttribute('x2', -10); geo.dots.forEach((d) => d.setAttribute('cx', -10)); }
  }

  const ro = new ResizeObserver(() => render());
  ro.observe(wrap);
  return {
    el: wrap,
    update(newData, newRange) { data = newData || {}; range = newRange; render(); },
    showAt(t) { if (t == null) hide(); else show(t); },
  };
}

// Kp-Balkendiagramm (3-h-Intervalle, beobachtet / geschätzt / vorhergesagt)
function createKpChart() {
  const wrap = el('div', { class: 'wx-chart' });
  const svg = sv('svg', { class: 'wx-svg', role: 'img', 'aria-label': 'Kp-Index der letzten Tage und Vorhersage' });
  const tip = el('div', { class: 'wx-tip', hidden: true });
  wrap.append(svg, tip);
  let bars = [];
  function render() {
    clear(svg);
    const W = Math.max(260, Math.round(wrap.clientWidth || 600)); const Hh = 190;
    svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`); svg.setAttribute('width', W); svg.setAttribute('height', Hh);
    if (!bars.length) return;
    const m = { l: 30, r: 30, t: 8, b: 22 }; const iw = W - m.l - m.r; const ih = Hh - m.t - m.b;
    const t0 = bars[0].t; const t1 = bars[bars.length - 1].t + 3 * H;
    const x = (t) => m.l + ((t - t0) / (t1 - t0)) * iw;
    const y = (v) => m.t + ih - (v / 9) * ih;
    const g = sv('g', { class: 'wx-grid' });
    for (let v = 0; v <= 9; v += 1) {
      const yy = y(v);
      if (v % 3 === 0 || v >= 5) g.append(sv('line', { x1: m.l, x2: m.l + iw, y1: yy, y2: yy }));
      if (v % 3 === 0) { const tx = sv('text', { x: m.l - 6, y: yy + 3.5, 'text-anchor': 'end', class: 'wx-ax' }); tx.textContent = String(v); g.append(tx); }
    }
    svg.append(g);
    for (let gl = 1; gl <= 5; gl++) { // G-Stufen rechts
      const tx = sv('text', { x: m.l + iw + 6, y: y(gl + 4) + 3.5, class: 'wx-cls', fill: SCALE_COLORS[gl] }); tx.textContent = `G${gl}`; svg.append(tx);
    }
    // Tage
    for (let t = Math.ceil(t0 / (24 * H)) * 24 * H; t < t1; t += 24 * H) {
      const xx = x(t);
      svg.append(sv('line', { x1: xx, x2: xx, y1: m.t, y2: m.t + ih, class: 'wx-day' }));
      if (t + 12 * H > t1) continue; // angeschnittener letzter Tag: keine Beschriftung
      const d = new Date(t);
      const cx = x(t + 12 * H);
      const tx = sv('text', { x: cx, y: Hh - 6, 'text-anchor': 'middle', class: 'wx-ax' });
      tx.textContent = iw < 420 ? `${pad(d.getUTCDate())}.` : `${WD[d.getUTCDay()]} ${fmtDateUTC(t)}`;
      svg.append(tx);
    }
    const bw = Math.max(1, (iw / bars.length) - (iw / bars.length > 6 ? 1.5 : 0.5));
    bars.forEach((b, i) => {
      const xx = x(b.t) + 0.25; const yy = y(Math.max(b.kp, 0.12));
      const r = sv('rect', { x: xx, y: yy, width: bw, height: m.t + ih - yy, rx: Math.min(2, bw / 3), fill: kpColor(b.kp), class: `wx-kpbar ${b.kind}` });
      r.dataset.i = i; svg.append(r);
    });
    const now = Date.now();
    if (now > t0 && now < t1) {
      const xx = x(now);
      svg.append(sv('line', { x1: xx, x2: xx, y1: m.t - 2, y2: m.t + ih, class: 'wx-now' }));
      const tx = sv('text', { x: xx + 4, y: m.t + 9, class: 'wx-now-l' }); tx.textContent = 'jetzt'; svg.append(tx);
    }
    const hit = sv('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent', class: 'wx-hit' });
    svg.append(hit);
    hit.addEventListener('pointermove', (e) => {
      const rc = svg.getBoundingClientRect(); const px = ((e.clientX - rc.left) / rc.width) * W;
      const t = t0 + ((px - m.l) / iw) * (t1 - t0);
      const b = bars.find((q) => t >= q.t && t < q.t + 3 * H); if (!b) { tip.hidden = true; return; }
      clear(tip);
      tip.append(el('div', { class: 'wx-tip-t', text: `${fmtDT(b.t)} – ${fmtUTC(b.t + 3 * H)}` }),
        el('div', { class: 'wx-tip-r' }, el('i', { style: `background:${kpColor(b.kp)}` }), el('span', { text: `Kp ${nf(b.kp, 2)} · ` }), el('b', { text: b.kind === 'predicted' ? 'Vorhersage' : b.kind === 'estimated' ? 'geschätzt' : 'beobachtet' })));
      const g2 = scaleFromKp(b.kp); if (g2) tip.append(el('div', { class: 'wx-tip-r', text: `Sturmstufe G${g2} (${SCALE_WORD[g2]})` }));
      tip.hidden = false; const frac = x(b.t + 1.5 * H) / W; tip.style.left = `${frac * 100}%`; tip.classList.toggle('flip', frac > 0.6);
    });
    hit.addEventListener('pointerleave', () => { tip.hidden = true; });
  }
  new ResizeObserver(() => render()).observe(wrap);
  return { el: wrap, update(b) { bars = b || []; render(); } };
}

// =========================================================================================================
// Panel
const SCALE_INFO = {
  G: { name: 'Geomagnetischer Sturm', src: 'Kp-Index', text: 'Störung des Erdmagnetfelds durch Sonnenwind und CMEs – wirkt auf Stromnetze, Lageregelung und Luftwiderstand von Satelliten, Polarlichter.' },
  S: { name: 'Strahlungssturm', src: 'Protonen ≥10 MeV', text: 'Energiereiche Sonnenprotonen – Gefahr für Astronauten (EVA), Satellitenelektronik und Polarflüge.' },
  R: { name: 'Funkausfall', src: 'Röntgenfluss', text: 'Röntgenstrahlung von Flares ionisiert die Tagseiten-Ionosphäre – Kurzwellen-(HF-)Funk und Navigation gestört.' },
};

export function createWeatherPanel(container) {
  const root = el('div', { class: 'wx' });
  const wrap = el('div', { class: 'wx-wrap' });
  root.append(wrap);
  container.append(root);

  const state = { active: false, timer: null, tick: null, ctl: null, loading: false, lastOk: 0, lastTry: 0, donkiAt: 0, data: {}, err: {}, range: 24 };

  // --- Kopf ----------------------------------------------------------------------------------------
  const status = el('span', { class: 'wx-status', text: 'Wird geladen …', 'aria-live': 'polite' });
  const refreshBtn = el('button', { type: 'button', class: 'wx-btn', title: 'Jetzt aktualisieren', 'aria-label': 'Jetzt aktualisieren', onclick: () => refresh(true) });
  refreshBtn.append(icon('M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6'));
  const head = el('header', { class: 'wx-head' },
    el('div', {},
      el('h2', { class: 'wx-title', text: 'Weltraumwetter' }),
      el('p', { class: 'wx-sub', text: 'Live-Lage von Sonne, Sonnenwind und Erdmagnetfeld – Daten von NOAA SWPC, aktualisiert jede Minute. Alle Zeiten in UTC.' })),
    el('div', { class: 'wx-statusbar' }, el('span', { class: 'wx-live', 'aria-hidden': 'true' }), status, refreshBtn));

  const scaleTiles = {};
  const scaleRow = el('div', { class: 'wx-scales' });
  for (const k of ['G', 'S', 'R']) {
    const lvl = el('div', { class: 'wx-scale-lvl', text: `${k}–` });
    const word = el('div', { class: 'wx-scale-word', text: '…' });
    const meas = el('div', { class: 'wx-scale-meas', text: '' });
    const fc = el('div', { class: 'wx-scale-fc' });
    const tile = el('article', { class: 'wx-card wx-scale' },
      el('div', { class: 'wx-scale-top' }, lvl, el('div', {}, el('div', { class: 'wx-scale-name', text: SCALE_INFO[k].name }), word)),
      el('p', { class: 'wx-scale-text', text: SCALE_INFO[k].text }), meas, fc);
    scaleTiles[k] = { tile, lvl, word, meas, fc };
    scaleRow.append(tile);
  }
  // Ampel
  const ampLights = [0, 1, 2].map(() => el('span', { class: 'wx-light' }));
  const ampLabel = el('div', { class: 'wx-amp-label', text: '…' });
  const ampRegs = el('div', { class: 'wx-amp-regs' });
  const ampCard = el('article', { class: 'wx-card wx-amp' },
    el('h3', { text: 'Risiko für Missionen' }),
    el('div', { class: 'wx-amp-main' }, el('div', { class: 'wx-amp-lights', 'aria-hidden': 'true' }, ...ampLights), ampLabel),
    ampRegs,
    el('a', { class: 'wx-link', href: '#', text: 'Auswertung und Regeln ↓', onclick: (e) => { e.preventDefault(); riskCard.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }));
  scaleRow.append(ampCard);

  // --- Sonnenwind ------------------------------------------------------------------------------------
  const rangeSeg = el('div', { class: 'seg wx-seg', role: 'group', 'aria-label': 'Zeitraum' });
  const rangeBtns = [2, 6, 24].map((h) => {
    const b = el('button', { type: 'button', text: `${h} h`, onclick: () => { state.range = h; try { localStorage.setItem('galactic.weather.range', String(h)); } catch { /* egal */ } syncRange(); renderWind(); } });
    b.dataset.h = h; rangeSeg.append(b); return b;
  });
  try { const r = +localStorage.getItem('galactic.weather.range'); if ([2, 6, 24].includes(r)) state.range = r; } catch { /* egal */ }
  function syncRange() { for (const b of rangeBtns) { const on = +b.dataset.h === state.range; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); } }
  syncRange();

  const windKpis = el('div', { class: 'wx-kpis' });
  const windMsg = el('div', { class: 'wx-msg' });
  const windSrc = el('span', { class: 'wx-card-meta' });
  const group = [];
  const sync = (src) => (t) => group.forEach((c) => { if (c !== src()) c.showAt(t); });
  const mk = (opts) => { let me = null; me = createChart({ ...opts, onHover: sync(() => me) }); group.push(me); return me; };
  const chSpeed = mk({ height: 150, unit: 'km/s', unitLabel: 'km/s', series: [{ key: 'speed', label: 'Geschwindigkeit', color: '#6ea8ff' }], fmt: (v) => nf(v), minSpan: 100,
    bands: [{ v: 500, label: 'schnell', color: 'rgba(255,204,85,.55)' }, { v: 700, label: 'sehr schnell', color: 'rgba(255,120,80,.6)' }], aria: 'Sonnenwindgeschwindigkeit' });
  const chDens = mk({ height: 130, unit: 'cm⁻³', unitLabel: 'cm⁻³', series: [{ key: 'density', label: 'Dichte', color: '#b98cff' }], fmt: (v) => nf(v, 1), floor: 0, yMin: 0, minSpan: 4, aria: 'Protonendichte' });
  const chTemp = mk({ height: 130, unit: 'K', unitLabel: 'K', log: true, yMin: 1e4, yMax: 1e6, series: [{ key: 'temp', label: 'Temperatur', color: '#ffcc55' }], fmt: (v) => nf(v), aria: 'Protonentemperatur' });
  const chMag = mk({ height: 170, unit: 'nT', unitLabel: 'nT', zero: true, minSpan: 10, series: [{ key: 'bt', label: 'Bt', color: '#c3cde6', width: 1.3 }, { key: 'bz', label: 'Bz (GSM)', color: '#ff7a7a', width: 1.7 }],
    negFill: 'rgba(255, 90, 90, 0.28)', negFillKey: 'bz', fmt: (v) => nf(v, 1), aria: 'Interplanetares Magnetfeld Bt und Bz' });
  const windCard = el('section', { class: 'wx-card wx-wide' },
    el('div', { class: 'wx-card-head' }, el('div', {}, el('h3', { text: 'Sonnenwind live (L1)' }), windSrc), rangeSeg),
    windKpis, windMsg,
    el('div', { class: 'wx-charts' },
      chartBlock('Geschwindigkeit', chSpeed),
      chartBlock('Dichte', chDens),
      chartBlock('Temperatur', chTemp),
      chartBlock('Magnetfeld Bt / Bz', chMag, el('span', { class: 'wx-legend' }, legend('#c3cde6', 'Bt (gesamt)'), legend('#ff7a7a', 'Bz'), legend('rgba(255,90,90,.5)', 'Bz Süd (< 0) – koppelt an die Magnetosphäre', true)))));

  // --- Kp ---------------------------------------------------------------------------------------------
  const kpChart = createKpChart();
  const kpNow = el('div', { class: 'wx-kpis' });
  const kpFc = el('div', { class: 'wx-fcdays' });
  const kpMsg = el('div', { class: 'wx-msg' });
  const kpCard = el('section', { class: 'wx-card wx-wide' },
    el('div', { class: 'wx-card-head' }, el('div', {}, el('h3', { text: 'Kp-Index' }), el('span', { class: 'wx-card-meta', text: 'planetarer 3-h-Index, 7 Tage + 3-Tage-Vorhersage' })),
      el('span', { class: 'wx-legend' }, legend('#3ddc84', 'ruhig'), legend('#c6e05a', 'aktiv (4)'), legend('#f2d64b', 'G1'), legend('#ff9a3c', 'G3'), legend('#ff5a5a', 'G4'), legend('rgba(255,255,255,.35)', 'Vorhersage', true))),
    kpNow, kpMsg, kpChart.el, kpFc);

  // --- Röntgen + Protonen --------------------------------------------------------------------------------
  const xrayKpis = el('div', { class: 'wx-kpis' });
  const xrayMsg = el('div', { class: 'wx-msg' });
  const chX = createChart({ height: 200, log: true, yMin: 1e-9, yMax: 1e-3, unit: 'W/m²', unitLabel: 'W/m²', fmt: (v) => `${fmtSci(v)}`, gapMs: 10 * 60 * 1000,
    series: [{ key: 'long', label: '0,1–0,8 nm', color: '#ff9a3c' }, { key: 'short', label: '0,05–0,4 nm', color: '#6ea8ff', width: 1.2 }],
    bands: [1e-8, 1e-7, 1e-6, 1e-5, 1e-4].map((v) => ({ v, color: 'rgba(255,255,255,.14)' })),
    labels: [['A', 1e-8, 1e-7], ['B', 1e-7, 1e-6], ['C', 1e-6, 1e-5], ['M', 1e-5, 1e-4], ['X', 1e-4, 1e-3]].map(([text, v0, v1], i) => ({ text, v0, v1, color: ['#8a97b5', '#9fb4d8', '#f2d64b', '#ff9a3c', '#ff5a5a'][i] })),
    aria: 'GOES-Röntgenfluss logarithmisch' });
  const flareList = el('ol', { class: 'wx-flares' });
  const xrayCard = el('section', { class: 'wx-card' },
    el('div', { class: 'wx-card-head' }, el('div', {}, el('h3', { text: 'GOES-Röntgenfluss' }), el('span', { class: 'wx-card-meta', text: 'Flare-Klassen A–X, 24 h' })),
      el('span', { class: 'wx-legend' }, legend('#ff9a3c', '0,1–0,8 nm (Klasse)'), legend('#6ea8ff', '0,05–0,4 nm'))),
    xrayKpis, xrayMsg, chX.el,
    el('h4', { text: 'Flares der letzten 7 Tage (≥ C)' }), flareList);

  const protKpis = el('div', { class: 'wx-kpis' });
  const protMsg = el('div', { class: 'wx-msg' });
  const chP = createChart({ height: 200, log: true, yMin: 1e-1, yMax: 1e4, unit: 'pfu', unitLabel: 'pfu', fmt: (v) => fmtFlux(v), gapMs: 15 * 60 * 1000,
    series: [{ key: 'p10', label: '≥10 MeV', color: '#ff7a7a' }, { key: 'p100', label: '≥100 MeV', color: '#b98cff', width: 1.3 }],
    bands: [10, 100, 1e3, 1e4, 1e5].map((v, i) => ({ v, label: `S${i + 1}`, color: SCALE_COLORS[i + 1] })),
    aria: 'GOES-Protonenfluss logarithmisch' });
  const protCard = el('section', { class: 'wx-card' },
    el('div', { class: 'wx-card-head' }, el('div', {}, el('h3', { text: 'Protonenfluss' }), el('span', { class: 'wx-card-meta', text: 'GOES integral, 24 h, Schwellen der S-Skala' })),
      el('span', { class: 'wx-legend' }, legend('#ff7a7a', '≥10 MeV (S-Skala)'), legend('#b98cff', '≥100 MeV'))),
    protKpis, protMsg, chP.el,
    el('p', { class: 'wx-note', text: 'pfu = Teilchen pro cm² · s · sr. Ruhiger Hintergrund ≈ 0,1–0,5 pfu. S1 ab 10 pfu (≥10 MeV), jede weitere Stufe ×10.' }));

  // --- Missionsrisiko -----------------------------------------------------------------------------------
  const riskBody = el('div', { class: 'wx-risk' });
  const riskTrend = el('p', { class: 'wx-trend', hidden: true });
  const rulesBox = el('details', { class: 'wx-rules' }, el('summary', { text: 'Regeln und Schwellen anzeigen' }), buildRulesTable());
  const riskCard = el('section', { class: 'wx-card wx-wide' },
    el('div', { class: 'wx-card-head' }, el('div', {}, el('h3', { text: 'Missionsrisiko' }),
      el('span', { class: 'wx-card-meta', text: 'einfache Schwellenregeln je Bahnbereich – Strahlung, Aufladung, Drag, Funk' }))),
    riskTrend, riskBody, rulesBox,
    el('p', { class: 'wx-note', text: 'Richtwerte für Planung und Lehre, keine operative Freigabe. Jede Stufe ergibt sich aus der ungünstigsten Einzelregel.' }));

  // --- Meldungen + CMEs ---------------------------------------------------------------------------------
  const alertList = el('div', { class: 'wx-alerts' });
  const alertMsg = el('div', { class: 'wx-msg' });
  const alertCard = el('section', { class: 'wx-card' },
    el('div', { class: 'wx-card-head' }, el('div', {}, el('h3', { text: 'SWPC-Meldungen' }), el('span', { class: 'wx-card-meta', text: 'Alarme, Warnungen, Vorwarnungen (Originaltext, englisch)' }))),
    alertMsg, alertList);
  const cmeList = el('div', { class: 'wx-cmes' });
  const cmeMsg = el('div', { class: 'wx-msg' });
  const cmeCard = el('section', { class: 'wx-card' },
    el('div', { class: 'wx-card-head' }, el('div', {}, el('h3', { text: 'Koronale Massenauswürfe (CME)' }), el('span', { class: 'wx-card-meta', text: 'NASA DONKI, letzte 7 Tage' }))),
    cmeMsg, cmeList);

  const foot = el('footer', { class: 'wx-foot' },
    el('p', { text: 'Quellen: NOAA Space Weather Prediction Center (services.swpc.noaa.gov) – Echtzeit-Sonnenwind (RTSW), GOES-Röntgen- und Protonendaten, Kp-Index und -Vorhersage, NOAA-Skalen, Meldungen. Werke der US-Regierung, gemeinfrei. CMEs: NASA CCMC DONKI über api.nasa.gov.' }),
    el('p', { text: 'Echtzeitdaten sind vorläufig und können Lücken oder Ausreißer enthalten; Kp-Werte der letzten Stunden sind Schätzungen.' }));

  wrap.append(head, scaleRow, windCard, kpCard,
    el('div', { class: 'wx-grid2' }, xrayCard, protCard),
    riskCard,
    el('div', { class: 'wx-grid2' }, alertCard, cmeCard),
    foot);

  for (const n of [windMsg, kpMsg, xrayMsg, protMsg, alertMsg, cmeMsg]) setMsg(n, 'loading');

  // =======================================================================================================
  // Laden
  async function refresh(manual = false) {
    if (state.loading) return;
    state.loading = true; state.lastTry = Date.now();
    root.classList.add('is-loading');
    state.ctl?.abort();
    const ctl = new AbortController(); state.ctl = ctl;
    const keys = Object.keys(SRC);
    const res = await Promise.allSettled(keys.map((k) => getJSON(SWPC + SRC[k], ctl.signal)));
    if (ctl.signal.aborted) { state.loading = false; root.classList.remove('is-loading'); return; }
    let ok = 0;
    res.forEach((r, i) => {
      const k = keys[i];
      if (r.status === 'fulfilled') { state.data[k] = r.value; state.err[k] = null; ok++; } else state.err[k] = r.reason?.message || 'Fehler';
    });
    if (ok) state.lastOk = Date.now();
    // DONKI selten (Kontingent des DEMO_KEY)
    const sinceDonki = Date.now() - state.donkiAt;
    if (sinceDonki > DONKI_EVERY_MS || ((manual || !state.data.cme) && sinceDonki > 5 * 60 * 1000)) {
      {
        state.donkiAt = Date.now();
        const end = new Date(); const start = new Date(Date.now() - 7 * 24 * H);
        const ymd = (d) => d.toISOString().slice(0, 10);
        try {
          // zuerst der eigene Proxy (Schlüssel serverseitig, CDN-Cache für alle Besucher), im Dev-Server direkt
          state.data.cme = await getJSON('/api/donki-cme', ctl.signal)
            .catch((e) => { if (ctl.signal.aborted) throw e; return getJSON(`${DONKI_CME}?startDate=${ymd(start)}&endDate=${ymd(end)}&api_key=${DONKI_KEY}`, ctl.signal); });
          state.err.cme = null;
        } catch (e) { if (!ctl.signal.aborted) state.err.cme = e?.message || 'Fehler'; }
      }
    }
    state.loading = false; root.classList.remove('is-loading');
    if (ctl.signal.aborted) return;
    renderAll();
  }

  function setMsg(node, kind, text) {
    clear(node);
    node.className = `wx-msg ${kind || ''}`;
    if (!kind) return;
    if (kind === 'loading') node.append(el('span', { class: 'wx-spin', 'aria-hidden': 'true' }), el('span', { text: text || 'Daten werden geladen …' }));
    else node.append(el('span', { text }));
  }
  // Fehlerzustand je Quelle: mit vorhandenen Altdaten nur Hinweis, sonst Fehlermeldung
  function srcState(node, keysArr) {
    const errs = keysArr.filter((k) => state.err[k]);
    const have = keysArr.every((k) => state.data[k] != null);
    if (!errs.length) { setMsg(node, null); return true; }
    if (have) { setMsg(node, 'warn', `Aktualisierung fehlgeschlagen (${errs.map((k) => state.err[k]).join(', ')}) – zeige letzten Stand.`); return true; }
    setMsg(node, 'error', `Quelle derzeit nicht erreichbar (${errs.map((k) => state.err[k]).join(', ')}). Neuer Versuch bei der nächsten Aktualisierung.`);
    return keysArr.some((k) => state.data[k] != null);
  }

  // =======================================================================================================
  // Darstellung
  let derived = {};
  function renderAll() {
    derive();
    renderScales();
    renderWind();
    renderKp();
    renderXray();
    renderProtons();
    renderRisk();
    renderAlerts();
    renderCmes();
    updateStatus();
  }

  function derive() {
    const now = Date.now();
    const w = pickRtsw(state.data.wind); const mg = pickRtsw(state.data.mag);
    const speed = seriesOf(w.rows, 'proton_speed', { positive: true });
    const density = seriesOf(w.rows, 'proton_density', { positive: true });
    const temp = seriesOf(w.rows, 'proton_temperature', { positive: true });
    const bt = seriesOf(mg.rows, 'bt'); const bz = seriesOf(mg.rows, 'bz_gsm');
    const xl = goesSeries(state.data.xray, '0.1-0.8nm'); const xs = goesSeries(state.data.xray, '0.05-0.4nm');
    const p10 = goesSeries(state.data.proton, '>=10 MeV'); const p100 = goesSeries(state.data.proton, '>=100 MeV');
    const kp = parseKp(state.data.kp);
    const k1 = Array.isArray(state.data.kp1m) ? state.data.kp1m : [];
    const k1last = k1.length ? k1[k1.length - 1] : null;
    const lastObs = [...kp].reverse().find((b) => b.kind !== 'predicted');
    const kpNowV = num(k1last?.estimated_kp) ?? lastObs?.kp ?? null;
    const kpPast = kp.filter((b) => b.kind !== 'predicted' && b.t >= now - 24 * H);
    const kpPred = kp.filter((b) => b.kind === 'predicted' && b.t + 3 * H > now);
    const tail = (s) => (last(s) ? last(s).t : 0);
    const recent = (s, mins = 15) => { const l = last(s); return l && now - l.t < 30 * 60 * 1000 ? meanSince(s, l.t - mins * 60 * 1000) : null; };
    const inputs = {
      kp: kpNowV,
      kpMax24h: kpPast.length ? Math.max(...kpPast.map((b) => b.kp)) : null,
      kpForecastMax: kpPred.length ? Math.max(...kpPred.map((b) => b.kp)) : null,
      bz: recent(bz, 10),
      bzMin3h: last(bz) && now - last(bz).t < 30 * 60 * 1000 ? minSince(bz, now - 3 * H) : null,
      bt: recent(bt, 10),
      speed: recent(speed, 10),
      density: recent(density, 10),
      temp: recent(temp, 10),
      xray: last(xl) && now - last(xl).t < 30 * 60 * 1000 ? last(xl).v : null,
      xrayMax24h: maxSince(xl, now - 24 * H),
      p10: last(p10) && now - last(p10).t < 45 * 60 * 1000 ? last(p10).v : null,
      p100: last(p100) && now - last(p100).t < 45 * 60 * 1000 ? last(p100).v : null,
      time: now,
    };
    latestInputs = inputs;
    derived = { w, mg, speed, density, temp, bt, bz, xl, xs, p10, p100, kp, kpPred, inputs, tWind: Math.max(tail(speed), tail(bz)) };
  }

  function renderScales() {
    const sc = state.data.scales;
    const cur = sc?.['0']; const inp = derived.inputs || {};
    const meas = {
      G: inp.kp != null ? `Kp jetzt ${nf(inp.kp, 2)} · 24-h-Max ${nf(inp.kpMax24h, 2)}` : '',
      S: inp.p10 != null ? `≥10 MeV: ${fmtFlux(inp.p10)} pfu` : '',
      R: inp.xray != null ? `Röntgen jetzt ${flareClass(inp.xray)} · 24-h-Max ${flareClass(inp.xrayMax24h)}` : '',
    };
    for (const k of ['G', 'S', 'R']) {
      const T = scaleTiles[k];
      let v = num(cur?.[k]?.Scale);
      if (v == null) v = k === 'G' ? scaleFromKp(inp.kp) : k === 'S' ? scaleFromProton(inp.p10) : scaleFromXray(inp.xray);
      const has = v != null;
      T.lvl.textContent = has ? `${k}${v}` : `${k}–`;
      T.word.textContent = has ? (v === 0 ? 'keine Störung' : `${SCALE_WORD[v]}`) : (state.err.scales ? 'nicht verfügbar' : '…');
      T.tile.style.setProperty('--c', has ? SCALE_COLORS[Math.min(5, v)] : '#8a97b5');
      T.tile.classList.toggle('hot', has && v > 0);
      T.meas.textContent = meas[k];
      clear(T.fc);
      if (sc) {
        for (const d of ['1', '2', '3']) {
          const e = sc[d]; if (!e) continue;
          const t = parseT(`${e.DateStamp}T00:00:00`);
          let txt; let col;
          if (k === 'G') { const g = num(e.G?.Scale) ?? 0; txt = `G${g}`; col = SCALE_COLORS[g]; } else if (k === 'S') { const p = num(e.S?.Prob); txt = p == null ? '–' : `${p} %`; col = p >= 25 ? '#ffcc55' : p >= 10 ? '#f2d64b' : '#3ddc84'; } else {
            const a = num(e.R?.MinorProb); const b = num(e.R?.MajorProb); txt = a == null ? '–' : `${a}/${b ?? 0} %`; col = b >= 10 ? '#ff9a3c' : a >= 40 ? '#f2d64b' : '#3ddc84';
          }
          T.fc.append(el('span', { class: 'wx-fc', style: `--c:${col}`, title: k === 'R' ? 'Wahrscheinlichkeit R1–R2 / R3+' : k === 'S' ? 'Wahrscheinlichkeit S1+' : 'erwartete Höchststufe' },
            el('small', { text: Number.isFinite(t) ? `${WD[new Date(t).getUTCDay()]} ${fmtDateUTC(t)}` : '' }), el('b', { text: txt })));
        }
        T.fc.prepend(el('span', { class: 'wx-fc-l', text: k === 'R' ? 'Prognose R1–2 / R3+' : k === 'S' ? 'Prognose S1+' : 'Prognose' }));
      }
    }
  }

  function kpi(label, value, unit, opts = {}) {
    return el('div', { class: `wx-kpi${opts.cls ? ` ${opts.cls}` : ''}`, style: opts.color ? `--c:${opts.color}` : null, title: opts.title || null },
      el('span', { class: 'k', text: label }), el('span', { class: 'v' }, el('b', { text: value }), unit ? el('small', { text: ` ${unit}` }) : null));
  }

  function renderWind() {
    if (!derived.inputs) return;
    srcState(windMsg, ['wind', 'mag']);
    const d = derived; const inp = d.inputs;
    windSrc.textContent = `Quelle: ${[d.w.src, d.mg.src].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ') || '–'}${d.tWind ? ` · letzter Wert ${fmtDT(d.tWind)}` : ''}`;
    if (d.tWind && Date.now() - d.tWind > 30 * 60 * 1000 && !windMsg.textContent) setMsg(windMsg, 'warn', `Seit ${fmtDT(d.tWind)} keine neuen Messwerte von L1 (Datenlücke bei der Quelle).`);
    const pd = dynPressure(inp.density, inp.speed); const mp = magnetopauseRe(inp.density, inp.speed, inp.bz);
    clear(windKpis);
    windKpis.append(
      kpi('Geschwindigkeit', nf(inp.speed), 'km/s', { color: inp.speed >= 700 ? '#ff7a50' : inp.speed >= 500 ? '#ffcc55' : '#6ea8ff' }),
      kpi('Dichte', nf(inp.density, 1), 'cm⁻³', { color: '#b98cff' }),
      kpi('Temperatur', inp.temp != null ? nf(inp.temp / 1000) : '–', 'kK', { color: '#ffcc55' }),
      kpi('Bt', nf(inp.bt, 1), 'nT', { color: '#c3cde6' }),
      kpi('Bz', nf(inp.bz, 1), 'nT', { color: inp.bz <= -10 ? '#ff5a5a' : inp.bz < 0 ? '#ff9a7a' : '#3ddc84', cls: inp.bz < 0 ? 'south' : '', title: 'negativ = südwärts: Energie gelangt in die Magnetosphäre' }),
      kpi('Dyn. Druck', nf(pd, 1), 'nPa', { color: '#8fd3ff' }),
      kpi('Magnetopause', nf(mp, 1), 'Rₑ', { color: mp != null && mp < 8 ? '#ff9a3c' : '#8fd3ff', title: 'subsolarer Abstand nach Shue (1998); GEO = 6,6 Erdradien' }),
    );
    const now = Date.now();
    const end = Math.max(d.tWind || now, now - 5 * 60 * 1000);
    const rng = [end - state.range * H, end];
    const data = { speed: d.speed, density: d.density, temp: d.temp, bt: d.bt, bz: d.bz };
    for (const c of [chSpeed, chDens, chTemp, chMag]) c.update(data, d.speed.length || d.bz.length ? rng : null);
  }

  function renderKp() {
    srcState(kpMsg, ['kp']);
    const d = derived; const inp = d.inputs;
    kpChart.update(d.kp);
    clear(kpNow);
    const g = scaleFromKp(inp.kp);
    kpNow.append(
      kpi('Kp jetzt (geschätzt)', nf(inp.kp, 2), g ? `G${g}` : '', { color: kpColor(inp.kp) }),
      kpi('Max. 24 h', nf(inp.kpMax24h, 2), '', { color: kpColor(inp.kpMax24h) }),
      kpi('Max. Vorhersage 72 h', nf(inp.kpForecastMax, 2), scaleFromKp(inp.kpForecastMax) ? `G${scaleFromKp(inp.kpForecastMax)}` : '', { color: kpColor(inp.kpForecastMax) }),
    );
    clear(kpFc);
    // Vorhersage je UTC-Tag; nur Tage mit mindestens der Hälfte der 8 Intervalle (Rest von heute / Restintervall am Ende fallen weg)
    const days = new Map();
    for (const b of d.kp) {
      if (b.kind !== 'predicted') continue;
      const day = Math.floor(b.t / (24 * H)) * 24 * H;
      const e = days.get(day) || { mx: 0, n: 0 };
      e.mx = Math.max(e.mx, b.kp); e.n++; days.set(day, e);
    }
    const fcDays = [...days.entries()].filter(([, e]) => e.n >= 4).sort((a, b) => a[0] - b[0]).slice(0, 3);
    if (fcDays.length) {
      kpFc.append(el('span', { class: 'wx-fc-l', text: 'Vorhersage (Max. je UTC-Tag)' }));
      for (const [day, { mx }] of fcDays) {
        const gs = scaleFromKp(mx);
        kpFc.append(el('span', { class: 'wx-fc big', style: `--c:${kpColor(mx)}` },
          el('small', { text: `${WD[new Date(day).getUTCDay()]} ${fmtDateUTC(day)}` }), el('b', { text: `Kp ${nf(mx, 2)}` }), el('em', { text: gs ? `G${gs} ${SCALE_WORD[gs]}` : mx >= 4 ? 'aktiv' : 'ruhig' })));
      }
    }
  }

  function renderXray() {
    srcState(xrayMsg, ['xray']);
    const d = derived; const inp = d.inputs;
    const tl = last(d.xl)?.t ?? Date.now();
    chX.update({ long: d.xl, short: d.xs }, d.xl.length ? [tl - 24 * H, tl] : null);
    const r = scaleFromXray(inp.xray);
    clear(xrayKpis);
    xrayKpis.append(
      kpi('Klasse jetzt', flareClass(inp.xray), '', { color: r ? SCALE_COLORS[r] : '#ff9a3c', cls: 'cls' }),
      kpi('Fluss', fmtSci(inp.xray), 'W/m²', { color: '#ff9a3c' }),
      kpi('Max. 24 h', flareClass(inp.xrayMax24h), '', { color: scaleFromXray(inp.xrayMax24h) ? SCALE_COLORS[scaleFromXray(inp.xrayMax24h)] : '#9fb4d8', cls: 'cls' }),
    );
    clear(flareList);
    const fl = Array.isArray(state.data.flares) ? state.data.flares : [];
    const big = fl.map((f) => ({ t: parseT(f.max_time || f.begin_time), b: parseT(f.begin_time), e: parseT(f.end_time), cls: String(f.max_class || ''), flux: num(f.max_xrlong) }))
      .filter((f) => /^[CMX]/.test(f.cls) && Number.isFinite(f.t)).sort((a, b) => b.t - a.t).slice(0, 8);
    if (!fl.length && state.err.flares) flareList.append(el('li', { class: 'wx-empty', text: 'Flare-Liste nicht verfügbar.' }));
    else if (!big.length) flareList.append(el('li', { class: 'wx-empty', text: 'Keine Flares der Klasse C oder höher.' }));
    for (const f of big) {
      const c = f.cls[0];
      flareList.append(el('li', { style: `--c:${c === 'X' ? '#ff5a5a' : c === 'M' ? '#ff9a3c' : '#f2d64b'}` },
        el('b', { text: f.cls }), el('span', { text: `Maximum ${fmtDT(f.t)}` }),
        el('small', { text: Number.isFinite(f.b) && Number.isFinite(f.e) ? `${fmtUTC(f.b)}–${fmtUTC(f.e)}` : '' })));
    }
  }

  function renderProtons() {
    srcState(protMsg, ['proton']);
    const d = derived; const inp = d.inputs;
    const tl = last(d.p10)?.t ?? Date.now();
    chP.update({ p10: d.p10, p100: d.p100 }, d.p10.length ? [tl - 24 * H, tl] : null);
    const s = scaleFromProton(inp.p10);
    clear(protKpis);
    protKpis.append(
      kpi('≥10 MeV', fmtFlux(inp.p10), 'pfu', { color: s ? SCALE_COLORS[s] : '#ff7a7a' }),
      kpi('≥100 MeV', fmtFlux(inp.p100), 'pfu', { color: '#b98cff' }),
      kpi('S-Stufe', s == null ? '–' : `S${s}`, s == null ? '' : SCALE_WORD[s], { color: s ? SCALE_COLORS[s] : '#3ddc84' }),
    );
  }

  function renderRisk() {
    const r = missionRisk(derived.inputs);
    // Ampel oben
    const lit = r.level == null ? -1 : r.level === 0 ? 2 : r.level === 1 ? 1 : 0; // rot oben, gelb Mitte, grün unten
    ampLights.forEach((l, i) => { l.className = 'wx-light'; if (i === lit) l.classList.add(['red', 'amber', 'green'][i]); });
    if (r.level === 3) ampLights[0].classList.add('blink');
    ampLabel.textContent = r.level == null ? 'Keine Daten' : r.label;
    ampLabel.style.color = r.color;
    clear(ampRegs);
    for (const g of r.regimes) ampRegs.append(el('div', { class: 'wx-amp-reg', style: `--c:${g.color}` }, el('i'), el('span', { text: g.name }), el('b', { text: g.label })));
    // Detailauswertung
    riskTrend.hidden = !r.trend; riskTrend.textContent = r.trend || '';
    clear(riskBody);
    for (const g of r.regimes) {
      const list = el('ul', { class: 'wx-factors' });
      for (const f of g.factors) {
        const c = f.level == null ? '#8a97b5' : RISK_LEVELS[f.level].color;
        list.append(el('li', { style: `--c:${c}` },
          el('div', { class: 'wx-f-top' }, el('i'), el('span', { class: 'wx-f-l', text: f.label }), el('b', { text: f.level == null ? '–' : RISK_LEVELS[f.level].label })),
          el('div', { class: 'wx-f-v', text: `${f.input}: ${f.valueText}` }),
          el('div', { class: 'wx-f-why', text: f.why })));
      }
      riskBody.append(el('article', { class: 'wx-regime', style: `--c:${g.color}` },
        el('div', { class: 'wx-regime-h' }, el('div', {}, el('h4', { text: g.name }), el('small', { text: g.desc })), el('span', { class: 'wx-badge', text: g.label })),
        list));
    }
  }

  function renderAlerts() {
    srcState(alertMsg, ['alerts']);
    clear(alertList);
    const al = (Array.isArray(state.data.alerts) ? state.data.alerts : []).map(parseAlert).filter((a) => Number.isFinite(a.t)).sort((a, b) => b.t - a.t).slice(0, 14);
    if (!al.length && state.data.alerts) { alertList.append(el('p', { class: 'wx-empty', text: 'Keine aktuellen Meldungen.' })); return; }
    const now = Date.now();
    for (const a of al) {
      const k = a.kind.startsWith('CANCEL') ? 'CANCEL' : a.kind;
      const det = el('details', { class: `wx-alert k-${k.replace(/\s+/g, '-').toLowerCase()}${now - a.t < 24 * H ? ' fresh' : ''}` },
        el('summary', {},
          el('span', { class: 'wx-al-kind', text: KIND_DE[a.kind] || (k === 'CANCEL' ? 'Aufgehoben' : a.kind) }),
          el('span', { class: 'wx-al-title', text: a.title }),
          el('time', { text: fmtDT(a.t) })),
        el('pre', { class: 'wx-al-text', text: a.text }));
      alertList.append(det);
    }
  }

  function renderCmes() {
    clear(cmeList);
    const raw = state.data.cme;
    if (state.err.cme && raw == null) { setMsg(cmeMsg, 'error', `NASA DONKI derzeit nicht erreichbar (${state.err.cme}). Der DEMO_KEY ist zudem stündlich begrenzt.`); return; }
    if (raw == null) { setMsg(cmeMsg, 'loading'); return; }
    setMsg(cmeMsg, state.err.cme ? 'warn' : null, state.err.cme ? `Aktualisierung fehlgeschlagen (${state.err.cme}) – zeige letzten Stand.` : '');
    const list = (Array.isArray(raw) ? raw : []).map((c) => {
      const an = (c.cmeAnalyses || []).find((a) => a.isMostAccurate) || (c.cmeAnalyses || [])[0] || null;
      const enlil = an?.enlilList || [];
      const earth = enlil.find((e) => e.isEarthGB || e.estimatedShockArrivalTime);
      return { t: parseT(c.startTime), id: String(c.activityID || ''), speed: num(an?.speed), type: an?.type ? String(an.type) : '', half: num(an?.halfAngle), note: String(c.note || ''),
        earth: !!earth, arrival: earth?.estimatedShockArrivalTime ? parseT(earth.estimatedShockArrivalTime) : null, kpMax: num(earth?.kp_90 ?? earth?.kp_180) };
    }).filter((c) => Number.isFinite(c.t)).sort((a, b) => b.t - a.t).slice(0, 10);
    if (!list.length) { cmeList.append(el('p', { class: 'wx-empty', text: 'Keine CMEs in den letzten 7 Tagen erfasst.' })); return; }
    for (const c of list) {
      const fast = c.speed >= 1000;
      cmeList.append(el('div', { class: `wx-cme${c.earth ? ' earth' : ''}`, style: `--c:${c.earth ? '#ff9a3c' : fast ? '#f2d64b' : '#6ea8ff'}` },
        el('div', { class: 'wx-cme-top' }, el('b', { text: fmtDT(c.t) }), c.earth ? el('span', { class: 'wx-badge', text: 'Erde betroffen' }) : null),
        el('div', { class: 'wx-cme-v', text: [c.speed != null ? `${nf(c.speed)} km/s` : null, c.type ? `Typ ${c.type}` : null, c.half != null ? `Halbwinkel ${nf(c.half)}°` : null].filter(Boolean).join(' · ') || 'keine Analyse' }),
        c.arrival ? el('div', { class: 'wx-cme-a', text: `Geschätzte Ankunft Schock: ${fmtDT(c.arrival)}${c.kpMax != null ? ` · Kp bis ${nf(c.kpMax)}` : ''}` }) : null,
        c.note ? el('div', { class: 'wx-cme-n', text: c.note.length > 220 ? `${c.note.slice(0, 220)} …` : c.note }) : null));
    }
  }

  function updateStatus() {
    if (!state.lastOk) { status.textContent = state.loading ? 'Wird geladen …' : 'Keine Verbindung zu NOAA SWPC'; root.classList.toggle('is-offline', !state.loading); return; }
    root.classList.remove('is-offline');
    const sec = Math.max(0, Math.round((state.lastTry + REFRESH_MS - Date.now()) / 1000));
    const d = new Date(state.lastOk);
    const anyErr = Object.keys(SRC).some((k) => state.err[k]);
    status.textContent = `Stand ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC${anyErr ? ' · teilweise veraltet' : ''}${state.active && !document.hidden ? ` · nächste in ${sec} s` : ' · pausiert'}`;
  }

  // =======================================================================================================
  // Takt: 60 s, nur wenn aktiv und Tab sichtbar
  function schedule() {
    clearInterval(state.timer); clearInterval(state.tick); state.timer = null; state.tick = null;
    if (!state.active || document.hidden) { state.ctl?.abort(); state.loading = false; root.classList.remove('is-loading'); updateStatus(); return; }
    if (Date.now() - state.lastTry >= REFRESH_MS - 5000 || !state.lastOk) refresh();
    state.timer = setInterval(() => refresh(), REFRESH_MS);
    state.tick = setInterval(updateStatus, 1000);
    updateStatus();
  }
  document.addEventListener('visibilitychange', () => { if (state.active) schedule(); });

  function setActive(on) {
    const v = !!on;
    if (v === state.active) return;
    state.active = v;
    root.classList.toggle('is-active', v);
    schedule();
  }
  return { setActive };
}

// =========================================================================================================
function icon(d) { const s = sv('svg', { viewBox: '0 0 24 24', class: 'wx-ico', 'aria-hidden': 'true' }); s.append(sv('path', { d })); return s; }
function legend(color, text, area = false) { return el('span', { class: `wx-lg${area ? ' area' : ''}` }, el('i', { style: `background:${color}` }), el('span', { text })); }
function chartBlock(title, chart, extra) { return el('div', { class: 'wx-chart-block' }, el('div', { class: 'wx-chart-title' }, el('span', { text: title }), extra || null), chart.el); }
function buildRulesTable() {
  const box = el('div', { class: 'wx-rules-body' });
  box.append(el('p', { text: 'Jede Regel bildet eine Messgröße über drei Schwellen auf die Stufen Niedrig → Erhöht → Hoch → Kritisch ab. Ein Bereich erhält die höchste Stufe seiner Regeln. Exportiert als missionRisk(data) und MISSION_RISK_RULES.' }));
  for (const r of MISSION_RISK_RULES) {
    const tb = el('table', { class: 'wx-rt' });
    tb.append(el('caption', { text: `${r.name} – ${r.desc}` }));
    tb.append(el('thead', {}, el('tr', {}, el('th', { text: 'Faktor' }), el('th', { text: 'Messgröße' }), ...RISK_LEVELS.slice(1).map((l) => el('th', { style: `color:${l.color}`, text: l.label })))));
    const body = el('tbody');
    for (const f of r.factors) {
      const op = f.lowerIsWorse ? '≤' : '≥';
      body.append(el('tr', {}, el('td', { text: f.label }), el('td', { text: f.input }),
        ...f.thresholds.map((t) => el('td', { text: `${op} ${f.unit === 'W/m²' ? `${flareClass(t)}` : f.unit === 'pfu' ? fmtFlux(t) : nf(t, t % 1 ? 1 : 0)} ${f.unit === 'W/m²' ? '' : f.unit}`.trim() }))));
    }
    tb.append(body);
    box.append(el('div', { class: 'wx-rt-wrap' }, tb));
  }
  box.append(el('p', { class: 'wx-note', text: 'Magnetopause: r₀ = (10,22 + 1,29·tanh(0,184·(Bz + 8,14))) · P^(−1/6,6), P = 1,6726·10⁻⁶ · n · v² nPa (Shue et al. 1998). Röntgenklassen: A < 10⁻⁷, B < 10⁻⁶, C < 10⁻⁵, M < 10⁻⁴ ≤ X (W/m²).' }));
  return box;
}
