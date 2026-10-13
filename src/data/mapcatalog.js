// Alle Körper mit Oberflächenkarten: Erde/Mond/Mars (bodies.js) plus die weiteren
// NASA-Trek-Karten (planetmaps.js) für Merkur, Venus, Monde und Kleinkörper.
import { BODIES } from './bodies.js';
import { PLANET_MAPS, TREK_RADIUS_KM } from './planetmaps.js';
import SMALL from './smallbodies.json';

const NAMES = {
  mercury: 'Merkur', venus: 'Venus', ceres: 'Ceres', vesta: 'Vesta', ryugu: 'Ryugu', bennu: 'Bennu',
  titan: 'Titan', europa: 'Europa', ganymede: 'Ganymed', io: 'Io', callisto: 'Kallisto', enceladus: 'Enceladus',
  mimas: 'Mimas', dione: 'Dione', rhea: 'Rhea', tethys: 'Tethys', iapetus: 'Iapetus', phoebe: 'Phoebe', phobos: 'Phobos',
};
const GROUP = {
  mercury: 'Planeten', venus: 'Planeten', earth: 'Planeten', mars: 'Planeten',
  ceres: 'Zwergplaneten & Asteroiden', vesta: 'Zwergplaneten & Asteroiden', ryugu: 'Zwergplaneten & Asteroiden', bennu: 'Zwergplaneten & Asteroiden',
};
// Sofort sichtbares Vollbild unter den Kacheln (vorhandene Texturen)
const FALLBACK = {
  mercury: '/textures/2k_mercury.jpg', venus: '/textures/2k_venus_surface.jpg',
  ceres: '/textures/ceres_dawn.jpg', vesta: '/textures/vesta_dawn.jpg',
};

const known = (id) => BODIES.find((b) => b.id === id) ?? SMALL.bodies.find((b) => b.id === id);

export const MAP_BODIES = [
  ...BODIES.filter((b) => b.maps).map((b) => ({ ...b, group: GROUP[b.id] ?? 'Monde' })),
  ...Object.entries(PLANET_MAPS).map(([id, maps]) => ({
    id,
    name: NAMES[id] ?? known(id)?.name ?? id,
    color: known(id)?.color ?? '#b0b4ba',
    radiusKm: TREK_RADIUS_KM[id],
    maps: maps.map((m) => ({ ...m, ...(m.underlay === undefined && maps.length > 1 && m !== maps[0] && { underlay: 0 }) })),
    mapFallback: FALLBACK[id],
    group: GROUP[id] ?? 'Monde',
  })),
];

export const mapBodyById = (id) => MAP_BODIES.find((b) => b.id === id);

// Karten-ID zu einem Objekt aus Systemansicht/Suche (Monde haben dort das Präfix „moon-“)
export const mapIdFor = (body) => {
  const id = body.isMoon ? body.id.replace(/^moon-/, '') : body.id;
  return id === 'moon' || mapBodyById(id) ? id : null;
};
