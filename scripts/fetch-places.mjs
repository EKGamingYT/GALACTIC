// Holt die Ortsnamen der Erde aus Natural Earth (gemeinfrei, naturalearthdata.com; GeoJSON-Spiegel
// github.com/nvkelso/natural-earth-vector) und schreibt kompakte Dateien nach src/data/places/:
//   cities.json    – besiedelte Orte (ne_10m_populated_places), nach Wichtigkeit sortiert
//   countries.json – Staaten/Gebiete (ne_10m_admin_0_countries), nur Beschriftungspunkt
// Aufruf: node scripts/fetch-places.mjs
//
// Format (beide Dateien): {"src":…, "langs":[Sprachcodes], "f":[[Breite, Länge, …, Name je Sprache …], …]}
//   cities:    [lat, lon, minZoom, Kennung (0 Ort, 1 Regionalhauptstadt, 2 Hauptstadt), …Namen]
//   countries: [lat, lon, minLabel, maxLabel, …Namen]
// minZoom/minLabel/maxLabel sind die Natural-Earth-Kartenzoomstufen (Web-Mercator, 256-px-Kacheln), ab/bis zu
// denen ein Name erscheinen soll. Namen: Index 0 = Englisch; ein leerer Eintrag heißt „wie Englisch“
// (spart Platz, die Anzeige fällt dann auf Englisch zurück). Namen = Wikidata-Übersetzungen aus Natural Earth.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/places');
// Sprachen der Auswahl (Reihenfolge = Spalten in den Dateien; en muss vorn stehen)
const LANGS = ['en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'tr', 'ru', 'zh', 'ja', 'ar'];

const get = async (file) => {
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res.json();
};
const r3 = (v) => Math.round(v * 1000) / 1000;
const r1 = (v) => Math.round(v * 10) / 10;
const clean = (s) => (typeof s === 'string' ? s.trim() : '');

// Namen je Sprache; was gleich dem englischen Namen ist (oder fehlt), bleibt leer
function names(p) {
  const en = clean(p.NAME_EN) || clean(p.NAME);
  return [en, ...LANGS.slice(1).map((l) => {
    const v = clean(p[`NAME_${l.toUpperCase()}`]);
    return v && v !== en ? v : '';
  })];
}

async function cities() {
  const data = await get('ne_10m_populated_places.geojson');
  const SKIP = new Set(['Scientific station', 'Meteorological Station', 'Historic place']);
  const rows = [];
  for (const { properties: p, geometry } of data.features) {
    if (SKIP.has(p.FEATURECLA)) continue;
    const [lon, lat] = geometry.coordinates;
    const cap = p.FEATURECLA === 'Admin-0 capital' ? 2 : /capital/.test(p.FEATURECLA) && /region/.test(p.FEATURECLA) ? 1 : 0;
    rows.push({ pop: p.POP_MAX ?? 0, row: [r3(lat), r3(lon), r1(p.MIN_ZOOM ?? 7), cap, ...names(p)] });
  }
  // wichtigste zuerst: kleinere Zoomstufe, dann Hauptstadt, dann Einwohner
  rows.sort((a, b) => a.row[2] - b.row[2] || b.row[3] - a.row[3] || b.pop - a.pop);
  return rows.map((r) => r.row);
}

async function countries() {
  const data = await get('ne_10m_admin_0_countries.geojson');
  const rows = [];
  for (const { properties: p } of data.features) {
    if (p.TYPE === 'Lease' || p.LABEL_X == null || p.LABEL_Y == null) continue;
    rows.push({ pop: p.POP_EST ?? 0, row: [r3(p.LABEL_Y), r3(p.LABEL_X), r1(p.MIN_LABEL ?? 3), r1(p.MAX_LABEL ?? 7), ...names(p)] });
  }
  rows.sort((a, b) => a.row[2] - b.row[2] || b.pop - a.pop); // wichtigste zuerst
  return rows.map((r) => r.row);
}

await mkdir(OUT, { recursive: true });
for (const [file, build, src] of [
  ['cities.json', cities, 'Natural Earth 10m Populated Places'],
  ['countries.json', countries, 'Natural Earth 10m Admin 0 – Countries'],
]) {
  const f = await build();
  const text = JSON.stringify({ src: `${src} (gemeinfrei)`, langs: LANGS, f });
  await writeFile(resolve(OUT, file), text);
  console.log(`${file}: ${f.length} Einträge, ${(Buffer.byteLength(text) / 1024).toFixed(0)} kB`);
}
