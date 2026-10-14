// Holt die offiziellen IAU-Eigennamen (Krater, Berge, Ebenen, Täler …) aller Karten-Körper aus dem
// „Gazetteer of Planetary Nomenclature“ (USGS Astrogeology / IAU WGPSN, gemeinfrei) und schreibt je Körper
// eine kompakte Datei nach src/data/nomenclature/<körperId>.json. Aufruf: node scripts/fetch-nomenclature.mjs [id …]
//
// Quelle: https://planetarynames.wr.usgs.gov  →  GIS-Downloads (KMZ mit Mittelpunkten aller Namen), gehostet unter
//   https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/<ZIEL>_nomenclature_center_pts.kmz
// Dort sind Längen bereits auf „+Ost, −180…180“ umgerechnet (auch für Körper, deren Gazetteer-Seite
// planetographisch „+West“ führt, z. B. Phobos/Stickney 49° W → −49), Breiten in °. Geprüft gegen die Metadaten.
// Format je Datei:  {"src":…, "types":[Typnamen], "f":[[Name, Breite, Länge, Durchmesser km, Typ-Index, Gazetteer-ID], …]}
// sortiert nach Größe (absteigend).
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const BASE = 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/nomenclature');

// Karten-ID → Ziel-Name im Gazetteer
const TARGETS = {
  moon: 'MOON', mars: 'MARS', mercury: 'MERCURY', venus: 'VENUS', titan: 'TITAN', europa: 'EUROPA',
  ganymede: 'GANYMEDE', io: 'IO', callisto: 'CALLISTO', enceladus: 'ENCELADUS', ceres: 'CERES', vesta: 'VESTA',
  mimas: 'MIMAS', dione: 'DIONE', rhea: 'RHEA', tethys: 'TETHYS', iapetus: 'IAPETUS', phoebe: 'PHOEBE',
  phobos: 'PHOBOS', ryugu: 'RYUGU', bennu: 'BENNU',
};
// Auswahl: Krater ab MIN_CRATER_KM, mindestens die größten KEEP_CRATERS, höchstens MAX_CRATERS; alle übrigen
// Typen (Berge, Ebenen, Täler, Regionen …) bleiben erhalten, außer winzigen Zusatztypen.
const MIN_CRATER_KM = 20;
const KEEP_CRATERS = 300;
const MAX_CRATERS = { moon: 1400, mars: 1200, venus: 1000, mercury: 800 };
const DEFAULT_MAX_CRATERS = 700;
const SKIP_TYPES = new Set(['Satellite Feature', 'Astronaut-named features']);
const MIN_OTHER_KM = 3; // bei großen Katalogen Nicht-Krater unter 3 km weglassen (außer Landestellen)

// --- Minimaler ZIP-Leser (KMZ = ZIP, gespeichert oder deflate) – ohne Abhängigkeiten ---
function readZipEntry(buf, test) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++, p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32)) {
    const nameLen = buf.readUInt16LE(p + 28);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (!test(name)) continue;
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const local = buf.readUInt32LE(p + 42);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    return method === 0 ? raw : inflateRawSync(raw);
  }
  throw new Error('KML im KMZ nicht gefunden');
}

const unxml = (s) => s.replace(/&(amp|lt|gt|quot|apos|#\d+);/g, (_, e) => (
  { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e] ?? String.fromCharCode(Number(e.slice(1)))));

function parseKml(xml) {
  const out = [];
  for (const m of xml.matchAll(/<Placemark[^>]*>([\s\S]*?)<\/Placemark>/g)) {
    const block = m[1];
    const name = unxml(block.match(/<name>([\s\S]*?)<\/name>/)?.[1] ?? '').trim();
    const data = {};
    for (const d of block.matchAll(/<SimpleData name="(\w+)">([\s\S]*?)<\/SimpleData>/g)) data[d[1]] = unxml(d[2]);
    const [lon, lat] = (block.match(/<coordinates>([^<]*)<\/coordinates>/)?.[1] ?? '').split(',').map(Number);
    out.push({ name, data, lat, lon });
  }
  return out;
}

const round = (v, n) => Math.round(v * 10 ** n) / 10 ** n;

async function build(id) {
  const url = `${BASE}/${TARGETS[id]}_nomenclature_center_pts.kmz`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const kml = readZipEntry(Buffer.from(await res.arrayBuffer()), (n) => n.endsWith('.kml')).toString('utf8');

  const all = [];
  for (const { name, data, lat, lon } of parseKml(kml)) {
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (data.approval && data.approval !== 'Adopted by IAU') continue; // nur offiziell angenommene Namen
    const type = (data.type ?? '').trim();
    if (SKIP_TYPES.has(type)) continue;
    const dLat = Number(data.max_lat) - Number(data.min_lat);
    let km = Number(data.diameter) || 0;
    if (!km && Number.isFinite(dLat)) km = dLat * 111; // grobe Ersatzgröße aus der Begrenzungsbox
    all.push({
      name,
      lat: round(lat, 2),
      lon: round(((lon + 540) % 360) - 180, 2),
      km: round(km, km < 10 ? 1 : 0),
      type: type.split(',')[0].trim() || 'Feature',
      gid: Number(data.link?.match(/Feature\/(\d+)/)?.[1]) || 0,
    });
  }

  const craters = all.filter((f) => f.type === 'Crater').sort((a, b) => b.km - a.km);
  const nBig = craters.filter((f) => f.km >= MIN_CRATER_KM).length;
  const nKeep = Math.min(craters.length, MAX_CRATERS[id] ?? DEFAULT_MAX_CRATERS, Math.max(nBig, KEEP_CRATERS));
  const others = all.filter((f) => f.type !== 'Crater' && (all.length <= 300 || f.km >= MIN_OTHER_KM || f.type === 'Statio'));
  const kept = [...craters.slice(0, nKeep), ...others].sort((a, b) => b.km - a.km);

  const types = [...new Set(kept.map((f) => f.type))];
  const json = {
    src: 'IAU Gazetteer of Planetary Nomenclature (USGS Astrogeology)',
    total: all.length,
    types,
    f: kept.map((f) => [f.name, f.lat, f.lon, f.km, types.indexOf(f.type), f.gid]),
  };
  // eine Zeile je Eintrag: gut diff-bar und trotzdem kompakt
  const text = `{"src":${JSON.stringify(json.src)},"total":${json.total},"types":${JSON.stringify(types)},"f":[\n${
    json.f.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`;
  await writeFile(resolve(OUT, `${id}.json`), text);
  console.log(`${id.padEnd(9)} ${String(all.length).padStart(5)} Namen → ${String(kept.length).padStart(4)} gespeichert (${(text.length / 1024).toFixed(0)} KB)  Typen: ${types.length}`);
}

await mkdir(OUT, { recursive: true });
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TARGETS);
for (const id of ids) {
  if (!TARGETS[id]) { console.error(`Unbekannter Körper: ${id}`); continue; }
  try { await build(id); } catch (e) { console.error(`${id}: ${e.message}`); }
}
