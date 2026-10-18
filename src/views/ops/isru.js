// Kolonie-Logistik: Lebenserhaltungs-Bilanz (O₂, Wasser, Nahrung, CO₂) und Energiemix für Mond-/Mars-Stationen.
// Stündliche (Mars: viertelstündliche) Simulation über einen Mondtag bzw. drei Sols: Solar (Tag/Nacht, Staub),
// Kernspaltung (Fission Surface Power), RTG, Batteriespeicher; ISRU wahlweise als flexible Last (nur bei Überschuss).
// Alle Werte sind Abschätzungen auf Basis offener Quellen (siehe SOURCES) – keine Missionsplanung.
// Ausgabe nur über textContent (keine innerHTML-Einfügung von Daten).
import './isru.css';
import { listStations } from '../../lib/stationsApi.js';

// --- Verbrauch je Person und Tag (NASA BVAD, NASA/TP-2015-218570/REV2, gerundet) -------------------------
const PER_CREW = { o2: 0.82, co2: 1.04, water: 2.5, hygiene: 1.5, food: 1.8 }; // kg/Tag; Hygiene = Annahme (minimal, ISS-ähnlich)
const BASE_KW = 3, CREW_KW = 1.5; // Grundlast Habitat + je Person (ECLSS, Thermalkontrolle, Kommunikation) – Modellannahme
// Wasserelektrolyse: ΔG°f(H₂O, fl.) = −237,1 kJ/mol (NIST) → 4,1 kWh/kg O₂ theoretisch, bei 70 % Wirkungsgrad ≈ 5,9
const E_ELEC = 237.1e3 * 2 / 0.032 / 3.6e6 / 0.7; // kWh je kg O₂
const WATER_PER_O2 = 36.03 / 32.0; // kg H₂O je kg O₂ (Stöchiometrie 2 H₂O → 2 H₂ + O₂)
const E_ICE = 2.5;   // kWh/kg Wasser aus Eis (Abbau + Erhitzen/Sublimieren) – Modellannahme, Literaturspanne ≈ 1–4
const E_MOXIE = 12;  // kWh/kg O₂, skalierte Festoxid-CO₂-Elektrolyse – Annahme; der MOXIE-Demonstrator lag bei ≈ 30–50
const S0 = 1361;     // W/m² Solarkonstante (Kopp & Lean 2011)
const FSP_KW = 40;   // kWe je Fission-Surface-Power-Einheit (NASA-Ziel)
const RTG_KW = 0.11; // kWe je MMRTG zu Missionsbeginn (NASA RPS)
const LIION_WH_KG = 180; // Wh/kg Batteriesystem – Annahme

const SITES = {
  moon_pole: { name: 'Mond – Südpol-Kraterrand', body: 'moon', ice: true, mars: false, lat: -89.5,
    note: 'Hohe Kraterränder sind ≈ 80–90 % der Zeit beleuchtet (Mazarico et al. 2011); Wassereis in dauerhaft beschatteten Kratern.' },
  moon_eq: { name: 'Mond – Äquator', body: 'moon', ice: false, mars: false, lat: 0,
    note: 'Rund 354 h Tag und 354 h Nacht – ohne Kernkraft braucht es riesige Speicher. Kein zugängliches Eis.' },
  mars_eq: { name: 'Mars – Äquatornähe (z. B. Jezero, 18° N)', body: 'mars', ice: false, mars: true, lat: 18,
    note: 'Sol = 24,66 h; Sonnenfluss ≈ 43 % der Erde, abgeschwächt durch Staub (optische Dicke τ).' },
  mars_mid: { name: 'Mars – mittlere Breiten (z. B. Arcadia Planitia, 40° N)', body: 'mars', ice: true, mars: true, lat: 40,
    note: 'Flaches Untergrundeis (Mars Reconnaissance Orbiter/SHARAD) – Wasser-ISRU möglich, aber weniger Sonne.' },
};
const MARS_FLUX = S0 / 1.524 ** 2; // ≈ 586 W/m² mittlerer Sonnenfluss am Mars (Bahnhalbachse 1,524 AE)

const SOURCES = [
  ['NASA – Life Support Baseline Values and Assumptions Document (BVAD), NASA/TP-2015-218570/REV2', 'https://ntrs.nasa.gov/citations/20210024855'],
  ['NASA – ISS-Lebenserhaltung erreicht 98 % Wasserrückgewinnung (2023)', 'https://www.nasa.gov/missions/station/iss-research/nasa-achieves-water-recovery-milestone-on-international-space-station/'],
  ['Hecht et al. (2021): Mars Oxygen ISRU Experiment (MOXIE), Science Advances / Space Science Reviews', 'https://mars.nasa.gov/mars2020/spacecraft/instruments/moxie/'],
  ['NASA – Fission Surface Power (40 kWe)', 'https://www.nasa.gov/space-technology-mission-directorate/tdm/fission-surface-power/'],
  ['NASA – Radioisotope Power Systems: MMRTG', 'https://science.nasa.gov/planetary-science/programs/radioisotope-power-systems/'],
  ['Mazarico et al. (2011): Illumination conditions of the lunar polar regions, Icarus 211', 'https://doi.org/10.1016/j.icarus.2010.10.030'],
  ['NIST Chemistry WebBook – Wasser (Bildungsenthalpie/-energie)', 'https://webbook.nist.gov/cgi/cbook.cgi?ID=C7732185'],
  ['Kopp & Lean (2011): A new, lower value of total solar irradiance, GRL 38', 'https://doi.org/10.1029/2010GL045777'],
  ['NASA – Mars Fact Sheet', 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html'],
];

const C = { solar: '#ffcc55', fission: '#6ea8ff', rtg: '#ff8f6b', load: '#e8eefc', soc: '#3ddc84', isru: '#b98cff', deficit: '#ff6b7a' };

// --- Hilfen --------------------------------------------------------------------------------------------
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
};
const nf = new Map();
const fmt = (x, d = 0) => {
  if (!Number.isFinite(x)) return '–';
  if (!nf.has(d)) nf.set(d, new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));
  return nf.get(d).format(x);
};
const fmtKg = (kg) => (kg >= 1000 ? `${fmt(kg / 1000, 1)} t` : `${fmt(kg, kg < 10 ? 2 : 0)} kg`);

// --- Modell ---------------------------------------------------------------------------------------------
// Solarleistung (kW) zur Zeit t (h) für 1 m² bei Wirkungsgrad eta
function solarPerM2(site, t, eta, tau) {
  if (site.body === 'moon') {
    const P = 708.73; // synodischer Monat in h
    if (site.lat < -80) { // Kraterrand: senkrecht nachgeführte Paneele, ≈ 85 % beleuchtet, Dunkelphase am Stück
      const ph = (t % P) / P;
      return ph > 0.85 ? 0 : (S0 * eta) / 1000;
    }
    const cosz = Math.sin((2 * Math.PI * (t % P)) / P); // waagerechte Paneele, Sonne läuft in 354 h über den Himmel
    return Math.max(0, cosz) * S0 * eta / 1000;
  }
  const sol = 24.66;
  const h = (2 * Math.PI * (t % sol)) / sol - Math.PI; // Stundenwinkel, 0 = Mittag
  const cosz = Math.cos((site.lat * Math.PI) / 180) * Math.cos(h); // Tagundnachtgleiche (Deklination 0)
  if (cosz <= 0.02) return 0;
  return MARS_FLUX * cosz * Math.exp(-tau / Math.max(cosz, 0.1)) * eta / 1000; // Beer-Lambert durch Staub
}

function simulate(p) {
  const site = SITES[p.site];
  // Lebenserhaltungs-Bilanz pro Tag
  const o2Need = p.crew * PER_CREW.o2;
  const o2Loop = o2Need * p.o2Closure;                         // aus CO₂ zurückgewonnen (Sabatier o. ä.)
  const moxie = site.mars ? Math.min(p.moxie, o2Need - o2Loop) : 0;
  const o2Elec = Math.max(0, o2Need - o2Loop - moxie);        // Rest per Wasserelektrolyse
  const waterUse = p.crew * (PER_CREW.water + PER_CREW.hygiene);
  const waterRec = waterUse * p.waterRec;
  const waterNeed = (waterUse - waterRec) + o2Elec * WATER_PER_O2; // Nachfüllbedarf inkl. Elektrolyse
  const food = p.crew * PER_CREW.food;

  // Energie
  const firm = BASE_KW + CREW_KW * p.crew + (o2Elec * E_ELEC) / 24; // lebenswichtige Last (kW)
  const isruWanted = ((site.ice ? p.ice : 0) * E_ICE + moxie * E_MOXIE) / 24; // kW
  const fission = p.fission * FSP_KW, rtg = p.rtg * RTG_KW;
  const period = site.body === 'moon' ? 708.73 : 3 * 24.66;
  const dt = site.body === 'moon' ? 1 : 0.25;
  const cap = p.battery; // kWh
  let soc = cap, deficit = 0, outH = 0, isruGot = 0, isruWant = 0, eSolar = 0, eFis = 0, eRtg = 0, eLoad = 0, curtailed = 0;
  let cum = 0, peak = 0, drawdown = 0;
  const series = [];
  for (let pass = 0; pass < 2; pass++) { // zweiter Durchlauf = eingeschwungener Zustand
    for (let t = 0; t < period; t += dt) {
      const sol = solarPerM2(site, t, p.eta, p.tau) * p.area * (1 - p.dust);
      const gen = sol + fission + rtg;
      const isru = p.flex ? Math.min(isruWanted, Math.max(0, gen - firm - (soc < cap * 0.95 ? (cap - soc) / dt : 0))) : isruWanted;
      const load = firm + isru;
      let net = gen - load;
      // Speicher
      if (net >= 0) { const ch = Math.min(net * dt, cap - soc); soc += ch; if (pass) curtailed += net * dt - ch; }
      else {
        const need = -net * dt, take = Math.min(need, soc); soc -= take;
        if (pass && need - take > 1e-9) { deficit += need - take; outH += dt; }
      }
      cum += (gen - load) * dt; peak = Math.max(peak, cum); drawdown = Math.max(drawdown, peak - cum);
      if (pass) {
        isruGot += isru * dt; isruWant += isruWanted * dt;
        eSolar += sol * dt; eFis += fission * dt; eRtg += rtg * dt; eLoad += load * dt;
        series.push({ t, sol, fission, rtg, load, firm, soc });
      }
    }
  }
  const isruFrac = isruWant > 0 ? isruGot / isruWant : 1;
  const iceGot = (site.ice ? p.ice : 0) * isruFrac;
  const moxieGot = moxie * isruFrac;
  // fehlender MOXIE-Sauerstoff muss per Elektrolyse nachgeliefert werden (Wasser!)
  const waterNeedEff = waterNeed + (moxie - moxieGot) * WATER_PER_O2;
  const waterResupply = Math.max(0, waterNeedEff - iceGot);
  const waterSurplus = Math.max(0, iceGot - waterNeedEff);
  const avgGen = (eSolar + eFis + eRtg) / period, avgLoad = eLoad / period;
  return {
    site, period, dt, series, cap, deficit, outH, curtailed, drawdown, avgGen, avgLoad, firm, isruWanted, isruFrac,
    mix: { solar: eSolar, fission: eFis, rtg: eRtg },
    o2: { need: o2Need, loop: o2Loop, isru: moxieGot, elec: o2Elec + (moxie - moxieGot) },
    water: { use: waterUse, rec: waterRec, need: waterNeedEff, isru: Math.min(iceGot, waterNeedEff), resupply: waterResupply, surplus: waterSurplus },
    co2: { made: p.crew * PER_CREW.co2, reduced: p.crew * PER_CREW.co2 * p.o2Closure },
    food,
    resupplyYear: 365.25 * (waterResupply + food),
  };
}

// --- Darstellung ------------------------------------------------------------------------------------------
function drawChart(canvas, r) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const L = 46, R = 46, T = 12, B = 26, w = W - L - R, h = H - T - B;
  const s = r.series;
  const maxP = Math.max(1, ...s.map((d) => Math.max(d.sol + d.fission + d.rtg, d.load))) * 1.08;
  const X = (t) => L + (t / r.period) * w, Y = (v) => T + h - (v / maxP) * h;
  const Ys = (v) => T + h - (r.cap > 0 ? v / r.cap : 0) * h;
  const css = getComputedStyle(canvas);
  const line = css.getPropertyValue('--line').trim() || 'rgba(130,170,255,.16)';
  const muted = css.getPropertyValue('--muted').trim() || '#8a97b5';
  g.font = '11px system-ui, sans-serif'; g.fillStyle = muted; g.strokeStyle = line; g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = (maxP / 4) * i, y = Y(v);
    g.beginPath(); g.moveTo(L, y); g.lineTo(L + w, y); g.stroke();
    g.textAlign = 'right'; g.fillText(`${fmt(v, v < 10 ? 1 : 0)}`, L - 6, y + 4);
    if (r.cap > 0) { g.textAlign = 'left'; g.fillText(`${fmt(25 * i)} %`, L + w + 6, y + 4); }
  }
  g.textAlign = 'left'; g.fillText('kW', 4, T + 10);
  const days = r.site.body === 'moon';
  const step = days ? 24 * 5 : 24.66 / 2;
  g.textAlign = 'center';
  for (let t = 0; t <= r.period + 1e-6; t += step) g.fillText(days ? `${fmt(t / 24)} d` : `${fmt(t / 24.66, 1)} Sol`, X(t), H - 8);
  // gestapelte Flächen: RTG, Kernspaltung, Solar
  const layers = [['rtg', (d) => d.rtg], ['fission', (d) => d.rtg + d.fission], ['solar', (d) => d.rtg + d.fission + d.sol]];
  let prev = () => 0;
  for (const [key, top] of layers) {
    g.beginPath();
    s.forEach((d, i) => (i ? g.lineTo(X(d.t), Y(top(d))) : g.moveTo(X(d.t), Y(top(d)))));
    for (let i = s.length - 1; i >= 0; i--) g.lineTo(X(s[i].t), Y(prev(s[i])));
    g.closePath(); g.fillStyle = C[key] + '55'; g.fill();
    g.beginPath(); s.forEach((d, i) => (i ? g.lineTo(X(d.t), Y(top(d))) : g.moveTo(X(d.t), Y(top(d)))));
    g.strokeStyle = C[key]; g.lineWidth = 1.2; g.stroke();
    prev = top;
  }
  const path = (fn, color, width, dash = []) => {
    g.beginPath(); s.forEach((d, i) => (i ? g.lineTo(X(d.t), fn(d)) : g.moveTo(X(d.t), fn(d))));
    g.setLineDash(dash); g.strokeStyle = color; g.lineWidth = width; g.stroke(); g.setLineDash([]);
  };
  path((d) => Y(d.load), C.load, 1.8);
  path((d) => Y(d.firm), C.load, 1, [4, 4]);
  if (r.cap > 0) path((d) => Ys(d.soc), C.soc, 1.6, [2, 3]);
}

function balanceRow(label, need, parts, unit = 'kg/Tag') {
  const total = Math.max(need, 1e-9);
  const bar = el('div', { class: 'isru-bar' }, parts.filter((p) => p.v > 1e-6).map((p) => {
    const seg = el('i', { title: `${p.label}: ${fmt(p.v, 2)} ${unit}` });
    seg.style.width = `${Math.min(100, (p.v / total) * 100)}%`; seg.style.background = p.color;
    return seg;
  }));
  return el('div', { class: 'isru-bal' },
    el('div', { class: 'isru-bal-head' }, el('b', { text: label }), el('span', { text: `Bedarf ${fmt(need, 2)} ${unit}` })),
    bar,
    el('div', { class: 'isru-legend' }, parts.map((p) => el('span', {}, el('i', { style: `background:${p.color}` }), `${p.label} ${fmt(p.v, 2)}`))));
}

function slider(label, { min, max, step = 1, value, unit = '', fmtV = (v) => fmt(v, step < 1 ? 2 : 0) }) {
  const out = el('output', { text: `${fmtV(value)} ${unit}`.trim() });
  const input = el('input', { type: 'range', min, max, step, value, 'aria-label': label });
  input.addEventListener('input', () => { out.textContent = `${fmtV(+input.value)} ${unit}`.trim(); });
  const node = el('label', { class: 'isru-field' }, el('span', {}, label, out), input);
  return { node, input, get: () => +input.value, set: (v) => { input.value = v; input.dispatchEvent(new Event('input')); } };
}

// --- Panel ----------------------------------------------------------------------------------------------
export function createIsruPanel(container) {
  const root = el('div', { class: 'isru' });
  container.append(root);
  const pct = (v) => fmt(v * 100);
  const f = {
    crew: slider('Besatzung', { min: 1, max: 40, value: 4, unit: 'Pers.' }),
    waterRec: slider('Wasser-Rückgewinnung', { min: 0, max: 0.98, step: 0.01, value: 0.9, unit: '%', fmtV: pct }),
    o2Closure: slider('O₂-Rückgewinnung aus CO₂', { min: 0, max: 0.75, step: 0.05, value: 0.5, unit: '%', fmtV: pct }),
    ice: slider('Eis-Abbau → Wasser', { min: 0, max: 100, value: 20, unit: 'kg/Tag' }),
    moxie: slider('O₂ aus Mars-CO₂ (MOXIE-Prinzip)', { min: 0, max: 20, step: 0.5, value: 2, unit: 'kg/Tag', fmtV: (v) => fmt(v, 1) }),
    area: slider('Solarfläche', { min: 0, max: 5000, step: 10, value: 80, unit: 'm²' }),
    eta: slider('Zellwirkungsgrad', { min: 0.15, max: 0.35, step: 0.01, value: 0.3, unit: '%', fmtV: pct }),
    dust: slider('Staubbelag / Alterung', { min: 0, max: 0.6, step: 0.05, value: 0.1, unit: '%', fmtV: pct }),
    tau: slider('Optische Dicke τ (Mars-Staub)', { min: 0.2, max: 5, step: 0.1, value: 0.5, fmtV: (v) => fmt(v, 1) }),
    fission: slider('Kernspaltung (je 40 kWe)', { min: 0, max: 6, value: 0, unit: 'Einh.' }),
    rtg: slider('RTG (MMRTG, je 110 We)', { min: 0, max: 40, value: 0, unit: 'Stk.' }),
    battery: slider('Batteriespeicher', { min: 0, max: 20000, step: 50, value: 1500, unit: 'kWh' }),
  };
  const site = el('select', { 'aria-label': 'Standort' }, Object.entries(SITES).map(([id, s]) => el('option', { value: id, text: s.name })));
  const flex = el('input', { type: 'checkbox', checked: true });
  const stationSel = el('select', { 'aria-label': 'Station übernehmen' }, el('option', { value: '', text: 'Aus Stationsplanung übernehmen …' }));
  const siteNote = el('p', { class: 'isru-note' });

  const canvas = el('canvas', { class: 'isru-chart', 'aria-label': 'Leistungsverlauf' });
  const kpis = el('div', { class: 'isru-kpis' });
  const balances = el('div', { class: 'isru-bals' });
  const mixBar = el('div', { class: 'isru-mix' });
  const advice = el('ul', { class: 'isru-advice' });

  const card = (title, ...kids) => el('section', { class: 'isru-card' }, el('h3', { text: title }), ...kids);
  root.append(
    el('div', { class: 'isru-head' },
      el('div', {}, el('h2', { text: 'Kolonie-Logistik' }),
        el('p', { text: 'Lebenserhaltung (O₂, Wasser, Nahrung) und Energiemix einer Mond- oder Marsstation – mit Recycling und In-situ-Ressourcennutzung (ISRU).' }))),
    el('div', { class: 'isru-grid' },
      el('div', { class: 'isru-col' },
        card('Standort & Besatzung', el('label', { class: 'isru-field' }, el('span', { text: 'Standort' }), site), siteNote,
          el('label', { class: 'isru-field' }, el('span', { text: 'Geplante Station' }), stationSel), f.crew.node),
        card('Lebenserhaltung', f.waterRec.node, f.o2Closure.node, f.ice.node, f.moxie.node,
          el('label', { class: 'isru-check' }, flex, el('span', { text: 'ISRU als flexible Last – läuft nur mit Energieüberschuss' }))),
        card('Energie', f.area.node, f.eta.node, f.dust.node, f.tau.node, f.fission.node, f.rtg.node, f.battery.node)),
      el('div', { class: 'isru-col' },
        card('Leistungsbilanz', kpis, canvas,
          el('div', { class: 'isru-legend' }, [['solar', 'Solar'], ['fission', 'Kernspaltung'], ['rtg', 'RTG'], ['load', 'Last (gestrichelt: lebenswichtig)'], ['soc', 'Speicher-Ladestand']]
            .map(([k, l]) => el('span', {}, el('i', { style: `background:${C[k]}` }), l)))),
        card('Energiemix (eingeschwungener Zyklus)', mixBar),
        card('Stoffbilanz pro Tag', balances),
        card('Einschätzung', advice))),
    el('details', { class: 'isru-src' }, el('summary', { text: 'Quellen & Modellannahmen' }),
      el('p', { text: `Verbrauch je Person und Tag: O₂ ${fmt(PER_CREW.o2, 2)} kg, CO₂ ${fmt(PER_CREW.co2, 2)} kg, Trink-/Zubereitungswasser ${fmt(PER_CREW.water, 1)} kg, Hygienewasser ${fmt(PER_CREW.hygiene, 1)} kg (Annahme), Nahrung inkl. Verpackung ${fmt(PER_CREW.food, 1)} kg. Grundlast ${BASE_KW} kW + ${CREW_KW} kW je Person (Annahme). Elektrolyse ${fmt(E_ELEC, 1)} kWh/kg O₂ (aus ΔG, 70 % Wirkungsgrad), Eis → Wasser ${E_ICE} kWh/kg (Annahme), CO₂-Elektrolyse ${E_MOXIE} kWh/kg O₂ (skalierte Anlage, Annahme), Batteriesystem ${LIION_WH_KG} Wh/kg. Solar ohne Nachführung (außer Mond-Kraterrand), Mars zur Tagundnachtgleiche.` }),
      el('ul', {}, SOURCES.map(([t, u]) => el('li', {}, el('a', { href: u, target: '_blank', rel: 'noopener noreferrer', text: t }))))));

  let raf = 0, last = null;
  const params = () => ({ site: site.value, flex: flex.checked, ...Object.fromEntries(Object.entries(f).map(([k, s]) => [k, s.get()])) });
  function update() {
    const p = params();
    const s = SITES[p.site];
    siteNote.textContent = s.note;
    f.ice.node.hidden = !s.ice; f.moxie.node.hidden = !s.mars; f.tau.node.hidden = !s.mars;
    const r = (last = simulate(p));
    // Kennzahlen
    const kpi = (label, value, tone = '') => el('div', { class: `isru-kpi ${tone}` }, el('span', { text: label }), el('b', { text: value }));
    const ok = r.deficit < 0.01;
    kpis.replaceChildren(
      kpi('Ø Erzeugung / Ø Last', `${fmt(r.avgGen, 1)} / ${fmt(r.avgLoad, 1)} kW`, r.avgGen >= r.avgLoad ? 'ok' : 'bad'),
      kpi('Stromausfall je Zyklus', ok ? 'keiner' : `${fmt(r.outH, r.dt < 1 ? 1 : 0)} h · ${fmt(r.deficit)} kWh`, ok ? 'ok' : 'bad'),
      kpi('ISRU-Auslastung', `${fmt(r.isruFrac * 100)} %`, r.isruFrac > 0.95 ? 'ok' : r.isruFrac > 0.5 ? 'warn' : 'bad'),
      kpi('Nachschub von der Erde', `${fmtKg(r.resupplyYear)} / Jahr`, ''));
    // Stoffbilanz
    balances.replaceChildren(
      balanceRow('Sauerstoff (O₂)', r.o2.need, [
        { label: 'Rückgewinnung aus CO₂', v: r.o2.loop, color: C.soc },
        { label: 'ISRU (Mars-CO₂)', v: r.o2.isru, color: C.isru },
        { label: 'Elektrolyse aus Wasser', v: r.o2.elec, color: C.fission }]),
      balanceRow('Wasser', r.water.use + r.o2.elec * WATER_PER_O2, [
        { label: 'Recycling', v: r.water.rec, color: C.soc },
        { label: 'ISRU (Eis)', v: r.water.isru, color: C.isru },
        { label: 'Nachschub', v: r.water.resupply, color: C.deficit }]),
      balanceRow('Nahrung', r.food, [{ label: 'Nachschub (kein Anbau modelliert)', v: r.food, color: C.deficit }]),
      el('p', { class: 'isru-note', text: `CO₂: ${fmt(r.co2.made, 2)} kg/Tag ausgeatmet, davon ${fmt(r.co2.reduced, 2)} kg zur O₂-Rückgewinnung genutzt, Rest wird abgeschieden und abgelassen.${r.water.surplus > 0.01 ? ` Wasser-Überschuss aus ISRU: ${fmt(r.water.surplus, 1)} kg/Tag (z. B. für Treibstoff/Speicher).` : ''}` }));
    // Energiemix
    const tot = r.mix.solar + r.mix.fission + r.mix.rtg || 1;
    mixBar.replaceChildren(
      el('div', { class: 'isru-bar big' }, [['solar', 'Solar'], ['fission', 'Kernspaltung'], ['rtg', 'RTG']].filter(([k]) => r.mix[k] > 0).map(([k, l]) => {
        const i = el('i', { title: `${l}: ${fmt((r.mix[k] / tot) * 100)} %` }); i.style.width = `${(r.mix[k] / tot) * 100}%`; i.style.background = C[k]; return i;
      })),
      el('div', { class: 'isru-legend' }, [['solar', 'Solar'], ['fission', 'Kernspaltung'], ['rtg', 'RTG']].map(([k, l]) =>
        el('span', {}, el('i', { style: `background:${C[k]}` }), `${l} ${fmt((r.mix[k] / tot) * 100)} % · ${fmt(r.mix[k] / (r.period / 24))} kWh/Tag`))),
      el('p', { class: 'isru-note', text: `Ungenutzter Überschuss: ${fmt(r.curtailed / (r.period / 24))} kWh/Tag. Speichermasse ≈ ${fmtKg((r.cap * 1000) / LIION_WH_KG)}.` }));
    // Einschätzung
    const tips = [];
    if (r.avgGen < r.avgLoad) tips.push(`Die mittlere Erzeugung reicht nicht: es fehlen ≈ ${fmt(r.avgLoad - r.avgGen, 1)} kW im Schnitt – mehr Solarfläche oder eine Kernspaltungs-Einheit (40 kWe).`);
    else if (!ok) tips.push(`Erzeugung reicht im Mittel, aber der Speicher ist zu klein: für Nullausfall wären ≈ ${fmt(r.drawdown)} kWh nötig (≈ ${fmtKg((r.drawdown * 1000) / LIION_WH_KG)} Batterie).`);
    else tips.push('Die Station ist über den ganzen Zyklus versorgt.');
    if (p.site === 'moon_eq' && f.fission.get() === 0) tips.push('Am Mondäquator dauert die Nacht ≈ 14,8 Tage – Kernspaltung ist hier fast zwingend.');
    if (s.mars && f.tau.get() >= 2) tips.push('Globaler Staubsturm (τ ≥ 2): Solar bricht ein – Opportunity verstummte 2018 bei τ ≈ 10,8.');
    if (r.isruFrac < 0.95 && r.isruWanted > 0) tips.push(`ISRU läuft nur zu ${fmt(r.isruFrac * 100)} % – mehr Überschussleistung oder ISRU als feste Last einplanen.`);
    if (r.water.resupply > 0.5 && s.ice) tips.push(`Mit ≈ ${fmt(Math.ceil(r.water.need))} kg/Tag Eis-Abbau wäre die Station wasserautark.`);
    if (p.waterRec < 0.9) tips.push('Die ISS erreicht seit 2023 rund 98 % Wasserrückgewinnung – höhere Recyclingrate spart viel Nachschub.');
    advice.replaceChildren(...tips.map((t) => el('li', { text: t })));
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => drawChart(canvas, r));
  }

  root.addEventListener('input', update);
  root.addEventListener('change', update);
  new ResizeObserver(() => last && drawChart(canvas, last)).observe(canvas);

  let stations = null;
  stationSel.addEventListener('change', () => {
    const st = stations?.find((x) => x.id === stationSel.value);
    if (!st) return;
    site.value = st.body === 'moon' ? (Math.abs(st.lat) > 80 ? 'moon_pole' : 'moon_eq') : Math.abs(st.lat) > 30 ? 'mars_mid' : 'mars_eq';
    if (st.crew) f.crew.set(Math.min(40, st.crew));
    update();
  });
  async function loadStations() {
    if (stations) return;
    stations = [];
    try {
      const [m, r] = await Promise.all([listStations('moon'), listStations('mars')]);
      stations = [...m, ...r];
      stationSel.append(...stations.map((s) => el('option', { value: s.id, text: `${s.name} (${s.body === 'moon' ? 'Mond' : 'Mars'}${s.crew ? `, ${s.crew} Pers.` : ''})` })));
    } catch { /* Stationsliste ist optional */ }
    stationSel.parentElement.hidden = !stations.length;
  }

  update();
  return {
    setActive(on) { if (on) { loadStations(); if (last) requestAnimationFrame(() => drawChart(canvas, last)); } },
  };
}
