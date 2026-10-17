// Himmel · SPHEREx – eigener HiPS-Betrachter (HEALPix-Kacheln auf einer three.js-Himmelskugel).
//
// Daten: SPHEREx-Quick-Release-2-Mosaike (sechs Detektorbänder D1–D6 + Farbkomposit), vom CDS Strasbourg
// aus den IRSA-Spektralbildern als HiPS erzeugt; dazu Kontext-Durchmusterungen anderer Missionen (2MASS,
// AllWISE, DSS2, Planck). Alle Kacheln kommen per fetch von alasky.cds.unistra.fr (CORS: *), Objektnamen
// löst CDS Sesame auf (cds.unistra.fr, CORS: *). IRSA selbst (SIA/Cutouts) sendet keine CORS-Header und
// ist deshalb aus dem Browser nicht direkt nutzbar.
//
// Bewusst ohne Aladin Lite (GPL): die HEALPix-Mathematik (NESTED-Schema, Górski et al. 2005) ist hier
// selbst umgesetzt. Kachel-Orientierung an hellen Sternen geprüft: Bildzeile (von oben) ↔ ix, Bildspalte ↔ iy.
// Farbskala „Glut“: Polynom-Näherung von „inferno“ nach Matt Zucker (CC0).
import * as THREE from 'three';
import './sky.css';

const DEG = Math.PI / 180;
const CDS = 'https://alasky.cds.unistra.fr';
const CDS_MIRROR = 'https://alaskybis.cds.unistra.fr';
const SESAME = 'https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp/SNV?';

// --- Ebenen ----------------------------------------------------------------------------------------
const SPX_CREDIT = 'SPHEREx QR2 · Courtesy NASA/JPL-Caltech, IRSA · HiPS: CDS Strasbourg';
const SPX_EPOCH = 'Apr 2025 – Mai 2026';
const SPX_BANDS = [
  ['d1', 'D1', 0.75, 1.10, '#7aa2ff'],
  ['d2', 'D2', 1.10, 1.62, '#6fd3ff'],
  ['d3', 'D3', 1.63, 2.41, '#7cf0b4'],
  ['d4', 'D4', 2.42, 3.82, '#ffe27a'],
  ['d5', 'D5', 3.83, 4.41, '#ffa45c'],
  ['d6', 'D6', 4.42, 5.00, '#ff6b6b'],
];
const um = (v) => v.toFixed(2).replace('.', ',');
const LAYERS = [
  {
    id: 'spx-color', group: 'SPHEREx', name: 'SPHEREx · Farbkomposit D1–D6', short: 'SPHEREx Farbe', path: '/SPHEREx/color',
    ext: 'png', maxOrder: 7, width: 512, frame: 'eq', mono: false, range: [0.75, 5.0], epoch: SPX_EPOCH, credit: SPX_CREDIT,
    note: 'Falschfarben aus allen sechs Detektoren: kurze Wellen blau, lange rot.',
  },
  ...SPX_BANDS.map(([k, label, a, b, tint]) => ({
    id: `spx-${k}`, group: 'SPHEREx', name: `SPHEREx ${label} · ${um(a)}–${um(b)} µm`, short: `SPHEREx ${label}`,
    path: `/SPHEREx/${label}`, ext: 'png', maxOrder: 7, width: 512, frame: 'eq', mono: true, range: [a, b], tint,
    epoch: SPX_EPOCH, credit: SPX_CREDIT,
    note: `Breitband-Mosaik aller ${label}-Aufnahmen (≈17 Spektralkanäle), Wurzel-Streckung 0–10 MJy/sr.`,
  })),
  {
    id: '2mass', group: 'Kontext', name: '2MASS · J/H/Ks 1,2–2,2 µm', short: '2MASS', path: '/2MASS/Color', ext: 'jpg',
    maxOrder: 9, width: 512, frame: 'eq', mono: false, range: [1.1, 2.4], epoch: '1997–2001',
    credit: '2MASS · UMass, IPAC/Caltech · HiPS: CDS Strasbourg', note: 'Nahinfrarot-Durchmusterung (Bodenteleskope), ~2″ Auflösung.',
  },
  {
    id: 'allwise', group: 'Kontext', name: 'AllWISE · W1/W2/W4 3,4–22 µm', short: 'AllWISE', path: '/AllWISE/RGB-W4-W2-W1',
    ext: 'jpg', maxOrder: 8, width: 512, frame: 'eq', mono: false, range: [3.4, 22], epoch: '2010–2011',
    credit: 'AllWISE · NASA/JPL-Caltech, UCLA · HiPS: CDS Strasbourg', note: 'Mittleres Infrarot des WISE-Weltraumteleskops.',
  },
  {
    id: 'dss2', group: 'Kontext', name: 'DSS2 · sichtbares Licht', short: 'DSS2 optisch', path: '/DSS/DSSColor', ext: 'jpg',
    maxOrder: 9, width: 512, frame: 'eq', mono: false, range: [0.4, 0.9], epoch: '1980er–1990er',
    credit: 'DSS2 · STScI/NASA, Palomar/UK-Schmidt · HiPS: CDS Strasbourg', note: 'Digitalisierte Fotoplatten, sichtbares Licht.',
  },
  {
    id: 'planck', group: 'Kontext', name: 'Planck HFI · Staub 353–857 GHz', short: 'Planck', path: '/PLANCK/R2/HFI_Color_353_545_857',
    ext: 'jpg', maxOrder: 3, width: 256, frame: 'gal', mono: false, range: [350, 850], epoch: '2009–2013',
    credit: 'Planck · ESA/Planck Collaboration · HiPS: CDS Strasbourg', note: 'Submillimeter: kalter Staub der Milchstraße (grob aufgelöst).',
  },
];
const LAYER = Object.fromEntries(LAYERS.map((l) => [l.id, l]));

// --- Ziele + Vergleichsvorschläge ------------------------------------------------------------------
const TARGETS = [
  { name: 'Orionnebel (M42)', ra: 83.822, dec: -5.391, fov: 2.5, note: 'Sternentstehung – Gas und Staub leuchten im Infraroten.' },
  { name: 'Galaktisches Zentrum', ra: 266.417, dec: -29.008, fov: 8, note: 'Optisch hinter Staub verborgen, im Infraroten sichtbar.' },
  { name: 'Rho-Ophiuchi-Wolke', ra: 246.8, dec: -24.2, fov: 6, note: 'Nahe Molekülwolke – Eis-Absorption (H₂O, CO₂, CO).' },
  { name: 'Taurus-Molekülwolke', ra: 68.0, dec: 26.0, fov: 12, note: 'Kalte Wolke, Staubkörner mit Eismänteln.' },
  { name: 'Andromeda (M31)', ra: 10.6847, dec: 41.2687, fov: 3.5, note: 'Nächste große Spiralgalaxie, 2,5 Mio. Lichtjahre entfernt.' },
  { name: 'Große Magellansche Wolke', ra: 80.894, dec: -69.756, fov: 12, note: 'Begleitgalaxie der Milchstraße.' },
  { name: 'Plejaden (M45)', ra: 56.75, dec: 24.117, fov: 2.5, note: 'Junger Sternhaufen mit Reflexionsnebel.' },
  { name: 'Carinanebel', ra: 161.265, dec: -59.867, fov: 3.5, note: 'Eine der hellsten Sternentstehungsregionen.' },
  { name: 'Cygnus X', ra: 307.5, dec: 41.0, fov: 8, note: 'Riesiger Sternentstehungskomplex in der Milchstraßenebene.' },
  { name: 'Tiefenfeld Nord (NEP)', ra: 270.0, dec: 66.5607, fov: 8, note: 'SPHEREx-Tiefenfeld am Nordpol der Ekliptik.' },
  { name: 'Tiefenfeld Süd (SEP)', ra: 90.0, dec: -66.5607, fov: 8, note: 'SPHEREx-Tiefenfeld am Südpol der Ekliptik.' },
  { name: 'Barnards Pfeilstern', ra: 269.452, dec: 4.72, fov: 0.32, note: 'Schnellster Stern am Himmel (10,4″/Jahr) – ideal für den Epochenvergleich.' },
];
const PRESETS = [
  { label: 'Durch den Staub', a: 'spx-d1', b: 'spx-d6', mode: 'swipe', target: 'Galaktisches Zentrum',
    text: 'D1 (0,75–1,1 µm) ↔ D6 (4,4–5 µm): längere Wellen dringen durch den Staub.' },
  { label: 'Eis-Bänder', a: 'spx-d3', b: 'spx-d4', mode: 'blink', target: 'Rho-Ophiuchi-Wolke',
    text: 'D3 ↔ D4: In D4 liegt die Wasser-Eis-Bande bei 3,05 µm.' },
  { label: 'Eigenbewegung', a: 'dss2', b: 'spx-color', mode: 'blink', target: 'Barnards Pfeilstern',
    text: 'DSS2 (1980er/90er) ↔ SPHEREx (2025/26): Barnards Stern ist rund 5′ nach Norden gewandert.' },
  { label: '2MASS ↔ SPHEREx', a: '2mass', b: 'spx-color', mode: 'swipe', target: 'Orionnebel (M42)',
    text: 'Ein Vierteljahrhundert: 2MASS (1997–2001) neben SPHEREx (2025/26).' },
  { label: 'Optisch ↔ Infrarot', a: 'dss2', b: 'spx-color', mode: 'fade', target: 'Carinanebel',
    text: 'Überblenden von sichtbarem Licht (DSS2) zu SPHEREx-Infrarot.' },
];
// Spektrale Merkmale im SPHEREx-Bereich (Markierungen in der Spektralleiste)
const FEATURES = [
  [1.875, 'Pa-α (Wasserstoff) 1,875 µm'], [3.05, 'H₂O-Eis 3,05 µm'], [3.3, 'PAH 3,3 µm'],
  [4.05, 'Br-α (Wasserstoff) 4,05 µm'], [4.27, 'CO₂-Eis 4,27 µm'], [4.67, 'CO-Eis 4,67 µm'],
];

// --- HEALPix (NESTED) --------------------------------------------------------------------------------
const JRLL = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4];
const JPLL = [1, 3, 5, 7, 0, 2, 4, 6, 1, 3, 5, 7];
function nest2xyf(order, ipix) {
  const npf = 4 ** order;
  const face = Math.floor(ipix / npf);
  let p = ipix - face * npf, ix = 0, iy = 0;
  for (let b = 0; b < order; b++) {
    const q = p % 4;
    p = Math.floor(p / 4);
    ix += (q & 1) << b;
    iy += ((q >> 1) & 1) << b;
  }
  return { face, ix, iy };
}
// Lage innerhalb einer Basisfläche (x, y ∈ [0,1]) → Einheitsvektor im Rahmen der Kachel
function fxy2vec(face, x, y) {
  const jr = JRLL[face] - x - y;
  let nr, z;
  if (jr < 1) { nr = jr; z = 1 - (nr * nr) / 3; } else if (jr > 3) { nr = 4 - jr; z = (nr * nr) / 3 - 1; } else { nr = 1; z = ((2 - jr) * 2) / 3; }
  let t = JPLL[face] * nr + x - y;
  if (t < 0) t += 8;
  if (t >= 8) t -= 8;
  const phi = nr < 1e-15 ? 0 : ((Math.PI / 4) * t) / nr;
  const s = Math.sqrt(Math.max(0, 1 - z * z));
  return [s * Math.cos(phi), s * Math.sin(phi), z];
}
const tilePixelAngle = (order, width) => Math.sqrt((4 * Math.PI) / (12 * 4 ** order)) / width;

// --- Koordinaten ------------------------------------------------------------------------------------
// ICRS → galaktisch (J2000, Hipparcos-Definition)
const EQ2GAL = [
  [-0.0548755604162154, -0.873437090234885, -0.4838350155487132],
  [0.4941094278755837, -0.4448296299600112, 0.7469822444972189],
  [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669],
];
const eq2gal = (v) => EQ2GAL.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const gal2eq = (v) => [0, 1, 2].map((i) => EQ2GAL[0][i] * v[0] + EQ2GAL[1][i] * v[1] + EQ2GAL[2][i] * v[2]);
function lonlat2vec(lon, lat) {
  const a = lon * DEG, d = lat * DEG;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}
function vec2lonlat(v) {
  const r = Math.hypot(v[0], v[1], v[2]) || 1;
  let lon = Math.atan2(v[1], v[0]) / DEG;
  if (lon < 0) lon += 360;
  return [lon, Math.asin(Math.max(-1, Math.min(1, v[2] / r))) / DEG];
}
// Himmelsvektor (x zum Frühlingspunkt, z zum Himmelsnordpol) ↔ three.js (y oben); reine Drehung, keine Spiegelung
const toThree = (v) => new THREE.Vector3(v[0], v[2], -v[1]);
const fromThree = (v) => [v.x, -v.z, v.y];

const nf = (v, d = 1) => v.toFixed(d).replace('.', ',');
const pad = (v, n = 2) => String(v).padStart(n, '0');
function fmtRA(ra) {
  let s = Math.round((ra / 15) * 36000) / 10;
  s = ((s % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s - h * 3600 - m * 60;
  return `${pad(h)}h ${pad(m)}m ${pad(sec.toFixed(1), 4).replace('.', ',')}s`;
}
function fmtDec(dec) {
  const sign = dec < 0 ? '−' : '+';
  let s = Math.round(Math.abs(dec) * 3600);
  const d = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  s -= d * 3600 + m * 60;
  return `${sign}${pad(d)}° ${pad(m)}′ ${pad(s)}″`;
}
function fmtFov(f) {
  if (f >= 1) return `${nf(f, f >= 10 ? 0 : 1)}°`;
  if (f * 60 >= 1) return `${nf(f * 60, f * 60 >= 10 ? 0 : 1)}′`;
  return `${nf(f * 3600, 0)}″`;
}

// Koordinaten-Eingabe: „83.82 -5.39“, „05:35:17 -05:23:28“, „5h35m17s −5°23′28″“, „gal 209 -19.4“
function parseCoords(text) {
  const t = text.trim().replace(/[−–]/g, '-').replace(/(\d),(?=\d)/g, '$1.');
  const num = '([+-]?\\d+(?:\\.\\d+)?)';
  const sep = '[\\s,;/]+';
  let m = t.match(new RegExp(`^(?:gal|g|l)\\s*[:=]?\\s*${num}°?${sep}(?:b\\s*[:=]?\\s*)?${num}°?$`, 'i'));
  if (m) {
    const l = Number(m[1]), b = Number(m[2]);
    if (Math.abs(b) > 90) return null;
    const [ra, dec] = vec2lonlat(gal2eq(lonlat2vec(l, b)));
    return { ra, dec };
  }
  m = t.match(new RegExp(`^${num}°?${sep}${num}°?$`));
  if (m) {
    const ra = Number(m[1]), dec = Number(m[2]);
    if (ra < 0 || ra >= 360 || Math.abs(dec) > 90) return null;
    return { ra, dec };
  }
  m = t.match(/^(\d{1,2})[h:\s]\s*(\d{1,2})[m:\s]\s*(\d{1,2}(?:\.\d+)?)s?[\s,;/]*([+-]?)\s*(\d{1,2})[d°:\s]\s*(\d{1,2})['′m:\s]\s*(\d{1,2}(?:\.\d+)?)(?:["″s]|'')?$/i);
  if (m) {
    const ra = (Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600) * 15;
    const dec = (m[4] === '-' ? -1 : 1) * (Number(m[5]) + Number(m[6]) / 60 + Number(m[7]) / 3600);
    if (ra >= 360 || Math.abs(dec) > 90 || Number(m[2]) >= 60 || Number(m[6]) >= 60) return null;
    return { ra, dec };
  }
  return null;
}

// --- Shader ----------------------------------------------------------------------------------------
const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = /* glsl */ `
uniform sampler2D map;
uniform float opacity;
uniform float gain;
uniform float gammaV;
uniform int mode;   // 0 Farbe · 1 Grau · 2 Glut · 3 Eis · 4 Bandfarbe
uniform vec3 tint;
varying vec2 vUv;
vec3 inferno(float t) {
  const vec3 c0 = vec3(0.0002189403691192265, 0.001651004631001012, -0.01948089843709184);
  const vec3 c1 = vec3(0.1065134194856116, 0.5639564367884091, 3.932712388889277);
  const vec3 c2 = vec3(11.60249308247187, -3.972853965665698, -15.9423941062914);
  const vec3 c3 = vec3(-41.70399613139459, 17.43639888205313, 44.35414519872813);
  const vec3 c4 = vec3(77.162935699427, -33.40235894210092, -81.80730925738993);
  const vec3 c5 = vec3(-71.31942824499214, 32.62606426397723, 73.20951985803202);
  const vec3 c6 = vec3(25.13112622477341, -12.24266895238567, -23.07032500287172);
  return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}
vec3 ice(float t) {
  vec3 a = mix(vec3(0.0, 0.0, 0.02), vec3(0.05, 0.12, 0.32), smoothstep(0.0, 0.35, t));
  a = mix(a, vec3(0.43, 0.66, 1.0), smoothstep(0.3, 0.75, t));
  return mix(a, vec3(1.0), smoothstep(0.75, 1.0, t));
}
void main() {
  vec4 c = texture2D(map, vUv);
  vec3 rgb;
  if (mode == 0) {
    rgb = pow(clamp(c.rgb * gain, 0.0, 1.0), vec3(gammaV));
  } else {
    float v = pow(clamp(dot(c.rgb, vec3(0.299, 0.587, 0.114)) * gain, 0.0, 1.0), gammaV);
    if (mode == 1) rgb = vec3(v);
    else if (mode == 2) rgb = clamp(inferno(v), 0.0, 1.0);
    else if (mode == 3) rgb = ice(v);
    else rgb = mix(tint * v, vec3(1.0), smoothstep(0.7, 1.0, v));
  }
  gl_FragColor = vec4(rgb, opacity * c.a);
}`;

// --- Spektralleiste (logarithmisch 0,75–5 µm) --------------------------------------------------------
const SPEC_MIN = Math.log(0.75), SPEC_MAX = Math.log(5.0);
const specPos = (v) => ((Math.log(v) - SPEC_MIN) / (SPEC_MAX - SPEC_MIN)) * 100;

const ICON = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

function layerOptions(selected) {
  const groups = { SPHEREx: 'SPHEREx (NASA) · 0,75–5 µm', Kontext: 'Kontext – andere Missionen' };
  return Object.entries(groups).map(([g, label]) => `<optgroup label="${label}">${LAYERS.filter((l) => l.group === g)
    .map((l) => `<option value="${l.id}"${l.id === selected ? ' selected' : ''}>${l.name}</option>`).join('')}</optgroup>`).join('');
}

const TEMPLATE = (state) => `
  <canvas class="sky-canvas" tabindex="0" aria-label="Himmelskarte: ziehen zum Schwenken, Mausrad oder Zwei-Finger-Geste zum Zoomen, Doppelklick zentriert, Pfeiltasten und +/− per Tastatur"></canvas>
  <div class="sky-cross" aria-hidden="true"></div>
  <div class="sky-split" hidden><button type="button" class="sky-split-handle" aria-label="Trennlinie verschieben (Pfeiltasten)"><span></span></button></div>
  <div class="sky-tags" aria-live="polite"><div class="sky-tag sky-tag-a" hidden></div><div class="sky-tag sky-tag-b" hidden></div></div>

  <form class="sky-search sky-glass" role="search" autocomplete="off">
    <span class="sky-search-ico">${ICON.search}</span>
    <input type="text" name="q" maxlength="80" placeholder="Objekt (M42, Vega …) oder Koordinaten" aria-label="Ziel suchen: Objektname oder Koordinaten (z. B. 83.82 -5.39, 05:35:17 -05:23:28, gal 0 0)" spellcheck="false" />
    <button type="submit" class="sky-btn sky-btn-primary">Los</button>
    <div class="sky-search-msg" role="status" aria-live="polite"></div>
  </form>

  <button type="button" class="sky-panel-toggle sky-glass" aria-expanded="true" aria-controls="sky-panel">${ICON.sliders}<span>Ebenen &amp; Vergleich</span></button>
  <section class="sky-panel sky-glass" id="sky-panel" aria-label="Himmelsebenen und Vergleich">
    <header class="sky-panel-head">
      <div>
        <h2>Himmel <b>·</b> SPHEREx</h2>
        <p class="sky-sub">Der Infrarot-Himmel von 0,75 bis 5 µm</p>
      </div>
      <button type="button" class="sky-icon-btn sky-panel-close" aria-label="Bedienfeld schließen">${ICON.close}</button>
    </header>

    <div class="sky-sec">
      <label class="sky-label" for="sky-layer-a"><i class="sky-dot sky-dot-a"></i>Ebene A</label>
      <select id="sky-layer-a" class="sky-select">${layerOptions(state.a)}</select>
      <div class="sky-spec">
        <div class="sky-spec-bar" role="group" aria-label="SPHEREx-Detektorband wählen">
          ${SPX_BANDS.map(([k, label, a, b, tint]) => `<button type="button" class="sky-spec-band" data-layer="spx-${k}" style="left:${specPos(a)}%;width:${specPos(b) - specPos(a)}%;--tint:${tint}" title="SPHEREx ${label}: ${um(a)}–${um(b)} µm">${label}</button>`).join('')}
          ${FEATURES.map(([w, t]) => `<i class="sky-spec-feat" style="left:${specPos(w)}%" title="${t}"></i>`).join('')}
          <span class="sky-spec-hl sky-spec-hl-a"></span><span class="sky-spec-hl sky-spec-hl-b"></span>
        </div>
        <div class="sky-spec-axis" aria-hidden="true">${[0.75, 1, 1.5, 2, 3, 4, 5].map((v) => `<span style="left:${specPos(v)}%">${String(v).replace('.', ',')}${v === 5 ? ' µm' : ''}</span>`).join('')}</div>
        <p class="sky-spec-legend">Striche: Eis-Banden H₂O 3,05 · CO₂ 4,27 · CO 4,67 µm · PAH 3,3 µm · Wasserstoff Pa-α, Br-α</p>
      </div>
      <p class="sky-layer-note"></p>
    </div>

    <div class="sky-sec">
      <div class="sky-label">Vergleich zweier Ebenen</div>
      <div class="seg sky-seg" role="group" aria-label="Vergleichsmodus">
        <button type="button" data-mode="off">Aus</button><button type="button" data-mode="swipe">Schieber</button><button type="button" data-mode="fade">Überblenden</button><button type="button" data-mode="blink">Blinken</button>
      </div>
      <div class="sky-compare" hidden>
        <label class="sky-label" for="sky-layer-b"><i class="sky-dot sky-dot-b"></i>Ebene B</label>
        <select id="sky-layer-b" class="sky-select">${layerOptions(state.b)}</select>
        <div class="sky-row sky-row-range">
          <label for="sky-cmp-range" class="sky-range-label sky-cmp-label">Trennlinie</label>
          <input id="sky-cmp-range" type="range" min="0" max="100" value="50" />
          <output class="sky-range-out sky-cmp-out">50 %</output>
        </div>
        <button type="button" class="sky-btn sky-swap">A ↔ B tauschen</button>
      </div>
      <div class="sky-presets">
        ${PRESETS.map((p, i) => `<button type="button" class="sky-chip" data-preset="${i}" title="${p.text}">${p.label}</button>`).join('')}
      </div>
      <p class="sky-hint sky-preset-text">Epochen: SPHEREx 2025/26 gegen DSS2, 2MASS oder AllWISE – sichtbar etwa an schnell bewegten Sternen.</p>
    </div>

    <div class="sky-sec">
      <div class="sky-label">Darstellung</div>
      <div class="sky-row">
        <span class="sky-row-k">Farbskala</span>
        <div class="seg sky-seg sky-cmap" role="group" aria-label="Farbskala für Einzelbänder">
          <button type="button" data-cmap="band">Band</button><button type="button" data-cmap="glut">Glut</button><button type="button" data-cmap="eis">Eis</button><button type="button" data-cmap="grau">Grau</button>
        </div>
      </div>
      <div class="sky-row sky-row-range">
        <label for="sky-gain" class="sky-range-label">Helligkeit</label>
        <input id="sky-gain" type="range" min="-100" max="100" value="0" />
        <output class="sky-range-out" data-for="gain">1,0×</output>
      </div>
      <div class="sky-row sky-row-range">
        <label for="sky-gamma" class="sky-range-label">Kontrast</label>
        <input id="sky-gamma" type="range" min="-100" max="100" value="0" />
        <output class="sky-range-out" data-for="gamma">1,00</output>
      </div>
      <div class="sky-row">
        <span class="sky-row-k">Gitter</span>
        <div class="seg sky-seg sky-grid" role="group" aria-label="Koordinatengitter">
          <button type="button" data-grid="off">Aus</button><button type="button" data-grid="eq">Äquatorial</button><button type="button" data-grid="gal">Galaktisch</button>
        </div>
      </div>
    </div>

    <div class="sky-sec">
      <div class="sky-label">Ziele</div>
      <div class="sky-targets">${TARGETS.map((t, i) => `<button type="button" class="sky-chip" data-target="${i}" title="${t.note}">${t.name}</button>`).join('')}</div>
    </div>

    <button class="sky-btn sky-about-btn" type="button">${ICON.info}<span>Was ist SPHEREx? · Quellen</span></button>
  </section>

  <div class="sky-zoom sky-glass" role="group" aria-label="Zoom">
    <button type="button" class="sky-icon-btn" data-zoom="in" aria-label="Hineinzoomen" title="Hineinzoomen">${ICON.plus}</button>
    <button type="button" class="sky-icon-btn" data-zoom="out" aria-label="Herauszoomen" title="Herauszoomen">${ICON.minus}</button>
    <button type="button" class="sky-icon-btn" data-zoom="home" aria-label="Weitwinkel" title="Weitwinkel">${ICON.home}</button>
    <button type="button" class="sky-icon-btn" data-zoom="info" aria-label="Über SPHEREx" title="Über SPHEREx">${ICON.info}</button>
  </div>

  <div class="sky-hud sky-glass">
    <div class="sky-hud-row"><span class="sky-k">α</span><span class="sky-v" data-hud="ra">–</span><span class="sky-k">δ</span><span class="sky-v" data-hud="dec">–</span></div>
    <div class="sky-hud-row"><span class="sky-k">l</span><span class="sky-v" data-hud="l">–</span><span class="sky-k">b</span><span class="sky-v" data-hud="b">–</span></div>
    <div class="sky-hud-row sky-hud-meta"><span data-hud="src">Mitte</span><span data-hud="fov"></span><span data-hud="order"></span><span class="sky-load" data-hud="load" hidden><i></i><span></span></span></div>
  </div>
  <div class="sky-credit"></div>
  <div class="sky-msg sky-glass" role="alert" hidden><p></p><button class="sky-btn sky-btn-primary" type="button">Erneut versuchen</button></div>

  <aside class="sky-about sky-glass" hidden aria-label="Über SPHEREx" tabindex="-1">
    <button type="button" class="sky-icon-btn sky-about-close" aria-label="Schließen">${ICON.close}</button>
    <h3>SPHEREx</h3>
    <p class="sky-about-lead"><b>S</b>pectro-<b>P</b>hotometer for the <b>H</b>istory of the Universe, <b>E</b>poch of <b>R</b>eionization and Ices <b>Ex</b>plorer – ein NASA-Weltraumteleskop der Explorer-Klasse (JPL/Caltech), gestartet am 11. März 2025.</p>
    <ul class="sky-facts">
      <li><b>102</b><span>Spektralbänder</span></li>
      <li><b>0,75–5</b><span>µm Wellenlänge</span></li>
      <li><b>6,2″</b><span>Pixelgröße</span></li>
      <li><b>4×</b><span>ganzer Himmel in 2 Jahren</span></li>
    </ul>
    <p>Sechs Detektoren (D1–D6) mit linear variablen Filtern zerlegen das Licht: Jeder Himmelspunkt wird über Monate hinweg an verschiedenen Stellen der Filter aufgenommen, so entsteht für jedes Pixel ein Spektrum aus 102 Kanälen (spektrale Auflösung R ≈ 35–130). Etwa alle sechs Monate ist der ganze Himmel einmal kartiert; an den Polen der Ekliptik entstehen besonders tiefe Felder.</p>
    <h4>Wissenschaftliche Ziele</h4>
    <ul class="sky-goals">
      <li><b>Inflation:</b> eine 3D-Karte von Hunderten Millionen Galaxien – ihre Verteilung verrät, wie das Universum in seinen ersten Augenblicken expandierte.</li>
      <li><b>Galaxiengeschichte:</b> das summierte Licht aller Galaxien (Intensitätskartierung) zeigt, wie viel Sternlicht im Lauf der kosmischen Zeit entstand.</li>
      <li><b>Eis &amp; Leben:</b> Wasser-, CO₂- und CO-Eis in den Molekülwolken der Milchstraße – Rohstoffe künftiger Planetensysteme.</li>
    </ul>
    <h4>Was hier zu sehen ist</h4>
    <p>Die SPHEREx-Ebenen sind Mosaike aus den Spektralbildern der <i>Quick Release 2</i> (NASA/IPAC IRSA, Aufnahmen April 2025 – Mai 2026), vom CDS Strasbourg als HiPS-Kacheln aufbereitet: je Detektor ein Breitband-Mosaik (D1–D6) und ein Farbkomposit. Einzelne Himmelsdurchgänge sind darin zusammengefasst – der Epochenvergleich nutzt deshalb ältere Durchmusterungen (DSS2, 2MASS, AllWISE). Kontext-Ebenen stammen nicht von SPHEREx und sind als „Kontext“ gekennzeichnet.</p>
    <h4>Quellen &amp; Zitierhinweise</h4>
    <ul class="sky-sources">
      <li>NASA: <a href="https://science.nasa.gov/mission/spherex/" target="_blank" rel="noopener noreferrer">SPHEREx-Missionsseite</a> · Caltech: <a href="https://spherex.caltech.edu/" target="_blank" rel="noopener noreferrer">spherex.caltech.edu</a> · IRSA: <a href="https://irsa.ipac.caltech.edu/Missions/spherex.html" target="_blank" rel="noopener noreferrer">SPHEREx-Archiv</a></li>
      <li>Bock, J. et al. (2025): <i>The SPHEREx Satellite Mission</i>, <a href="https://arxiv.org/abs/2511.02985" target="_blank" rel="noopener noreferrer">arXiv:2511.02985</a></li>
      <li>Daten: SPHEREx Quick Release, NASA/IPAC IRSA, <a href="https://doi.org/10.26131/IRSA652" target="_blank" rel="noopener noreferrer">doi:10.26131/IRSA652</a> – „Courtesy NASA/JPL-Caltech“ (<a href="https://spherex.caltech.edu/page/image-use-policy" target="_blank" rel="noopener noreferrer">Bildnutzung</a>)</li>
      <li>HiPS-Mosaike CDS/P/SPHEREx/QR2: CDS Strasbourg (T. Boch, M. Buga); HiPS-Standard: Fernique et al. 2015, A&amp;A 578, A114</li>
      <li>Namensauflösung: CDS Sesame / SIMBAD (Wenger et al. 2000, A&amp;AS 143, 9)</li>
      <li>Kontext: 2MASS (Skrutskie et al. 2006), WISE (Wright et al. 2010), DSS2 (STScI), Planck (ESA)</li>
    </ul>
  </aside>`;

export function createSkyView(container) {
  const state = {
    ra: 84.5, dec: -3.0, fov: 36, // Start: Orion im Infraroten
    a: 'spx-color', b: '2mass',
    mode: 'off', split: 0.5, fade: 0.5, blinkMs: 900,
    grid: 'eq', cmap: 'band', gain: 1, gamma: 1,
  };

  const root = document.createElement('div');
  root.className = 'sky';
  root.innerHTML = TEMPLATE(state);
  container.replaceChildren(root);

  const $ = (s) => root.querySelector(s);
  const canvas = $('.sky-canvas');
  const hud = Object.fromEntries([...root.querySelectorAll('[data-hud]')].map((el) => [el.dataset.hud, el]));
  const msgEl = $('.sky-msg');

  // --- Laufzeit ----------------------------------------------------------------------------------------
  let renderer = null, camera = null, inited = false, active = false, raf = 0;
  let dirty = true, width = 1, height = 1, maxAniso = 1, fatal = false;
  let fly = null, blinkShowB = false, blinkT = 0, lastFrame = 0;
  let pointerSky = null; // Himmelsrichtung unter dem Mauszeiger (für die Anzeige)
  const runtimes = new Map();
  const shared = { gain: { value: 1 }, gammaV: { value: 1 } }; // für beide Ebenen gleich (fairer Vergleich)
  const net = { inflight: 0, queue: [], fails: 0, lastOk: 0, MAX: 8 };
  const MAX_TILES = 420;
  let loadedCount = 0, frameId = 0;

  const gridScene = new THREE.Scene();
  const gridMat = new THREE.LineBasicMaterial({ color: 0x6ea8ff, transparent: true, opacity: 0.3, depthTest: false, depthWrite: false });
  const gridMat2 = new THREE.LineBasicMaterial({ color: 0x9cc4ff, transparent: true, opacity: 0.75, depthTest: false, depthWrite: false });
  const gridLines = new THREE.LineSegments(new THREE.BufferGeometry(), gridMat);
  const gridEquator = new THREE.LineSegments(new THREE.BufferGeometry(), gridMat2);
  gridLines.frustumCulled = gridEquator.frustumCulled = false;
  gridScene.add(gridLines, gridEquator);
  let gridKey = '';

  function rt(id) {
    let r = runtimes.get(id);
    if (!r) {
      const def = LAYER[id];
      r = {
        def, cache: new Map(), scene: new THREE.Scene(), order: 0, pending: 0,
        uniforms: { opacity: { value: 1 }, mode: { value: 0 }, tint: { value: new THREE.Color(def.tint || '#ffffff') } },
      };
      runtimes.set(id, r);
      applyLayerUniforms();
    }
    return r;
  }

  function init() {
    inited = true;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      fatal = true;
      showMsg('WebGL ist in diesem Browser nicht verfügbar – der Himmelsbetrachter kann nicht starten.', false);
      return;
    }
    renderer.autoClear = false;
    renderer.setClearColor(0x02040a, 1);
    maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      fatal = true;
      showMsg('Der Grafikkontext ging verloren – bitte die Seite neu laden.', false);
    });
    new ResizeObserver(() => { resize(); dirty = true; }).observe(root);
    bindInput();
    resize();
  }

  function resize() {
    if (!renderer) return;
    const w = root.clientWidth, h = root.clientHeight;
    if (!w || !h) return;
    width = w;
    height = h;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    clampFov();
    if (camera) updateCamera();
  }

  // --- Kamera (Mitte RA/Dec, Norden oben, Blick von innen → Osten links wie am Himmel) -------------------
  function maxFov() {
    const asp = width / height;
    return asp > 1 ? Math.min(140, (2 * Math.atan(Math.tan(70 * DEG) / asp)) / DEG) : 140;
  }
  const MIN_FOV = 0.08;
  function clampFov() { state.fov = Math.max(MIN_FOV, Math.min(maxFov(), state.fov)); }
  const centerVec = () => lonlat2vec(state.ra, state.dec);
  function updateCamera() {
    const a = state.ra * DEG, d = state.dec * DEG;
    const north = [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)];
    camera.fov = state.fov;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    camera.up.copy(toThree(north));
    camera.lookAt(toThree(centerVec()));
    camera.updateMatrixWorld();
  }
  function skyAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return new THREE.Vector3(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1, 0.5).unproject(camera).normalize();
  }
  // Ansicht so drehen, dass der Himmelspunkt `from` dort erscheint, wo jetzt `to` liegt
  function rotateCenter(from, to) {
    const q = new THREE.Quaternion().setFromUnitVectors(to, from);
    [state.ra, state.dec] = vec2lonlat(fromThree(toThree(centerVec()).applyQuaternion(q)));
  }
  function zoomBy(factor, clientX, clientY) {
    if (!camera) return;
    fly = null;
    updateCamera();
    const anchor = clientX != null ? skyAt(clientX, clientY) : null;
    state.fov *= factor;
    clampFov();
    updateCamera();
    if (anchor) { rotateCenter(anchor, skyAt(clientX, clientY)); updateCamera(); }
    dirty = true;
  }
  function flyTo(ra, dec, fov) {
    const to = { ra, dec, fov: fov ?? state.fov };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !camera || !active) {
      Object.assign(state, to);
      clampFov();
      dirty = true;
      return;
    }
    const v0 = toThree(centerVec()), v1 = toThree(lonlat2vec(ra, dec));
    const ang = v0.angleTo(v1) / DEG;
    fly = {
      v0, q: new THREE.Quaternion().setFromUnitVectors(v0, v1), f0: state.fov, f1: to.fov,
      peak: Math.min(maxFov(), Math.max(state.fov, to.fov, ang * 0.9)), t0: performance.now(), dur: 900 + Math.min(1300, ang * 12), to,
    };
  }
  function stepFly(now) {
    const t = Math.min(1, (now - fly.t0) / fly.dur);
    const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    const q = new THREE.Quaternion().slerp(fly.q, e);
    [state.ra, state.dec] = vec2lonlat(fromThree(fly.v0.clone().applyQuaternion(q)));
    // Zoom log-interpoliert, mit „Hüpfer“ bei weiten Sprüngen (erst heraus, dann wieder hinein)
    const l0 = Math.log(fly.f0), l1 = Math.log(fly.f1);
    const bump = Math.sin(Math.PI * e) * Math.max(0, Math.log(fly.peak) - Math.max(l0, l1));
    state.fov = Math.exp(l0 * (1 - e) + l1 * e + bump);
    if (t >= 1) { Object.assign(state, fly.to); fly = null; }
    clampFov();
    dirty = true;
  }

  // --- Kacheln -----------------------------------------------------------------------------------------
  function targetOrder(def) {
    const pxAngle = (state.fov * DEG) / (height * Math.min(1.5, window.devicePixelRatio || 1));
    let o = 0;
    while (o < def.maxOrder && tilePixelAngle(o, def.width) > pxAngle * 1.4) o++;
    return o;
  }
  function viewRadius() {
    const tv = Math.tan((state.fov * DEG) / 2), th = tv * (width / height);
    return Math.atan(Math.hypot(tv, th));
  }
  const tileMeta = new Map();
  function meta(order, ipix) {
    const key = `${order}/${ipix}`;
    let m = tileMeta.get(key);
    if (!m) {
      const { face, ix, iy } = nest2xyf(order, ipix), n = 2 ** order;
      const c = fxy2vec(face, (ix + 0.5) / n, (iy + 0.5) / n);
      let r = 0;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0], [0, 0.5], [1, 0.5], [0.5, 1]]) {
        const v = fxy2vec(face, (ix + dx) / n, (iy + dy) / n);
        r = Math.max(r, Math.acos(Math.max(-1, Math.min(1, v[0] * c[0] + v[1] * c[1] + v[2] * c[2]))));
      }
      m = { c, r: r * 1.08 + 1e-4 };
      if (tileMeta.size > 20000) tileMeta.clear();
      tileMeta.set(key, m);
    }
    return m;
  }
  // Kegeltest: Kachel (Mittelpunkt + Umkreis) gegen Blickkegel, hierarchisch ab den 12 Basisflächen
  function visibleTiles(order, dir, radius) {
    const out = [], stack = [];
    for (let p = 0; p < 12; p++) stack.push([0, p]);
    while (stack.length && out.length < 400) {
      const [o, p] = stack.pop();
      const m = meta(o, p);
      const cosd = m.c[0] * dir[0] + m.c[1] * dir[1] + m.c[2] * dir[2];
      if (Math.acos(Math.max(-1, Math.min(1, cosd))) > m.r + radius) continue;
      if (o === order) out.push({ o, p, d: cosd });
      else for (let k = 0; k < 4; k++) stack.push([o + 1, p * 4 + k]);
    }
    return out.sort((x, y) => y.d - x.d);
  }

  function tileGeometry(def, order, ipix) {
    const { face, ix, iy } = nest2xyf(order, ipix), n = 2 ** order;
    const seg = order === 0 ? 20 : order === 1 ? 12 : order === 2 ? 8 : order <= 4 ? 5 : 3;
    const pos = new Float32Array((seg + 1) * (seg + 1) * 3), uv = new Float32Array((seg + 1) * (seg + 1) * 2);
    let k = 0;
    for (let i = 0; i <= seg; i++) {
      for (let j = 0; j <= seg; j++) {
        let v = fxy2vec(face, (ix + i / seg) / n, (iy + j / seg) / n);
        if (def.frame === 'gal') v = gal2eq(v);
        pos[k * 3] = v[0]; pos[k * 3 + 1] = v[2]; pos[k * 3 + 2] = -v[1];
        // HiPS-Kachel: Bildspalte folgt iy, Bildzeile (von oben, flipY = false) folgt ix
        uv[k * 2] = j / seg; uv[k * 2 + 1] = i / seg;
        k++;
      }
    }
    const idx = [];
    for (let i = 0; i < seg; i++) {
      for (let j = 0; j < seg; j++) {
        const a = i * (seg + 1) + j, b = a + 1, c = a + seg + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  const tileUrl = (def, order, ipix, mirror) =>
    `${mirror ? CDS_MIRROR : CDS}${def.path}/Norder${order}/Dir${Math.floor(ipix / 10000) * 10000}/Npix${ipix}.${def.ext}`;

  function request(r, order, ipix, prio) {
    const key = `${order}/${ipix}`;
    const e = r.cache.get(key);
    if (e) {
      e.used = performance.now();
      e.wanted = frameId;
      if (e.state !== 'error' || performance.now() < e.retryAt) return e;
      r.cache.delete(key);
    }
    if (!fly) net.queue.push({ r, order, ipix, key, prio }); // während eines Kameraflugs nur Vorhandenes zeigen
    return null;
  }

  function pump() {
    while (net.inflight < net.MAX && net.queue.length) {
      const job = net.queue.shift();
      if (!job.r.cache.has(job.key)) load(job);
    }
  }

  async function load({ r, order, ipix, key }) {
    const entry = { state: 'loading', used: performance.now(), wanted: frameId, aborted: false, ctrl: null };
    r.cache.set(key, entry);
    net.inflight++;
    // Last auf Haupt- und Spiegelserver verteilen (doppelt so viele parallele Verbindungen); der jeweils andere dient als Rückfall
    const firstMirror = ipix % 2 === 1;
    for (let attempt = 0; attempt < 2 && !entry.aborted; attempt++) {
      const ctrl = (entry.ctrl = new AbortController());
      // Antwortkopf binnen 25 s, sonst hängt die Verbindung → anderer Server; der Körper darf dann langsam sein
      // (CDS liefert zeitweise nur ~20–50 kB/s, PNG-Kacheln haben 100–600 kB)
      let timer = setTimeout(() => ctrl.abort(), 25000);
      try {
        const res = await fetch(tileUrl(r.def, order, ipix, attempt === 0 ? firstMirror : !firstMirror), { mode: 'cors', credentials: 'omit', signal: ctrl.signal });
        clearTimeout(timer);
        timer = setTimeout(() => ctrl.abort(), 120000);
        if (res.status === 404) { entry.state = 'empty'; break; } // an dieser Stelle keine Daten
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const bmp = await createImageBitmap(await res.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        const tex = new THREE.Texture(bmp);
        tex.flipY = false;
        tex.colorSpace = THREE.NoColorSpace; // Werte unverändert durchreichen (ShaderMaterial ohne Farbraum-Umrechnung)
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.anisotropy = maxAniso;
        tex.needsUpdate = true;
        const mat = new THREE.ShaderMaterial({
          vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
          uniforms: { map: { value: tex }, opacity: r.uniforms.opacity, mode: r.uniforms.mode, tint: r.uniforms.tint, gain: shared.gain, gammaV: shared.gammaV },
        });
        const mesh = new THREE.Mesh(tileGeometry(r.def, order, ipix), mat);
        mesh.renderOrder = order;
        mesh.frustumCulled = false;
        Object.assign(entry, { state: 'ready', mesh, tex, bmp });
        loadedCount++;
        net.fails = 0;
        net.lastOk = performance.now();
        if (!fatal) msgEl.hidden = true;
        break;
      } catch {
        if (entry.aborted) break; // nicht mehr gebraucht (Ansicht hat sich bewegt)
        if (attempt === 0) continue; // einmal über den anderen Server versuchen
        entry.state = 'error';
        entry.retryAt = performance.now() + 15000;
        net.fails++;
        if (net.fails >= 8 && performance.now() - net.lastOk > 8000) {
          showMsg('Die Himmelskacheln (CDS Strasbourg) sind gerade nicht erreichbar. Bitte Netzwerk prüfen oder später erneut versuchen.', true);
        }
      } finally {
        clearTimeout(timer);
      }
    }
    net.inflight--;
    if (r.cache.get(key) !== entry) disposeEntry(entry); // inzwischen verworfen
    evict();
    dirty = true;
    pump();
  }

  function disposeEntry(e) {
    if (e.state === 'ready') loadedCount--;
    if (e.mesh) { e.mesh.geometry.dispose(); e.mesh.material.dispose(); }
    if (e.tex) e.tex.dispose();
    if (e.bmp && e.bmp.close) e.bmp.close();
    e.state = 'gone';
  }
  function evict() {
    if (loadedCount <= MAX_TILES) return;
    const all = [];
    for (const r of runtimes.values()) for (const [k, e] of r.cache) if (e.state === 'ready' && !e.keep) all.push([e.used, r, k, e]);
    all.sort((x, y) => x[0] - y[0]);
    for (let i = 0; i < all.length && loadedCount > MAX_TILES * 0.85; i++) {
      const [, r, k, e] = all[i];
      r.cache.delete(k);
      disposeEntry(e);
    }
  }

  // Sichtbare Kacheln einer Ebene bestimmen, anfordern und je Stelle die beste geladene Auflösung zeichnen
  function prepareLayer(r) {
    const def = r.def;
    let order = targetOrder(def);
    let dir = centerVec();
    if (def.frame === 'gal') dir = eq2gal(dir);
    const rad = viewRadius();
    let tiles = visibleTiles(order, dir, rad);
    while (tiles.length > 160 && order > 0) { order--; tiles = visibleTiles(order, dir, rad); }
    r.order = order;
    const draw = new Set();
    const now = performance.now();
    // Vorschau eine Stufe von 3 Ordnungen gröber (1 Kachel statt 64) – erst ab Ordnung 4, grobe Kacheln sind groß
    const coarse = order >= 4 ? order - 3 : -1;
    let pending = 0;
    for (const { o, p } of tiles) {
      const e = request(r, o, p, 1);
      if (e && e.state === 'ready') { e.used = now; draw.add(e); continue; }
      if (!e || e.state === 'loading') pending++;
      // Ersatz: nächstgröbere geladene Kachel; fehlt jede, zusätzlich eine grobe Vorschau anfordern
      let fo = o, fp = p, found = false;
      while (fo > 0 && !found) {
        fo--;
        fp = Math.floor(fp / 4);
        const pe = r.cache.get(`${fo}/${fp}`);
        if (pe && pe.state === 'ready') { pe.used = now; draw.add(pe); found = true; }
      }
      if (!found && coarse >= 0) request(r, coarse, Math.floor(p / 4 ** (o - coarse)), 0);
    }
    r.pending = pending;
    r.scene.clear();
    for (const c of r.cache.values()) c.keep = draw.has(c);
    for (const e of draw) r.scene.add(e.mesh);
  }

  const shownIds = () => (state.mode === 'off' ? [state.a] : [state.a, state.b]);
  function prepare() {
    frameId++;
    net.queue.length = 0;
    for (const id of new Set(shownIds())) prepareLayer(rt(id));
    // Downloads für Kacheln, die nicht mehr im Bild sind, abbrechen – sonst blockieren sie die Verbindungen
    if (!fly) {
      for (const r of runtimes.values()) {
        for (const [k, e] of r.cache) {
          if (e.state === 'loading' && e.wanted !== frameId && performance.now() - e.used > 400) {
            e.aborted = true;
            e.ctrl?.abort();
            r.cache.delete(k);
          }
        }
      }
    }
    net.queue.sort((x, y) => x.prio - y.prio); // grobe Vorschauen zuerst, sonst von der Mitte nach außen
    pump();
  }

  // --- Gitter -----------------------------------------------------------------------------------------
  const STEPS = [30, 15, 10, 5, 2, 1, 0.5, 0.25, 1 / 6, 1 / 12, 1 / 30, 1 / 60, 1 / 120];
  function updateGrid() {
    gridScene.visible = state.grid !== 'off';
    if (!gridScene.visible) return;
    const gal = state.grid === 'gal';
    let c = centerVec();
    if (gal) c = eq2gal(c);
    const [clon, clat] = vec2lonlat(c);
    const R = viewRadius() / DEG;
    const step = STEPS.find((s) => state.fov / s >= 3.5) ?? STEPS[STEPS.length - 1];
    const key = `${state.grid}|${step}|${Math.round(clon / step)}|${Math.round(clat / step)}|${Math.round(R / step)}`;
    if (key === gridKey) return;
    gridKey = key;
    gridMat.color.set(gal ? 0xb98cff : 0x6ea8ff);
    gridMat2.color.set(gal ? 0xd9b8ff : 0x9cc4ff);
    const latMin = Math.max(-90, clat - R - step), latMax = Math.min(90, clat + R + step);
    const polar = Math.abs(clat) + R >= 88;
    const dLon = polar ? 180 : Math.min(180, (R + step) / Math.cos(Math.min(89, Math.abs(clat) + R) * DEG));
    const lonStep = polar ? Math.max(step, 15) : step;
    const pts = [], eqPts = [];
    const push = (arr, lon, lat, lon2, lat2) => {
      let a = lonlat2vec(lon, lat), b = lonlat2vec(lon2, lat2);
      if (gal) { a = gal2eq(a); b = gal2eq(b); }
      arr.push(a[0], a[2], -a[1], b[0], b[2], -b[1]);
    };
    const N = 72;
    const l0 = polar ? 0 : clon - dLon, l1 = polar ? 360 : clon + dLon;
    for (let lat = Math.ceil(latMin / step) * step; lat <= latMax + 1e-9; lat += step) {
      if (Math.abs(lat) >= 90 - 1e-9) continue;
      const arr = Math.abs(lat) < 1e-9 ? eqPts : pts; // Äquator bzw. galaktische Ebene hervorheben
      for (let i = 0; i < N; i++) push(arr, l0 + ((l1 - l0) * i) / N, lat, l0 + ((l1 - l0) * (i + 1)) / N, lat);
    }
    const ls = polar ? 0 : Math.ceil(l0 / lonStep) * lonStep, le = polar ? 360 - 1e-9 : l1;
    for (let lon = ls; lon <= le; lon += lonStep) {
      for (let i = 0; i < N; i++) push(pts, lon, latMin + ((latMax - latMin) * i) / N, lon, latMin + ((latMax - latMin) * (i + 1)) / N);
    }
    gridLines.geometry.dispose();
    gridLines.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    gridEquator.geometry.dispose();
    gridEquator.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(eqPts, 3));
  }

  // --- Zeichnen -----------------------------------------------------------------------------------------
  function render() {
    updateCamera();
    prepare();
    updateGrid();
    const ra = rt(state.a), rb = state.mode !== 'off' ? rt(state.b) : null;
    for (const r of runtimes.values()) r.uniforms.opacity.value = 1;
    renderer.setScissorTest(false);
    renderer.clear();
    if (!rb) {
      renderer.render(ra.scene, camera);
    } else if (state.mode === 'swipe') {
      const x = Math.round(width * state.split);
      renderer.setScissorTest(true);
      renderer.setScissor(0, 0, x, height);
      renderer.render(ra.scene, camera);
      renderer.setScissor(x, 0, width - x, height);
      renderer.render(rb.scene, camera);
      renderer.setScissorTest(false);
    } else if (state.mode === 'fade') {
      renderer.render(ra.scene, camera);
      if (rb !== ra) { rb.uniforms.opacity.value = state.fade; renderer.render(rb.scene, camera); }
    } else {
      renderer.render(blinkShowB ? rb.scene : ra.scene, camera);
    }
    if (gridScene.visible) renderer.render(gridScene, camera);
    updateHud();
    updateLoadUI();
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = lastFrame ? now - lastFrame : 0;
    lastFrame = now;
    if (fly) stepFly(now);
    if (state.mode === 'blink') {
      blinkT += dt;
      if (blinkT >= state.blinkMs) { blinkT = 0; blinkShowB = !blinkShowB; updateTags(); dirty = true; }
    }
    if (dirty && width > 1) { dirty = false; render(); }
  }

  // --- Anzeige -----------------------------------------------------------------------------------------
  function updateHud() {
    const v = pointerSky ? fromThree(pointerSky) : centerVec();
    const [ra, dec] = vec2lonlat(v);
    const [l, b] = vec2lonlat(eq2gal(v));
    hud.ra.textContent = fmtRA(ra);
    hud.dec.textContent = fmtDec(dec);
    hud.l.textContent = `${nf(l, 3)}°`;
    hud.b.textContent = `${b < 0 ? '−' : '+'}${nf(Math.abs(b), 3)}°`;
    hud.src.textContent = pointerSky ? 'Zeiger' : 'Bildmitte';
    hud.fov.textContent = `Feld ${fmtFov(state.fov)}`;
    const r = rt(state.a);
    hud.order.textContent = `HiPS ${r.order}/${r.def.maxOrder}`;
    hud.order.title = r.order >= r.def.maxOrder ? 'Höchste verfügbare Auflösung dieser Ebene erreicht' : 'HEALPix-Ordnung der geladenen Kacheln';
  }
  function updateLoadUI() {
    const n = [...new Set(shownIds())].reduce((s, id) => s + rt(id).pending, 0);
    hud.load.hidden = !(n > 0 && net.inflight > 0);
    if (!hud.load.hidden) hud.load.lastElementChild.textContent = `lädt ${n}`;
  }
  function showMsg(text, retry) {
    msgEl.hidden = false;
    msgEl.querySelector('p').textContent = text;
    msgEl.querySelector('button').hidden = !retry;
  }
  msgEl.querySelector('button').addEventListener('click', () => {
    for (const r of runtimes.values()) for (const [k, e] of r.cache) if (e.state === 'error') r.cache.delete(k);
    net.fails = 0;
    net.lastOk = performance.now();
    msgEl.hidden = true;
    dirty = true;
  });

  function updateCredit() {
    const credits = [...new Set(shownIds().map((id) => LAYER[id].credit))];
    $('.sky-credit').textContent = credits.join('   |   ');
  }
  function updateTags() {
    const ta = $('.sky-tag-a'), tb = $('.sky-tag-b');
    const on = state.mode !== 'off';
    ta.hidden = tb.hidden = !on;
    root.dataset.cmp = state.mode;
    if (!on) return;
    const A = LAYER[state.a], B = LAYER[state.b];
    ta.textContent = `A · ${A.short} · ${A.epoch}`;
    tb.textContent = `B · ${B.short} · ${B.epoch}`;
    ta.classList.toggle('dim', state.mode === 'blink' && blinkShowB);
    tb.classList.toggle('dim', state.mode === 'blink' && !blinkShowB);
  }
  function updateSpec() {
    const hl = (el, def, show) => {
      const [a, b] = def.range;
      const visible = show && b > 0.75 && a < 5;
      el.hidden = !visible;
      if (!visible) return;
      const l = specPos(Math.max(0.75, a)), r = specPos(Math.min(5, b));
      el.style.left = `${l}%`;
      el.style.width = `${Math.max(0.8, r - l)}%`;
      el.classList.toggle('open-r', b > 5);
      el.classList.toggle('open-l', a < 0.75);
    };
    const A = LAYER[state.a], B = LAYER[state.b];
    hl($('.sky-spec-hl-a'), A, true);
    hl($('.sky-spec-hl-b'), B, state.mode !== 'off');
    root.querySelectorAll('.sky-spec-band').forEach((btn) => {
      btn.classList.toggle('on', btn.dataset.layer === state.a);
      btn.classList.toggle('on-b', state.mode !== 'off' && btn.dataset.layer === state.b);
      btn.setAttribute('aria-pressed', String(btn.dataset.layer === state.a));
    });
    let extra = '';
    if (A.range[0] >= 5) extra = ' Liegt jenseits des SPHEREx-Bereichs (längerwellig).';
    else if (A.range[1] <= 0.9 && A.range[0] < 0.75) extra = ' Überwiegend kürzerwellig als SPHEREx.';
    $('.sky-layer-note').textContent = `${A.group === 'Kontext' ? 'Kontext, nicht SPHEREx. ' : ''}${A.note} Aufnahmen: ${A.epoch}.${extra}`;
  }
  function applyLayerUniforms() {
    const mode = { band: 4, glut: 2, eis: 3, grau: 1 }[state.cmap];
    for (const r of runtimes.values()) r.uniforms.mode.value = r.def.mono ? mode : 0;
    const anyMono = shownIds().some((id) => LAYER[id].mono);
    const seg = $('.sky-cmap');
    seg.classList.toggle('is-disabled', !anyMono);
    seg.title = anyMono ? 'Farbskala für die SPHEREx-Einzelbänder D1–D6' : 'Wirkt nur auf die SPHEREx-Einzelbänder D1–D6';
  }
  function setPressed(sel, attr, value) {
    root.querySelectorAll(sel).forEach((b) => {
      const on = b.dataset[attr] === value;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }
  function syncControls() {
    $('#sky-layer-a').value = state.a;
    $('#sky-layer-b').value = state.b;
    setPressed('[data-mode]', 'mode', state.mode);
    setPressed('[data-cmap]', 'cmap', state.cmap);
    setPressed('[data-grid]', 'grid', state.grid);
    $('.sky-compare').hidden = state.mode === 'off';
    const range = $('#sky-cmp-range'), lab = $('.sky-cmp-label'), out = $('.sky-cmp-out');
    if (state.mode === 'swipe') { lab.textContent = 'Trennlinie'; range.value = Math.round(state.split * 100); out.textContent = `${range.value} %`; }
    if (state.mode === 'fade') { lab.textContent = 'Anteil B'; range.value = Math.round(state.fade * 100); out.textContent = `${range.value} %`; }
    if (state.mode === 'blink') { lab.textContent = 'Takt'; range.value = Math.round(((state.blinkMs - 250) / 1750) * 100); out.textContent = `${nf(state.blinkMs / 1000, 1)} s`; }
    $('.sky-split').hidden = state.mode !== 'swipe';
    $('.sky-split').style.left = `${state.split * 100}%`;
    root.style.setProperty('--split', String(state.split));
    applyLayerUniforms();
    updateSpec();
    updateTags();
    updateCredit();
    dirty = true;
  }

  // --- Bedienung ---------------------------------------------------------------------------------------
  $('#sky-layer-a').addEventListener('change', (e) => { state.a = e.target.value; syncControls(); });
  $('#sky-layer-b').addEventListener('change', (e) => { state.b = e.target.value; syncControls(); });
  root.querySelectorAll('.sky-spec-band').forEach((btn) => btn.addEventListener('click', () => { state.a = btn.dataset.layer; syncControls(); }));
  root.querySelectorAll('[data-mode]').forEach((btn) => btn.addEventListener('click', () => {
    state.mode = btn.dataset.mode;
    if (state.mode !== 'off' && state.b === state.a) state.b = state.a === 'spx-color' ? '2mass' : 'spx-color';
    blinkT = 0;
    blinkShowB = false;
    syncControls();
  }));
  root.querySelectorAll('[data-cmap]').forEach((btn) => btn.addEventListener('click', () => { state.cmap = btn.dataset.cmap; syncControls(); }));
  root.querySelectorAll('[data-grid]').forEach((btn) => btn.addEventListener('click', () => { state.grid = btn.dataset.grid; gridKey = ''; syncControls(); }));
  $('#sky-cmp-range').addEventListener('input', (e) => {
    const v = Number(e.target.value) / 100;
    if (state.mode === 'swipe') state.split = Math.max(0.02, Math.min(0.98, v));
    if (state.mode === 'fade') state.fade = v;
    if (state.mode === 'blink') state.blinkMs = 250 + v * 1750;
    syncControls();
  });
  $('.sky-swap').addEventListener('click', () => { [state.a, state.b] = [state.b, state.a]; syncControls(); });
  const gainIn = $('#sky-gain'), gammaIn = $('#sky-gamma');
  gainIn.addEventListener('input', () => {
    state.gain = 2 ** (Number(gainIn.value) / 60);
    shared.gain.value = state.gain;
    root.querySelector('[data-for="gain"]').textContent = `${nf(state.gain, 1)}×`;
    dirty = true;
  });
  gammaIn.addEventListener('input', () => {
    state.gamma = 2 ** (Number(gammaIn.value) / 80);
    shared.gammaV.value = state.gamma;
    root.querySelector('[data-for="gamma"]').textContent = nf(state.gamma, 2);
    dirty = true;
  });
  root.querySelectorAll('[data-target]').forEach((btn) => btn.addEventListener('click', () => {
    const t = TARGETS[Number(btn.dataset.target)];
    flyTo(t.ra, t.dec, t.fov);
    setSearchMsg(`${t.name} – ${t.note}`, false);
    closePanelOnMobile();
  }));
  root.querySelectorAll('[data-preset]').forEach((btn) => btn.addEventListener('click', () => {
    const p = PRESETS[Number(btn.dataset.preset)];
    Object.assign(state, { a: p.a, b: p.b, mode: p.mode });
    blinkT = 0;
    blinkShowB = false;
    const t = TARGETS.find((x) => x.name === p.target);
    if (t) flyTo(t.ra, t.dec, t.fov);
    $('.sky-preset-text').textContent = p.text;
    syncControls();
    closePanelOnMobile();
  }));

  // Bedienfeld ein-/ausklappen (schmal: standardmäßig zu)
  const panel = $('.sky-panel'), panelToggle = $('.sky-panel-toggle');
  const narrow = () => window.matchMedia('(max-width: 720px)').matches;
  function setPanel(open) {
    panel.classList.toggle('closed', !open);
    root.classList.toggle('panel-open', open);
    panelToggle.setAttribute('aria-expanded', String(open));
  }
  function closePanelOnMobile() { if (narrow()) setPanel(false); }
  setPanel(!narrow());
  panelToggle.addEventListener('click', () => setPanel(panel.classList.contains('closed')));
  $('.sky-panel-close').addEventListener('click', () => setPanel(false));

  // Info „Was ist SPHEREx?“
  const about = $('.sky-about');
  const openAbout = (open) => { about.hidden = !open; if (open) about.focus(); };
  $('.sky-about-btn').addEventListener('click', () => { openAbout(true); closePanelOnMobile(); });
  $('.sky-about-close').addEventListener('click', () => openAbout(false));
  about.addEventListener('keydown', (e) => { if (e.key === 'Escape') openAbout(false); });

  // Zoom-Knöpfe
  root.querySelectorAll('[data-zoom]').forEach((btn) => btn.addEventListener('click', () => {
    const z = btn.dataset.zoom;
    if (z === 'in') zoomBy(1 / 1.6);
    else if (z === 'out') zoomBy(1.6);
    else if (z === 'home') flyTo(state.ra, state.dec, maxFov());
    else openAbout(about.hidden);
  }));

  // Suche: Koordinaten direkt, sonst Objektname über CDS Sesame (Antwort nur per textContent ausgeben)
  const form = $('.sky-search'), input = form.querySelector('input'), searchMsg = $('.sky-search-msg');
  let searchCtrl = null;
  function setSearchMsg(text, isError) {
    searchMsg.textContent = text;
    searchMsg.classList.toggle('err', !!isError);
    searchMsg.classList.toggle('show', !!text);
  }
  input.addEventListener('input', () => { if (!input.value) setSearchMsg('', false); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    const c = parseCoords(q);
    if (c) {
      flyTo(c.ra, c.dec, Math.min(state.fov, 3));
      setSearchMsg(`Koordinaten α ${fmtRA(c.ra)}, δ ${fmtDec(c.dec)}`, false);
      return;
    }
    searchCtrl?.abort();
    const ctrl = (searchCtrl = new AbortController());
    const timer = setTimeout(() => ctrl.abort(), 12000);
    form.classList.add('busy');
    setSearchMsg('Suche bei CDS Sesame …', false);
    try {
      const res = await fetch(SESAME + encodeURIComponent(q), { mode: 'cors', credentials: 'omit', signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = new DOMParser().parseFromString(await res.text(), 'text/xml');
      const resolver = [...xml.getElementsByTagName('Resolver')].find((r) => r.getElementsByTagName('jradeg')[0]);
      if (!resolver) { setSearchMsg(`„${q}“ wurde nicht gefunden. Tipp: Katalogname (M42, NGC 7000) oder Koordinaten.`, true); return; }
      const ra = Number(resolver.getElementsByTagName('jradeg')[0].textContent);
      const dec = Number(resolver.getElementsByTagName('jdedeg')[0]?.textContent);
      if (!Number.isFinite(ra) || !Number.isFinite(dec) || ra < 0 || ra >= 360 || Math.abs(dec) > 90) throw new Error('Koordinaten ungültig');
      const otype = resolver.getElementsByTagName('otype')[0]?.textContent?.trim().slice(0, 40);
      const oname = resolver.getElementsByTagName('oname')[0]?.textContent?.trim().replace(/^NAME\s+/, '').replace(/\s+/g, ' ').slice(0, 60);
      flyTo(ra, dec, Math.min(Math.max(state.fov, 0.5), 3));
      setSearchMsg(`${oname || q}${otype ? ` (${otype})` : ''} · α ${fmtRA(ra)}, δ ${fmtDec(dec)} · CDS Sesame`, false);
    } catch {
      if (ctrl !== searchCtrl) return; // von einer neueren Suche abgelöst
      setSearchMsg(ctrl.signal.aborted ? 'Zeitüberschreitung bei CDS Sesame.' : 'Namensauflösung (CDS Sesame) nicht erreichbar.', true);
    } finally {
      clearTimeout(timer);
      if (ctrl === searchCtrl) form.classList.remove('busy');
    }
  });

  // Trennlinie ziehen
  const handle = $('.sky-split-handle');
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const r = root.getBoundingClientRect();
      state.split = Math.max(0.02, Math.min(0.98, (ev.clientX - r.left) / r.width));
      syncControls();
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
  handle.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    state.split = Math.max(0.02, Math.min(0.98, state.split + (e.key === 'ArrowLeft' ? -0.03 : 0.03)));
    syncControls();
  });

  function bindInput() {
    const pointers = new Map();
    let last = null, pinch = null, moved = 0;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.focus({ preventScroll: true });
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      fly = null;
      moved = 0;
      if (pointers.size === 1) last = { x: e.clientX, y: e.clientY };
      if (pointers.size === 2) {
        const [p1, p2] = [...pointers.values()];
        pinch = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), fov: state.fov };
      }
      root.classList.add('dragging');
    });
    canvas.addEventListener('pointermove', (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinch) {
        const [p1, p2] = [...pointers.values()];
        const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        if (d > 10) zoomBy((pinch.fov * (pinch.d / d)) / state.fov, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
      } else if (pointers.size === 1 && last) {
        moved += Math.abs(e.clientX - last.x) + Math.abs(e.clientY - last.y);
        updateCamera();
        rotateCenter(skyAt(last.x, last.y), skyAt(e.clientX, e.clientY));
        last = { x: e.clientX, y: e.clientY };
        dirty = true;
      }
      if (e.pointerType === 'mouse') {
        pointerSky = skyAt(e.clientX, e.clientY);
        if (!dirty) updateHud();
      }
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 1) { const p = [...pointers.values()][0]; last = { x: p.x, y: p.y }; }
      if (pointers.size === 0) { last = null; root.classList.remove('dragging'); }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { pointerSky = null; updateHud(); } });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      zoomBy(Math.exp(Math.max(-1, Math.min(1, dy * 0.0016))), e.clientX, e.clientY);
    }, { passive: false });
    canvas.addEventListener('dblclick', (e) => {
      if (moved > 6) return;
      const [ra, dec] = vec2lonlat(fromThree(skyAt(e.clientX, e.clientY)));
      flyTo(ra, dec, state.fov / 2);
    });
    canvas.addEventListener('keydown', (e) => {
      const stepDeg = state.fov * 0.1, k = e.key;
      const cosd = Math.max(0.1, Math.cos(state.dec * DEG));
      if (k === '+' || k === '=') zoomBy(1 / 1.4);
      else if (k === '-' || k === '_') zoomBy(1.4);
      else if (k === 'ArrowLeft') state.ra = (state.ra + stepDeg / cosd + 360) % 360; // Osten liegt links
      else if (k === 'ArrowRight') state.ra = (state.ra - stepDeg / cosd + 360) % 360;
      else if (k === 'ArrowUp') state.dec = Math.min(90, state.dec + stepDeg);
      else if (k === 'ArrowDown') state.dec = Math.max(-90, state.dec - stepDeg);
      else return;
      e.preventDefault();
      fly = null;
      dirty = true;
    });
  }

  // --- Aktivierung -------------------------------------------------------------------------------------
  function start() {
    if (raf || fatal) return;
    dirty = true;
    lastFrame = 0;
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  function setActive(on) {
    on = !!on;
    if (on === active) return;
    active = on;
    if (on) {
      if (!inited) init(); // WebGL erst beim ersten Öffnen der Ansicht anlegen
      resize();
      start();
    } else {
      stop();
      fly = null;
      net.queue.length = 0; // laufende Downloads dürfen fertig werden, neue starten nicht
    }
  }
  // Falls der Aufrufer setActive nicht nutzt: Sichtbarkeit der Ansicht (Klasse „active“) selbst beobachten
  new MutationObserver(() => setActive(container.classList.contains('active'))).observe(container, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (active) start(); });

  syncControls();
  if (container.classList.contains('active')) setActive(true);
  return { setActive };
}
