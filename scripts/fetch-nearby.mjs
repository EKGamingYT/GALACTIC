// Holt alle Sterne (inkl. Weisser/Brauner Zwerge, jede Komponente von Mehrfachsystemen) innerhalb von
// 50 Lichtjahren um die Sonne samt bestaetigten Exoplaneten und schreibt src/data/nearbystars.json.
// Aufruf: node scripts/fetch-nearby.mjs [--full] [--debug] [--trace=<regex>]   (Node >= 20, keine Abhaengigkeiten)
//   --full: Herkunfts-/Pruefdaten (SIMBAD-Kennung, Gaia-/NASA-Gegenwerte) mitschreiben; Umgebungsvariable FETCH_CACHE=<Ordner> cached TAP-Antworten (Entwicklung).
//
// Quellen (alle offen nutzbar, Quellenangabe Pflicht – siehe CREDITS.md):
//   1. CDS SIMBAD TAP  https://simbad.cds.unistra.fr/simbad/sim-tap/sync
//      Stern-Kandidaten (plx_value >= 62 mas), Komponenten (Tabelle h_link / Nachbarschaftssuche),
//      Koordinaten, Spektraltyp, V-Helligkeit, Bezeichner. Wenger et al. 2000, A&AS 143, 9.
//      Nutzung frei, "This research has made use of the SIMBAD database, operated at CDS, Strasbourg, France".
//   2. ESA Gaia DR3 TAP  https://gea.esac.esa.int/tap-server/tap/sync
//      Parallaxen (Gaia Collaboration 2023, A&A 674, A1), Vollstaendigkeits- und Entfernungs-Gegenprobe.
//      Lizenz CC BY-SA 3.0 IGO (ESA/Gaia/DPAC).
//   3. NASA Exoplanet Archive TAP  https://exoplanetarchive.ipac.caltech.edu/TAP/sync  (Tabelle pscomppars)
//      Planeten (sy_dist <= 15.6 pc) und Sternparameter der Planetenwirte (Teff, Masse, Radius).
//      NASA/Caltech-IPAC, oeffentlich frei nutzbar mit Quellenangabe.
// Es werden keine Daten chinesischer Agenturen verwendet (Spektraltypen mit RAA/ChJAA-Bibcode werden verworfen).
//
// Methodik
//  - Entfernung = 1000 / Parallaxe (pc) * 3.26156 (Lj). Grenze 50 Lj <=> Parallaxe >= 65.24 mas.
//  - Komponenten enger Mehrfachsterne (< 60") teilen sich die genaueste Parallaxe; Gaia-Werte mit RUWE > 1.4
//    gelten als unzuverlaessig und werden bei Begleitern durch den Wert der Hauptkomponente ersetzt.
//  - colorHex: Schwarzkoerper-Naeherung (Planck-Kurve nach Kim et al. 2002 -> CIE xy -> sRGB) aus Teff;
//    ohne gemessene Teff aus dem Spektraltyp (Skala nach Pecaut & Mamajek 2013, Weisse Zwerge Teff = 50400/Typ).
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = process.env.OUT || resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/nearbystars.json');
const SIMBAD = 'https://simbad.cds.unistra.fr/simbad/sim-tap/sync';
const GAIA = 'https://gea.esac.esa.int/tap-server/tap/sync';
const NASA = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';

const LY_PER_PC = 3.261563777;
const MAX_LY = 50;
const MIN_PLX = 1000 / (MAX_LY / LY_PER_PC); // 65.231 mas
const PRE_PLX = 62; // SIMBAD-Vorauswahl (grosszuegig, wird spaeter anhand der adoptierten Parallaxe beschnitten)
const D2R = Math.PI / 180;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- TAP-Hilfsfunktion
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
// Optionaler Entwicklungs-Cache (nur wenn FETCH_CACHE=<Ordner> gesetzt ist): identische Anfragen werden von der Platte gelesen
const CACHE = process.env.FETCH_CACHE || null;
async function tap(url, adql, { tries = 8, big = false } = {}) {
  let last;
  const ckey = CACHE ? resolve(CACHE, createHash('sha1').update(url + adql + big).digest('hex') + '.json') : null;
  if (ckey) { try { return JSON.parse(await readFile(ckey, 'utf8')); } catch { /* kein Cache-Treffer */ } }
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': UA },
        body: new URLSearchParams({ REQUEST: 'doQuery', LANG: 'ADQL', FORMAT: 'json', QUERY: adql }),
        signal: AbortSignal.timeout(240000),
      });
      let txt = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200).replace(/\s+/g, ' ')}`);
      // 64-bit-Gaia-IDs duerfen nicht als JSON-Zahl geparst werden (Genauigkeitsverlust) -> in Strings umwandeln
      if (big) txt = txt.replace(/([\[,:\s])(\d{16,20})(?=[,\]\s}])/g, '$1"$2"');
      const j = JSON.parse(txt);
      let rows;
      if (Array.isArray(j)) rows = j; // NASA liefert ein Array von Objekten
      else {
        const cols = j.metadata.map((m) => m.name);
        rows = j.data.map((r) => Object.fromEntries(r.map((v, k) => [cols[k], v])));
      }
      if (ckey) { await mkdir(CACHE, { recursive: true }); await writeFile(ckey, JSON.stringify(rows)); }
      return rows;
    } catch (e) {
      last = e;
      await sleep(Math.min(20000, 1500 * (i + 1)));
    }
  }
  throw new Error(`TAP-Anfrage fehlgeschlagen (${url}): ${last?.message}\n${adql.slice(0, 300)}`);
}
async function chunked(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await fn(items.slice(i, i + size))));
  return out;
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ---------------------------------------------------------------- Astronomie-Hilfen
function sepArcsec(a, b) {
  const d1 = a.dec * D2R, d2 = b.dec * D2R, dr = (a.ra - b.ra) * D2R;
  const h = Math.sin((d1 - d2) / 2) ** 2 + Math.cos(d1) * Math.cos(d2) * Math.sin(dr / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h))) / D2R * 3600;
}
const lyOf = (plx) => (1000 / plx) * LY_PER_PC;

// Spektraltyp -> Teff (Pecaut & Mamajek 2013, Zwerge; L/T/Y nach Filippazzo et al. 2015, gerundet)
const SCALE = [
  [0, 31500], [2, 20600], [5, 15700], [8, 12500], [10, 9700], [12, 8970], [15, 8080], [17, 7800], [20, 7220], [22, 6930],
  [25, 6510], [28, 6170], [30, 5920], [32, 5770], [35, 5660], [38, 5490], [40, 5280], [42, 5040], [43, 4830], [44, 4600],
  [45, 4410], [47, 4070], [50, 3850], [51, 3660], [52, 3560], [53, 3430], [54, 3210], [55, 3060], [56, 2810], [57, 2680],
  [58, 2570], [59, 2380], [60, 2300], [65, 1700], [69, 1350], [70, 1300], [73, 1150], [76, 950], [78, 750], [79, 600],
  [80, 450], [81, 400], [82, 350], [84, 300],
];
const LETTER_BASE = { O: -5, B: 0, A: 10, F: 20, G: 30, K: 40, M: 50, L: 60, T: 70, Y: 80 };
function teffFromSpectral(sp) {
  if (!sp) return null;
  if (/^D[A-Z]/.test(sp)) { // Weisse Zwerge: Teff ~ 50400 / Typzahl, ohne Zahl Standardwert
    const n = /(\d+(?:\.?\d*)?)/.exec(sp);
    return n ? Math.round(Math.min(50400 / parseFloat(n[1]), 80000)) : 8000;
  }
  const m = /([OBAFGKMLTY])\s*(\d+(?:\.\d+)?)?/.exec(sp.replace(/^(?:sd|d|g|esd|usd)(?=[OBAFGKMLTY])/, ''));
  if (!m) return null;
  const idx = LETTER_BASE[m[1]] + (m[2] !== undefined ? parseFloat(m[2]) : 5);
  if (idx <= SCALE[0][0]) return SCALE[0][1];
  for (let i = 1; i < SCALE.length; i++) {
    if (idx <= SCALE[i][0]) {
      const [x0, t0] = SCALE[i - 1], [x1, t1] = SCALE[i];
      return Math.round(t0 + ((t1 - t0) * (idx - x0)) / (x1 - x0));
    }
  }
  return SCALE[SCALE.length - 1][1];
}

// Schwarzkoerper-Farbe: Planck-Ort nach Kim et al. (2002) -> XYZ -> linear sRGB -> normiert -> Gamma
function blackbodyHex(T) {
  T = Math.min(25000, Math.max(1667, T));
  const x = T <= 4000
    ? -0.2661239e9 / T ** 3 - 0.2343589e6 / T ** 2 + 0.8776956e3 / T + 0.17991
    : -3.0258469e9 / T ** 3 + 2.1070379e6 / T ** 2 + 0.2226347e3 / T + 0.24039;
  const y = T <= 2222
    ? -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683
    : T <= 4000
      ? -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867
      : 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483;
  const X = x / y, Y = 1, Z = (1 - x - y) / y;
  let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  let g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  let b = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  r = Math.max(r, 0); g = Math.max(g, 0); b = Math.max(b, 0);
  const mx = Math.max(r, g, b) || 1;
  const enc = (c) => {
    c /= mx;
    c = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0');
  };
  return '#' + enc(r) + enc(g) + enc(b);
}

// ---------------------------------------------------------------- Namen
const GREEK = { alf: 'Alpha', bet: 'Beta', gam: 'Gamma', del: 'Delta', eps: 'Epsilon', zet: 'Zeta', eta: 'Eta', tet: 'Theta', iot: 'Iota', kap: 'Kappa', lam: 'Lambda', mu: 'Mu', nu: 'Nu', ksi: 'Xi', omi: 'Omicron', pi: 'Pi', rho: 'Rho', sig: 'Sigma', tau: 'Tau', ups: 'Upsilon', phi: 'Phi', chi: 'Chi', psi: 'Psi', ome: 'Omega' };
const CON = { And: 'Andromedae', Ant: 'Antliae', Aps: 'Apodis', Aqr: 'Aquarii', Aql: 'Aquilae', Ara: 'Arae', Ari: 'Arietis', Aur: 'Aurigae', Boo: 'Bootis', Cae: 'Caeli', Cam: 'Camelopardalis', Cnc: 'Cancri', CVn: 'Canum Venaticorum', CMa: 'Canis Majoris', CMi: 'Canis Minoris', Cap: 'Capricorni', Car: 'Carinae', Cas: 'Cassiopeiae', Cen: 'Centauri', Cep: 'Cephei', Cet: 'Ceti', Cha: 'Chamaeleontis', Cir: 'Circini', Col: 'Columbae', Com: 'Comae Berenices', CrA: 'Coronae Australis', CrB: 'Coronae Borealis', Crv: 'Corvi', Crt: 'Crateris', Cru: 'Crucis', Cyg: 'Cygni', Del: 'Delphini', Dor: 'Doradus', Dra: 'Draconis', Equ: 'Equulei', Eri: 'Eridani', For: 'Fornacis', Gem: 'Geminorum', Gru: 'Gruis', Her: 'Herculis', Hor: 'Horologii', Hya: 'Hydrae', Hyi: 'Hydri', Ind: 'Indi', Lac: 'Lacertae', Leo: 'Leonis', LMi: 'Leonis Minoris', Lep: 'Leporis', Lib: 'Librae', Lup: 'Lupi', Lyn: 'Lyncis', Lyr: 'Lyrae', Men: 'Mensae', Mic: 'Microscopii', Mon: 'Monocerotis', Mus: 'Muscae', Nor: 'Normae', Oct: 'Octantis', Oph: 'Ophiuchi', Ori: 'Orionis', Pav: 'Pavonis', Peg: 'Pegasi', Per: 'Persei', Phe: 'Phoenicis', Pic: 'Pictoris', Psc: 'Piscium', PsA: 'Piscis Austrini', Pup: 'Puppis', Pyx: 'Pyxidis', Ret: 'Reticuli', Sge: 'Sagittae', Sgr: 'Sagittarii', Sco: 'Scorpii', Scl: 'Sculptoris', Sct: 'Scuti', Ser: 'Serpentis', Sex: 'Sextantis', Tau: 'Tauri', Tel: 'Telescopii', Tri: 'Trianguli', TrA: 'Trianguli Australis', Tuc: 'Tucanae', UMa: 'Ursae Majoris', UMi: 'Ursae Minoris', Vel: 'Velorum', Vir: 'Virginis', Vol: 'Volantis', Vul: 'Vulpeculae' };

// Kuratierte Namen (Schluessel = SIMBAD main_id, Leerzeichen normalisiert). Deutsche / gebraeuchliche Namen.
const NAME_DE = {
  '* alf Cen A': 'Alpha Centauri A', '* alf Cen B': 'Alpha Centauri B', 'NAME Proxima Centauri': 'Proxima Centauri',
  "NAME Barnard's star": 'Barnards Pfeilstern', 'NAME Luhman 16A': 'Luhman 16 A', 'NAME Luhman 16B': 'Luhman 16 B',
  'WISEA J085510.74-071442.5': 'WISE 0855-0714', 'Wolf 359': 'Wolf 359', 'HD 95735': 'Lalande 21185',
  '* alf CMa': 'Sirius A', '* alf CMa B': 'Sirius B', 'G 272-61A': 'Luyten 726-8 A', 'G 272-61B': 'Luyten 726-8 B',
  'G 272-61C': 'Luyten 726-8 C', 'CD-23 14742': 'Ross 154', 'Ross 248': 'Ross 248', '* eps Eri': 'Epsilon Eridani',
  'HD 217987': 'Lacaille 9352', 'Ross 128': 'Ross 128', 'V* EZ Aqr': 'EZ Aquarii',
  '* 61 Cyg A': '61 Cygni A', '* 61 Cyg B': '61 Cygni B', '* alf CMi': 'Procyon A', '* alf CMi B': 'Procyon B',
  'HD 173739': 'Struve 2398 A', 'HD 173740': 'Struve 2398 B', 'HD 1326': 'Groombridge 34 A', 'HD 1326B': 'Groombridge 34 B',
  'G 51-15': 'DX Cancri', '* eps Ind': 'Epsilon Indi A', '* eps Ind B': 'Epsilon Indi B', '* tau Cet': 'Tau Ceti',
  'L 372-58': 'Gliese 1061', 'V* YZ Cet': 'YZ Ceti', 'BD+05 1668': 'Luytens Stern', "NAME Teegarden's Star": 'Teegardens Stern',
  'HD 33793': 'Kapteyns Stern', 'V* AX Mic': 'Lacaille 8760', 'HD 239960A': 'Kruger 60 A', 'HD 239960B': 'Kruger 60 B',
  'Ross 614': 'Ross 614 A', 'BD-12 4523': 'Wolf 1061', 'Wolf 28': 'van Maanens Stern', 'V* AD Leo': 'AD Leonis',
  'V* EV Lac': 'EV Lacertae', 'V* YZ CMi': 'YZ Canis Minoris', 'HD 131977': 'Gliese 570 A', 'HD 131976': 'Gliese 570 BC',
  'GJ 570 D': 'Gliese 570 D', 'SCR J1845-6357': 'SCR 1845-6357 A', 'SCR J1845-6357B': 'SCR 1845-6357 B',
  '* 70 Oph A': '70 Ophiuchi A', '* 70 Oph B': '70 Ophiuchi B', '* 36 Oph A': '36 Ophiuchi A', '* 36 Oph B': '36 Ophiuchi B',
  'V* V2215 Oph': '36 Ophiuchi C', '* omi02 Eri': '40 Eridani A', '* omi02 Eri B': '40 Eridani B',
  '* omi02 Eri C': '40 Eridani C', '* alf Aql': 'Altair', '* sig Dra': 'Sigma Draconis',
  '* eta Cas': 'Eta Cassiopeiae A', '* eta Cas B': 'Eta Cassiopeiae B', 'BD+44 2051': 'Gliese 412 A', 'BD+44 2051B': 'Gliese 412 B',
  'HD 42581': 'Gliese 229 A', 'HD 42581B': 'Gliese 229 B', 'V* BR Psc': 'BR Piscium', '* del Pav': 'Delta Pavonis',
  '* e Eri': '82 Eridani', 'V* QY Aur': 'QY Aurigae', 'EGGR 180': 'Stein 2051 B',
  'Wolf 424': 'Wolf 424', 'Wolf 424 A': 'Wolf 424 A', 'Wolf 424 B': 'Wolf 424 B', 'Ross 614B': 'Ross 614 B',
  'G 175-34': 'Stein 2051 A', 'HD 180617': 'Gliese 752 A', 'VB 10': 'Gliese 752 B (van Biesbroeck 10)',
  // --- 50-Lj-Erweiterung: deutsche / gebraeuchliche Namen heller Sterne
  '* alf Lyr': 'Wega', '* alf Boo': 'Arktur', '* alf Boo B': 'Arktur B', '* alf Aur': 'Kapella', 'G 96-29A': 'Kapella H', 'G 96-29B': 'Kapella L',
  '* bet Gem': 'Pollux', '* alf PsA': 'Fomalhaut', '* bet Leo': 'Denebola', '* bet Vir': 'Zavijava', '* gam Vir': 'Porrima A', '* gam Vir B': 'Porrima B',
  '* alf Oph': 'Rasalhague', '* alf Cep': 'Alderamin', '* alf Crv': 'Alchiba', '* alf Crv B': 'Alchiba B', '* bet Aql': 'Alshain', '* bet Aql B': 'Alshain B',
  '* gam Cep': 'Errai', '* bet CVn': 'Chara', '* del Eri': 'Rana', '* del Cap': 'Deneb Algedi', '* eta Boo': 'Muphrid',
  '* iot UMa A': 'Talitha A', 'NAME * iot UMa BC': 'Talitha BC',
  '* rho01 Cnc': '55 Cancri A', '* rho01 Cnc B': '55 Cancri B', '* ups And': 'Upsilon Andromedae A', '* 47 UMa': '47 Ursae Majoris',
};
// Namen der bereits in der 20-Lj-Fassung vorhandenen Sterne, die nicht ueber NAME_DE/Bezeichner entstanden (bleiben unveraendert)
const KEEP_NAMES = {
  "* 61 Cyg": "61 Cygni",
  "BD+59 1915": "BD+59 1915",
  "IRAS 00156+4344": "IRAS 00156+4344",
  "DENIS J104814.6-395606": "DENIS 1048-3956",
  "WISE J072227.27-054029.9": "WISE 0722-0540",
  "HD 225213": "Gliese 1",
  "G 3-33": "Gliese 83.1",
  "BD+68 946": "Gliese 687",
  "CD-46 11540": "Gliese 674",
  "LP 731-58": "Gliese 3622",
  "LAWD 37": "Gliese 440",
  "BD-15 6290": "Gliese 876",
  "G 208-44": "Gliese 1245 A",
  "G 208-45": "Gliese 1245 B",
  "L 143-23": "Gliese 3618",
  "G 158-27": "Gliese 1002",
  "DENIS J025503.3-470049": "DENIS 0255-4700",
  "HD 88230": "Gliese 380",
  "WISE J163940.83-684738.6": "WISE 1639-6847",
  "HD 204961": "Gliese 832",
  "G 158-50": "Gliese 1005",
  "CD-44 11909": "Gliese 682",
  "2MASS J09393548-2448279": "2MASS 0939-2448",
  "G 9-38B": "Gliese 1116 B",
  "G 9-38A": "Gliese 1116 A",
  "2MASS J15065257+7027247": "2MASS 1506+7027",
  "G 99-49": "Gliese 3379",
  "2MASS J08173001-6155158": "2MASS 0817-6155",
  "G 254-29": "Gliese 445",
  "UCAC4 195-119117": "UCAC4 195-119117",
  "LP 656-38": "Gliese 3323",
  "2MASS J02540788+0223563": "2MASS 0254+0223",
  "HD 119850": "Gliese 526",
  "HD 265866": "Gliese 251",
  "LP 816-60": "LP 816-60",
  "2MASS J11145133-2618235": "2MASS 1114-2618",
  "WISE J035000.32-565830.2": "WISE 0350-5658",
  "WISEP J174124.25+255319.5": "WISE 1741+2553",
  "LSR J1835+3259": "LSR 1835+3259",
  "HD 36395": "Gliese 205",
  "2MASSI J0415195-093506": "2MASS 0415-0935",
  "Gaia DR3 6305165514134625024": "Gaia DR3 6305165514134625024",
  "Ross 47": "Gliese 213",
  "L 205-128": "Gliese 693",
  "L 347-14": "Gliese 754",
  "CD-40 9712": "Gliese 588",
  "HD 155876": "Gliese 661",
  "WISE J154151.65-225024.9": "WISE 1541-2250",
  "HD 191408": "Gliese 783 A",
  "IRAS 20079-3614": "Gliese 783",
  "SIMP J013656.5+093347.3": "SIMP 0136+0933",
  "2MASSI J0937347+293142": "2MASS 0937+2931",
};
// Mehrfachsysteme, deren Einzelkomponenten SIMBAD nicht als eigene Objekte fuehrt (werden aufgeteilt; Spektraltyp aus
// der "A+B"-Angabe, sonst Gesamtangabe des Systems; Einzelhelligkeit unbekannt -> null)
const SPLIT = {
  'Epsilon Indi B': ['Epsilon Indi Ba', 'Epsilon Indi Bb'],
  'EZ Aquarii': ['EZ Aquarii A', 'EZ Aquarii B', 'EZ Aquarii C'], // GJ 866 A/B/C = Luyten 789-6 (Bezeichner in SIMBAD)
};
const MULTI_COMPONENT = /\s(A|B|C|D|AB|BC|Aa|Ab|Ba|Bb)$/;

// IAU-NameExoWorlds-Namen von Planetenwirten (Copernicus, Titawin ...) sind im Alltag unueblich -> Bayer/Flamsteed/Katalogname bevorzugen
const EXO_NAMES = new Set(['Copernicus', 'Titawin', 'Chalawan', 'Helvetios', 'Cervantes', 'Brahe', 'Galileo', 'Harriot', 'Janssen', 'Lipperhey', 'Tadmor', 'Fortitudo', 'Veritate', 'Draugr', 'Poltergeist', 'Phobetor', 'Taphao Thong', 'Taphao Kaew', 'Ogma', 'Dimidium', 'Majriti', 'Gumiao', 'Fulu', 'Intercrus', 'Spe', 'Naqaya', 'Cayahuanca']);
const SUP = { 1: '¹', 2: '²', 3: '³' };
function parseBayer(str, greekOnly) {
  const m = /^\* ([a-z]{2,3})\.?(\d{0,2}) ([A-Za-z]{2,3})(?: ([A-Z][a-z]?|[A-Z]{2}))?$/.exec(str) || (!greekOnly && /^\* (\d{1,3})() ([A-Za-z]{2,3})(?: ([A-Z][a-z]?|[A-Z]{2}))?$/.exec(str));
  if (!m) return null;
  const isGreek = !!GREEK[m[1]];
  if (greekOnly && !isGreek) return null;
  const num = m[2] ? (SUP[+m[2]] || m[2]) : '';
  const con = CON[m[3]] || m[3];
  return `${isGreek ? GREEK[m[1]] + num : m[1]} ${con}${m[4] ? ' ' + m[4] : ''}`;
}
function identNames(idents, mainId) {
  // idents: Liste von SIMBAD-Bezeichnern des Objekts (mainId zuerst bevorzugt, damit Komponenten konsistent benannt werden)
  const ids = [...new Set([norm(mainId), ...idents.map(norm)])];
  const nm = ids.find((x) => x.startsWith('NAME ') && !EXO_NAMES.has(x.slice(5)));
  if (nm) return nm.slice(5).replace(/^\* /, '');
  for (const x of ids) { const b = parseBayer(x, true); if (b) return b; }
  for (const x of ids) { const b = parseBayer(x, false); if (b) return b; }
  const gj = ids.find((x) => /^(GJ|Gl) \d+(\.\d+)?(?: ?[A-Z]{1,2})?$/.test(x));
  if (gj) return gj.replace(/^(GJ|Gl) /, 'Gliese ');
  return null;
}
function shortSurvey(name) {
  // "2MASS J15065257+7027247" -> "2MASS J1506+7027", "WISE J035000.32-565830.2" -> "WISE 0350-5658"
  let m = /^(2MASS[IWP]? J|WISE[PA]? J|DENIS J|SDSS J|ULAS J|UGPS J|SIMP J|LSR J|SCR J|LP J|CWISE J)(\d{2})(\d{2})[\d.]*([+-]\d{2})(\d{2})/.exec(name);
  if (m) {
    const pre = m[1].replace(/ J$/, '').replace(/^(2MASS)[IWP]$/, '$1').replace(/^WISE[PA]$/, 'WISE');
    return `${pre} ${m[2]}${m[3]}${m[4]}${m[5]}`;
  }
  return name;
}
const slug = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ---------------------------------------------------------------- Beschreibungen (kuratiert, systemweise)
const DESC = {
  'alpha-centauri': 'Das der Sonne nächste Sternsystem (rund 4,3 Lichtjahre): Alpha Centauri A und B umkreisen einander in etwa 80 Jahren, der Rote Zwerg Proxima Centauri begleitet sie in großem Abstand. Um Proxima kreist mit Proxima b ein Planet mit mindestens Erdmasse in der habitablen Zone.',
  'barnards-pfeilstern': 'Roter Zwerg im Sternbild Schlangenträger mit der größten bekannten Eigenbewegung aller Sterne (rund 10,4 Bogensekunden pro Jahr). Es sind mehrere sehr kleine, enge Planeten nachgewiesen.',
  'wolf-359': 'Sehr leuchtschwacher Roter Zwerg im Sternbild Löwe in knapp 8 Lichtjahren Entfernung und ein typischer Flare-Stern mit häufigen Strahlungsausbrüchen. Er ist nur mit dem Teleskop zu sehen.',
  sirius: 'Sirius ist der hellste Stern des Nachthimmels (−1,46 mag) in rund 8,6 Lichtjahren Entfernung. Sirius A ist ein weißer Hauptreihenstern; sein Begleiter Sirius B war der erste entdeckte Weiße Zwerg, beide umkreisen einander in etwa 50 Jahren.',
  'epsilon-eridani': 'Junger, sonnenähnlicher Stern (K2V) im Sternbild Eridanus, etwa 10,5 Lichtjahre entfernt, umgeben von Staub- und Trümmerscheiben. Er besitzt mindestens einen Gasriesen, Epsilon Eridani b.',
  'tau-ceti': 'Sonnenähnlicher Stern (G8V) in knapp 12 Lichtjahren Entfernung mit einer Trümmerscheibe. Mehrere Planeten mit wenigen Erdmassen wurden aus Radialgeschwindigkeitsdaten abgeleitet, ihre Existenz ist teils umstritten.',
  'ross-128': 'Ruhiger Roter Zwerg im Sternbild Jungfrau in etwa 11 Lichtjahren Entfernung. Der Planet Ross 128 b umläuft ihn in rund 10 Tagen und gilt als gemäßigter Gesteinsplanet.',
  'luyten-726-8': 'Doppelsystem aus zwei Roten Zwergen (Gliese 65) in rund 8,7 Lichtjahren Entfernung. Die Komponente B ist als UV Ceti der Namensgeber der Klasse der Flare-Sterne.',
  procyon: 'Procyon ist der achthellste Stern des Nachthimmels (Kleiner Hund), rund 11,5 Lichtjahre entfernt: ein gelblich-weißer Unterriese (F5) mit einem lichtschwachen Weißen Zwerg als Begleiter, die einander in etwa 41 Jahren umkreisen.',
  '61-cygni': 'Weites Doppelsystem zweier orangefarbener Zwerge (K5V/K7V) im Sternbild Schwan, rund 11,4 Lichtjahre entfernt. Friedrich Wilhelm Bessel bestimmte hier 1838 erstmals die Entfernung eines Fixsterns per Parallaxe.',
  'teegardens-stern': 'Sehr leuchtschwacher Roter Zwerg (M7) im Sternbild Widder, erst 2003 entdeckt. Er hat mindestens zwei Planeten mit erdähnlicher Masse (Teegarden’s Star b und c) in der Nähe der habitablen Zone.',
  'epsilon-indi': 'System aus dem orangefarbenen Zwergstern Epsilon Indi A und einem engen Paar Brauner Zwerge (Ba/Bb) in knapp 12 Lichtjahren Entfernung. Um A kreist der Gasriese Epsilon Indi Ab, der 2024 mit dem James-Webb-Weltraumteleskop direkt abgebildet wurde.',
  'lalande-21185': 'Heller Roter Zwerg (M2V) im Sternbild Großer Bär in rund 8,3 Lichtjahren Entfernung, mit einem Planetensystem aus mehreren Planeten. Er ist einer der hellsten Roten Zwerge am Himmel der Nordhalbkugel.',
  'yz-ceti': 'Roter Zwerg im Sternbild Walfisch in rund 12 Lichtjahren Entfernung mit einem kompakten System aus mindestens drei erdgroßen Planeten, deren Umlaufzeiten nur wenige Tage betragen.',
  'gliese-1061': 'Sehr kühler Roter Zwerg (M5,5) im Sternbild Uhr in rund 12 Lichtjahren Entfernung mit drei bekannten Planeten (b, c, d); die äußeren Planeten c und d liegen am Rand beziehungsweise innerhalb der habitablen Zone.',
  'luhman-16': 'Das mit rund 6,5 Lichtjahren der Sonne nächste Paar Brauner Zwerge (L7,5 und T0,5), 2013 anhand von Daten des Weltraumteleskops WISE entdeckt und das drittnächste Sternsystem überhaupt.',
  'wise-0855-0714': 'Kältester bekannter Braune-Zwerg-ähnlicher Himmelskörper (um 250 K) in rund 7,4 Lichtjahren Entfernung, 2014 anhand von WISE-Daten entdeckt.',
  'kapteyns-stern': 'Roter Unterzwerg aus dem Halo der Milchstraße mit sehr hoher Eigenbewegung (rund 8,7 Bogensekunden pro Jahr); er ist mit etwa 11 Milliarden Jahren deutlich älter als die Sonne.',
  // --- 50-Lj-Erweiterung: weitere bemerkenswerte Systeme
  wega: 'Wega (Alpha Lyrae) ist mit 0,03 mag der fünfthellste Stern des Nachthimmels und bildet mit Atair und Deneb das Sommerdreieck, rund 25 Lichtjahre entfernt. Der schnell rotierende weiße Stern (A0 V) besitzt eine Staubscheibe und diente lange als Nullpunkt der Helligkeitsskala.',
  arktur: 'Arktur (Alpha Bootis) ist mit −0,05 mag der hellste Stern des Nordhimmels und der vierthellste des gesamten Nachthimmels, rund 37 Lichtjahre entfernt. Der orangefarbene Rote Riese (K1,5 III) hat etwa den 25-fachen Sonnendurchmesser und eine sehr hohe Eigenbewegung.',
  kapella: 'Kapella (Alpha Aurigae), rund 43 Lichtjahre entfernt, ist der sechsthellste Stern des Nachthimmels. Er besteht aus zwei gelben Riesensternen, die einander in etwa 104 Tagen umkreisen; in großem Abstand folgt ein Paar Roter Zwerge (Kapella H und L).',
  pollux: 'Pollux (Beta Geminorum) ist mit 1,14 mag der hellste Stern der Zwillinge, rund 34 Lichtjahre entfernt. Der orangefarbene Riese (K0 III) wird von einem Gasplaneten mit mindestens gut zwei Jupitermassen umkreist (Pollux b, Umlaufzeit rund 590 Tage).',
  fomalhaut: 'Fomalhaut (Alpha Piscis Austrini), rund 25 Lichtjahre entfernt, ist der hellste Stern des Südlichen Fisches. Der junge weiße Stern (A4 V) ist von einem breiten Staubring umgeben; das 2008 mit Hubble abgebildete Objekt Fomalhaut b erwies sich später als Staubwolke.',
  castor: 'Castor (Alpha Geminorum) ist ein Sechsfachsystem in rund 50 Lichtjahren Entfernung: Die Sterne A und B umkreisen einander in mehreren Jahrhunderten und sind selbst enge Doppelsterne. Castor C (YY Geminorum) ist ein weiter entferntes, sich gegenseitig bedeckendes Paar Roter Zwerge.',
  denebola: 'Denebola (Beta Leonis) bildet den Schwanz des Löwen und ist rund 36 Lichtjahre entfernt. Der weiße Hauptreihenstern (A3 V) leuchtet etwa 14-mal stärker als die Sonne und zeigt einen Infrarotüberschuss, der auf eine Staubscheibe hindeutet.',
  alderamin: 'Alderamin (Alpha Cephei) ist ein rasch rotierender weißer Stern (A8 V) im Kepheus in rund 49 Lichtjahren Entfernung. Wegen der Präzession der Erdachse wird er um das Jahr 7500 der Polarstern sein.',
  rasalhague: 'Rasalhague (Alpha Ophiuchi), rund 49 Lichtjahre entfernt, ist der hellste Stern des Schlangenträgers. Der weiße Stern (A5 IV) rotiert sehr schnell und ist deutlich abgeplattet; ein enger Begleiter umkreist ihn in etwa 8,6 Jahren.',
  porrima: 'Porrima (Gamma Virginis) ist ein Doppelsystem zweier fast gleich heller Sterne der Klasse F0 in rund 39 Lichtjahren Entfernung. Sie umkreisen einander in etwa 170 Jahren auf einer stark elliptischen Bahn und standen 2005 nur rund 0,4 Bogensekunden auseinander.',
  altair: 'Altair (Alpha Aquilae) ist mit 0,76 mag der zwölfthellste Stern des Nachthimmels und Teil des Sommerdreiecks, rund 17 Lichtjahre entfernt. Er rotiert in nur etwa 9 Stunden einmal um seine Achse und ist dadurch deutlich abgeplattet.',
  '40-eridani': '40 Eridani (Omikron² Eridani) ist ein Dreifachsystem in gut 16 Lichtjahren Entfernung: ein orangefarbener Hauptstern, der Weiße Zwerg B als einer der ersten entdeckten Weißen Zwerge und der Rote Zwerg C. In „Star Trek“ liegt bei diesem Stern der Planet Vulkan.',
  'eta-cassiopeiae': 'Eta Cassiopeiae ist ein sonnenähnliches Doppelsystem (F9 V und K7 V) in rund 19 Lichtjahren Entfernung im Sternbild Kassiopeia; die beiden Sterne umkreisen einander in etwa 480 Jahren.',
  'beta-hydri': 'Beta Hydri (Kleine Wasserschlange), rund 24 Lichtjahre entfernt, ist ein sonnenähnlicher Stern, der mit rund 6 bis 7 Milliarden Jahren deutlich älter und bereits etwas aufgebläht ist – ein Ausblick auf die Zukunft unserer Sonne.',
  'gliese-876': 'Gliese 876 ist ein Roter Zwerg im Wassermann in rund 15 Lichtjahren Entfernung und war einer der ersten Roten Zwerge mit nachgewiesenen Planeten. Die Planeten c, b und e stehen in einer Laplace-Resonanz (Umlaufzeiten im Verhältnis 1 : 2 : 4).',
  'hd-219134': 'HD 219134 (Gliese 892) ist ein orangefarbener Zwergstern (K3 V) in der Kassiopeia, gut 21 Lichtjahre entfernt und mit bloßem Auge gerade sichtbar. Sechs Planeten sind bekannt, darunter HD 219134 b als einer der nächstgelegenen Felsplaneten, die vor ihrem Stern vorüberziehen.',
  'gliese-581': 'Gliese 581 ist ein Roter Zwerg (M3 V) in der Waage, rund 20,5 Lichtjahre entfernt, mit mindestens drei bestätigten Planeten (b, c, e). Weitere Kandidaten, darunter das einst als bewohnbar gehandelte Gliese 581 g, gelten als umstritten oder widerlegt.',
  'gliese-667': 'Gliese 667 ist ein Dreifachsystem im Skorpion in rund 24 Lichtjahren Entfernung: Zwei orangefarbene Zwerge (A und B) umkreisen einander eng, der Rote Zwerg C folgt in größerem Abstand. Um Gliese 667 C sind mehrere Planeten bekannt, einige davon in oder nahe der habitablen Zone.',
  'l-98-59': 'L 98-59 ist ein Roter Zwerg im Sternbild Fliegender Fisch in rund 35 Lichtjahren Entfernung mit fünf bestätigten Planeten. Die inneren Planeten sind kleine Felsplaneten und gehören zu den Zielen für Atmosphärenmessungen mit dem James-Webb-Weltraumteleskop.',
  '61-virginis': '61 Virginis ist ein sonnenähnlicher Stern (G6 V) in gut 27 Lichtjahren Entfernung mit einer Staubscheibe. Er wird von drei Planeten mit nur wenigen Erdmassen auf engen Bahnen umkreist.',
  'gliese-436': 'Gliese 436 ist ein Roter Zwerg (M3 V) im Löwen in knapp 32 Lichtjahren Entfernung. Sein Planet Gliese 436 b ist ein heißer Neptun mit 2,6 Tagen Umlaufzeit und trägt einen riesigen, kometenartigen Schweif aus Wasserstoff.',
  '55-cancri': '55 Cancri (Rho¹ Cancri) ist ein Doppelsternsystem in rund 41 Lichtjahren Entfernung. Um die orangegelbe Hauptkomponente A kreisen fünf bestätigte Planeten, darunter die Lava-Supererde 55 Cancri e mit nur 0,7 Tagen Umlaufzeit; in großem Abstand folgt ein Roter Zwerg.',
  'trappist-1': 'TRAPPIST-1 ist ein ultrakühler Roter Zwerg im Wassermann, rund 41 Lichtjahre entfernt und kaum größer als Jupiter. Seine sieben etwa erdgroßen Gesteinsplaneten mit Umlaufzeiten von 1,5 bis 19 Tagen wurden 2016/2017 entdeckt; drei davon liegen in der habitablen Zone.',
  'hd-40307': 'HD 40307 ist ein orangefarbener Zwergstern (K2,5 V) im Sternbild Maler in rund 42 Lichtjahren Entfernung. Mehrere Super-Erden wurden über die Radialgeschwindigkeit gefunden; Planet g umkreist den Stern in rund 198 Tagen nahe der habitablen Zone.',
  'upsilon-andromedae': 'Upsilon Andromedae ist ein Doppelstern in rund 44 Lichtjahren Entfernung. Um den gelblich-weißen Hauptstern (F9 V) kreisen mindestens drei Planeten – 1999 das erste bekannte Mehrplanetensystem um einen Hauptreihenstern. Die IAU nennt den Stern Titawin.',
  '47-ursae-majoris': '47 Ursae Majoris ist ein sonnenähnlicher Stern (G1 V) im Großen Bären in rund 45 Lichtjahren Entfernung. Drei Gasriesen umkreisen ihn auf weiten Bahnen; die IAU nennt den Stern Chalawan.',
  'lhs-1140': 'LHS 1140 ist ein kleiner Roter Zwerg im Walfisch in rund 49 Lichtjahren Entfernung. Die Super-Erde LHS 1140 b liegt in der habitablen Zone und ist ein aussichtsreiches Ziel für Atmosphärenuntersuchungen mit dem James-Webb-Weltraumteleskop.',
  'gliese-1214': 'Gliese 1214 ist ein Roter Zwerg im Schlangenträger in knapp 48 Lichtjahren Entfernung. Sein Planet Gliese 1214 b, ein Mini-Neptun mit gut dem 2,7-fachen Erdradius, gehört zu den am besten untersuchten Exoplaneten; seine Atmosphäre ist von dichten Dunstschichten verhüllt.',
};
// Systemnamen (Slug) erzwingen, wenn die automatische Ableitung abweicht
const SYSTEM_SLUG_BY_NAME = { 'Barnards Pfeilstern': 'barnards-pfeilstern' };

// ================================================================ Hauptablauf
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);

const STAR_COLS = 'b.oid, b.main_id, b.ra, b.dec, b.plx_value AS plx, b.plx_err AS plxerr, b.plx_bibcode AS plxbib, b.sp_type AS sp, b.sp_bibcode AS spbib, b.otype, f.V AS vmag';
const STAR_FROM = 'FROM basic AS b LEFT JOIN allfluxes AS f ON f.oidref = b.oid';
const isStarType = (o) => /\*/.test(o || '') && !/^Pl/.test(o || '');
// Keine Daten chinesischer Agenturen/Surveys: LAMOST-Objekte werden verworfen, Spektraltypen mit RAA/ChJAA-Bibcode ignoriert
const CN_BIB = /RAA|ChJAA|ChA&A|ChPhL|SciSn/;
const isCN = (r) => /^LAMOST/i.test(r.main_id || '');
const REAL_STAR_OTYPES = new Set(['PM*', 'LM*', 'BD*', 'WD*', 'Em*', 'BY*', 'Er*', 'SB*', '**', 'Fl*', 'RS*', 'EB*']);

// 1) SIMBAD-Kandidaten
log('SIMBAD: Kandidaten mit Parallaxe >=', PRE_PLX, 'mas ...');
const cand0 = (await tap(SIMBAD, `SELECT ${STAR_COLS} ${STAR_FROM} WHERE b.plx_value >= ${PRE_PLX}`)).filter((r) => isStarType(r.otype));
log('  Kandidaten:', cand0.length);

const all = new Map(); // oid -> Stern
const add = (r, extra = {}) => { if (!all.has(r.oid)) all.set(r.oid, { ...r, ...extra }); return all.get(r.oid); };
cand0.forEach((r) => add(r, { origin: 'simbad' }));

// 2) Komponenten ueber SIMBAD-Hierarchie (h_link), zwei Ebenen
const parentOf = new Map(); // child oid -> [parent oid]
const removedParents = new Set();
let frontier = [...all.keys()];
for (let level = 0; level < 2 && frontier.length; level++) {
  const rows = await chunked(frontier, 60, (ch) =>
    tap(SIMBAD, `SELECT h.parent AS parent, ${STAR_COLS} FROM h_link AS h JOIN basic AS b ON b.oid = h.child LEFT JOIN allfluxes AS f ON f.oidref = b.oid WHERE h.parent IN (${ch.join(',')})`));
  const next = [];
  for (const r of rows) {
    if (!isStarType(r.otype) || isCN(r)) continue;
    if (r.plx == null && r.sp == null) continue; // namenlose Hintergrundobjekte ohne Daten
    if (!all.has(r.oid)) { add(r, { origin: 'h_link' }); next.push(r.oid); }
    if (!parentOf.has(r.oid)) parentOf.set(r.oid, []);
    parentOf.get(r.oid).push(r.parent);
    removedParents.add(r.parent);
  }
  frontier = next;
}
// Ein Elternobjekt mit genau EINEM Kind "... B/C/D" ist in SIMBAD meist die Hauptkomponente A selbst (z.B. * zet Her + * zet Her B) -> behalten
{
  const kidsOf = new Map();
  for (const [kid, ps] of parentOf) for (const p of ps) { if (!kidsOf.has(p)) kidsOf.set(p, new Set()); kidsOf.get(p).add(kid); }
  for (const p of [...removedParents]) {
    const kids = [...(kidsOf.get(p) || [])];
    const po = all.get(p);
    if (kids.length === 1 && po?.plx != null && /\s(B|C|D|Ba|Bb|BC)$/.test(norm(all.get(kids[0])?.main_id)) && !/^\*\* /.test(norm(po.main_id))) removedParents.delete(p);
  }
}
log('  nach Hierarchie:', all.size, '| Elternobjekte (zusammengesetzt):', removedParents.size);

// 3) Begleiter ohne eigene Parallaxe per Positionssuche (22")
const baseList = [...all.values()].filter((s) => s.plx != null);
const neighbours = await chunked(baseList, 25, (ch) => {
  const cones = ch.map((s) => `CONTAINS(POINT('ICRS', b.ra, b.dec), CIRCLE('ICRS', ${s.ra}, ${s.dec}, 0.006)) = 1`).join(' OR ');
  return tap(SIMBAD, `SELECT ${STAR_COLS} ${STAR_FROM} WHERE (${cones}) AND b.plx_value IS NULL`);
});
// nur echte Sterne (Spektraltyp oder Eigenbewegungs-/Doppelstern-Typ), keine namenlosen Gaia-Hintergrundquellen
for (const r of neighbours) if (isStarType(r.otype) && !isCN(r) && !all.has(r.oid) && (r.sp != null || REAL_STAR_OTYPES.has(r.otype))) add(r, { origin: 'cone' });
log('  nach Positionssuche:', all.size);

// 4) Bezeichner (inkl. Gaia-DR3-ID) fuer alle Objekte
const idents = new Map(); // oid -> [id]
async function loadIdents(oids) {
  const rows = await chunked(oids, 60, (ch) => tap(SIMBAD, `SELECT oidref, id FROM ident WHERE oidref IN (${ch.join(',')})`));
  for (const r of rows) { if (!idents.has(r.oidref)) idents.set(r.oidref, []); idents.get(r.oidref).push(r.id); }
}
await loadIdents([...all.keys()]);
const gaiaIdOf = (oid) => (idents.get(oid) || []).map((s) => /^Gaia DR3 (\d+)$/.exec(s)?.[1]).find(Boolean) || null;

// 5) Gaia-DR3-Vollstaendigkeitspruefung: alle Gaia-Quellen mit Parallaxe >= 160 mas
log('Gaia DR3: unabhaengige Liste (parallax >= 63 mas) ...');
const gaiaCols = 'source_id, ra, dec, parallax, parallax_error, ruwe, phot_g_mean_mag';
const gaiaList = await tap(GAIA, `SELECT ${gaiaCols} FROM gaiadr3.gaia_source WHERE parallax >= 63 AND parallax_over_error > 5`, { big: true });
const known = new Set([...all.keys()].map(gaiaIdOf).filter(Boolean));
const missing = gaiaList.filter((g) => !known.has(String(g.source_id)));
log('  Gaia-Quellen:', gaiaList.length, '| nicht in SIMBAD-Auswahl:', missing.length);
const addedFromGaia = [];
if (missing.length) {
  const rows = await chunked(missing.map((g) => `Gaia DR3 ${g.source_id}`), 50, (ch) =>
    tap(SIMBAD, `SELECT i.id AS gid, ${STAR_COLS} FROM ident AS i JOIN basic AS b ON b.oid = i.oidref LEFT JOIN allfluxes AS f ON f.oidref = b.oid WHERE i.id IN (${ch.map(q).join(',')})`));
  for (const r of rows) {
    if (!isStarType(r.otype) || all.has(r.oid) || removedParents.has(r.oid)) continue;
    add(r, { origin: 'gaia-completeness' }); addedFromGaia.push(r.main_id);
  }
  await loadIdents([...all.keys()].filter((o) => !idents.has(o)));
  const stillMissing = missing.filter((g) => ![...all.keys()].some((o) => gaiaIdOf(o) === String(g.source_id)));
  for (const g of stillMissing) log('  WARNUNG: Gaia-Quelle ohne SIMBAD-Objekt:', g.source_id, 'plx', g.parallax);
  log('  aus Gaia-Abgleich ergaenzt:', addedFromGaia.length, addedFromGaia.join('; ').slice(0, 300));
}
const gaiaById = new Map(gaiaList.map((g) => [String(g.source_id), g]));
// Gaia-Daten fuer alle Sterne mit Gaia-ID nachladen (auch ausserhalb der Liste, z.B. RUWE-Pruefung)
const needG = [...all.keys()].map(gaiaIdOf).filter((id) => id && !gaiaById.has(id));
const extraG = await chunked(needG, 80, (ch) => tap(GAIA, `SELECT ${gaiaCols} FROM gaiadr3.gaia_source WHERE source_id IN (${ch.join(',')})`, { big: true }));
extraG.forEach((g) => gaiaById.set(String(g.source_id), g));

// 6) Aufbau der Sternliste: zusammengesetzte Eltern entfernen, Parallaxen vererben
let stars = [];
for (const s of all.values()) {
  const gid = gaiaIdOf(s.oid);
  const g = gid ? gaiaById.get(gid) : null;
  s.gaia = g ? { plx: g.parallax, err: g.parallax_error, ruwe: g.ruwe } : null;
  s.id = idents.get(s.oid) || [];
  s.mainId = norm(s.main_id);
  if (removedParents.has(s.oid)) { s.isParent = true; continue; }
  stars.push(s);
}
// Zusammengesetzte Sammeleintraege ohne h_link (z.B. "Wolf 424" neben "Wolf 424 A/B"): Doppelstern-Objekt mit >= 2 Einzelsternen < 8"
// Zusaetzlich (50-Lj-Fassung): Sammeleintrag "X" neben den Komponenten "XA", "XB" (gleicher Namensstamm, < 8"), z.B. LHS 1234 + LHS 1234A/B
const isCompOf = (parentMain, kidMain) => kidMain.startsWith(parentMain) && /^\s?(A|B|C|D|AB|BC|Aa|Ab|Ba|Bb)$/.test(kidMain.slice(parentMain.length));
for (const s of [...stars]) {
  const byRule = s.otype === '**' || /\+/.test(s.sp || '');
  const fixed = !!(NAME_DE[s.mainId] || KEEP_NAMES[s.mainId]);
  const nameKids = fixed ? [] : stars.filter((o) => o !== s && sepArcsec(s, o) < 60 && isCompOf(s.mainId, o.mainId));
  // Sammeleintrag nur, wenn eine Komponente "A" existiert (sonst ist der Eintrag selbst der Hauptstern, z.B. HD 4391 + 4391B/C/D)
  const nameOk = nameKids.length >= 2 && nameKids.some((o) => /^\s?A[a-z]?$/.test(o.mainId.slice(s.mainId.length)));
  const near = byRule ? stars.filter((o) => o !== s && sepArcsec(s, o) < 8) : [];
  const kids = near.length >= 2 ? near : (nameOk ? nameKids : []);
  if (kids.length < 2) continue;
  stars.splice(stars.indexOf(s), 1);
  s.isParent = true;
  for (const k of kids) {
    if (!parentOf.has(k.oid)) parentOf.set(k.oid, []);
    parentOf.get(k.oid).push(s.oid);
    if (kids === nameKids && k.sp == null && s.sp && !s.sp.includes('+') && !CN_BIB.test(s.spbib || '')) { k.sp = s.sp; k.spbib = s.spbib; k.spFromParent = true; }
  }
}
// Eltern-Parallaxe vererben (z.B. Alpha Cen: Akeson et al. 2021 genauer als Hipparcos-Einzelwerte)
for (const s of stars) {
  const ps = (parentOf.get(s.oid) || []).map((o) => all.get(o)).filter((p) => p?.plx != null);
  const best = ps.sort((a, b) => (a.plxerr ?? 99) - (b.plxerr ?? 99))[0];
  if (best && (s.plx == null || (best.plxerr ?? 99) < (s.plxerr ?? 99))) {
    s.plx = best.plx; s.plxerr = best.plxerr; s.plxbib = best.plxbib; s.plxFrom = 'Elternobjekt ' + norm(best.main_id);
  }
}
// Nachbarn aus Positionssuche: Parallaxe des naechsten Kandidaten
for (const s of stars) {
  if (s.plx != null) continue;
  const near = stars.filter((o) => o !== s && o.plx != null).map((o) => [sepArcsec(s, o), o]).sort((a, b) => a[0] - b[0])[0];
  if (near && near[0] < 30) { s.plx = near[1].plx; s.plxerr = near[1].plxerr; s.plxbib = near[1].plxbib; s.plxFrom = 'Nachbar ' + norm(near[1].main_id); }
}

// 7) Beste eigene Parallaxe je Stern: Gaia (RUWE <= 1.4, kleinerer Fehler) sonst SIMBAD
for (const s of stars) {
  s.own = null;
  const cands = [];
  // SIMBAD-Wert stammt oft aus Gaia (yCat 1345/1350) -> bei RUWE > 1.4 ebenfalls unzuverlaessig
  const simbadIsGaia = /yCat\.13(45|50)/.test(s.plxbib || '') && !s.plxFrom;
  if (s.plx != null) cands.push({ plx: s.plx, err: s.plxerr ?? 99, src: s.plxFrom ? `SIMBAD (${s.plxFrom}), ${s.plxbib}` : `SIMBAD, ${s.plxbib}`, ruwe: null, reliable: !(simbadIsGaia && (s.gaia?.ruwe ?? 0) > 1.4) });
  if (s.gaia && s.gaia.plx != null) cands.push({ plx: s.gaia.plx, err: s.gaia.err ?? 99, src: 'Gaia DR3', ruwe: s.gaia.ruwe, reliable: (s.gaia.ruwe ?? 9) <= 1.4 });
  const rel = cands.filter((c) => c.reliable).sort((a, b) => a.err - b.err)[0];
  s.own = rel || cands.sort((a, b) => a.err - b.err)[0] || null;
  s.unreliableGaia = !!(s.gaia && (s.gaia.ruwe ?? 0) > 1.4);
}
const noPlx = stars.filter((s) => !s.own);
if (noPlx.length) log('  ohne Parallaxe (ignoriert):', noPlx.map((s) => s.mainId).join('; '));
stars = stars.filter((s) => s.own);
// 8) Cluster: enge Gruppen (<60") teilen die beste Parallaxe; weite Begleiter mit unzuverlaessigem Gaia-Wert erben
const parent = stars.map((_, i) => i);
const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
const sysParent = stars.map((_, i) => i);
const sfind = (i) => (sysParent[i] === i ? i : (sysParent[i] = sfind(sysParent[i])));
for (let i = 0; i < stars.length; i++) {
  for (let j = i + 1; j < stars.length; j++) {
    const a = stars[i], b = stars[j];
    if (!a.own || !b.own) continue;
    const sep = sepArcsec(a, b);
    const rel = Math.abs(a.own.plx - b.own.plx) / Math.max(a.own.plx, b.own.plx);
    if (sep < 60 && rel < 0.08) parent[find(i)] = find(j);
    // dreidimensionaler Abstand (z.B. Proxima <-> Alpha Cen)
    const la = lyOf(a.own.plx), lb = lyOf(b.own.plx);
    const ang = sep / 3600 * D2R;
    const d3 = Math.sqrt(la * la + lb * lb - 2 * la * lb * Math.cos(Math.min(ang, Math.PI)));
    // Weite Paare: < 20' Abstand, aehnliche Parallaxe; jenseits 20 Lj zusaetzlich 3D-Abstand < 1 Lj (Zufallspaare vermeiden)
    if (sep < 1200 && rel < 0.04 && (d3 < 1 || (sep < 120 && d3 < 3) || Math.max(la, lb) < 20)) sysParent[sfind(i)] = sfind(j);
    if (d3 < 0.5 && sep < 20000) sysParent[sfind(i)] = sfind(j);
  }
}
const PLX_PREFER_GAIA = new Set(['* gam Vir']); // Porrima: Gaia-DR3-Wert (RUWE 1.48) liegt naeher an der Bahnloesung als der DR2-Wert der Komponente B
const groups = new Map();
stars.forEach((s, i) => { const k = find(i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); });
for (const grp of groups.values()) {
  let best = [...grp].filter((s) => s.own.reliable).sort((a, b) => a.own.err - b.own.err)[0] || [...grp].sort((a, b) => a.own.err - b.own.err)[0];
  const pref = grp.find((x) => PLX_PREFER_GAIA.has(x.mainId) && x.gaia?.plx != null);
  if (pref) { pref.own = { plx: pref.gaia.plx, err: pref.gaia.err ?? 99, src: 'Gaia DR3 (trotz RUWE > 1.4 bewusst gewaehlt)', ruwe: pref.gaia.ruwe, reliable: true }; best = pref; }
  for (const s of grp) {
    s.adopt = { plx: best.own.plx, err: best.own.err, src: s === best ? best.own.src : `${best.own.src} (von ${norm(best.mainId)} uebernommen)` };
    s.groupSize = grp.length;
  }
}
// Systemzuordnung zusaetzlich mit den uebernommenen Parallaxen (Komponenten mit abweichendem Einzelwert, z.B. Gliese 667 C)
for (let i = 0; i < stars.length; i++) {
  for (let j = i + 1; j < stars.length; j++) {
    const a = stars[i], b = stars[j];
    const sep = sepArcsec(a, b);
    if (sep > 1200) continue;
    const rel = Math.abs(a.adopt.plx - b.adopt.plx) / Math.max(a.adopt.plx, b.adopt.plx);
    const la = lyOf(a.adopt.plx), lb = lyOf(b.adopt.plx);
    const ang = sep / 3600 * D2R;
    const d3 = Math.sqrt(la * la + lb * lb - 2 * la * lb * Math.cos(Math.min(ang, Math.PI)));
    if (rel < 0.04 && (d3 < 1 || (sep < 120 && d3 < 3) || Math.max(la, lb) < 20)) sysParent[sfind(i)] = sfind(j);
  }
}
// Bekannte weite Mehrfachsysteme, die die Winkel-/Abstandskriterien verfehlen (Fomalhaut A/B/C: Begleiter ueber 3 Grad entfernt)
for (const grp of [['* alf PsA', 'V* TW PsA', '* alf PsA C']]) {
  const idx = grp.map((m) => stars.findIndex((s) => s.mainId === m)).filter((i) => i >= 0);
  for (let k = 1; k < idx.length; k++) sysParent[sfind(idx[k])] = sfind(idx[0]);
}
// System-Ebene: weite Begleiter mit unzuverlaessigem Gaia-Wert (RUWE > 1.4) uebernehmen die Parallaxe des genauesten Mitglieds
const sysGroups = new Map();
stars.forEach((s, i) => { const k = sfind(i); if (!sysGroups.has(k)) sysGroups.set(k, []); sysGroups.get(k).push(s); });
for (const grp of sysGroups.values()) {
  if (grp.length < 2) continue;
  const best = [...grp].filter((s) => s.own.reliable).sort((a, b) => a.adopt.err - b.adopt.err)[0];
  if (!best) continue;
  for (const s of grp) {
    if (s.unreliableGaia && s.adopt.err > best.adopt.err && Math.abs(s.adopt.plx - best.adopt.plx) / best.adopt.plx < 0.04) {
      s.adopt = { plx: best.adopt.plx, err: best.adopt.err, src: `${best.adopt.src} (Gaia-RUWE>1.4 bei ${s.mainId}; von ${best.mainId} uebernommen)` };
    }
  }
}

// 9) NASA Exoplanet Archive
log('NASA Exoplanet Archive: pscomppars (sy_dist <= 15.6 pc) ...');
const planetsRaw = await tap(NASA, 'select pl_name,hostname,sy_dist,sy_plx,pl_orbsmax,pl_orbper,pl_orbeccen,pl_orbincl,pl_rade,pl_bmasse,pl_bmassprov,disc_year,discoverymethod,ra,dec,st_teff,st_mass,st_rad,sy_vmag,gaia_dr3_id,hip_name,hd_name from pscomppars where sy_dist <= 15.6 order by sy_dist');
log('  Planeten:', planetsRaw.length);

// 10) Schwellwert, Namen, Systeme
const inRange = (s) => s.adopt && s.adopt.plx >= MIN_PLX;
// Komponenten eines Systems, dessen anderes Mitglied innerhalb der Grenze liegt, werden mitgefuehrt (bis 10 % jenseits der Grenze, z.B. Castor A/B mit Castor C)
const okSys = new Set(stars.filter(inRange).map((s) => sfind(stars.indexOf(s))));
const withinSystem = (s) => s.adopt && s.adopt.plx >= MIN_PLX * 0.9 && okSys.has(sfind(stars.indexOf(s)));
const final = stars.filter((s) => inRange(s) || withinSystem(s));
const dropped = stars.filter((s) => !final.includes(s));
log('Sterne innerhalb 50 Lj:', final.length, '| verworfen (jenseits):', dropped.length);

const usedIds = new Set();
const out = [];
for (const s of final) {
  const key = s.mainId;
  let name = NAME_DE[key] || KEEP_NAMES[key] || null;
  if (!name) {
    const fromIdent = identNames(s.id, s.mainId);
    name = fromIdent || shortSurvey(key.replace(/^(\*\*|\*|V\*|NAME) /, ''));
  }
  s.name = name;
  s.nameFixed = !!(NAME_DE[key] || KEEP_NAMES[key]); // kuratierte / bereits veroeffentlichte Namen bleiben unangetastet
}
// Zusammengesetzte Eintraege aufteilen (Epsilon Indi B = Ba + Bb mit T1V + T6V; EZ Aquarii = A + B + C)
for (const s of [...final]) {
  const names = SPLIT[s.name];
  if (!names) continue;
  const parts = (s.sp || '').split('+');
  final.splice(final.indexOf(s), 1);
  names.forEach((n, i) => final.push({
    ...s, name: n, nameFixed: true, splitFrom: s.mainId, vmag: null,
    sp: parts.length === names.length ? parts[i] : s.sp,
    componentNote: parts.length === names.length ? 'Komponente eines engen Doppelsterns; Spektraltyp aus der SIMBAD-Angabe des Paares, keine Einzelhelligkeit katalogisiert.' : 'Komponente eines Mehrfachsystems (GJ 866 A/B/C); SIMBAD fuehrt nur das Gesamtsystem – Spektraltyp ist der des Gesamtsystems, keine Einzelhelligkeit.',
  }));
}

// 11) Planeten zuordnen
const hostIdx = new Map(); // gaia id -> star
for (const s of final) { const g = gaiaIdOf(s.oid); if (g) hostIdx.set(g, s); }
const normName = (x) => String(x || '').toLowerCase().replace(/gliese|\bgl\b|\bgj\b/g, 'gj').replace(/[^a-z0-9]/g, '');
const unmatched = [];
const hostOf = (p) => {
  const gid = /(\d+)$/.exec(p.gaia_dr3_id || '')?.[1];
  if (gid && hostIdx.has(gid)) return hostIdx.get(gid);
  const hn = normName(p.hostname);
  const byName = final.find((s) => s.id.some((i) => normName(i.replace(/^(NAME|\*|V\*) /, '')) === hn));
  if (byName) return byName;
  // Position (Eigenbewegung bis ~3') + Entfernung
  const cand = final.map((s) => [sepArcsec({ ra: p.ra, dec: p.dec }, s), s]).filter(([d, s]) => d < 240 && Math.abs(1000 / p.sy_dist - s.adopt.plx) / s.adopt.plx < (d < 15 ? 0.12 : 0.03)).sort((a, b) => a[0] - b[0]);
  return cand[0]?.[1] || null;
};
const planetsByStar = new Map();
for (const p of planetsRaw) {
  const h = hostOf(p);
  if (!h) { unmatched.push(`${p.pl_name} (${p.hostname}, ${p.sy_dist} pc)`); continue; }
  if (!planetsByStar.has(h)) planetsByStar.set(h, []);
  planetsByStar.get(h).push(p);
}
const hostParam = new Map(); // Stern -> NASA-Sternparameter
for (const [h, ps] of planetsByStar) hostParam.set(h, ps[0]);

// Namenspflege fuer neue (nicht kuratierte) Namen: Planetenwirte tragen den ueblichen Namen des NASA-Archivs (HD 40307, LHS 1140 ...),
// Komponenten-Buchstaben werden abgesetzt ("HD 4391B" -> "HD 4391 B")
const CATALOG_NAME = /^(Gliese|LP|L|G|LSPM|PM|UCAC4|2MASS|CWISE|WISE|Gaia|SCR|SIPS|LHS|1RXS|BD|CD|HD|LEHPM|WT|APMPM|UPM|RX|LTT)\b/;
const HOST_OK = /^((HD|HIP|GJ|Gl|LHS|LTT|Wolf|HR|BD|CD|L|LP|G|TOI|TRAPPIST|WASP)[ -]?\d|\d+ [A-Z][a-z]+( [A-Z])?$)/;
for (const s of final) {
  if (s.nameFixed) continue;
  s._glieseName = s.name;
  const host = (planetsByStar.get(s) || [])[0]?.hostname;
  if (host && CATALOG_NAME.test(s.name) && HOST_OK.test(host) && !/\d[a-z]$/.test(host)) s.name = host.replace(/^(GJ|Gl) /, 'Gliese ');
  s.name = s.name.replace(/^(.*\d)(AB|BC|Aa|Ab|Ba|Bb|A|B|C|D)$/, '$1 $2');
}
// Hat ein Planetenwirt statt "Gliese N" den NASA-Namen bekommen (z.B. HD 147379), folgen seine "Gliese N B/C"-Begleiter im selben System
const sysKey = (x) => sfind(stars.indexOf(stars.includes(x) ? x : stars.find((o) => o.mainId === x.splitFrom)));
for (const s of final) {
  const m = /^Gliese ([\d.]+)( [A-D])?$/.exec(s._glieseName || '');
  if (!m || s.name === s._glieseName) continue;
  const newBase = s.name.replace(/ [A-D]$/, '');
  for (const o of final) {
    if (o === s || o.nameFixed || sysKey(o) !== sysKey(s)) continue;
    const mo = /^Gliese ([\d.]+)( [A-D])?$/.exec(o.name);
    if (mo && mo[1] === m[1]) o.name = newBase + (mo[2] || '');
  }
}

// Spektraltyp bereinigen (Mehrfachtypen, Quellen chinesischer Agenturen)
function cleanSp(s, sibs) {
  let sp = s.sp ? norm(s.sp) : null;
  if (sp && CN_BIB.test(s.spbib || '')) sp = null;
  if (!sp) return null;
  sp = sp.replace(/^([OBAFGKMLTY][\d.]*)\+(V|IV|III|II|I|VI)$/, '$1$2'); // "M2+V" -> "M2V"
  if (sp.includes('+') && !s.splitFrom) {
    const parts = sp.split('+');
    const others = sibs.filter((o) => o !== s).map((o) => norm(o.sp || ''));
    if (parts.slice(1).some((p) => others.some((o) => o && (o === p || o.startsWith(p.slice(0, 2)))))) return parts[0];
    const m = /\s([A-D])$/.exec(s.name);
    if (m && parts.length > 1 && 'ABCD'.indexOf(m[1]) < parts.length && !others.length) return parts['ABCD'.indexOf(m[1])];
  }
  return sp;
}

// Systeme (nach Namen-Basis)
final.forEach((s) => { s._orig = stars.includes(s) ? s : stars.find((o) => o.mainId === s.splitFrom); });
const sysMembers = new Map();
final.forEach((s) => { const k = sfind(stars.indexOf(s._orig)); if (!sysMembers.has(k)) sysMembers.set(k, []); sysMembers.get(k).push(s); });
const COMP_RE = /^(.*) (AB|BC|Aa|Ab|Ba|Bb|A|B|C|D)$/;
// Mehrfachsysteme: steht neben "X B" ein Eintrag "X", wird er zu "X A" (gilt nicht fuer kuratierte Namen)
for (const members of sysMembers.values()) {
  const bases = new Set(members.map((m) => COMP_RE.exec(m.name)?.[1]).filter(Boolean));
  for (const m of members) if (!m.nameFixed && bases.has(m.name) && !members.some((o) => o.name === m.name + ' A')) m.name += ' A';
}
// Gleichlautende Namen (z.B. zwei Komponenten ohne Buchstaben) bekommen A/B/...
{
  const byName = new Map();
  for (const s of final) { if (!byName.has(s.name)) byName.set(s.name, []); byName.get(s.name).push(s); }
  for (const [name, list] of byName) {
    if (list.length < 2 || list.some((x) => x.nameFixed)) continue;
    list.sort((a, b) => a.ra - b.ra || a.dec - b.dec).forEach((x, i) => { x.name = name + ' ' + 'ABCDEFGH'[i]; });
  }
}
const baseName = (n, multi) => (multi ? n.replace(MULTI_COMPONENT, '') : n.replace(/\s+A$/, ''));
for (const members of sysMembers.values()) {
  const lead = [...members].sort((a, b) => (a.vmag ?? 99) - (b.vmag ?? 99) || a.name.localeCompare(b.name))[0];
  const multi = members.length > 1;
  const base = baseName(lead.name, multi).replace(/\s*\(.*\)$/, '');
  const sysSlug = SYSTEM_SLUG_BY_NAME[base] || slug(base);
  for (const s of members) s.system = sysSlug;
}
// Eindeutige IDs
for (const s of final) {
  let id = slug(s.name.replace(/\s*\(.*\)$/, ''));
  let n = 2; const base = id;
  while (usedIds.has(id)) id = `${base}-${n++}`;
  usedIds.add(id); s.slug = id;
}

// 12) Ausgabeobjekte
const r2 = (x, d = 2) => (x == null || Number.isNaN(+x) ? null : +(+x).toFixed(d));
const numOrNull = (x) => (x == null || x === '' || Number.isNaN(+x) ? null : +x);
const sorted = final.sort((a, b) => (b.adopt.plx - a.adopt.plx) || ((a.vmag ?? 99) - (b.vmag ?? 99)) || a.name.localeCompare(b.name));
const sysList = new Map();
const outStars = sorted.map((s) => {
  const sibs = final.filter((o) => o.system === s.system);
  const sp = cleanSp(s, sibs);
  const hp = hostParam.get(s);
  let teff = numOrNull(hp?.st_teff), teffSource = teff ? 'NASA Exoplanet Archive' : null;
  let colorBasis = 'teff';
  if (!teff) { const est = teffFromSpectral(sp); if (est) { teff = est; teffSource = 'Spektraltyp-Skala (Schaetzung)'; colorBasis = 'spectral-type'; } }
  const color = teff ? blackbodyHex(teff) : '#ffcc99';
  if (!teff) colorBasis = 'assumed';
  const vmag = numOrNull(s.vmag) ?? numOrNull(hp?.sy_vmag);
  const planets = (planetsByStar.get(s) || []).map((p) => ({
    name: p.pl_name,
    aAu: numOrNull(p.pl_orbsmax), periodDays: numOrNull(p.pl_orbper), e: numOrNull(p.pl_orbeccen), incDeg: numOrNull(p.pl_orbincl),
    radiusEarth: numOrNull(p.pl_rade), massEarth: numOrNull(p.pl_bmasse), massIsMinimum: p.pl_bmassprov ? /msini/i.test(p.pl_bmassprov) : null,
    discoveryYear: numOrNull(p.disc_year), method: p.discoverymethod || null,
  })).sort((a, b) => (a.periodDays ?? 1e12) - (b.periodDays ?? 1e12));
  const distanceLy = r2(lyOf(s.adopt.plx));
  const gaiaOwn = s.gaia?.plx != null ? r2(s.gaia.plx, 3) : null;
  return {
    id: s.slug,
    name: s.name,
    system: s.system,
    raDeg: r2(s.ra, 5),
    decDeg: r2(s.dec, 5),
    distanceLy,
    parallaxMas: r2(s.adopt.plx, 3),
    parallaxErrMas: r2(s.adopt.err, 3),
    spectralType: sp,
    vmag: r2(vmag, 2),
    teffK: teff ? Math.round(teff) : null,
    massSun: numOrNull(hp?.st_mass) != null ? r2(hp.st_mass, 3) : null,
    radiusSun: numOrNull(hp?.st_rad) != null ? r2(hp.st_rad, 3) : null,
    colorHex: color,
    teffSource, colorBasis,
    simbadId: s.mainId,
    ...(s.componentNote ? { componentNote: s.componentNote } : {}),
    description: null, // unten gesetzt
    parallaxSource: s.adopt.src,
    check: { simbadPlxMas: s.plx != null ? r2(s.plx, 3) : null, gaiaDr3PlxMas: gaiaOwn, gaiaRuwe: s.gaia?.ruwe != null ? r2(s.gaia.ruwe, 2) : null, nasaDistLy: hp?.sy_dist ? r2(hp.sy_dist * LY_PER_PC) : null },
    lowPrecision: s.adopt.err / s.adopt.plx > 0.1 ? true : undefined,
    planets,
  };
});
// Beschreibungen
const nameToSlugKeys = (st) => [st.system, slug(st.name.replace(/\s*\(.*\)$/, ''))];
for (const st of outStars) {
  for (const k of nameToSlugKeys(st)) if (DESC[k]) { st.description = DESC[k]; break; }
}
// Plausibilitaet / Zusammenfassung
const systems = new Set(outStars.map((s) => s.system));
const nPlanets = outStars.reduce((n, s) => n + s.planets.length, 0);
const must = ['proxima-centauri', 'alpha-centauri-a', 'barnards-pfeilstern', 'wolf-359', 'sirius-a', 'sirius-b', 'epsilon-eridani', 'tau-ceti', 'ross-128', 'luyten-726-8-a', 'procyon-a', 'procyon-b', '61-cygni-a', 'teegardens-stern', 'epsilon-indi-a', 'lalande-21185', 'yz-ceti', 'gliese-1061', 'altair', 'wega', 'arktur', 'kapella', 'pollux', 'fomalhaut', 'castor-a', 'castor-c', '55-cancri-a', 'gliese-581', 'gliese-667-c', 'trappist-1', 'hd-40307', 'upsilon-andromedae-a', '47-ursae-majoris', 'gliese-436', 'lhs-1140', 'gliese-876', 'denebola', 'porrima-a'];
const ids = new Set(outStars.map((s) => s.id));
const lack = must.filter((m) => !ids.has(m));
if (lack.length) log('WARNUNG: erwartete Sterne fehlen:', lack.join(', '));
if (unmatched.length) log('WARNUNG: Planeten ohne Wirtsstern in der Liste:', unmatched.join('; '));

const data = {
  source: 'CDS SIMBAD (https://simbad.cds.unistra.fr/simbad/, TAP), ESA Gaia DR3 (https://gea.esac.esa.int/archive/, CC BY-SA 3.0 IGO) und NASA Exoplanet Archive (https://exoplanetarchive.ipac.caltech.edu/, Tabelle pscomppars). This research has made use of the SIMBAD database, operated at CDS, Strasbourg, France; of the NASA Exoplanet Archive, operated by the California Institute of Technology under contract with NASA; and of data from the ESA mission Gaia (https://www.cosmos.esa.int/gaia), processed by the Gaia DPAC.',
  sources: [
    { name: 'SIMBAD astronomical database, CDS Strasbourg', url: 'https://simbad.cds.unistra.fr/simbad/sim-tap/sync', license: 'freie Nutzung mit Quellenangabe (CDS-Acknowledgement)', reference: 'Wenger et al. 2000, A&AS 143, 9', use: 'Kandidaten, Koordinaten, Spektraltypen, V-Helligkeit, Bezeichner, Mehrfachsystem-Hierarchie' },
    { name: 'ESA Gaia DR3 (Gaia Archive)', url: 'https://gea.esac.esa.int/tap-server/tap/sync', license: 'CC BY-SA 3.0 IGO', reference: 'Gaia Collaboration 2023, A&A 674, A1', use: 'Parallaxen, Vollstaendigkeits- und Entfernungs-Gegenprobe' },
    { name: 'NASA Exoplanet Archive (Planetary Systems Composite Parameters)', url: 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync', license: 'oeffentlich (NASA/Caltech-IPAC), Quellenangabe', reference: 'NASA Exoplanet Archive, Caltech/IPAC', use: 'bestaetigte Exoplaneten, Teff/Masse/Radius der Wirtssterne' },
  ],
  fetched: new Date().toISOString().slice(0, 10),
  note: 'Entfernungen aus der Parallaxe (d[Lj] = 1000/Parallaxe[mas] * 3,26156); Grenze 50 Lj entspricht Parallaxe >= 65,24 mas. Enge Komponenten teilen sich die genaueste Parallaxe; "check" enthaelt die SIMBAD-/Gaia-/NASA-Gegenwerte, "lowPrecision" markiert Parallaxenfehler > 10 %. teffK stammt fuer Planetenwirte von der NASA, sonst aus dem Spektraltyp geschaetzt (teffSource). colorHex ist eine Schwarzkoerper-Naeherung. massSun/radiusSun nur fuer Planetenwirte (NASA), sonst null. Planetenmassen mit massIsMinimum=true sind Mindestmassen (m sin i).',
  counts: { stars: outStars.length, systems: systems.size, planets: nPlanets },
  stars: outStars,
};
for (const st of data.stars) { if (st.lowPrecision === undefined) delete st.lowPrecision; }
// Schlanke Ausgabe (Standard): Pruef-/Herkunftsfelder, die die App nicht liest, entfallen (mit --full bleiben sie erhalten).
// Eine Zeile je Stern haelt die Datei klein und diff-freundlich.
const FULL = process.argv.includes('--full');
const AUDIT_STAR = ['parallaxErrMas', 'teffSource', 'colorBasis', 'simbadId', 'componentNote', 'parallaxSource', 'check', 'lowPrecision'];
const AUDIT_PLANET = ['incDeg', 'massIsMinimum'];
if (!FULL) {
  for (const st of data.stars) {
    for (const k of AUDIT_STAR) delete st[k];
    for (const p of st.planets) for (const k of AUDIT_PLANET) delete p[k];
  }
  data.note = 'Entfernungen aus der Parallaxe (d[Lj] = 1000/Parallaxe[mas] * 3,26156); Grenze 50 Lj entspricht Parallaxe >= 65,24 mas. Enge Komponenten teilen sich die genaueste Parallaxe; Mitglieder eines Systems, dessen anderes Mitglied innerhalb der Grenze liegt, werden mitgefuehrt (bis 10 % jenseits). teffK stammt fuer Planetenwirte von der NASA, sonst aus dem Spektraltyp geschaetzt. colorHex ist eine Schwarzkoerper-Naeherung. massSun/radiusSun nur fuer Planetenwirte (NASA), sonst null. Herkunfts- und Pruefdaten (SIMBAD-Kennung, Gaia-/NASA-Gegenwerte) entfallen in dieser schlanken Fassung: node scripts/fetch-nearby.mjs --full.';
}
await mkdir(dirname(OUT), { recursive: true });
const { stars: starRows, ...head } = data;
const headText = Object.entries(head).map(([k, v]) => ` ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n');
await writeFile(OUT, `{\n${headText},\n "stars": [\n${starRows.map((st) => '  ' + JSON.stringify(st)).join(',\n')}\n ]\n}\n`, 'utf8');
log(`geschrieben: ${OUT}`);
console.log(`Sterne: ${outStars.length} | Systeme: ${systems.size} | Planeten: ${nPlanets}`);
if (process.argv.includes('--debug')) {
  for (const s of dropped) console.log('verworfen', s.mainId, s.adopt?.plx?.toFixed(2), s.origin);
}
// Entwicklungshilfe: --trace=<regex> zeigt, was mit passenden SIMBAD-Objekten geschah
{
  const tr = process.argv.find((a) => a.startsWith('--trace='));
  if (tr) {
    const re = new RegExp(tr.slice(8), 'i');
    for (const s of all.values()) {
      if (!re.test(s.main_id || '')) continue;
      console.log('trace', norm(s.main_id), '| otype', s.otype, '| origin', s.origin, '| plx', s.plx, '| parent', !!s.isParent, '| in stars', stars.includes(s), '| adopt', s.adopt?.plx?.toFixed(2), '| final', final.includes(s));
    }
  }
}
