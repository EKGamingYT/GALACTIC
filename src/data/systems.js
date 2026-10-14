// Sternsysteme der Sonnenumgebung (≤ 20 Lj), zusammengefasst aus nearbystars.json:
// Mitglieder, Planeten, Leuchtkraft und habitable Zone je Stern.
import DATA from './nearbystars.json';

// Bolometrische Korrektur BC_V grob nach Spektralklasse (für Sterne ohne Teff/Radius)
const BC = { O: -3.0, B: -1.5, A: -0.2, F: -0.05, G: -0.15, K: -0.5, M: -2.0, L: -4.5, T: -6.0, Y: -8.0, D: -0.5 };
function bcFor(spectralType) {
  const sp = spectralType || '';
  const m = sp.replace(/^(sd|d|esd)/, '').match(/[OBAFGKMLTYD]/);
  if (!m) return null;
  if (m[0] === 'M') { // M-Zwerge: BC wird mit späterem Subtyp stark negativ
    const sub = parseFloat(sp.slice(sp.indexOf('M') + 1)) || 3;
    return -1.0 - 0.45 * sub;
  }
  return BC[m[0]];
}

// Bolometrische Korrektur aus der Temperatur (grobe Stützstellen, linear interpoliert) –
// genauer als nach Spektralklasse, v. a. für heiße Weiße Zwerge und kühle Rote Zwerge
const BC_T = [[2700, -4.8], [2800, -4.4], [3050, -3.8], [3200, -2.6], [3500, -1.6], [4000, -0.9], [5000, -0.3], [6000, -0.05], [8000, -0.1],
  [10000, -0.4], [15000, -1.3], [20000, -2.0], [25000, -2.5], [30000, -2.9], [40000, -3.6]];
function bcFromTeff(T) {
  if (T <= BC_T[0][0]) return BC_T[0][1];
  for (let i = 1; i < BC_T.length; i++) {
    const [t1, b1] = BC_T[i];
    if (T <= t1) { const [t0, b0] = BC_T[i - 1]; return b0 + ((T - t0) / (t1 - t0)) * (b1 - b0); }
  }
  return BC_T[BC_T.length - 1][1];
}

// Leuchtkraft in Sonnenleuchtkräften: aus Radius & Teff (Stefan-Boltzmann) oder
// aus scheinbarer Helligkeit, Parallaxe und bolometrischer Korrektur (Näherung)
export function luminosity(s) {
  if (s.radiusSun && s.teffK) return { L: s.radiusSun ** 2 * (s.teffK / 5772) ** 4, estimated: false };
  const bc = s.teffK ? bcFromTeff(s.teffK) : bcFor(s.spectralType);
  if (s.vmag == null || !s.parallaxMas || bc == null) return { L: null, estimated: true };
  const Mv = s.vmag + 5 * Math.log10(s.parallaxMas) - 10;
  return { L: 10 ** (-0.4 * (Mv + bc - 4.74)), estimated: true };
}

// Konservative habitable Zone nach Kopparapu et al. (Seff 1,107 … 0,356, sonnenähnlich skaliert)
export function habitableZone(L) {
  return L ? [Math.sqrt(L / 1.107), Math.sqrt(L / 0.356)] : null;
}

const SUFFIX = /\s+(A|B|C|D|Ab|Ba|Bb|BC|AB)(\s*\(.*\))?$/;

function buildSystems() {
  const groups = new Map();
  for (const s of DATA.stars) {
    if (!groups.has(s.system)) groups.set(s.system, []);
    groups.get(s.system).push(s);
  }
  return [...groups.entries()].map(([id, members]) => {
    const withL = members.map((s) => ({ s, ...luminosity(s) }));
    const primary = withL.slice().sort((a, b) => (b.L ?? 0) - (a.L ?? 0))[0].s;
    const planets = members.flatMap((s) => (s.planets || []).map((p) => {
      const hz = habitableZone(withL.find((w) => w.s === s).L);
      return { ...p, host: s.name, inHz: hz && p.aAu ? p.aAu >= hz[0] && p.aAu <= hz[1] : null };
    }));
    return {
      id: `system-${id}`,
      systemId: id,
      name: members.length > 1 ? primary.name.replace(SUFFIX, '') : primary.name,
      type: members.length > 1 ? `Sternsystem · ${members.length} Sterne` : 'Sternsystem · Einzelstern',
      color: primary.colorHex || '#ffffff',
      distanceLy: Math.min(...members.map((s) => s.distanceLy)),
      primaryId: primary.id,
      description: members.find((s) => s.description)?.description ?? null,
      members: withL.map(({ s, L, estimated }) => ({ ...s, L, estimated, hz: habitableZone(L) })),
      planets,
      isSystem: true,
    };
  }).sort((a, b) => a.distanceLy - b.distanceLy);
}

export const SYSTEMS = buildSystems();
