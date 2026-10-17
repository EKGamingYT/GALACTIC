// HiPS-Bausteine (Hierarchical Progressive Surveys, Fernique et al. 2015) für three.js:
// HEALPix-Mathematik (NESTED-Schema, Górski et al. 2005), Koordinaten, Kachel-URLs der CDS-Server,
// Sichtbarkeitstest, Kachel-Geometrie und ein Kachel-Lader mit Cache, Warteschlange und Rückfall-Server.
// Gemeinsam genutzt vom Himmelsbetrachter (src/views/sky.js) und vom Sternenhimmel des 3D-Sonnensystems
// (src/views/system.js). Bewusst ohne Aladin Lite (GPL) – alles hier selbst umgesetzt.
// Kachel-Orientierung an hellen Sternen geprüft: Bildzeile (von oben) ↔ ix, Bildspalte ↔ iy.
//
// Koordinaten der Kachel-Geometrie: „three-äquatorial“ – Himmelsvektor (x zum Frühlingspunkt, z zum
// Himmelsnordpol) als three.js-Vektor (x, z, −y), also y = Himmelsnordpol (siehe toThree).
import * as THREE from 'three';

export const DEG = Math.PI / 180;
export const CDS = 'https://alasky.cds.unistra.fr';
export const CDS_MIRROR = 'https://alaskybis.cds.unistra.fr';

// --- HEALPix (NESTED) --------------------------------------------------------------------------------
const JRLL = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4];
const JPLL = [1, 3, 5, 7, 0, 2, 4, 6, 1, 3, 5, 7];
export function nest2xyf(order, ipix) {
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
export function fxy2vec(face, x, y) {
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
// Winkel (rad) eines Bildpunkts einer Kachel der Ordnung `order` mit `width` Pixeln Kantenlänge
export const tilePixelAngle = (order, width) => Math.sqrt((4 * Math.PI) / (12 * 4 ** order)) / width;

// --- Koordinaten ------------------------------------------------------------------------------------
// ICRS → galaktisch (J2000, Hipparcos-Definition)
export const EQ2GAL = [
  [-0.0548755604162154, -0.873437090234885, -0.4838350155487132],
  [0.4941094278755837, -0.4448296299600112, 0.7469822444972189],
  [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669],
];
export const eq2gal = (v) => EQ2GAL.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
export const gal2eq = (v) => [0, 1, 2].map((i) => EQ2GAL[0][i] * v[0] + EQ2GAL[1][i] * v[1] + EQ2GAL[2][i] * v[2]);
export function lonlat2vec(lon, lat) {
  const a = lon * DEG, d = lat * DEG;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}
export function vec2lonlat(v) {
  const r = Math.hypot(v[0], v[1], v[2]) || 1;
  let lon = Math.atan2(v[1], v[0]) / DEG;
  if (lon < 0) lon += 360;
  return [lon, Math.asin(Math.max(-1, Math.min(1, v[2] / r))) / DEG];
}
// Himmelsvektor (x zum Frühlingspunkt, z zum Himmelsnordpol) ↔ three.js (y oben); reine Drehung, keine Spiegelung
export const toThree = (v) => new THREE.Vector3(v[0], v[2], -v[1]);
export const fromThree = (v) => [v.x, -v.z, v.y];

// --- Auswahl der Kacheln -----------------------------------------------------------------------------
// Feinste sinnvolle Ordnung: ein Kachel-Bildpunkt höchstens ~1,4 Bildschirmpunkte groß
export function orderForPixel(def, pxAngle) {
  let o = 0;
  while (o < def.maxOrder && tilePixelAngle(o, def.width) > pxAngle * 1.4) o++;
  return o;
}
// Halber Öffnungswinkel (rad) des Blickkegels, der das ganze Bild (bis in die Ecken) umfasst
export function viewRadius(fovDeg, aspect) {
  const tv = Math.tan((fovDeg * DEG) / 2), th = tv * aspect;
  return Math.atan(Math.hypot(tv, th));
}
// Mittelpunkt (Einheitsvektor im Kachelrahmen) und Umkreisradius (rad) einer Kachel – zwischengespeichert
const metaCache = new Map();
export function tileMeta(order, ipix) {
  const key = `${order}/${ipix}`;
  let m = metaCache.get(key);
  if (!m) {
    const { face, ix, iy } = nest2xyf(order, ipix), n = 2 ** order;
    const c = fxy2vec(face, (ix + 0.5) / n, (iy + 0.5) / n);
    let r = 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0], [0, 0.5], [1, 0.5], [0.5, 1]]) {
      const v = fxy2vec(face, (ix + dx) / n, (iy + dy) / n);
      r = Math.max(r, Math.acos(Math.max(-1, Math.min(1, v[0] * c[0] + v[1] * c[1] + v[2] * c[2]))));
    }
    m = { c, r: r * 1.08 + 1e-4 };
    if (metaCache.size > 20000) metaCache.clear();
    metaCache.set(key, m);
  }
  return m;
}
// Kegeltest: Kachel (Mittelpunkt + Umkreis) gegen Blickkegel, hierarchisch ab den 12 Basisflächen.
// `dir` im Rahmen der Ebene (äquatorial bzw. galaktisch); Ergebnis von der Bildmitte nach außen sortiert.
export function visibleTiles(order, dir, radius, limit = 400) {
  const out = [], stack = [];
  for (let p = 0; p < 12; p++) stack.push([0, p]);
  while (stack.length && out.length < limit) {
    const [o, p] = stack.pop();
    const m = tileMeta(o, p);
    const cosd = m.c[0] * dir[0] + m.c[1] * dir[1] + m.c[2] * dir[2];
    if (Math.acos(Math.max(-1, Math.min(1, cosd))) > m.r + radius) continue;
    if (o === order) out.push({ o, p, d: cosd });
    else for (let k = 0; k < 4; k++) stack.push([o + 1, p * 4 + k]);
  }
  return out.sort((x, y) => y.d - x.d);
}

// Kachel als gekrümmtes Flächenstück der Einheitskugel (three-äquatorial), UV passend zum Kachelbild
export function tileGeometry(def, order, ipix) {
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

export const tileUrl = (def, order, ipix, mirror) =>
  `${mirror ? CDS_MIRROR : CDS}${def.path}/Norder${order}/Dir${Math.floor(ipix / 10000) * 10000}/Npix${ipix}.${def.ext}`;

// --- Kachel-Lader ------------------------------------------------------------------------------------
// Eine „Ebene“ (Laufzeitobjekt r) braucht mindestens { def, cache: Map }. def: { path, ext, maxOrder,
// width, frame: 'eq' | 'gal' }. Je Kachel ein Cache-Eintrag { state: 'loading'|'ready'|'empty'|'error', … };
// makeMesh(r, tex, order, ipix) baut daraus das darzustellende Mesh.
export function createTileLoader({
  maxTiles = 420, maxInflight = 8, layers, makeMesh,
  anisotropy = () => 1, colorSpace = THREE.NoColorSpace,
  canQueue = () => true, onSuccess = () => {}, onFailure = () => {}, onSettled = () => {},
}) {
  const net = { inflight: 0, queue: [], fails: 0, lastOk: 0, MAX: maxInflight };
  let loadedCount = 0, frameId = 0;

  function request(r, order, ipix, prio) {
    const key = `${order}/${ipix}`;
    const e = r.cache.get(key);
    if (e) {
      e.used = performance.now();
      e.wanted = frameId;
      if (e.state !== 'error' || performance.now() < e.retryAt) return e;
      r.cache.delete(key);
    }
    if (canQueue()) net.queue.push({ r, order, ipix, key, prio }); // z. B. während eines Kameraflugs nur Vorhandenes zeigen
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
        tex.colorSpace = colorSpace; // Standard: Werte unverändert durchreichen (ShaderMaterial ohne Farbraum-Umrechnung)
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.anisotropy = anisotropy();
        tex.needsUpdate = true;
        const mesh = makeMesh(r, tex, order, ipix);
        Object.assign(entry, { state: 'ready', mesh, tex, bmp });
        loadedCount++;
        net.fails = 0;
        net.lastOk = performance.now();
        onSuccess(entry);
        break;
      } catch {
        if (entry.aborted) break; // nicht mehr gebraucht (Ansicht hat sich bewegt)
        if (attempt === 0) continue; // einmal über den anderen Server versuchen
        entry.state = 'error';
        entry.retryAt = performance.now() + 15000;
        net.fails++;
        onFailure(net);
      } finally {
        clearTimeout(timer);
      }
    }
    net.inflight--;
    if (r.cache.get(key) !== entry) disposeEntry(entry); // inzwischen verworfen
    evict();
    onSettled();
    pump();
  }

  function disposeEntry(e) {
    if (e.state === 'ready') loadedCount--;
    if (e.mesh) { e.mesh.geometry.dispose(); e.mesh.material.dispose(); }
    if (e.tex) e.tex.dispose();
    if (e.bmp && e.bmp.close) e.bmp.close();
    e.state = 'gone';
  }
  // Am längsten ungenutzte Kacheln freigeben (gerade gezeichnete bzw. dauerhaft gehaltene ausgenommen)
  function evict() {
    if (loadedCount <= maxTiles) return;
    const all = [];
    for (const r of layers()) for (const [k, e] of r.cache) if (e.state === 'ready' && !e.keep && !e.pinned) all.push([e.used, r, k, e]);
    all.sort((x, y) => x[0] - y[0]);
    for (let i = 0; i < all.length && loadedCount > maxTiles * 0.85; i++) {
      const [, r, k, e] = all[i];
      r.cache.delete(k);
      disposeEntry(e);
    }
  }

  return {
    net,
    request,
    pump,
    evict,
    disposeEntry,
    get loadedCount() { return loadedCount; },
    // Neues Bild: Warteschlange wird aus den jetzt sichtbaren Kacheln neu aufgebaut
    beginFrame() { frameId++; net.queue.length = 0; },
    // Downloads für Kacheln, die nicht mehr im Bild sind, abbrechen – sonst blockieren sie die Verbindungen
    abortStale() {
      for (const r of layers()) {
        for (const [k, e] of r.cache) {
          if (e.state === 'loading' && e.wanted !== frameId && performance.now() - e.used > 400 && !e.pinned) {
            e.aborted = true;
            e.ctrl?.abort();
            r.cache.delete(k);
          }
        }
      }
    },
    // grobe Vorschauen zuerst, sonst von der Mitte nach außen
    flush() { net.queue.sort((x, y) => x.prio - y.prio); pump(); },
    // Fehlgeschlagene Kacheln sofort neu versuchen lassen
    clearErrors() {
      for (const r of layers()) for (const [k, e] of r.cache) if (e.state === 'error') r.cache.delete(k);
      net.fails = 0;
      net.lastOk = performance.now();
    },
  };
}

// Sichtbare Kacheln einer Ebene bestimmen, anfordern und je Stelle die beste geladene Auflösung wählen.
// Fehlt eine Kachel, springt die nächstgröbere geladene ein; fehlt jede, wird zusätzlich eine grobe Vorschau
// (3 Ordnungen gröber) angefordert. Setzt r.order/r.pending und die keep-Marken; gibt die zu zeichnenden
// Cache-Einträge zurück.
export function selectTiles(loader, r, order, dir, radius, maxVisible = 160) {
  let tiles = visibleTiles(order, dir, radius);
  while (tiles.length > maxVisible && order > 0) { order--; tiles = visibleTiles(order, dir, radius); }
  r.order = order;
  const draw = new Set();
  const now = performance.now();
  // Vorschau eine Stufe von 3 Ordnungen gröber (1 Kachel statt 64) – erst ab Ordnung 4, grobe Kacheln sind groß
  const coarse = order >= 4 ? order - 3 : -1;
  let pending = 0;
  for (const { o, p } of tiles) {
    const e = loader.request(r, o, p, 1);
    if (e && e.state === 'ready') { e.used = now; draw.add(e); continue; }
    if (!e || e.state === 'loading') pending++;
    let fo = o, fp = p, found = false;
    while (fo > 0 && !found) {
      fo--;
      fp = Math.floor(fp / 4);
      const pe = r.cache.get(`${fo}/${fp}`);
      if (pe && pe.state === 'ready') { pe.used = now; draw.add(pe); found = true; }
    }
    if (!found && coarse >= 0) loader.request(r, coarse, Math.floor(p / 4 ** (o - coarse)), 0);
  }
  r.pending = pending;
  for (const c of r.cache.values()) c.keep = draw.has(c);
  return draw;
}
