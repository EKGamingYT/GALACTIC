// Erzeugt public/data/satcat.json – eine kompakte Momentaufnahme des CelesTrak-Satellitenkatalogs (SATCAT).
// Das Ingenieurstool lädt den Katalog zur Laufzeit direkt von CelesTrak (CORS erlaubt) und nutzt diese Datei
// nur als Rückfall, falls CelesTrak nicht erreichbar ist oder Abrufe drosselt (HTTP 403 bei zu häufigem Laden).
//
// Aufruf:   node scripts/fetch-satcat.mjs              (lädt https://celestrak.org/pub/satcat.csv)
//           node scripts/fetch-satcat.mjs --in satcat.csv   (verwendet eine bereits geladene CSV)
// Quelle:   CelesTrak, T. S. Kelso – https://celestrak.org/satcat/satcat-format.php
// CelesTrak aktualisiert den Katalog täglich; bitte nicht öfter als nötig abrufen.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSatcat, SATCAT_URL } from '../src/data/spacecraftSatcat.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'public', 'data', 'satcat.json');
const args = process.argv.slice(2);
const inIdx = args.indexOf('--in');

let text;
let stamp;
if (inIdx >= 0) {
  const file = path.resolve(args[inIdx + 1]);
  text = fs.readFileSync(file, 'utf8');
  stamp = fs.statSync(file).mtime.toISOString();
  console.log(`Lese ${file}`);
} else {
  console.log(`Lade ${SATCAT_URL} …`);
  const r = await fetch(SATCAT_URL, { headers: { 'User-Agent': 'GALACTIC-Atlas satcat snapshot (einmalig)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} – CelesTrak drosselt evtl. wiederholte Abrufe; später erneut versuchen oder --in nutzen.`);
  text = await r.text();
  stamp = new Date().toISOString();
}

const rows = parseSatcat(text).sort((a, b) => a.norad - b.norad);
// Spaltenweise gespeichert (deutlich kleiner als Zeilen-JSON): Texte mit Zeilenumbruch verbunden,
// NORAD-Nummern und Datumswerte als Differenzen, wiederkehrende Codes über Wörterbücher.
const dict = () => { const list = []; const map = new Map(); return { list, id: (v) => { if (!map.has(v)) { map.set(v, list.length); list.push(v); } return map.get(v); } }; };
const owners = dict(), sites = dict(), centers = dict(), otypes = dict(), ops = dict();
// Datum → Tage seit 1970-01-01 + 20000 (immer positiv), 0 = keine Angabe
const day = (s) => (s ? Math.round(Date.parse(`${s}T00:00:00Z`) / 86400000) + 20000 : 0);
const delta = (arr) => { let prev = 0; return arr.map((v) => { const d = v - prev; prev = v; return d; }); };
const col = (f) => rows.map(f);
const json = {
  quelle: 'CelesTrak SATCAT (T. S. Kelso), https://celestrak.org/pub/satcat.csv',
  stand: stamp,
  anzahl: rows.length,
  format: 'spaltenweise; norad als Differenzen; start/decay = Tage seit 1970-01-01 + 20000, 0 = keine Angabe (start als Differenzen); typ 0=PAY 1=R/B 2=DEB 3=UNK',
  ops: ops.list, owners: owners.list, sites: sites.list, centers: centers.list, otypes: otypes.list,
  norad: delta(col((r) => r.norad)),
  name: col((r) => r.name).join('\n'),
  cospar: col((r) => r.cospar).join('\n'),
  typ: col((r) => r.ti).join(''),
  op: col((r) => ops.id(r.ops)),
  owner: col((r) => owners.id(r.owner)),
  start: delta(col((r) => day(r.launch))),
  site: col((r) => sites.id(r.site)),
  decay: col((r) => day(r.decay)),
  period: col((r) => r.period),
  incl: col((r) => r.incl),
  apo: col((r) => r.apo),
  peri: col((r) => r.peri),
  rcs: col((r) => r.rcs),
  center: col((r) => centers.id(r.center)),
  otype: col((r) => otypes.id(r.otype)),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(json));
console.log(`${rows.length} Objekte → ${path.relative(root, OUT)} (${(fs.statSync(OUT).size / 1048576).toFixed(2)} MB)`);
