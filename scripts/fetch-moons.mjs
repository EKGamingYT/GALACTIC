// Holt Bahnelemente und physikalische Parameter aller natürlichen Satelliten (Erde, Mars, Jupiter,
// Saturn, Uranus, Neptun, Pluto) vom JPL Solar System Dynamics und schreibt sie nach
// src/data/moons.json. Aufruf: node scripts/fetch-moons.mjs
//
// Quellen (öffentlich, NASA/JPL-Caltech):
//   https://ssd.jpl.nasa.gov/sats/elem/      "Planetary Satellite Mean Elements"
//   https://ssd.jpl.nasa.gov/sats/phys_par/  "Planetary Satellite Physical Parameters"
// JPL bietet dafür keine JSON-API (ssd-api.jpl.nasa.gov/sat_*.api -> 404), daher werden die
// HTML-Tabellen geparst.
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ELEM_URL = 'https://ssd.jpl.nasa.gov/sats/elem/';
const PHYS_URL = 'https://ssd.jpl.nasa.gov/sats/phys_par/';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/moons.json');

// ---------- Planetenorientierung: IAU/WGCCRE 2015 (Archinal et al. 2018), Werte zur Epoche J2000 ----------
// poleRa/poleDec = "Nordpol" im IAU-Sinn (rechte-Hand-Regel zur Bahnebene des Sonnensystems);
// retrograde = true: Eigendrehung läuft gegen diese Richtung, der Drehimpuls zeigt zum Gegenpol.
const PLANETS = {
  earth:   { name: 'Erde',    poleRaDeg: 0.0,      poleDecDeg: 90.0,    retrogradeSpin: false },
  mars:    { name: 'Mars',    poleRaDeg: 317.269,  poleDecDeg: 54.433,  retrogradeSpin: false },
  jupiter: { name: 'Jupiter', poleRaDeg: 268.057,  poleDecDeg: 64.495,  retrogradeSpin: false },
  saturn:  { name: 'Saturn',  poleRaDeg: 40.589,   poleDecDeg: 83.537,  retrogradeSpin: false },
  uranus:  { name: 'Uranus',  poleRaDeg: 257.311,  poleDecDeg: -15.175, retrogradeSpin: true },
  neptune: { name: 'Neptun',  poleRaDeg: 299.334,  poleDecDeg: 42.950,  retrogradeSpin: false }, // 299.36+0.70 sin N, 43.46-0.51 cos N bei J2000
  pluto:   { name: 'Pluto',   poleRaDeg: 132.993,  poleDecDeg: -6.163,  retrogradeSpin: true },
};
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const EPS = 23.4392911 * D2R; // Schiefe der Ekliptik J2000
function vec(ra, dec) { return [Math.cos(dec * D2R) * Math.cos(ra * D2R), Math.cos(dec * D2R) * Math.sin(ra * D2R), Math.sin(dec * D2R)]; }
for (const p of Object.values(PLANETS)) {
  // Drehimpulsrichtung (Spinvektor): bei retrograder Drehung der Gegenpol des IAU-Nordpols
  const ra = p.retrogradeSpin ? (p.poleRaDeg + 180) % 360 : p.poleRaDeg;
  const dec = p.retrogradeSpin ? -p.poleDecDeg : p.poleDecDeg;
  p.spinPoleRaDeg = +ra.toFixed(3);
  p.spinPoleDecDeg = +dec.toFixed(3);
  // Neigung der Drehachse gegen die Ekliptik-Normale (J2000): Nordpol der Ekliptik im ICRF = (0, -sin eps, cos eps)
  const [x, y, z] = vec(ra, dec);
  const cosO = -y * Math.sin(EPS) + z * Math.cos(EPS);
  p.tiltToEclipticDeg = +(Math.acos(cosO) * R2D).toFixed(2);
}
// Achsneigung gegen die eigene Bahnebene (NASA Planetary Fact Sheets / IAU)
const OBLIQUITY = { earth: 23.44, mars: 25.19, jupiter: 3.13, saturn: 26.73, uranus: 97.77, neptune: 28.32, pluto: 122.53 };
for (const [k, v] of Object.entries(OBLIQUITY)) PLANETS[k].obliquityDeg = v;

// ---------- deutsche Namen, Kurzbeschreibungen ----------
const DE_NAME = { moon: 'Mond', ganymede: 'Ganymed', callisto: 'Kallisto' };
const MAJOR = {
  moon: 'Einziger natürlicher Satellit der Erde, mit gebundener Rotation (immer dieselbe Seite zur Erde). Zwischen 1969 und 1972 betraten zwölf Astronauten im Apollo-Programm seine Oberfläche; das Artemis-Programm plant die Rückkehr.',
  phobos: 'Größerer, kartoffelförmiger Marsmond, der den Mars in nur etwa 7,7 Stunden umrundet und ihm langsam näherkommt. Auffällig ist der Einschlagkrater Stickney; Ziel der geplanten JAXA-Mission MMX.',
  deimos: 'Kleinerer und weiter außen kreisender Marsmond mit einer Umlaufzeit von rund 30 Stunden; seine Oberfläche ist von feinem Regolith geglättet.',
  io: 'Vulkanisch aktivster Körper des Sonnensystems: Die Gezeitenreibung durch Jupiter und die anderen Galileischen Monde heizt Io auf, über 400 Vulkane sind aktiv.',
  europa: 'Eisoberfläche über einem globalen Ozean aus flüssigem Wasser, einem der aussichtsreichsten Orte für außerirdisches Leben. Ziel der NASA-Mission Europa Clipper und der ESA-Mission JUICE.',
  ganymede: 'Größter Mond des Sonnensystems (größer als der Merkur) und als einziger Mond mit eigenem Magnetfeld. Unter der Eiskruste liegt vermutlich ein Ozean; Ziel der ESA-Mission JUICE.',
  callisto: 'Äußerster der vier Galileischen Monde mit der am dichtesten verkraterten und ältesten Oberfläche im Sonnensystem. Vermutlich besitzt er einen unterirdischen Ozean.',
  amalthea: 'Unregelmäßig geformter, rötlicher innerer Jupitermond von rund 250 km Länge; 1892 von E. E. Barnard entdeckt, als letzter Mond noch per Auge am Teleskop. Die Sonde Galileo flog 2002 vorbei.',
  mimas: 'Kleiner Eismond, der durch den riesigen Einschlagkrater Herschel (ca. 130 km) an den „Todesstern“ erinnert. Seine Bahn liegt direkt am Rand der Saturnringe (Cassinische Teilung).',
  enceladus: 'Aus dem Südpol schießen Wasserfontänen ins All, entdeckt von der Sonde Cassini; darunter liegt ein globaler salziger Ozean. Die Fontänen speisen den E-Ring des Saturn.',
  tethys: 'Eismond aus nahezu reinem Wassereis mit dem riesigen Krater Odysseus und dem 2.000 km langen Grabensystem Ithaca Chasma. Er teilt seine Bahn mit den Trojanern Telesto und Calypso.',
  dione: 'Eismond mit hellen Eisklippen auf der Rückseite und Gravitationsresonanz zu Enceladus. Die kleinen Monde Helene und Polydeuces begleiten ihn als Trojaner.',
  rhea: 'Zweitgrößter Saturnmond, ein stark verkraterter Eiskörper mit einer extrem dünnen Sauerstoff-Kohlendioxid-Exosphäre.',
  titan: 'Einziger Mond mit dichter Atmosphäre (hauptsächlich Stickstoff) und flüssigen Methanseen und -flüssen auf der Oberfläche. 2005 landete die Sonde Huygens; Ziel der NASA-Mission Dragonfly.',
  hyperion: 'Unregelmäßig geformter, schwammartig durchlöcherter Mond mit chaotischer Rotation; seine Bahn steht in Resonanz mit Titan.',
  iapetus: 'Zweifarbiger Mond: Die vorlaufende Seite (Cassini Regio) ist tiefdunkel, die Gegenseite hell. Ein rund 20 km hoher Gebirgsgrat verläuft entlang seines Äquators.',
  phoebe: 'Dunkler, unregelmäßiger Mond auf rückläufiger Bahn, vermutlich ein eingefangenes Objekt aus dem Kuipergürtel. Cassini flog 2004 vorbei; Phoebe speist den riesigen Phoebe-Ring.',
  miranda: 'Kleinster und innerster der fünf großen Uranusmonde mit extrem zerklüfteter Oberfläche – darunter die Klippe Verona Rupes (bis zu rund 20 km hoch). Von Voyager 2 im Jahr 1986 aufgenommen.',
  ariel: 'Hellster der großen Uranusmonde, mit relativ junger Oberfläche, die von Canyons und Tälern durchzogen ist.',
  umbriel: 'Dunkelster der fünf großen Uranusmonde; eine alte, gleichmäßig dunkle Oberfläche mit dem hellen Ringkrater Wunda.',
  titania: 'Größter Uranusmond (Durchmesser ca. 1.580 km) mit Gräben und Schluchten wie Messina Chasmata; Voyager 2 sah sie 1986.',
  oberon: 'Äußerster der fünf großen Uranusmonde, alt und stark verkratert, mit dunklem Material auf den Kraterböden.',
  triton: 'Größter Neptunmond und mit rückläufiger Bahn vermutlich ein eingefangenes Kuipergürtel-Objekt. Voyager 2 entdeckte 1989 Stickstoffgeysire; seine Bahn schrumpft langsam.',
  nereid: 'Dritt-größter Neptunmond mit einer der exzentrischsten Bahnen aller Monde (e ≈ 0,75) und einer Umlaufzeit von rund 360 Tagen.',
  proteus: 'Zweitgrößter Neptunmond, sehr dunkel und nicht kugelförmig – etwa so groß, wie ein Körper werden kann, ohne durch die eigene Schwerkraft rund zu werden. 1989 von Voyager 2 entdeckt.',
  charon: 'Größter Mond des Zwergplaneten Pluto (etwa halber Pluto-Durchmesser). Pluto und Charon umkreisen einen gemeinsamen Schwerpunkt außerhalb Plutos; New Horizons flog 2015 vorbei und fand die rote Polkappe Mordor Macula.',
};

// ---------- Hilfsfunktionen ----------
const PARENT = { Earth: 'earth', Mars: 'mars', Jupiter: 'jupiter', Saturn: 'saturn', Uranus: 'uranus', Neptune: 'neptune', Pluto: 'pluto' };
const FRAME = {
  ecliptic:   { code: 'ecliptic',   label: 'Ekliptik' },
  Laplace:    { code: 'laplace',    label: 'Laplace-Ebene' },
  equatorial: { code: 'equatorial', label: 'Äquator des Planeten' },
};

async function get(url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'GALACTIC-atlas/1.0 (open-source educational project)' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      if (i === tries) throw new Error(`${url}: ${e.message}`);
      await new Promise(res => setTimeout(res, 1500 * i));
    }
  }
}

const decode = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
// nur bekannte HTML-Tags entfernen, damit Werte wie "<0.0002" erhalten bleiben
const stripTags = s => decode(s.replace(/<\/?(a|td|tr|th|sup|sub|br|span|b|i|em|strong|div|p)\b[^>]*>/gi, ' ')).replace(/\s+/g, ' ').trim();
const num = s => { const v = parseFloat(String(s).replace(/,/g, '')); return Number.isFinite(v) && /^[-+]?[\d.]/.test(String(s).trim()) ? v : null; };
const norm360 = d => ((d % 360) + 360) % 360;
const slug = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function tableRows(html, tableId) {
  const start = html.indexOf(`id="${tableId}"`);
  if (start < 0) throw new Error(`Tabelle ${tableId} nicht gefunden – JPL-Seite geändert?`);
  const end = html.indexOf('</table>', start);
  const body = html.slice(start, end);
  return [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m =>
    // Zellen trennen am öffnenden <td>; schließende Tags fehlen teils (phys_par)
    m[1].split(/<td\b[^>]*>/i).slice(1).map(stripTags)
  ).filter(r => r.length > 5);
}

// "2000-01-01.5" -> Julianisches Datum
function epochToJd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(\.\d+)?$/.exec(s.trim());
  if (!m) throw new Error('Unbekanntes Epochenformat: ' + s);
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return ms / 86400000 + 2440587.5 + (m[4] ? parseFloat(m[4]) : 0);
}

function displayName(raw) {
  const m = /^S(\d{4})_([A-Z])_(\d+)$/.exec(raw);
  if (m) return `S/${m[1]} ${m[2]} ${m[3]}`;
  return raw.replace(/_/g, ' ');
}

// ---------- Hauptprogramm ----------
const [elemHtml, physHtml] = await Promise.all([get(ELEM_URL), get(PHYS_URL)]);

// Physikalische Parameter nach NAIF-Code
const phys = new Map();
for (const r of tableRows(physHtml, 'sat_phys_par')) {
  // Planet, Satellit, Code, GM(wert,sigma,ref), Radius(wert,sigma,ref), Dichte(wert,sigma,ref)
  phys.set(r[2], { gm: num(r[3]), radiusKm: num(r[6]), densityGcm3: num(r[9]) });
}

// Elemente; pro NAIF-Code gewinnt der Eintrag mit der jüngsten Epoche (Puck steht zweimal in der Tabelle)
const rowsByCode = new Map();
for (const r of tableRows(elemHtml, 'sat_elem')) {
  if (r.length < 20) continue;
  const code = r[3];
  const prev = rowsByCode.get(code);
  if (!prev || epochToJd(r[6]) > epochToJd(prev[6])) rowsByCode.set(code, r);
}

const poleOf = parent => ({ raDeg: PLANETS[parent].spinPoleRaDeg, decDeg: PLANETS[parent].spinPoleDecDeg });
const moons = [];
const usedIds = new Set();
for (const r of rowsByCode.values()) {
  const [jplId, planet, rawName, code, ephem, frameRaw, epoch, a, e, w, M, inc, node, P] = r;
  const parent = PARENT[planet];
  if (!parent) { console.warn('Unbekannter Planet übersprungen:', planet, rawName); continue; }
  const fr = FRAME[frameRaw];
  if (!fr) throw new Error('Unbekannter Bezugsrahmen: ' + frameRaw);
  let id = slug(rawName === 'Moon' ? 'moon' : rawName);
  if (usedIds.has(id)) id = `${id}-${parent}`;
  usedIds.add(id);
  const iDeg = num(inc);
  const ph = phys.get(code) || {};
  const m = {
    id,
    name: DE_NAME[id] || displayName(rawName),
    parent,
    naifId: +code,
    major: id in MAJOR,
    ...(id in MAJOR ? { description: MAJOR[id] } : {}),
    aKm: num(a),
    e: num(e),
    iDeg,
    nodeDeg: num(node),
    periDeg: num(w),
    MDeg: M === '' ? null : +norm360(num(M)).toFixed(3),
    epochJd: epochToJd(epoch),
    periodDays: num(P),
    frame: fr.label,
    frameCode: fr.code,
    // Pol der Bezugsebene (ICRF/J2000): Laplace -> Tabellenwert; Äquator -> Spinpol des Planeten; Ekliptik -> null
    framePole: fr.code === 'laplace' ? { raDeg: num(r[16]), decDeg: num(r[17]), tiltDeg: num(r[18]) }
      : fr.code === 'equatorial' ? poleOf(parent) : null,
    retrograde: iDeg != null && iDeg > 90,
    radiusKm: ph.radiusKm ?? null,
    gm: ph.gm ?? null,
    densityGcm3: ph.densityGcm3 ?? null,
    albedo: null, // von JPL SSD für Satelliten nicht angegeben
    ephemeris: ephem || null,
  };
  moons.push(m);
}

// Reihenfolge: Planet, dann große Halbachse
const order = Object.keys(PLANETS);
moons.sort((x, y) => order.indexOf(x.parent) - order.indexOf(y.parent) || x.aKm - y.aKm);

// Plausibilitätsprüfungen
const missingMajor = Object.keys(MAJOR).filter(id => !moons.some(m => m.id === id));
if (missingMajor.length) throw new Error('Große Monde fehlen: ' + missingMajor.join(', '));
const bad = moons.filter(m => [m.aKm, m.e, m.iDeg, m.nodeDeg, m.periDeg, m.periodDays].some(v => v == null || Number.isNaN(v)));
if (bad.length) console.warn('Monde mit unvollständigen Elementen:', bad.map(m => m.name).join(', '));
if (moons.length < 400) throw new Error('Verdächtig wenige Monde: ' + moons.length);

const out = {
  source: 'NASA/JPL Solar System Dynamics – Planetary Satellite Mean Elements (ssd.jpl.nasa.gov/sats/elem/) und Planetary Satellite Physical Parameters (ssd.jpl.nasa.gov/sats/phys_par/); Polorientierung: IAU WGCCRE 2015 (Archinal et al. 2018)',
  fetched: new Date().toISOString().slice(0, 10),
  note: 'Mittlere Bahnelemente. frameCode: ecliptic = J2000-Ekliptik, laplace = lokale Laplace-Ebene (framePole = Pol dieser Ebene in RA/Dec J2000), equatorial = Äquator des Planeten (framePole = Spinpol). Winkel in Grad, Entfernungen in km, Epoche als Julianisches Datum (TDB).',
  planets: PLANETS,
  moons,
};
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out, null, 1) + '\n');

const counts = {};
for (const m of moons) counts[m.parent] = (counts[m.parent] || 0) + 1;
console.log(`${moons.length} Monde -> ${OUT}`);
console.log(counts);
console.log('mit Radius:', moons.filter(m => m.radiusKm != null).length, '| major:', moons.filter(m => m.major).length, '| rückläufig:', moons.filter(m => m.retrograde).length);
