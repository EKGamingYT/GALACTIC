// Ingenieurstool: Raketen-Stufenrechner, Orbitmechanik, interplanetare Missionen und Raumschiff-Budgets.
// Alle Rechnungen sind bewusst einfache Näherungen (Tsiolkovsky, Kreisbahnen, Hohmann, Patched Conics)
// und dienen der Abschätzung – nicht der Missionsplanung.
// Ausgabe ausschließlich über textContent / Textknoten (keine innerHTML-Einfügung von Daten).

import './engineer.css';
import { BODIES } from '../data/bodies.js';
import { ENGINES, engineById, ENGINE_ABGLEICH } from '../data/engines.js';
import { LAUNCHERS, launcherById } from '../data/launchers.js';

// --- Konstanten ------------------------------------------------------------------------------------------
const G0 = 9.80665; // m/s², Normfallbeschleunigung (CGPM 1901)
const AU_KM = 149597870.7; // km, IAU 2012
const S0 = 1361; // W/m², Solarkonstante bei 1 AE (Kopp & Lean 2011, TSIS: 1360,8 ± 0,5)
const DAY = 86400;
const YEAR = 365.25 * DAY;

// Gravitationsparameter μ (km³/s²): JPL SSD „Astrodynamic Parameters“ / „Planetary Physical Parameters“ (DE440).
// Äquatorradius und siderische Rotation: NASA Planetary Fact Sheet. Negative Rotation = rückläufig.
const PHYS_SOURCE = [
  { name: 'JPL SSD – Astrodynamic Parameters', url: 'https://ssd.jpl.nasa.gov/astro_par.html' },
  { name: 'JPL SSD – Planetary Physical Parameters', url: 'https://ssd.jpl.nasa.gov/planets/phys_par.html' },
  { name: 'NASA – Planetary Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/' },
];
const PHYS = {
  sun: { gm: 132712440041.9, rEq: 695700, rotH: 609.12 },
  mercury: { gm: 22031.868551, rEq: 2440.5, rotH: 1407.6 },
  venus: { gm: 324858.592, rEq: 6051.8, rotH: -5832.6 },
  earth: { gm: 398600.435507, rEq: 6378.137, rotH: 23.9345 },
  moon: { gm: 4902.800118, rEq: 1738.1, rotH: 655.72, parent: 'earth', aKm: 384400 },
  mars: { gm: 42828.375816, rEq: 3396.2, rotH: 24.6229 },
  jupiter: { gm: 126712764.1, rEq: 71492, rotH: 9.925 },
  saturn: { gm: 37940584.8418, rEq: 60268, rotH: 10.656 },
  uranus: { gm: 5794556.4, rEq: 25559, rotH: -17.24 },
  neptune: { gm: 6836527.10058, rEq: 24764, rotH: 16.11 },
  pluto: { gm: 869.6, rEq: 1188.3, rotH: -153.2928 },
};
const ORBIT_BODIES = BODIES.filter((b) => PHYS[b.id]).map((b) => ({ ...b, ...PHYS[b.id] }));
const PLANETS = ORBIT_BODIES.filter((b) => b.elements); // heliozentrische Bahn bekannt (a = elements[0] in AE)
const physOf = (id) => ORBIT_BODIES.find((b) => b.id === id);
const MU_SUN = PHYS.sun.gm;

const STAGE_COLORS = ['#6ea8ff', '#b98cff', '#3ddc84', '#ffcc55', '#ff8f6b', '#5fd4d4'];

// --- Formatierung / Eingabe --------------------------------------------------------------------------------
const nfCache = new Map();
function fmt(x, d = 0) {
  if (x == null || !Number.isFinite(x)) return '–';
  let f = nfCache.get(d);
  if (!f) { f = new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }); nfCache.set(d, f); }
  return f.format(x);
}
// Signifikante Stellen für Werte unbekannter Größenordnung
function fmtSig(x, sig = 3) {
  if (x == null || !Number.isFinite(x)) return '–';
  if (x === 0) return '0';
  const d = Math.max(0, sig - 1 - Math.floor(Math.log10(Math.abs(x))));
  return fmt(x, Math.min(d, 6));
}
function fmtForce(kN) {
  if (kN == null || !Number.isFinite(kN)) return '–';
  if (kN < 0.01) return `${fmtSig(kN * 1e6, 3)} mN`;
  if (kN >= 10000) return `${fmt(kN / 1000, 2)} MN`;
  return `${fmt(kN, kN < 100 ? 1 : 0)} kN`;
}
function fmtDur(s) {
  if (s == null || !Number.isFinite(s)) return '–';
  if (s < 120) return `${fmt(s, 0)} s`;
  if (s < 7200) return `${fmt(Math.floor(s / 60))} min ${fmt(Math.round(s % 60))} s`;
  if (s < 3 * DAY) return `${fmt(s / 3600, 1)} h`;
  if (s < 2 * YEAR) return `${fmt(s / DAY, 1)} Tage`;
  return `${fmt(s / YEAR, 2)} Jahre`;
}
// Deutsche Eingaben: „1.234,5“, „1234,5“ und „1234.5“ werden akzeptiert.
function parseNum(str) {
  if (str == null) return NaN;
  let s = String(str).trim().replace(/[\s  ]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return /^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(s) ? Number(s) : NaN;
}
const toInput = (x, d = 3) => (x == null || !Number.isFinite(x) ? '' : new Intl.NumberFormat('de-DE', { maximumFractionDigits: d, useGrouping: false }).format(x));

// --- DOM-Helfer ----------------------------------------------------------------------------------------
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'style') n.style.cssText = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  append(n, kids);
  return n;
}
function append(n, kids) {
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
const SVGNS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs = {}, text) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
}
const clear = (n) => { while (n.firstChild) n.firstChild.remove(); };
let uid = 0;
const nextId = (p) => `eng-${p}-${++uid}`;

// Zahlenfeld mit Beschriftung und Einheit; ruft onInput(Wert) live auf.
function numField(label, value, unit, onInput, { hint, min, d = 3 } = {}) {
  const id = nextId('f');
  const input = el('input', { id, type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', value: toInput(value, d) });
  const wrap = el('label', { class: 'eng-field', for: id },
    el('span', { class: 'eng-field-l', text: label }),
    el('span', { class: 'eng-field-i' }, input, unit ? el('span', { class: 'eng-unit', text: unit }) : null),
    hint ? el('span', { class: 'eng-field-h', text: hint }) : null);
  input.addEventListener('input', () => {
    const v = parseNum(input.value);
    const bad = input.value.trim() !== '' && (!Number.isFinite(v) || (min != null && v < min));
    input.classList.toggle('bad', bad);
    onInput(input.value.trim() === '' || bad ? null : v);
  });
  return wrap;
}
function selectField(label, options, value, onChange) {
  const id = nextId('s');
  const sel = el('select', { id, class: 'eng-select' });
  fillOptions(sel, options, value);
  sel.addEventListener('change', () => onChange(sel.value));
  return el('label', { class: 'eng-field', for: id }, el('span', { class: 'eng-field-l', text: label }), el('span', { class: 'eng-field-i' }, sel));
}
// options: [{value, text}] oder [{group, items:[…]}]
function fillOptions(sel, options, value) {
  clear(sel);
  for (const o of options) {
    if (o.group) {
      const g = el('optgroup', { label: o.group });
      for (const it of o.items) g.append(el('option', { value: it.value, text: it.text }));
      sel.append(g);
    } else sel.append(el('option', { value: o.value, text: o.text }));
  }
  if (value != null) sel.value = value;
}
function kpi(label, value, sub, tone) {
  return el('div', { class: `eng-kpi${tone ? ` ${tone}` : ''}` },
    el('span', { class: 'k', text: label }), el('span', { class: 'v', text: value }), sub ? el('span', { class: 's', text: sub }) : null);
}
function card(title, ...kids) {
  return el('section', { class: 'eng-card' }, title ? el('h3', { text: title }) : null, kids);
}
function formula(title, lines) {
  return el('details', { class: 'eng-formula' }, el('summary', { text: title }),
    lines.map((l) => (Array.isArray(l) ? el('p', {}, el('code', { text: l[0] }), l[1] ? ` – ${l[1]}` : '') : el('p', { text: l }))));
}
function srcLink(q) {
  if (!q) return null;
  return q.url ? el('a', { href: q.url, target: '_blank', rel: 'noopener noreferrer', text: q.name }) : el('span', { text: q.name });
}
function warnList(items) {
  if (!items.length) return null;
  return el('ul', { class: 'eng-warn' }, [...new Set(items)].map((w) => el('li', { text: w })));
}

// --- Physik ----------------------------------------------------------------------------------------------
const vCirc = (mu, r) => Math.sqrt(mu / r);
const period = (mu, a) => 2 * Math.PI * Math.sqrt(a ** 3 / mu);
function hohmann(mu, r1, r2) {
  const a = (r1 + r2) / 2;
  const dv1 = Math.abs(Math.sqrt(mu / r1) * (Math.sqrt((2 * r2) / (r1 + r2)) - 1));
  const dv2 = Math.abs(Math.sqrt(mu / r2) * (1 - Math.sqrt((2 * r1) / (r1 + r2))));
  return { a, dv1, dv2, t: Math.PI * Math.sqrt(a ** 3 / mu) };
}
// Abflug/Einfang aus/in eine Kreisbahn mit Radius r bei hyperbolischer Überschussgeschwindigkeit vinf
const dvFromCircular = (mu, r, vinf) => Math.sqrt(vinf ** 2 + (2 * mu) / r) - Math.sqrt(mu / r);
function interplanetary(fromId, toId) {
  const A = physOf(fromId), B = physOf(toId);
  const r1 = A.elements[0] * AU_KM, r2 = B.elements[0] * AU_KM;
  const h = hohmann(MU_SUN, r1, r2);
  const v1 = vCirc(MU_SUN, r1), v2 = vCirc(MU_SUN, r2);
  const vt1 = Math.sqrt(MU_SUN * (2 / r1 - 1 / h.a)), vt2 = Math.sqrt(MU_SUN * (2 / r2 - 1 / h.a));
  const T1 = period(MU_SUN, r1), T2 = period(MU_SUN, r2);
  const syn = 1 / Math.abs(1 / T1 - 1 / T2);
  // Phasenwinkel: Winkel, um den das Ziel beim Start vorauslaufen muss
  let phase = 180 - (360 / T2) * h.t;
  phase = ((((phase + 180) % 360) + 360) % 360) - 180;
  return { A, B, r1, r2, tof: h.t, vinfDep: Math.abs(vt1 - v1), vinfArr: Math.abs(v2 - vt2), T1, T2, syn, phase };
}
function hillRadius(b) {
  if (b.id === 'sun') return null;
  if (b.parent) return b.aKm * Math.cbrt(b.gm / (3 * PHYS[b.parent].gm));
  return b.elements[0] * AU_KM * Math.cbrt(b.gm / (3 * MU_SUN));
}

// Richtwerte für das Raketen-Δv: LEO pauschal inkl. Gravitations-/Luftwiderstandsverlusten,
// darüber Hohmann-Zusatz aus 200-km-Parkbahn (selbst berechnet, Erde μ/R wie oben).
function rocketTargets() {
  const e = PHYS.earth, r0 = e.rEq + 200;
  const LEO = 9.4;
  const gto = hohmann(e.gm, r0, e.rEq + 35786).dv1;
  const tli = hohmann(e.gm, r0, 384400).dv1;
  const mars = dvFromCircular(e.gm, r0, interplanetary('earth', 'mars').vinfDep);
  return [
    { name: 'LEO (200 km)', dv: LEO, note: 'inkl. ≈ 1,5–2 km/s Verluste' },
    { name: 'GTO', dv: LEO + gto, note: `LEO + ${fmt(gto, 2)} km/s` },
    { name: 'Mond (TLI)', dv: LEO + tli, note: `LEO + ${fmt(tli, 2)} km/s` },
    { name: 'Mars-Transfer', dv: LEO + mars, note: `LEO + ${fmt(mars, 2)} km/s` },
  ];
}

// --- Triebwerks-/Stufenwerte -------------------------------------------------------------------------------------
function engineStats(e) {
  if (!e) return { error: 'kein Triebwerk gewählt' };
  const warn = [];
  const fV = e.schubVak_kN != null ? e.schubVak_kN * 1000 : null;
  const fS = e.schubSL_kN != null ? e.schubSL_kN * 1000 : null;
  let iV = e.ispVak_s;
  const iS = e.ispSL_s;
  let mdot = null;
  if (fV && iV) mdot = fV / (iV * G0);
  else if (fS && iS) mdot = fS / (iS * G0);
  if (!mdot) return { error: `${e.name}: ${iV || iS ? 'Schub' : 'spezifischer Impuls'} nicht veröffentlicht – nicht berechenbar` };
  if (!iV) { iV = iS; warn.push(`${e.name}: Vakuum-Isp fehlt – Bodenwert verwendet (Δv unterschätzt).`); }
  const fVac = mdot * iV * G0;
  const fSL = fS ?? (iS ? mdot * iS * G0 : null);
  return { mdot, fVac, fSL, warn };
}
function stageStats(stage) {
  let mdot = 0, fVac = 0, fSL = 0, slKnown = true;
  const warn = [];
  for (const g of stage.triebwerke) {
    if (!(g.anzahl > 0)) return { error: 'Triebwerksanzahl fehlt' };
    const s = engineStats(engineById(g.id));
    if (s.error) return s;
    mdot += g.anzahl * s.mdot;
    fVac += g.anzahl * s.fVac;
    if (s.fSL == null) slKnown = false; else fSL += g.anzahl * s.fSL;
    warn.push(...s.warn);
  }
  if (!slKnown) fSL = fVac;
  return { mdot, fVac, fSL, slKnown, warn };
}
// Mittlerer Schub (≙ gemittelte Isp, da Massenstrom konstant) für Phasen ab dem Boden, sonst Vakuum
const thrustFor = (st, atm) => (atm ? (st.fSL + st.fVac) / 2 : st.fVac);

function computeRocket(stages, payloadKg) {
  const n = stages.length;
  const warn = [];
  const rows = [];
  if (!(payloadKg >= 0)) return { error: 'Nutzlastmasse fehlt.', rows, warn };
  for (let i = 0; i < n; i++) {
    const s = stages[i];
    if (!(s.mp > 0) || !(s.md > 0)) return { error: `Stufe ${i + 1}: Treibstoff- und Trockenmasse eintragen (> 0).`, rows, warn };
  }
  const stats = stages.map(stageStats);
  const m0Total = payloadKg + stages.reduce((a, s) => a + s.mp + s.md, 0);
  const atmStage = new Set([0]);
  if (stages[0]?.parallel && n > 1) atmStage.add(1);
  const rem = stages.map((s) => s.mp);
  let m = m0Total;
  let error = null;
  for (let i = 0; i < n; i++) {
    const s = stages[i], a = stats[i];
    if (a.error) { error = `Stufe ${i + 1}: ${a.error}`; break; }
    warn.push(...a.warn.map((w) => `Stufe ${i + 1}: ${w}`));
    const atm = atmStage.has(i);
    if (atm && !a.slKnown) warn.push(`Stufe ${i + 1}: Bodenschub/-Isp unbekannt – Vakuumwert verwendet (Start-TWR und Δv überschätzt).`);
    if (s.parallel && i + 1 < n) {
      const c = stats[i + 1];
      if (c.error) { error = `Stufe ${i + 2}: ${c.error}`; break; }
      const atmC = atmStage.has(i + 1);
      const tb = rem[i] / a.mdot;
      let used = c.mdot * tb;
      if (used > rem[i + 1]) { used = rem[i + 1]; warn.push(`Stufe ${i + 2} hat ihren Treibstoff vor Brennschluss der Booster verbraucht – Näherung ungenau.`); }
      const F = thrustFor(a, atm) + thrustFor(c, atmC);
      const mdotT = a.mdot + c.mdot;
      const m0 = m, mf = m - rem[i] - used;
      const ve = F / mdotT;
      rows.push({
        idx: i, label: `Stufe ${i + 1} + ${i + 2} (parallel)`, isp: ve / G0, dv: ve * Math.log(m0 / mf), tb, m0, mf,
        twr0: ((atm ? a.fSL : a.fVac) + (atmC ? c.fSL : c.fVac)) / (m0 * G0), twr1: (a.fVac + c.fVac) / (mf * G0),
      });
      rem[i + 1] -= used;
      m = mf - s.md;
      continue;
    }
    const m0 = m, mf = m - rem[i];
    const ve = thrustFor(a, atm) / a.mdot;
    const after = i > 0 && stages[i - 1].parallel;
    rows.push({
      idx: i, label: after ? `Stufe ${i + 1} (Rest)` : `Stufe ${i + 1}`, isp: ve / G0, dv: ve * Math.log(m0 / mf), tb: rem[i] / a.mdot, m0, mf,
      // nach Booster-Abwurf ist die Stufe schon in der Höhe: mittlerer statt Bodenschub
      twr0: (after ? thrustFor(a, atm) : atm ? a.fSL : a.fVac) / (m0 * G0), twr1: a.fVac / (mf * G0),
    });
    m = mf - s.md;
  }
  if (stages[n - 1]?.parallel) warn.push('Letzte Stufe ist als „parallel“ markiert, hat aber keine Folgestufe – wie eine normale Stufe gerechnet.');
  const dvTotal = rows.reduce((a, r) => a + r.dv, 0);
  if (rows[0] && rows[0].twr0 < 1) warn.push('Start-Schub-Gewichts-Verhältnis < 1 – die Rakete hebt nicht ab.');
  else if (rows[0] && rows[0].twr0 < 1.15) warn.push('Start-TWR < 1,15 – sehr hohe Gravitationsverluste zu erwarten.');
  return { rows, dvTotal, m0Total, payloadFrac: payloadKg / m0Total, warn, error };
}

// =========================================================================================================
export function createEngineerView(container) {
  const root = el('div', { class: 'eng' });
  const wrap = el('div', { class: 'eng-wrap' });
  root.append(wrap);
  container.append(root);

  const TABS = [
    { id: 'rakete', name: 'Rakete' },
    { id: 'orbit', name: 'Orbit / Satellit' },
    { id: 'mission', name: 'Mission / Sonde' },
    { id: 'raumschiff', name: 'Raumschiff' },
    { id: 'katalog', name: 'Triebwerke' },
  ];
  const tabBar = el('div', { class: 'seg eng-tabs', role: 'tablist', 'aria-label': 'Bereiche des Ingenieurstools' });
  const panels = {};
  const tabBtns = {};
  let current = 'rakete';
  try { const t = localStorage.getItem('galactic.engineer.tab'); if (TABS.some((x) => x.id === t)) current = t; } catch { /* kein Speicher */ }

  for (const t of TABS) {
    const pid = nextId('p');
    const b = el('button', { type: 'button', role: 'tab', 'aria-controls': pid, text: t.name, onclick: () => show(t.id) });
    tabBtns[t.id] = b;
    tabBar.append(b);
    panels[t.id] = el('div', { class: 'eng-panel', id: pid, role: 'tabpanel' });
  }
  wrap.append(
    el('header', { class: 'eng-head' },
      el('div', {},
        el('h2', { class: 'eng-title', text: 'Ingenieurstool' }),
        el('p', { class: 'eng-sub', text: 'Raketen, Satelliten, Sonden und Raumschiffe überschlägig auslegen – alle Werte live, alle Formeln offen.' })),
      tabBar),
    ...Object.values(panels),
    el('p', { class: 'eng-foot', text: 'Vereinfachte Lehrmodelle (Tsiolkovsky, Kreisbahnen, Hohmann, Patched Conics). Ergebnisse sind Richtwerte, keine Missionsplanung.' }),
  );

  function show(id) {
    current = id;
    for (const t of TABS) {
      const on = t.id === id;
      tabBtns[t.id].classList.toggle('on', on);
      tabBtns[t.id].setAttribute('aria-selected', String(on));
      panels[t.id].hidden = !on;
    }
    try { localStorage.setItem('galactic.engineer.tab', id); } catch { /* egal */ }
  }

  buildRocket(panels.rakete);
  buildOrbit(panels.orbit);
  buildMission(panels.mission);
  buildCraft(panels.raumschiff);
  buildCatalog(panels.katalog);
  show(current);

  return {
    setActive(on) { root.classList.toggle('is-active', !!on); },
  };
}

// =========================================================================================================
// Tab: Rakete
function buildRocket(panel) {
  const launchEngines = [
    { group: 'Flüssigtriebwerke', items: ENGINES.filter((e) => e.art === 'fluessig').map((e) => ({ value: e.id, text: `${e.name} · ${e.hersteller}` })) },
    { group: 'Feststoffmotoren', items: ENGINES.filter((e) => e.art === 'fest').map((e) => ({ value: e.id, text: `${e.name} · ${e.hersteller}` })) },
  ];
  const state = {
    payload: 5000,
    stages: [
      { name: '1. Stufe', triebwerke: [{ id: 'rd-180', anzahl: 1 }], mp: 284089, md: 21054, parallel: false },
      { name: '2. Stufe', triebwerke: [{ id: 'rl10c-1', anzahl: 1 }], mp: 20830, md: 2316, parallel: false },
    ],
    source: null,
  };

  const tplSel = el('select', { class: 'eng-select', 'aria-label': 'Vorlage wählen' });
  fillOptions(tplSel, [{ value: '', text: 'Vorlage laden …' }, ...LAUNCHERS.map((l) => ({ value: l.id, text: `${l.name}${l.ohneMassen ? ' (ohne Massen)' : ''}` }))], '');
  tplSel.addEventListener('change', () => {
    const l = launcherById(tplSel.value);
    if (!l) return;
    state.stages = l.stufen.map((s) => ({
      name: s.name, triebwerke: s.triebwerke.map((g) => ({ ...g })), mp: s.treibstoff_kg, md: s.trocken_kg, parallel: !!s.parallel, hinweis: s.hinweis,
    }));
    if (l.nutzlast_kg != null) state.payload = l.nutzlast_kg;
    state.source = l;
    tplSel.value = '';
    renderEditor();
    update();
  });

  const payloadField = el('div');
  const srcBox = el('div', { class: 'eng-note' });
  const stagesBox = el('div', { class: 'eng-stages' });
  const addBtn = el('button', { type: 'button', class: 'eng-btn', text: '+ Stufe hinzufügen', onclick: () => {
    state.stages.push({ name: `${state.stages.length + 1}. Stufe`, triebwerke: [{ id: 'rl10b-2', anzahl: 1 }], mp: 20000, md: 2500, parallel: false });
    renderEditor(); update();
  } });

  const resBox = el('div', { class: 'eng-results' });
  const chartBox = el('div', { class: 'eng-charts' });
  const rocketBox = el('div', { class: 'eng-rocket' });

  panel.append(el('div', { class: 'eng-grid' },
    el('div', { class: 'eng-col' },
      card('Aufbau', el('div', { class: 'eng-row' }, tplSel, addBtn), srcBox, payloadField, stagesBox),
      formula('Formeln & Annahmen', [
        ['Δv = Isp · g₀ · ln(m₀ / m_f)', 'Raketengrundgleichung (Tsiolkovsky), g₀ = 9,80665 m/s²'],
        ['ṁ = F_vak / (Isp_vak · g₀)', 'Massenstrom je Triebwerk; Brenndauer t = m_Treibstoff / ṁ'],
        ['TWR = F / (m · g₀)', 'Schub-Gewichts-Verhältnis bei Zündung (m₀) und Brennschluss (m_f)'],
        ['Isp_1. Stufe = (Isp_SL + Isp_vak) / 2', 'Stufen, die am Boden zünden, rechnen mit der gemittelten Isp; alle anderen mit Vakuum-Isp'],
        ['Parallel: Isp_eff = ΣF / (Σṁ · g₀)', 'Booster brennen gemeinsam mit der Folgestufe; deren verbrauchter Treibstoff wird abgezogen, danach Abwurf der Booster-Trockenmasse'],
        'Nicht berücksichtigt: Gravitations-, Luftwiderstands- und Steuerverluste (stecken pauschal im LEO-Richtwert), Drosselung, Verkleidungsabwurf, Restreibstoff. Feststoffmotoren werden mit Maximalschub gerechnet – ihre Brenndauer erscheint daher zu kurz.',
      ])),
    el('div', { class: 'eng-col' },
      card('Ergebnis', resBox),
      card('Masse & Δv je Stufe', chartBox),
      card('Seitenansicht (schematisch)', rocketBox))));

  function renderEditor() {
    clear(payloadField);
    payloadField.append(numField('Nutzlast', state.payload / 1000, 't', (v) => { state.payload = v == null ? null : v * 1000; update(); }, { min: 0 }));
    clear(srcBox);
    if (state.source) {
      srcBox.append('Vorlage: ', el('strong', { text: state.source.name }), ' · Quelle: ', srcLink(state.source.quelle));
      if (state.source.ohneMassen) srcBox.append(el('div', { class: 'eng-hint', text: 'Für diese Rakete veröffentlicht der Hersteller keine Stufenmassen – bitte eigene Werte eintragen.' }));
    } else srcBox.append('Beispiel: Atlas V 401 · eigene Stufen frei konfigurierbar.');

    clear(stagesBox);
    state.stages.forEach((s, i) => {
      const color = STAGE_COLORS[i % STAGE_COLORS.length];
      const last = i === state.stages.length - 1;
      const groups = el('div', { class: 'eng-groups' });
      s.triebwerke.forEach((g, gi) => {
        const info = el('div', { class: 'eng-einfo' });
        const showInfo = () => { clear(info); info.append(engineInfo(engineById(g.id))); };
        groups.append(el('div', { class: 'eng-group' },
          el('div', { class: 'eng-row' },
            selectField(gi === 0 ? 'Triebwerk' : 'weiteres Triebwerk', launchEngines, g.id, (v) => { g.id = v; showInfo(); update(); }),
            numField('Anzahl', g.anzahl, '×', (v) => { g.anzahl = v == null ? null : Math.round(v); update(); }, { min: 1, d: 0 }),
            s.triebwerke.length > 1 ? el('button', { type: 'button', class: 'eng-btn ghost icon', title: 'Triebwerkstyp entfernen', 'aria-label': 'Triebwerkstyp entfernen', text: '×',
              onclick: () => { s.triebwerke.splice(gi, 1); renderEditor(); update(); } }) : null),
          info));
        showInfo();
      });
      const parId = nextId('c');
      const par = el('input', { type: 'checkbox', id: parId, checked: s.parallel && !last, disabled: last });
      par.addEventListener('change', () => { s.parallel = par.checked; renderEditor(); update(); });
      stagesBox.append(el('div', { class: 'eng-stage', style: `--c:${color}` },
        el('div', { class: 'eng-stage-h' },
          el('span', { class: 'eng-badge', text: `S${i + 1}` }),
          (() => { const n = el('input', { type: 'text', class: 'eng-name', value: s.name || '', 'aria-label': `Name Stufe ${i + 1}`, maxlength: '40' }); n.addEventListener('input', () => { s.name = n.value; update(); }); return n; })(),
          state.stages.length > 1 ? el('button', { type: 'button', class: 'eng-btn ghost icon', title: 'Stufe entfernen', 'aria-label': `Stufe ${i + 1} entfernen`, text: '×',
            onclick: () => { state.stages.splice(i, 1); renderEditor(); update(); } }) : null),
        groups,
        el('button', { type: 'button', class: 'eng-btn ghost small', text: '+ Triebwerkstyp', onclick: () => { s.triebwerke.push({ id: s.triebwerke[0].id, anzahl: 1 }); renderEditor(); update(); } }),
        el('div', { class: 'eng-row' },
          numField('Treibstoffmasse', s.mp == null ? null : s.mp / 1000, 't', (v) => { s.mp = v == null ? null : v * 1000; update(); }, { min: 0 }),
          numField('Trockenmasse', s.md == null ? null : s.md / 1000, 't', (v) => { s.md = v == null ? null : v * 1000; update(); }, { min: 0 })),
        el('label', { class: 'eng-check', for: parId }, par, el('span', { text: last ? 'Parallel-Booster (nur mit Folgestufe möglich)' : 'Booster: brennt parallel zur nächsten Stufe' })),
        s.hinweis ? el('p', { class: 'eng-hint', text: s.hinweis }) : null));
    });
  }

  function update() {
    const res = computeRocket(state.stages, state.payload);
    clear(resBox);
    if (res.rows.length) {
      resBox.append(el('div', { class: 'eng-kpis' },
        kpi('Gesamt-Δv', `${fmt(res.dvTotal / 1000, 2)} km/s`, res.error ? 'unvollständig' : 'ohne Verluste', 'hi'),
        kpi('Startmasse', `${fmt(res.m0Total / 1000, 1)} t`),
        kpi('Start-TWR', fmt(res.rows[0].twr0, 2), res.rows[0].twr0 < 1 ? 'hebt nicht ab' : null, res.rows[0].twr0 < 1 ? 'bad' : null),
        kpi('Nutzlastanteil', `${fmt(res.payloadFrac * 100, 2)} %`)));
      const table = el('table', { class: 'eng-table' },
        el('thead', {}, el('tr', {}, ['Phase', 'Isp', 'Δv', 'TWR Start', 'TWR Ende', 'Brenndauer', 'm₀/m_f'].map((h) => el('th', { scope: 'col', text: h })))),
        el('tbody', {}, res.rows.map((r) => el('tr', {},
          el('th', { scope: 'row' }, el('span', { class: 'eng-dot', style: `--c:${STAGE_COLORS[r.idx % STAGE_COLORS.length]}` }), r.label),
          el('td', { text: `${fmt(r.isp, 0)} s` }),
          el('td', { text: `${fmt(r.dv / 1000, 2)} km/s` }),
          el('td', { text: fmt(r.twr0, 2) }),
          el('td', { text: fmt(r.twr1, 2) }),
          el('td', { text: fmtDur(r.tb) }),
          el('td', { text: fmt(r.m0 / r.mf, 2) })))));
      resBox.append(el('div', { class: 'eng-scroll' }, table));
      // Zielwerte
      const tgt = el('div', { class: 'eng-targets' });
      for (const t of rocketTargets()) {
        const ok = res.dvTotal / 1000 >= t.dv;
        const p = Math.min(1, res.dvTotal / 1000 / t.dv);
        tgt.append(el('div', { class: `eng-target${ok ? ' ok' : ''}` },
          el('div', { class: 'eng-target-h' }, el('span', { text: t.name }), el('span', { text: `${fmt(t.dv, 1)} km/s ${ok ? '✓' : `(fehlen ${fmt(t.dv - res.dvTotal / 1000, 2)})`}` })),
          el('div', { class: 'eng-bar' }, el('i', { style: `width:${(p * 100).toFixed(1)}%` })),
          el('span', { class: 'eng-target-n', text: t.note })));
      }
      resBox.append(el('h4', { text: 'Ziel-Δv (Richtwerte)' }), tgt,
        el('p', { class: 'eng-hint', text: 'Richtwerte: LEO ≈ 9,4 km/s inkl. typischer Aufstiegsverluste; GTO/TLI/Mars als LEO + Hohmann-Zusatz aus 200 km Parkbahn (selbst berechnet, siehe Orbit- und Missions-Tab). Reale Werte hängen von Startort, Bahnneigung und Flugprofil ab.' }));
    }
    if (res.error) resBox.append(el('p', { class: 'eng-error', text: res.error }));
    const w = warnList(res.warn);
    if (w) resBox.append(w);
    drawCharts(res);
    drawRocket();
  }

  function drawCharts(res) {
    clear(chartBox);
    const massRows = state.stages.map((s, i) => ({
      label: `S${i + 1}`, color: STAGE_COLORS[i % STAGE_COLORS.length],
      segs: [{ v: (s.mp || 0) / 1000, cls: 'prop', title: `Treibstoff ${fmt((s.mp || 0) / 1000, 1)} t` }, { v: (s.md || 0) / 1000, cls: 'dry', title: `Trocken ${fmt((s.md || 0) / 1000, 1)} t` }],
      text: `${fmt(((s.mp || 0) + (s.md || 0)) / 1000, 1)} t`,
    }));
    const dvRows = res.rows.map((r) => ({
      label: r.label.replace('Stufe ', 'S').replace(' (parallel)', ' ∥').replace(' (Rest)', ' Rest'), color: STAGE_COLORS[r.idx % STAGE_COLORS.length],
      segs: [{ v: r.dv / 1000, cls: 'prop', title: `${fmt(r.dv / 1000, 2)} km/s` }], text: `${fmt(r.dv / 1000, 2)} km/s`,
    }));
    chartBox.append(
      el('div', { class: 'eng-chart' }, el('h4', { text: 'Masse je Stufe' }), barChart(massRows),
        el('div', { class: 'eng-legend' }, el('span', { class: 'lg prop', text: 'Treibstoff' }), el('span', { class: 'lg dry', text: 'Trockenmasse' }))),
      el('div', { class: 'eng-chart' }, el('h4', { text: 'Δv je Phase' }), dvRows.length ? barChart(dvRows) : el('p', { class: 'muted small', text: 'Noch keine berechenbare Phase.' })));
  }

  function drawRocket() {
    clear(rocketBox);
    const st = state.stages;
    const mass = (s) => Math.max(0, (s.mp || 0) + (s.md || 0));
    // Kernstapel = alle nicht-parallelen Stufen (bzw. letzte Stufe); Booster hängen an der Folgestufe
    const core = st.map((s, i) => ({ s, i })).filter(({ s, i }) => !(s.parallel && i < st.length - 1));
    const coreMass = core.reduce((a, c) => a + mass(c.s), 0) || 1;
    const H = 300, W = 46, CX = 90, FAIR = 40, BELL = 14, MIN = 14;
    const hs = core.map((c) => Math.max(MIN, (mass(c.s) / coreMass) * H));
    const total = hs.reduce((a, b) => a + b, 0) + FAIR + BELL + 16;
    const svg = sv('svg', { viewBox: `0 0 180 ${total.toFixed(0)}`, class: 'eng-svg', role: 'img', 'aria-label': 'Schematische Seitenansicht der Rakete, Stufenhöhen proportional zur Stufenmasse' });
    let y = total - BELL - 4;
    core.forEach((c, k) => {
      const h = hs[k];
      const color = STAGE_COLORS[c.i % STAGE_COLORS.length];
      y -= h;
      if (k === 0) svg.append(sv('path', { d: `M${CX - 14} ${y + h} L${CX + 14} ${y + h} L${CX + 19} ${y + h + BELL} L${CX - 19} ${y + h + BELL} Z`, class: 'bell' }));
      // Booster dieser Stufe (Vorgänger mit parallel)
      const prev = c.i > 0 ? st[c.i - 1] : null;
      if (prev && prev.parallel) {
        const bc = STAGE_COLORS[(c.i - 1) % STAGE_COLORS.length];
        const bh = Math.min(h * 1.1, Math.max(MIN, (mass(prev) / 2 / coreMass) * H * 1.5));
        for (const side of [-1, 1]) {
          const bx = side < 0 ? CX - W / 2 - 22 : CX + W / 2;
          svg.append(sv('rect', { x: bx, y: y + h - bh, width: 22, height: bh, rx: 4, fill: bc, class: 'booster' }));
          svg.append(sv('path', { d: `M${bx} ${y + h - bh + 6} Q${bx + 11} ${y + h - bh - 16} ${bx + 22} ${y + h - bh + 6} Z`, fill: bc, class: 'booster' }));
          svg.append(sv('path', { d: `M${bx + 4} ${y + h} L${bx + 18} ${y + h} L${bx + 20} ${y + h + 9} L${bx + 2} ${y + h + 9} Z`, class: 'bell' }));
        }
      }
      const r = sv('rect', { x: CX - W / 2, y, width: W, height: h, rx: 3, fill: color, class: 'stage' });
      r.append(sv('title', {}, `${c.s.name || `Stufe ${c.i + 1}`}: ${fmt(mass(c.s) / 1000, 1)} t`));
      svg.append(r);
      if (h >= 16) svg.append(sv('text', { x: CX, y: y + h / 2 + 4, 'text-anchor': 'middle', class: 'lbl' }, `S${c.i + 1}`));
    });
    svg.append(sv('path', { d: `M${CX - W / 2} ${y} C${CX - W / 2} ${y - FAIR * 0.6} ${CX - 6} ${y - FAIR} ${CX} ${y - FAIR} C${CX + 6} ${y - FAIR} ${CX + W / 2} ${y - FAIR * 0.6} ${CX + W / 2} ${y} Z`, class: 'fairing' }));
    rocketBox.append(svg, el('p', { class: 'eng-hint', text: 'Höhen proportional zur Stufenmasse (Mindesthöhe für kleine Stufen), Booster seitlich an der Stufe, mit der sie brennen.' }));
  }

  renderEditor();
  update();
}

function engineInfo(e) {
  if (!e) return '';
  const parts = [
    `${e.land} · ${e.treibstoff}`,
    `Schub ${e.schubSL_kN != null ? `${fmtForce(e.schubSL_kN)} (SL)` : ''}${e.schubSL_kN != null && e.schubVak_kN != null ? ' / ' : ''}${e.schubVak_kN != null ? `${fmtForce(e.schubVak_kN)} (Vak)` : ''}`,
    `Isp ${e.ispSL_s != null ? `${fmt(e.ispSL_s, 1)} s (SL)` : ''}${e.ispSL_s != null && e.ispVak_s != null ? ' / ' : ''}${e.ispVak_s != null ? `${fmt(e.ispVak_s, 1)} s (Vak)` : ''}${e.ispSL_s == null && e.ispVak_s == null ? 'nicht veröffentlicht' : ''}`,
  ];
  if (e.leistung_kW) parts.push(`${fmt(e.leistung_kW, 2)} kW`);
  return el('span', {}, parts.join(' · '), ' · ', srcLink(e.quelle), e.hinweis ? el('span', { class: 'eng-hint block', text: e.hinweis }) : null);
}

// Horizontales Balkendiagramm (SVG). rows: [{label, color, segs:[{v, cls, title}], text}]
function barChart(rows) {
  const W = 340, RH = 26, LW = 64, TW = 74;
  const max = Math.max(...rows.map((r) => r.segs.reduce((a, s) => a + s.v, 0)), 1e-9);
  const svg = sv('svg', { viewBox: `0 0 ${W} ${rows.length * RH + 4}`, class: 'eng-bars', role: 'img' });
  rows.forEach((r, i) => {
    const y = i * RH + 4;
    svg.append(sv('text', { x: 0, y: y + 14, class: 'lbl' }, r.label));
    let x = LW;
    for (const s of r.segs) {
      const w = (s.v / max) * (W - LW - TW);
      const rect = sv('rect', { x, y: y + 2, width: Math.max(0, w), height: 16, rx: 3, fill: r.color, class: s.cls });
      rect.append(sv('title', {}, s.title));
      svg.append(rect);
      x += w;
    }
    svg.append(sv('text', { x: x + 6, y: y + 14, class: 'val' }, r.text));
  });
  return svg;
}

// =========================================================================================================
// Tab: Orbit / Satellit
function buildOrbit(panel) {
  const state = { body: 'earth', h: 400, h1: 400, h2: 35786 };
  const bodyOpts = ORBIT_BODIES.map((b) => ({ value: b.id, text: `${b.name} (${b.type})` }));
  const out1 = el('div'), out2 = el('div'), out3 = el('div'), bodyInfo = el('p', { class: 'eng-note' });

  panel.append(el('div', { class: 'eng-grid three' },
    card('Zentralkörper',
      selectField('Körper', bodyOpts, state.body, (v) => { state.body = v; update(); }),
      bodyInfo,
      el('p', { class: 'eng-hint' }, 'Quellen: ', PHYS_SOURCE.map((q, i) => [i ? ' · ' : '', srcLink(q)]))),
    card('Kreisbahn',
      numField('Bahnhöhe über Äquatorradius', state.h, 'km', (v) => { state.h = v; update(); }, { min: 0 }),
      out1,
      formula('Formeln', [
        ['v = √(μ / r)', 'Kreisbahngeschwindigkeit, r = R + h'],
        ['T = 2π · √(r³ / μ)', 'Umlaufzeit'],
        ['v_esc = √(2μ / r)', 'Fluchtgeschwindigkeit (ohne Atmosphäre/Rotation)'],
        ['g = μ / r²', 'Schwerebeschleunigung in dieser Höhe'],
      ])),
    card('Hohmann-Transfer',
      el('div', { class: 'eng-row' },
        numField('Starthöhe', state.h1, 'km', (v) => { state.h1 = v; update(); }, { min: 0 }),
        numField('Zielhöhe', state.h2, 'km', (v) => { state.h2 = v; update(); }, { min: 0 })),
      out2,
      formula('Formeln', [
        ['a = (r₁ + r₂) / 2', 'große Halbachse der Transferellipse'],
        ['Δv₁ = √(μ/r₁) · (√(2r₂/(r₁+r₂)) − 1)', 'Zündung in der Ausgangsbahn'],
        ['Δv₂ = √(μ/r₂) · (1 − √(2r₁/(r₁+r₂)))', 'Zirkularisierung in der Zielbahn'],
        ['t = π · √(a³ / μ)', 'Transferzeit (halbe Ellipse)'],
        'Koplanare Kreisbahnen, impulsive Zündungen; Bahnebenenwechsel nicht enthalten.',
      ])),
    card('Synchrone Bahn', out3,
      formula('Formeln', [
        ['r_sync = ∛(μ · T_rot² / 4π²)', 'Bahnradius mit Umlaufzeit = siderische Rotationsperiode'],
        ['r_Hill ≈ a · ∛(m / 3M)', 'Hill-Sphäre: außerhalb ist keine stabile Umlaufbahn um den Körper möglich'],
      ]))));

  function update() {
    const b = physOf(state.body);
    clear(bodyInfo);
    bodyInfo.append(`μ = ${fmtSig(b.gm, 7)} km³/s² · Äquatorradius ${fmt(b.rEq, 1)} km · siderische Rotation ${fmt(Math.abs(b.rotH), 2)} h${b.rotH < 0 ? ' (rückläufig)' : ''}`);

    clear(out1);
    if (state.h != null) {
      const r = b.rEq + state.h;
      out1.append(el('div', { class: 'eng-kpis' },
        kpi('Bahngeschwindigkeit', `${fmt(vCirc(b.gm, r), 3)} km/s`, null, 'hi'),
        kpi('Umlaufzeit', fmtDur(period(b.gm, r))),
        kpi('Fluchtgeschw. (Höhe)', `${fmt(Math.sqrt((2 * b.gm) / r), 3)} km/s`),
        kpi('Fluchtgeschw. (Oberfl.)', `${fmt(Math.sqrt((2 * b.gm) / b.rEq), 3)} km/s`),
        kpi('Schwere in Höhe', `${fmt((b.gm / r ** 2) * 1000, 3)} m/s²`)));
      const rH = hillRadius(b);
      if (rH && r > rH / 3) out1.append(el('p', { class: 'eng-error', text: `Bahnradius liegt jenseits ⅓ der Hill-Sphäre (${fmt(rH, 0)} km) – Bahn durch Störungen nicht stabil.` }));
    }

    clear(out2);
    if (state.h1 != null && state.h2 != null) {
      const h = hohmann(b.gm, b.rEq + state.h1, b.rEq + state.h2);
      out2.append(el('div', { class: 'eng-kpis' },
        kpi('Δv₁', `${fmt(h.dv1 * 1000, 0)} m/s`),
        kpi('Δv₂', `${fmt(h.dv2 * 1000, 0)} m/s`),
        kpi('Δv gesamt', `${fmt((h.dv1 + h.dv2) * 1000, 0)} m/s`, null, 'hi'),
        kpi('Transferzeit', fmtDur(h.t))));
    }

    clear(out3);
    const T = Math.abs(b.rotH) * 3600;
    const rs = Math.cbrt((b.gm * T * T) / (4 * Math.PI * Math.PI));
    const rH = hillRadius(b);
    const name = b.id === 'earth' ? 'Geostationäre Bahn' : b.id === 'mars' ? 'Areostationäre Bahn' : 'Synchrone Bahn';
    out3.append(el('div', { class: 'eng-kpis' },
      kpi(`${name} – Höhe`, `${fmt(rs - b.rEq, 0)} km`, `Radius ${fmt(rs, 0)} km`, 'hi'),
      kpi('Bahngeschwindigkeit', `${fmt(vCirc(b.gm, rs), 3)} km/s`),
      rH ? kpi('Hill-Sphäre', `${fmt(rH, 0)} km`) : null));
    if (rs < b.rEq) out3.append(el('p', { class: 'eng-error', text: 'Synchronbahn läge unter der Oberfläche – nicht möglich.' }));
    else if (rH && rs > rH / 3) out3.append(el('p', { class: 'eng-error', text: 'Synchronbahn liegt außerhalb des stabilen Bereichs der Hill-Sphäre – praktisch nicht nutzbar.' }));
    if (b.rotH < 0) out3.append(el('p', { class: 'eng-hint', text: 'Rückläufige Rotation: Die synchrone Bahn müsste ebenfalls rückläufig sein.' }));
  }
  update();
}

// =========================================================================================================
// Tab: Mission / Sonde
function buildMission(panel) {
  const state = { from: 'earth', to: 'mars', hDep: 200, hArr: 400 };
  const opts = PLANETS.map((p) => ({ value: p.id, text: p.name }));
  const out = el('div');
  const depLbl = el('div'), arrLbl = el('div');

  panel.append(el('div', { class: 'eng-grid' },
    el('div', { class: 'eng-col' },
      card('Transfer',
        el('div', { class: 'eng-row' },
          selectField('Von', opts, state.from, (v) => { state.from = v; update(); }),
          selectField('Nach', opts, state.to, (v) => { state.to = v; update(); })),
        el('div', { class: 'eng-row' },
          numField('Parkbahn beim Start', state.hDep, 'km', (v) => { state.hDep = v; update(); }, { min: 0 }),
          numField('Zielbahn bei Ankunft', state.hArr, 'km', (v) => { state.hArr = v; update(); }, { min: 0 })),
        depLbl, arrLbl,
        el('p', { class: 'eng-tag', text: 'Näherung: Patched Conics · Hohmann zwischen mittleren, kreisförmigen und koplanaren Bahnen' }),
        el('p', { class: 'eng-hint' }, 'Bahnradien: große Halbachsen nach Standish (JPL), Massen/μ: ', srcLink(PHYS_SOURCE[0]))),
      formula('Formeln & Annahmen', [
        ['v∞ = |v_Transfer − v_Planet|', 'hyperbolische Überschussgeschwindigkeit an Start- und Zielplanet'],
        ['C3 = v∞²', 'charakteristische Energie des Abflugs (km²/s²)'],
        ['Δv = √(v∞² + 2μ/r) − √(μ/r)', 'Zündung aus einer Kreisbahn mit Radius r (Abflug) bzw. Einfang in eine Kreisbahn (Ankunft)'],
        ['t = π · √(a³ / μ_☉)', 'Flugdauer (halbe Transferellipse)'],
        ['S = 1 / |1/T₁ − 1/T₂|', 'synodische Periode = Abstand zwischen Startfenstern'],
        ['φ = 180° − n₂ · t', 'Phasenwinkel: so weit muss das Ziel beim Start vorauslaufen'],
        'Reale Missionen nutzen elliptische Bahnen, Bahnneigungen, Swing-bys und Lambert-Lösungen – Werte können deutlich abweichen (z. B. Jupiter real oft per Venus-/Erd-Swing-by).',
      ])),
    card('Ergebnis', out)));

  function update() {
    clear(out);
    clear(depLbl); clear(arrLbl);
    if (state.from === state.to) { out.append(el('p', { class: 'eng-error', text: 'Start- und Zielplanet müssen verschieden sein.' })); return; }
    const m = interplanetary(state.from, state.to);
    depLbl.append(el('p', { class: 'eng-hint', text: `${m.A.name}: Radius ${fmt(m.A.rEq, 0)} km, mittlerer Sonnenabstand ${fmt(m.A.elements[0], 3)} AE` }));
    arrLbl.append(el('p', { class: 'eng-hint', text: `${m.B.name}: Radius ${fmt(m.B.rEq, 0)} km, mittlerer Sonnenabstand ${fmt(m.B.elements[0], 3)} AE` }));
    const dep = state.hDep != null ? dvFromCircular(m.A.gm, m.A.rEq + state.hDep, m.vinfDep) : null;
    const arr = state.hArr != null ? dvFromCircular(m.B.gm, m.B.rEq + state.hArr, m.vinfArr) : null;
    out.append(
      el('div', { class: 'eng-kpis' },
        kpi('Flugdauer', fmtDur(m.tof), `${fmt(m.tof / DAY, 0)} Tage`, 'hi'),
        kpi('C3 (Abflug)', `${fmt(m.vinfDep ** 2, 2)} km²/s²`),
        kpi('v∞ Abflug', `${fmt(m.vinfDep, 3)} km/s`),
        kpi('Δv Abflug', dep != null ? `${fmt(dep, 3)} km/s` : '–', state.hDep != null ? `aus ${fmt(state.hDep)} km Kreisbahn` : null),
        kpi('v∞ Ankunft', `${fmt(m.vinfArr, 3)} km/s`),
        kpi('Δv Einfang', arr != null ? `${fmt(arr, 3)} km/s` : '–', state.hArr != null ? `in ${fmt(state.hArr)} km Kreisbahn` : null),
        kpi('Δv gesamt', dep != null && arr != null ? `${fmt(dep + arr, 3)} km/s` : '–', 'ab Parkbahn bis Zielbahn', 'hi'),
        kpi('Synodische Periode', fmtDur(m.syn), `${fmt(m.syn / DAY, 0)} Tage`),
        kpi('Phasenwinkel beim Start', `${fmt(m.phase, 1)}°`, m.phase >= 0 ? 'Ziel läuft voraus' : 'Ziel läuft hinterher'),
        kpi(`Umlaufzeit ${m.A.name}`, fmtDur(m.T1)),
        kpi(`Umlaufzeit ${m.B.name}`, fmtDur(m.T2))),
      el('p', { class: 'eng-hint', text: 'Startfenster wiederholen sich etwa im Abstand der synodischen Periode. Aerobraking am Ziel kann das Einfang-Δv stark senken (nicht berücksichtigt).' }),
      transferSvg(m));
  }
  update();
}

// Skizze der Hohmann-Ellipse (heliozentrisch, maßstäblich in Bahnradien)
function transferSvg(m) {
  const S = 130, C = 150;
  const rmax = Math.max(m.r1, m.r2);
  const k = S / rmax;
  const r1 = m.r1 * k, r2 = m.r2 * k;
  const a = (r1 + r2) / 2, b = Math.sqrt(r1 * r2); // Halbachsen der Transferellipse
  const svg = sv('svg', { viewBox: '0 0 300 300', class: 'eng-svg orbit', role: 'img', 'aria-label': 'Skizze der Transferbahn' });
  svg.append(sv('circle', { cx: C, cy: C, r: r1, class: 'orb a' }), sv('circle', { cx: C, cy: C, r: r2, class: 'orb b' }));
  // halbe Ellipse vom Start (rechts, Abstand r1) zum Ziel (gegenüber)
  const start = C + r1, end = C - r2;
  svg.append(sv('path', { d: `M${start} ${C} A${a} ${b} 0 0 0 ${end} ${C}`, class: 'xfer' }));
  svg.append(sv('circle', { cx: C, cy: C, r: 5, class: 'sun' }));
  svg.append(sv('circle', { cx: start, cy: C, r: 4, class: 'pa' }), sv('circle', { cx: end, cy: C, r: 4, class: 'pb' }));
  svg.append(sv('text', { x: start + 6, y: C + 14, class: 'lbl' }, m.A.name), sv('text', { x: end, y: C - 10, class: 'lbl', 'text-anchor': 'middle' }, m.B.name));
  return el('div', { class: 'eng-orbitfig' }, svg);
}

// =========================================================================================================
// Tab: Raumschiff
function buildCraft(panel) {
  const state = {
    rows: [
      { name: 'Struktur & Mechanismen', m: 120, p: 0 },
      { name: 'Thermalkontrolle', m: 25, p: 40 },
      { name: 'Energieversorgung (Batterie, PCDU)', m: 60, p: 30 },
      { name: 'Lage- und Bahnregelung', m: 35, p: 60 },
      { name: 'Kommunikation', m: 20, p: 80 },
      { name: 'Bordrechner & Datenhaltung', m: 10, p: 30 },
      { name: 'Antrieb (trocken)', m: 40, p: 20 },
      { name: 'Nutzlast / Instrumente', m: 80, p: 150 },
    ],
    margM: 20, margP: 20, dist: 1, eta: 30, loss: 80, angle: 0,
    engine: 'spt-100', prop: 50,
  };
  const listBox = el('div', { class: 'eng-budget' });
  const out = el('div'), solarOut = el('div'), propOut = el('div');
  const distWrap = el('div');
  const engOpts = [
    { group: 'Elektrisch', items: ENGINES.filter((e) => e.art === 'elektrisch').map((e) => ({ value: e.id, text: e.name })) },
    { group: 'Chemisch (flüssig)', items: ENGINES.filter((e) => e.art === 'fluessig').map((e) => ({ value: e.id, text: e.name })) },
  ];
  const engInfo = el('div', { class: 'eng-einfo' });

  panel.append(el('div', { class: 'eng-grid' },
    el('div', { class: 'eng-col' },
      card('Subsysteme',
        el('p', { class: 'eng-hint', text: 'Beispielwerte eines kleinen Satelliten – frei änderbar.' }),
        listBox,
        el('button', { type: 'button', class: 'eng-btn', text: '+ Subsystem', onclick: () => { state.rows.push({ name: 'Neues Subsystem', m: 0, p: 0 }); renderList(); update(); } }),
        el('div', { class: 'eng-row' },
          numField('Massenreserve', state.margM, '%', (v) => { state.margM = v; update(); }, { min: 0, hint: 'üblich 10–20 % (Systemmarge)' }),
          numField('Leistungsreserve', state.margP, '%', (v) => { state.margP = v; update(); }, { min: 0 }))),
      formula('Formeln & Annahmen', [
        ['m_ges = Σm · (1 + Reserve)', 'Trockenmasse mit Systemmarge'],
        ['S = S₀ / d²', `Solarstrahlung im Abstand d (AE), S₀ = ${fmt(S0)} W/m² (TSIS, Kopp & Lean 2011)`],
        ['A = P / (S · η · f · cos θ)', 'Zellfläche: η Wirkungsgrad, f Verluste (Alterung, Verschaltung, Temperatur), θ Einfallswinkel'],
        ['Δv = Isp · g₀ · ln((m_ges + m_T) / m_ges)', 'Antriebsvermögen mit Treibstoffmasse m_T'],
        'Ohne Batterieauslegung für Schattenphasen, ohne Leistungsbedarf des Antriebs im Budget (bei elektrischem Antrieb separat ausgewiesen).',
      ])),
    el('div', { class: 'eng-col' },
      card('Budget', out),
      card('Solargenerator',
        distWrap,
        el('div', { class: 'eng-row' },
          numField('Zellwirkungsgrad η', state.eta, '%', (v) => { state.eta = v; update(); }, { min: 0, hint: 'Dreifachzellen ≈ 28–32 %' }),
          numField('Verlustfaktor f', state.loss, '%', (v) => { state.loss = v; update(); }, { min: 0 }),
          numField('Einfallswinkel θ', state.angle, '°', (v) => { state.angle = v; update(); }, { min: 0 })),
        solarOut),
      card('Antrieb',
        el('div', { class: 'eng-row' },
          selectField('Triebwerk', engOpts, state.engine, (v) => { state.engine = v; update(); }),
          numField('Treibstoffmasse', state.prop, 'kg', (v) => { state.prop = v; update(); }, { min: 0 })),
        engInfo, propOut))));

  // Abstandsfeld + Schnellwahl der Planeten
  const distField = numField('Sonnenabstand', state.dist, 'AE', (v) => { state.dist = v; update(); }, { min: 0 });
  distWrap.append(distField, el('div', { class: 'eng-chips' }, PLANETS.slice(0, 6).map((p) => el('button', {
    type: 'button', class: 'eng-chip', text: p.name,
    onclick: () => { const inp = distField.querySelector('input'); inp.value = toInput(p.elements[0], 3); inp.dispatchEvent(new Event('input')); },
  }))));

  function renderList() {
    clear(listBox);
    listBox.append(el('div', { class: 'eng-budget-h' }, el('span', { text: 'Subsystem' }), el('span', { text: 'Masse' }), el('span', { text: 'Leistung' }), el('span')));
    state.rows.forEach((r, i) => {
      const name = el('input', { type: 'text', class: 'eng-name', value: r.name, 'aria-label': 'Subsystem', maxlength: '60' });
      name.addEventListener('input', () => { r.name = name.value; });
      listBox.append(el('div', { class: 'eng-budget-r' }, name,
        numField('', r.m, 'kg', (v) => { r.m = v; update(); }, { min: 0 }),
        numField('', r.p, 'W', (v) => { r.p = v; update(); }, { min: 0 }),
        el('button', { type: 'button', class: 'eng-btn ghost icon', title: 'Entfernen', 'aria-label': `${r.name} entfernen`, text: '×', onclick: () => { state.rows.splice(i, 1); renderList(); update(); } })));
    });
  }

  function update() {
    const sumM = state.rows.reduce((a, r) => a + (r.m || 0), 0);
    const sumP = state.rows.reduce((a, r) => a + (r.p || 0), 0);
    const mTot = sumM * (1 + (state.margM || 0) / 100);
    const pTot = sumP * (1 + (state.margP || 0) / 100);
    clear(out);
    out.append(el('div', { class: 'eng-kpis' },
      kpi('Trockenmasse (Σ)', `${fmt(sumM, 1)} kg`),
      kpi('inkl. Reserve', `${fmt(mTot, 1)} kg`, `+${fmt(state.margM || 0)} %`, 'hi'),
      kpi('Leistung (Σ)', `${fmt(sumP, 0)} W`),
      kpi('inkl. Reserve', `${fmt(pTot, 0)} W`, `+${fmt(state.margP || 0)} %`, 'hi')));
    // Anteile
    if (sumM > 0) {
      const bar = el('div', { class: 'eng-stack', role: 'img', 'aria-label': 'Massenanteile der Subsysteme' });
      state.rows.forEach((r, i) => {
        if (!(r.m > 0)) return;
        bar.append(el('i', { style: `width:${((r.m / sumM) * 100).toFixed(2)}%;--c:${STAGE_COLORS[i % STAGE_COLORS.length]}`, title: `${r.name}: ${fmt((r.m / sumM) * 100, 1)} %` }));
      });
      out.append(el('h4', { text: 'Massenanteile' }), bar,
        el('ul', { class: 'eng-legend list' }, state.rows.filter((r) => r.m > 0).map((r) => el('li', { style: `--c:${STAGE_COLORS[state.rows.indexOf(r) % STAGE_COLORS.length]}` }, `${r.name} · ${fmt((r.m / sumM) * 100, 1)} %`))));
    }

    clear(solarOut);
    const cos = Math.cos(((state.angle || 0) * Math.PI) / 180);
    if (state.dist > 0 && state.eta > 0 && state.loss > 0 && cos > 0.01) {
      const S = S0 / state.dist ** 2;
      const A = pTot / (S * (state.eta / 100) * (state.loss / 100) * cos);
      solarOut.append(el('div', { class: 'eng-kpis' },
        kpi('Solarstrahlung', `${fmt(S, 0)} W/m²`, `bei ${fmt(state.dist, 2)} AE`),
        kpi('Zellfläche', `${fmtSig(A, 3)} m²`, `für ${fmt(pTot, 0)} W`, 'hi')));
    } else solarOut.append(el('p', { class: 'eng-error', text: 'Abstand, Wirkungsgrad, Verlustfaktor > 0 und Einfallswinkel < 90° eingeben.' }));

    clear(engInfo); clear(propOut);
    const e = engineById(state.engine);
    engInfo.append(engineInfo(e));
    const s = engineStats(e);
    if (s.error) { propOut.append(el('p', { class: 'eng-error', text: s.error })); return; }
    if (!(mTot > 0) || state.prop == null) return;
    const isp = s.fVac / (s.mdot * G0);
    const dv = isp * G0 * Math.log((mTot + state.prop) / mTot);
    const tb = state.prop / s.mdot;
    propOut.append(el('div', { class: 'eng-kpis' },
      kpi('Δv', `${fmt(dv, 0)} m/s`, `Isp ${fmt(isp, 0)} s`, 'hi'),
      kpi('Startmasse', `${fmt(mTot + state.prop, 1)} kg`),
      kpi('Brenndauer gesamt', fmtDur(tb)),
      kpi('Beschleunigung', `${fmtSig((s.fVac / (mTot + state.prop)) * 1000, 3)} mm/s²`, 'bei Brennbeginn')));
    if (e.art === 'elektrisch' && e.leistung_kW) {
      const need = e.leistung_kW * 1000;
      propOut.append(el('p', { class: pTot >= need ? 'eng-hint' : 'eng-error',
        text: `Elektrischer Antrieb benötigt ≈ ${fmt(need, 0)} W zusätzlich – Solargenerator entsprechend vergrößern (Budget oben enthält ihn nicht).` }));
    }
  }
  renderList();
  update();
}

// =========================================================================================================
// Tab: Triebwerkskatalog
function buildCatalog(panel) {
  let filter = 'alle';
  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Antriebsart' });
  const F = [['alle', 'Alle'], ['fluessig', 'Flüssig'], ['fest', 'Feststoff'], ['elektrisch', 'Elektrisch']];
  const btns = F.map(([id, name]) => el('button', { type: 'button', text: name, onclick: () => { filter = id; render(); } }));
  seg.append(...btns);
  const body = el('tbody');
  const ART = { fluessig: 'flüssig', fest: 'fest', elektrisch: 'elektrisch' };
  panel.append(
    card('Triebwerkskatalog',
      el('div', { class: 'eng-row' }, seg),
      el('div', { class: 'eng-scroll' }, el('table', { class: 'eng-table cat' },
        el('thead', {}, el('tr', {}, ['Triebwerk', 'Art', 'Land', 'Treibstoff', 'Schub SL', 'Schub Vak', 'Isp SL', 'Isp Vak', 'Masse', 'Einsatz', 'Quelle'].map((h) => el('th', { scope: 'col', text: h })))),
        body)),
      el('p', { class: 'eng-hint' }, '„–“ = nicht offiziell veröffentlicht. Feststoff: Maximalschub. Abgleich: ', srcLink(ENGINE_ABGLEICH))),
    card('Raketenvorlagen',
      el('ul', { class: 'eng-srcs' }, LAUNCHERS.map((l) => el('li', {}, el('strong', { text: l.name }), ` (${l.land}${l.ohneMassen ? ', ohne Massenangaben' : ''}) · `, srcLink(l.quelle))))));

  function render() {
    btns.forEach((b, i) => b.classList.toggle('on', F[i][0] === filter));
    clear(body);
    for (const e of ENGINES) {
      if (filter !== 'alle' && e.art !== filter) continue;
      body.append(el('tr', {},
        el('th', { scope: 'row' }, el('span', { text: e.name }), el('span', { class: 'sub', text: e.hersteller })),
        el('td', { text: ART[e.art] + (e.leistung_kW ? ` · ${fmt(e.leistung_kW, 2)} kW` : '') }),
        el('td', { text: e.land }),
        el('td', { text: e.treibstoff }),
        el('td', { text: fmtForce(e.schubSL_kN) }),
        el('td', { text: fmtForce(e.schubVak_kN) }),
        el('td', { text: e.ispSL_s != null ? `${fmt(e.ispSL_s, 1)} s` : '–' }),
        el('td', { text: e.ispVak_s != null ? `${fmt(e.ispVak_s, 1)} s` : '–' }),
        el('td', { text: e.masse_kg != null ? `${fmt(e.masse_kg)} kg` : '–' }),
        el('td', { class: 'wrap', text: e.einsatz.join(', ') }),
        el('td', { class: 'wrap' }, srcLink(e.quelle), e.hinweis ? el('span', { class: 'sub', text: e.hinweis }) : null)));
    }
  }
  render();
}
