// Holt alle Sterne (inkl. Weisser/Brauner Zwerge, jede Komponente von Mehrfachsystemen) innerhalb von
// 20 Lichtjahren um die Sonne samt bestaetigten Exoplaneten und schreibt src/data/nearbystars.json.
// Aufruf: node scripts/fetch-nearby.mjs        (Node >= 20, keine Abhaengigkeiten)
//
// Quellen (alle offen nutzbar, Quellenangabe Pflicht – siehe CREDITS.md):
//   1. CDS SIMBAD TAP  https://simbad.cds.unistra.fr/simbad/sim-tap/sync
//      Stern-Kandidaten (plx_value >= 150 mas), Komponenten (Tabelle h_link / Nachbarschaftssuche),
//      Koordinaten, Spektraltyp, V-Helligkeit, Bezeichner. Wenger et al. 2000, A&AS 143, 9.
//      Nutzung frei, "This research has made use of the SIMBAD database, operated at CDS, Strasbourg, France".
//   2. ESA Gaia DR3 TAP  https://gea.esac.esa.int/tap-server/tap/sync
//      Parallaxen (Gaia Collaboration 2023, A&A 674, A1), Vollstaendigkeits- und Entfernungs-Gegenprobe.
//      Lizenz CC BY-SA 3.0 IGO (ESA/Gaia/DPAC).
//   3. NASA Exoplanet Archive TAP  https://exoplanetarchive.ipac.caltech.edu/TAP/sync  (Tabelle pscomppars)
//      Planeten (sy_dist <= 6.3 pc) und Sternparameter der Planetenwirte (Teff, Masse, Radius).
//      NASA/Caltech-IPAC, oeffentlich frei nutzbar mit Quellenangabe.
// Es werden keine Daten chinesischer Agenturen verwendet (Spektraltypen mit RAA/ChJAA-Bibcode werden verworfen).
//
// Methodik
//  - Entfernung = 1000 / Parallaxe (pc) * 3.26156 (Lj). Grenze 20 Lj <=> Parallaxe >= 163.08 mas.
//  - Komponenten enger Mehrfachsterne (< 60") teilen sich die genaueste Parallaxe; Gaia-Werte mit RUWE > 1.4
//    gelten als unzuverlaessig und werden bei Begleitern durch den Wert der Hauptkomponente ersetzt.
//  - colorHex: Schwarzkoerper-Naeherung (Planck-Kurve nach Kim et al. 2002 -> CIE xy -> sRGB) aus Teff;
//    ohne gemessene Teff aus dem Spektraltyp (Skala nach Pecaut & Mamajek 2013, Weisse Zwerge Teff = 50400/Typ).
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/nearbystars.json');
const SIMBAD = 'https://simbad.cds.unistra.fr/simbad/sim-tap/sync';
const GAIA = 'https://gea.esac.esa.int/tap-server/tap/sync';
const NASA = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';

const LY_PER_PC = 3.261563777;
const MAX_LY = 20;
const MIN_PLX = 1000 / (MAX_LY / LY_PER_PC); // 163.078 mas
const PRE_PLX = 150; // SIMBAD-Vorauswahl (grosszuegig, wird spaeter anhand der adoptierten Parallaxe beschnitten)
const D2R = Math.PI / 180;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- TAP-Hilfsfunktion
async function tap(url, adql, { tries = 5, big = false } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ REQUEST: 'doQuery', LANG: 'ADQL', FORMAT: 'json', QUERY: adql }),
        signal: AbortSignal.timeout(150000),
      });
      let txt = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200).replace(/\s+/g, ' ')}`);
      // 64-bit-Gaia-IDs duerfen nicht als JSON-Zahl geparst werden (Genauigkeitsverlust) -> in Strings umwandeln
      if (big) txt = txt.replace(/([\[,:\s])(\d{16,20})(?=[,\]\s}])/g, '$1"$2"');
      const j = JSON.parse(txt);
      if (Array.isArray(j)) return j; // NASA liefert ein Array von Objekten
      const cols = j.metadata.map((m) => m.name);
      return j.data.map((r) => Object.fromEntries(r.map((v, k) => [cols[k], v])));
    } catch (e) {
      last = e;
      await sleep(1500 * (i + 1));
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
};
// Mehrfachsysteme, deren Einzelkomponenten SIMBAD nicht als eigene Objekte fuehrt (werden aufgeteilt; Spektraltyp aus
// der "A+B"-Angabe, sonst Gesamtangabe des Systems; Einzelhelligkeit unbekannt -> null)
const SPLIT = {
  'Epsilon Indi B': ['Epsilon Indi Ba', 'Epsilon Indi Bb'],
  'EZ Aquarii': ['EZ Aquarii A', 'EZ Aquarii B', 'EZ Aquarii C'], // GJ 866 A/B/C = Luyten 789-6 (Bezeichner in SIMBAD)
};
const MULTI_COMPONENT = /\s(A|B|C|D|AB|BC|Aa|Ab|Ba|Bb)$/;

function identNames(idents) {
  // idents: Liste von SIMBAD-Bezeichnern des Objekts
  const ids = idents.map(norm);
  const nm = ids.find((s) => s.startsWith('NAME '));
  if (nm) return nm.slice(5);
  const bay = ids.find((s) => /^\* (?:(?:[a-z]{2,3})\d{0,2}|\d{1,3}) [A-Za-z]{2,3}(?: [A-Z]\w?)?$/.test(s));
  if (bay) {
    const m = /^\* ([a-z]{2,3}\d{0,2}|\d{1,3}) ([A-Za-z]{2,3})(?: ([A-Z]\w?))?$/.exec(bay);
    const g = GREEK[m[1].replace(/\d+$/, '')];
    const num = (m[1].match(/\d+$/) || [''])[0];
    const con = CON[m[2]] || m[2];
    return `${g ? g + num : m[1]} ${con}${m[3] ? ' ' + m[3] : ''}`;
  }
  const gj = ids.find((s) => /^(GJ|Gl) \d+(\.\d+)?(?: ?[A-Z]{1,2})?$/.test(s));
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
log('Gaia DR3: unabhaengige Liste (parallax >= 160 mas) ...');
const gaiaCols = 'source_id, ra, dec, parallax, parallax_error, ruwe, phot_g_mean_mag';
const gaiaList = await tap(GAIA, `SELECT ${gaiaCols} FROM gaiadr3.gaia_source WHERE parallax >= 160 AND parallax_over_error > 5`, { big: true });
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
for (const s of [...stars]) {
  if (!(s.otype === '**' || /\+/.test(s.sp || ''))) continue;
  const kids = stars.filter((o) => o !== s && sepArcsec(s, o) < 8);
  if (kids.length < 2) continue;
  stars.splice(stars.indexOf(s), 1);
  s.isParent = true;
  for (const k of kids) { if (!parentOf.has(k.oid)) parentOf.set(k.oid, []); parentOf.get(k.oid).push(s.oid); }
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
    if (sep < 1200 && rel < 0.04) sysParent[sfind(i)] = sfind(j);
    // dreidimensionaler Abstand < 0.5 Lj (z.B. Proxima <-> Alpha Cen)
    const la = lyOf(a.own.plx), lb = lyOf(b.own.plx);
    const ang = sep / 3600 * D2R;
    const d3 = Math.sqrt(la * la + lb * lb - 2 * la * lb * Math.cos(Math.min(ang, Math.PI)));
    if (d3 < 0.5 && sep < 20000) sysParent[sfind(i)] = sfind(j);
  }
}
const groups = new Map();
stars.forEach((s, i) => { const k = find(i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); });
for (const grp of groups.values()) {
  const best = [...grp].filter((s) => s.own.reliable).sort((a, b) => a.own.err - b.own.err)[0] || [...grp].sort((a, b) => a.own.err - b.own.err)[0];
  for (const s of grp) {
    s.adopt = { plx: best.own.plx, err: best.own.err, src: s === best ? best.own.src : `${best.own.src} (von ${norm(best.mainId)} uebernommen)` };
    s.groupSize = grp.length;
  }
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
log('NASA Exoplanet Archive: pscomppars (sy_dist <= 6.3 pc) ...');
const planetsRaw = await tap(NASA, 'select pl_name,hostname,sy_dist,sy_plx,pl_orbsmax,pl_orbper,pl_orbeccen,pl_orbincl,pl_rade,pl_bmasse,pl_bmassprov,disc_year,discoverymethod,ra,dec,st_teff,st_mass,st_rad,sy_vmag,gaia_dr3_id,hip_name,hd_name from pscomppars where sy_dist <= 6.3 order by sy_dist');
log('  Planeten:', planetsRaw.length);

// 10) Schwellwert, Namen, Systeme
const final = stars.filter((s) => s.adopt && s.adopt.plx >= MIN_PLX);
const dropped = stars.filter((s) => !(s.adopt && s.adopt.plx >= MIN_PLX));
log('Sterne innerhalb 20 Lj:', final.length, '| verworfen (jenseits):', dropped.length);

const usedIds = new Set();
const out = [];
for (const s of final) {
  const key = s.mainId;
  let name = NAME_DE[key] || null;
  if (!name) {
    const fromIdent = identNames(s.id);
    name = fromIdent || shortSurvey(key.replace(/^(\*|V\*|NAME) /, ''));
  }
  s.name = name;
}
// Zusammengesetzte Eintraege aufteilen (Epsilon Indi B = Ba + Bb mit T1V + T6V; EZ Aquarii = A + B + C)
for (const s of [...final]) {
  const names = SPLIT[s.name];
  if (!names) continue;
  const parts = (s.sp || '').split('+');
  final.splice(final.indexOf(s), 1);
  names.forEach((n, i) => final.push({
    ...s, name: n, splitFrom: s.mainId, vmag: null,
    sp: parts.length === names.length ? parts[i] : s.sp,
    componentNote: parts.length === names.length ? 'Komponente eines engen Doppelsterns; Spektraltyp aus der SIMBAD-Angabe des Paares, keine Einzelhelligkeit katalogisiert.' : 'Komponente eines Mehrfachsystems (GJ 866 A/B/C); SIMBAD fuehrt nur das Gesamtsystem – Spektraltyp ist der des Gesamtsystems, keine Einzelhelligkeit.',
  }));
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

// 11) Planeten zuordnen
const hostIdx = new Map(); // gaia id -> star
for (const s of final) { const g = gaiaIdOf(s.oid); if (g) hostIdx.set(g, s); }
const normName = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const unmatched = [];
const hostOf = (p) => {
  const gid = /(\d+)$/.exec(p.gaia_dr3_id || '')?.[1];
  if (gid && hostIdx.has(gid)) return hostIdx.get(gid);
  const hn = normName(p.hostname);
  const byName = final.find((s) => s.id.some((i) => normName(i.replace(/^(NAME|\*|V\*) /, '')) === hn));
  if (byName) return byName;
  // Position (Eigenbewegung bis ~3') + Entfernung
  const cand = final.map((s) => [sepArcsec({ ra: p.ra, dec: p.dec }, s), s]).filter(([d, s]) => d < 240 && Math.abs(1000 / p.sy_dist - s.adopt.plx) / s.adopt.plx < 0.03).sort((a, b) => a[0] - b[0]);
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
const must = ['proxima-centauri', 'alpha-centauri-a', 'barnards-pfeilstern', 'wolf-359', 'sirius-a', 'sirius-b', 'epsilon-eridani', 'tau-ceti', 'ross-128', 'luyten-726-8-a', 'procyon-a', 'procyon-b', '61-cygni-a', 'teegardens-stern', 'epsilon-indi-a', 'lalande-21185', 'yz-ceti', 'gliese-1061'];
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
  note: 'Entfernungen aus der Parallaxe (d[Lj] = 1000/Parallaxe[mas] * 3,26156); Grenze 20 Lj entspricht Parallaxe >= 163,08 mas. Enge Komponenten teilen sich die genaueste Parallaxe; "check" enthaelt die SIMBAD-/Gaia-/NASA-Gegenwerte, "lowPrecision" markiert Parallaxenfehler > 10 %. teffK stammt fuer Planetenwirte von der NASA, sonst aus dem Spektraltyp geschaetzt (teffSource). colorHex ist eine Schwarzkoerper-Naeherung. massSun/radiusSun nur fuer Planetenwirte (NASA), sonst null. Planetenmassen mit massIsMinimum=true sind Mindestmassen (m sin i).',
  counts: { stars: outStars.length, systems: systems.size, planets: nPlanets },
  stars: outStars,
};
for (const st of data.stars) { if (st.lowPrecision === undefined) delete st.lowPrecision; }
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(data, null, 1) + '\n', 'utf8');
log(`geschrieben: ${OUT}`);
console.log(`Sterne: ${outStars.length} | Systeme: ${systems.size} | Planeten: ${nPlanets}`);
if (process.argv.includes('--debug')) {
  for (const s of dropped) console.log('verworfen', s.mainId, s.adopt?.plx?.toFixed(2), s.origin);
}
