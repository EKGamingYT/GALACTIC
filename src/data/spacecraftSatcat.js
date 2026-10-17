// Laden des vollständigen CelesTrak-Satellitenkatalogs (SATCAT) zur Laufzeit.
// Quelle: CelesTrak, T. S. Kelso – https://celestrak.org/pub/satcat.csv (CORS: Access-Control-Allow-Origin: *).
// Die CSV (≈ 7 MB, ≈ 70 000 Objekte) wird im Browser per Cache-API zwischengespeichert und höchstens
// einmal pro Tag neu geladen (CelesTrak aktualisiert den Katalog täglich und bittet um sparsame Abrufe).
// Rückfall: Ist CelesTrak nicht erreichbar oder drosselt (HTTP 403), wird die mit scripts/fetch-satcat.mjs
// erzeugte Momentaufnahme public/data/satcat.json vom eigenen Server geladen.

export const SATCAT_URL = 'https://celestrak.org/pub/satcat.csv';
export const SATCAT_INFO_URL = 'https://celestrak.org/satcat/satcat-format.php';
const CACHE_NAME = 'galactic-satcat-v1';
const SNAPSHOT_URL = `${import.meta.env?.BASE_URL ?? '/'}data/satcat.json`;
const MAX_AGE_MS = 24 * 3600 * 1000;
const BACKOFF_MS = 6 * 3600 * 1000; // nach Fehlschlag CelesTrak 6 h lang nicht erneut anfragen
const BACKOFF_KEY = 'galactic.satcat.liveBlockedUntil';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* egal */ } };

const TYPE_IDX = { PAY: 0, 'R/B': 1, DEB: 2, UNK: 3 };
export const TYPE_KEYS = ['PAY', 'R/B', 'DEB', 'UNK'];
const ACTIVE = new Set(['+', 'P', 'B', 'S', 'X']);

let memo = null; // { rows, fetched, fromCache }
let pending = null;

function splitCsv(line) {
  if (!line.includes('"')) return line.split(',');
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
const num = (s) => (s === '' || s == null ? null : (Number.isFinite(+s) ? +s : null));

export function parseSatcat(text) {
  const lines = text.split(/\r?\n/);
  const head = splitCsv(lines[0]).map((h) => h.trim());
  const ix = (k) => head.indexOf(k);
  const I = {
    name: ix('OBJECT_NAME'), cospar: ix('OBJECT_ID'), norad: ix('NORAD_CAT_ID'), type: ix('OBJECT_TYPE'), ops: ix('OPS_STATUS_CODE'),
    owner: ix('OWNER'), launch: ix('LAUNCH_DATE'), site: ix('LAUNCH_SITE'), decay: ix('DECAY_DATE'), period: ix('PERIOD'),
    incl: ix('INCLINATION'), apo: ix('APOGEE'), peri: ix('PERIGEE'), rcs: ix('RCS'), center: ix('ORBIT_CENTER'), otype: ix('ORBIT_TYPE'),
  };
  if (I.name < 0 || I.norad < 0 || I.cospar < 0) throw new Error('Unerwartetes SATCAT-Format (Spaltenköpfe fehlen).');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    const f = splitCsv(l);
    const norad = parseInt(f[I.norad], 10);
    if (!Number.isFinite(norad)) continue;
    const launch = f[I.launch] || '';
    const t = TYPE_IDX[f[I.type]] ?? 3;
    const ops = f[I.ops] || '';
    const decay = f[I.decay] || '';
    rows.push({
      norad, name: f[I.name] || '', cospar: f[I.cospar] || '', type: TYPE_KEYS[t], ti: t, ops,
      owner: f[I.owner] || 'UNK', launch, year: launch ? +launch.slice(0, 4) : null, site: f[I.site] || '', decay,
      period: num(f[I.period]), incl: num(f[I.incl]), apo: num(f[I.apo]), peri: num(f[I.peri]), rcs: num(f[I.rcs]),
      center: f[I.center] || '', otype: f[I.otype] || '',
      inOrbit: !decay, active: ACTIVE.has(ops),
      key: '', // Suchschlüssel, unten gesetzt
    });
  }
  for (const r of rows) r.key = `${r.name.toUpperCase()}|${r.cospar}|${r.norad}`;
  return rows;
}

async function readWithProgress(resp, onProgress) {
  const total = +resp.headers.get('content-length') || 0;
  if (!resp.body || !resp.body.getReader) { const t = await resp.text(); onProgress?.(1, t.length, total); return t; }
  const reader = resp.body.getReader();
  const dec = new TextDecoder('utf-8');
  let got = 0; let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.byteLength;
    text += dec.decode(value, { stream: true });
    onProgress?.(total ? got / total : null, got, total);
  }
  text += dec.decode();
  return text;
}

// Momentaufnahme (kompaktes JSON aus scripts/fetch-satcat.mjs) in Zeilenobjekte umwandeln
function fromSnapshot(j) {
  const iso = (d) => (d ? new Date((d - 20000) * 86400000).toISOString().slice(0, 10) : ''); // 0 = keine Angabe
  const names = j.name.split('\n'), cos = j.cospar.split('\n');
  const rows = new Array(j.anzahl);
  let norad = 0; let start = 0;
  for (let i = 0; i < j.anzahl; i++) {
    norad += j.norad[i];
    const ti = +j.typ[i];
    start += j.start[i];
    const launch = iso(start); const decay = iso(j.decay[i]); const ops = j.ops[j.op[i]] || '';
    rows[i] = {
      norad, name: names[i], cospar: cos[i], type: TYPE_KEYS[ti] || 'UNK', ti, ops, owner: j.owners[j.owner[i]] || 'UNK',
      launch, year: launch ? +launch.slice(0, 4) : null, site: j.sites[j.site[i]] || '', decay,
      period: j.period[i], incl: j.incl[i], apo: j.apo[i], peri: j.peri[i], rcs: j.rcs[i], center: j.centers[j.center[i]] || '', otype: j.otypes[j.otype[i]] || '',
      inOrbit: !decay, active: ACTIVE.has(ops), key: `${names[i].toUpperCase()}|${cos[i]}|${norad}`,
    };
  }
  return { rows, stand: Date.parse(j.stand) || null };
}

async function openCache() {
  try { return typeof caches !== 'undefined' ? await caches.open(CACHE_NAME) : null; } catch { return null; }
}

// onProgress(anteil 0..1 | null, bytes, gesamtBytes, phase)
export function loadSatcat({ force = false, onProgress } = {}) {
  if (memo && !force) return Promise.resolve(memo);
  if (pending && !force) return pending;
  pending = (async () => {
    const cache = await openCache();
    let text = null; let fetched = null; let fromCache = false; let snapshot = null; let liveError = null;
    if (cache && !force) {
      try {
        const hit = await cache.match(SATCAT_URL);
        if (hit) {
          const at = +hit.headers.get('x-galactic-fetched') || 0;
          if (Date.now() - at < MAX_AGE_MS) {
            onProgress?.(null, 0, 0, 'cache');
            text = await hit.text(); fetched = at; fromCache = true;
          }
        }
      } catch { /* Cache defekt – neu laden */ }
    }
    if (text == null) {
      try {
        if (!force && +lsGet(BACKOFF_KEY) > Date.now()) throw new Error('CelesTrak zuletzt nicht erreichbar – erneuter Versuch später');
        // Zeitlimit nur bis zum Eintreffen der Antwort-Header (gedrosselte Abrufe hängen sonst lange)
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 12000) : 0;
        let resp;
        try { resp = await fetch(SATCAT_URL, { mode: 'cors', credentials: 'omit', cache: 'no-cache', signal: ctrl?.signal }); }
        finally { clearTimeout(timer); }
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        text = await readWithProgress(resp, (p, g, t) => onProgress?.(p, g, t, 'download'));
        fetched = Date.now();
        lsSet(BACKOFF_KEY, null);
        if (cache) {
          try {
            await cache.put(SATCAT_URL, new Response(text, { headers: { 'content-type': 'text/csv; charset=utf-8', 'x-galactic-fetched': String(fetched) } }));
          } catch { /* Speicher voll – egal */ }
        }
      } catch (e) {
        liveError = e;
        if (!/später$/.test(e.message || '')) lsSet(BACKOFF_KEY, String(Date.now() + BACKOFF_MS));
        // Netzfehler/Drosselung: notfalls veralteten Cache, sonst Momentaufnahme vom eigenen Server
        const old = cache ? await cache.match(SATCAT_URL).catch(() => null) : null;
        if (old) { text = await old.text(); fetched = +old.headers.get('x-galactic-fetched') || null; fromCache = true; }
        else {
          onProgress?.(null, 0, 0, 'snapshot');
          const r = await fetch(SNAPSHOT_URL, { credentials: 'same-origin' });
          if (!r.ok) throw new Error(`CelesTrak: ${e.message || 'nicht erreichbar'}; Momentaufnahme: HTTP ${r.status}`);
          snapshot = fromSnapshot(JSON.parse(await readWithProgress(r, (p, g, t) => onProgress?.(p, g, t, 'snapshot'))));
        }
      }
    }
    onProgress?.(1, 0, 0, 'parse');
    await new Promise((r) => setTimeout(r, 0));
    const rows = snapshot ? snapshot.rows : parseSatcat(text);
    if (snapshot) fetched = snapshot.stand;
    memo = { rows, fetched, fromCache, snapshot: !!snapshot, liveError: liveError ? String(liveError.message || liveError) : null, byNorad: new Map(rows.map((r) => [r.norad, r])), byCospar: new Map(rows.map((r) => [r.cospar, r])) };
    return memo;
  })();
  pending.catch(() => { pending = null; });
  return pending;
}

export const satcatLoaded = () => memo;
