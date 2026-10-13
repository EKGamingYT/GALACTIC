// Kenndaten der Sonne und des Sonnensystems sowie seine Lage im Universum.
// Quellen: NASA Sun Fact Sheet; IAU 2015 (Nominalwerte); Kopparapu et al. 2013/2014
// (habitable Zone); GRAVITY Collaboration 2019 (Abstand zum galaktischen Zentrum);
// Bennett & Bovy 2019 (Höhe über der galaktischen Ebene); IERS/ICRF3 (Bezugssystem).

const DEG = Math.PI / 180;
export const OBLIQUITY_DEG = 23.4392911; // Schiefe der Ekliptik (J2000)

export const HABITABLE_ZONE = {
  conservative: [0.95, 1.67], // AE – Runaway-Treibhaus … maximales Treibhaus
  optimistic: [0.75, 1.77],   // AE – „Recent Venus“ … „Early Mars“
};

export const SOLAR_SYSTEM = {
  id: 'solar-system',
  name: 'Sonnensystem',
  type: 'Planetensystem',
  color: '#ffcc55',
  facts: [
    ['Zentralstern', 'Sonne (Sol)'],
    ['Spektraltyp', 'G2V – Gelber Zwerg (Hauptreihe)'],
    ['Alter', '≈ 4,6 Mrd. Jahre'],
    ['Masse', '1,989 · 10³⁰ kg'],
    ['Radius', '695.700 km'],
    ['Leuchtkraft', '3,828 · 10²⁶ W'],
    ['Oberflächentemperatur', '5.772 K'],
    ['Planeten', '8'],
    ['Zwergplaneten (IAU)', '5 (Ceres, Pluto, Eris, Haumea, Makemake)'],
    ['Habitable Zone', '0,95–1,67 AE (konservativ)'],
  ],
  galaxy: [
    ['Galaxie', 'Milchstraße, Orion-Arm (Lokaler Arm)'],
    ['Abstand zum galaktischen Zentrum', '≈ 8,18 kpc (≈ 26.700 Lichtjahre)'],
    ['Höhe über der galaktischen Ebene', '≈ 21 pc (≈ 68 Lichtjahre)'],
    ['Umlaufgeschwindigkeit um das Zentrum', '≈ 230 km/s'],
    ['Galaktisches Jahr', '≈ 230 Mio. Jahre'],
    ['Bezugssystem', 'ICRS – festgelegt über die Positionen von über 4.500 Quasaren (ICRF3)'],
  ],
};

// Richtungen (Einheitsvektoren im ekliptikalen J2000-System) für das Koordinatenkreuz.
function equatorialToEcliptic(raDeg, decDeg) {
  const a = raDeg * DEG, d = decDeg * DEG, e = OBLIQUITY_DEG * DEG;
  const x = Math.cos(d) * Math.cos(a), y = Math.cos(d) * Math.sin(a), z = Math.sin(d);
  return { x, y: y * Math.cos(e) + z * Math.sin(e), z: -y * Math.sin(e) + z * Math.cos(e) };
}

export const REFERENCE_DIRECTIONS = [
  { name: 'Frühlingspunkt · ICRS-x', dir: { x: 1, y: 0, z: 0 }, color: 0x8ab4ff },
  { name: 'Himmelsnordpol · ICRS-z', dir: equatorialToEcliptic(0, 90), color: 0x8ab4ff },
  { name: 'Ekliptik-Nordpol', dir: { x: 0, y: 0, z: 1 }, color: 0xb8c4dc },
  { name: 'Galaktisches Zentrum (Sgr A*) · 26.700 Lj', dir: equatorialToEcliptic(266.41684, -29.00781), color: 0xffb86b },
  { name: 'Galaktischer Nordpol', dir: equatorialToEcliptic(192.85948, 27.12825), color: 0xffd9a8 },
];
export const GALACTIC_NORTH = REFERENCE_DIRECTIONS[4].dir;
