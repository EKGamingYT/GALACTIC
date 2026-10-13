// Holt Bahn- und Physikdaten von Zwergplaneten, Asteroiden und Kometen aus der
// JPL Small-Body Database (ssd-api.jpl.nasa.gov) und schreibt sie nach
// src/data/smallbodies.json. Aufruf: node scripts/fetch-smallbodies.mjs
import { writeFile } from 'node:fs/promises';

// [Suchbegriff, deutscher Name, Kategorie, Monde, Beschreibung, Farbe]
const OBJECTS = [
  ['Ceres', 'Ceres', 'Zwergplanet', 0, 'Größtes Objekt im Asteroidengürtel. Von der NASA-Sonde Dawn 2015–2018 erforscht; helle Salzablagerungen im Krater Occator.', '#9c968e'],
  ['Eris', 'Eris', 'Zwergplanet', 1, 'Etwa 27 % massereicher als Pluto. Ihre Entdeckung 2005 führte 2006 zur Neudefinition des Planetenbegriffs. Mond: Dysnomia.', '#e4e1da'],
  ['Haumea', 'Haumea', 'Zwergplanet', 2, 'Rotiert in nur ~3,9 Stunden und ist dadurch stark abgeplattet. Besitzt ein Ringsystem (2017 entdeckt). Monde: Hiʻiaka und Namaka.', '#d9d4cc'],
  ['Makemake', 'Makemake', 'Zwergplanet', 1, 'Heller, rötlicher Zwergplanet im Kuipergürtel. Ein kleiner Mond wurde 2016 entdeckt.', '#c99a7a'],
  ['225088', 'Gonggong', 'Zwergplanet-Kandidat', 1, 'Großes, rötliches Objekt jenseits von Neptun mit stark geneigter Bahn. Mond: Xiangliu.', '#b0705a'],
  ['50000', 'Quaoar', 'Zwergplanet-Kandidat', 1, 'Besitzt einen Ring weit außerhalb der Roche-Grenze (2023 entdeckt). Mond: Weywot.', '#a8786a'],
  ['90377', 'Sedna', 'Zwergplanet-Kandidat', 0, 'Extrem langgestreckte Bahn mit Perihel bei ~76 AE und Umlaufzeit von über 10.000 Jahren – mögliches Objekt der inneren Oortschen Wolke.', '#b5513a'],
  ['90482', 'Orcus', 'Zwergplanet-Kandidat', 1, 'Der „Anti-Pluto“: gleiche 2:3-Resonanz mit Neptun wie Pluto, aber auf der gegenüberliegenden Bahnseite. Mond: Vanth.', '#a9a9b0'],
  ['4', 'Vesta', 'Asteroid', 0, 'Zweitmassereichstes Objekt im Asteroidengürtel. Dawn umkreiste Vesta 2011–2012; riesiger Einschlagkrater Rheasilvia am Südpol.', '#b8b0a2'],
  ['2', 'Pallas', 'Asteroid', 0, 'Drittgrößter Asteroid mit auffällig stark geneigter Bahn (~35°).', '#9a978f'],
  ['10', 'Hygiea', 'Asteroid', 0, 'Viertgrößtes Objekt im Gürtel, nahezu kugelförmig – möglicher Zwergplanet-Kandidat.', '#7d7a74'],
  ['3', 'Juno', 'Asteroid', 0, 'Einer der ersten entdeckten Asteroiden (1804).', '#a59d8f'],
  ['16', 'Psyche', 'Asteroid', 0, 'Metallreicher Asteroid, Ziel der NASA-Mission Psyche (Start 2023, Ankunft 2029).', '#a7a7a0'],
  ['433', 'Eros', 'Erdnaher Asteroid', 0, 'Erster Asteroid, der umkreist und auf dem gelandet wurde (NEAR Shoemaker, 2000/2001).', '#b49a7a'],
  ['101955', 'Bennu', 'Erdnaher Asteroid', 0, 'Ziel von OSIRIS-REx; eine Gesteinsprobe kam 2023 zur Erde.', '#6e6a66'],
  ['162173', 'Ryugu', 'Erdnaher Asteroid', 0, 'Ziel der JAXA-Mission Hayabusa2; Proben kamen 2020 zur Erde.', '#5f5c58'],
  ['25143', 'Itokawa', 'Erdnaher Asteroid', 0, 'Ziel der JAXA-Mission Hayabusa; erste Asteroidenprobe auf der Erde (2010).', '#9c9282'],
  ['99942', 'Apophis', 'Erdnaher Asteroid', 0, 'Fliegt am 13. April 2029 in nur ~32.000 km Abstand an der Erde vorbei.', '#a08f7c'],
  ['65803', 'Didymos', 'Erdnaher Asteroid', 1, 'Doppelasteroid: Die NASA-Sonde DART traf 2022 den Mond Dimorphos und veränderte dessen Bahn. ESA-Mission Hera folgt.', '#8e8a84'],
  ['1P', 'Halley', 'Komet', 0, 'Berühmtester periodischer Komet, Umlaufzeit ~76 Jahre. Nächster Sonnennähe-Durchgang 2061.', '#cfe6ff'],
  ['67P', 'Tschurjumow-Gerassimenko', 'Komet', 0, 'Ziel der ESA-Mission Rosetta mit Lander Philae (2014–2016).', '#cfe6ff'],
  ['2P', 'Encke', 'Komet', 0, 'Komet mit der kürzesten bekannten Umlaufzeit (~3,3 Jahre).', '#cfe6ff'],
];

// Mittlere Radien (km) aus der Fachliteratur, wo die SBDB keinen Durchmesser führt
// (Sternbedeckungen / Spitzer- & Herschel-Messungen; gerundet).
const RADIUS_FALLBACK = { Eris: 1163, Haumea: 780, Makemake: 715, Gonggong: 615, Quaoar: 545, Sedna: 500, Orcus: 455 };

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

const out = [];
for (const [sstr, name, category, moons, description, color] of OBJECTS) {
  const url = `https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${encodeURIComponent(sstr)}&phys-par=1&full-prec=1`;
  const d = await (await fetch(url)).json();
  if (!d.orbit) throw new Error(`Keine Daten für ${sstr}: ${JSON.stringify(d).slice(0, 200)}`);
  const el = Object.fromEntries(d.orbit.elements.map((e) => [e.name, num(e.value)]));
  const phys = Object.fromEntries((d.phys_par || []).map((p) => [p.name, p.value]));
  out.push({
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name,
    fullname: d.object.fullname,
    type: category,
    color,
    moons,
    description,
    radiusKm: phys.diameter ? num(phys.diameter) / 2 : RADIUS_FALLBACK[name] ?? null,
    radiusSource: phys.diameter ? 'JPL SBDB' : 'Literaturwert',
    rotationHours: num(phys.rot_per),
    albedo: num(phys.albedo),
    kepler: {
      epochJd: num(d.orbit.epoch), a: el.a, e: el.e, i: el.i, node: el.om, peri: el.w, M: el.ma, n: el.n,
    },
    periodYears: el.per ? el.per / 365.25 : null,
  });
  console.log(`✓ ${name}`);
}

await writeFile(
  new URL('../src/data/smallbodies.json', import.meta.url),
  JSON.stringify({ source: 'JPL Small-Body Database API (ssd-api.jpl.nasa.gov)', fetched: new Date().toISOString().slice(0, 10), bodies: out }, null, 1)
);
console.log(`${out.length} Objekte gespeichert.`);
