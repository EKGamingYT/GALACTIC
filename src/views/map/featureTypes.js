// Deutsche Bezeichnungen und Farbgruppen für die IAU-Merkmalstypen (Gazetteer of Planetary Nomenclature).
// Schlüssel = lateinischer Deskriptor (Einzahl), Wert = [deutsche Bezeichnung, Gruppe].
const TYPES = {
  Crater: ['Krater', 'crater'], Cavus: ['Senke', 'crater'], 'Large ringed feature': ['Großer Ringkomplex', 'crater'],
  Mons: ['Berg / Gebirge', 'mountain'], Tholus: ['Kuppe', 'mountain'], Collis: ['Hügelgruppe', 'mountain'],
  Mensa: ['Tafelberg', 'mountain'], Dorsum: ['Rücken', 'mountain'], Rupes: ['Steilstufe', 'mountain'],
  Scopulus: ['Steilwand', 'mountain'], Saxum: ['Felsblock', 'mountain'], Labes: ['Rutschung', 'mountain'],
  Lingula: ['Hochlandzunge', 'mountain'], Promontorium: ['Kap', 'mountain'], Flexus: ['Windung', 'mountain'],
  Planitia: ['Tiefebene', 'plain'], Planum: ['Hochebene', 'plain'], Mare: ['Meer (Mare)', 'plain'],
  Oceanus: ['Ozean', 'plain'], Lacus: ['See (Lacus)', 'plain'], Palus: ['Sumpf (Palus)', 'plain'],
  Sinus: ['Bucht (Sinus)', 'plain'], Vastitas: ['Weite Ebene', 'plain'], Lacuna: ['Trockensee', 'plain'],
  Fretum: ['Meerenge', 'plain'], Insula: ['Insel', 'plain'],
  Vallis: ['Tal', 'valley'], Fossa: ['Graben', 'valley'], Chasma: ['Schlucht', 'valley'], Rima: ['Rille', 'valley'],
  Catena: ['Kraterkette', 'valley'], Labyrinthus: ['Talsystem', 'valley'], Sulcus: ['Furchenbündel', 'valley'],
  Flumen: ['Flusskanal', 'valley'], Serpens: ['Schlangenrücken', 'valley'], Linea: ['Lineament', 'valley'],
  Regio: ['Region', 'region'], Terra: ['Hochland (Terra)', 'region'], Tessera: ['Tessera (Mosaikgelände)', 'region'],
  Chaos: ['Chaosgelände', 'region'], Unda: ['Dünenfeld', 'region'], 'Albedo Feature': ['Albedo-Struktur', 'region'],
  Macula: ['Dunkler Fleck', 'region'], Facula: ['Heller Fleck', 'region'], Corona: ['Corona (Ringstruktur)', 'region'],
  Arcus: ['Bogenstruktur', 'region'], Virga: ['Streifenstruktur', 'region'],
  Patera: ['Vulkan-Caldera (Patera)', 'volcano'], Fluctus: ['Lavastrom', 'volcano'],
  'Eruptive center': ['Eruptionszentrum', 'volcano'], Farrum: ['Pfannkuchendom', 'volcano'],
  Statio: ['Landestelle', 'other'],
};

// Gruppen: deutsche Bezeichnung + Farbe (Beschriftung und Legende)
export const CLASSES = {
  crater: { de: 'Krater', color: '#f3f6fc' },
  mountain: { de: 'Berge & Rücken', color: '#ffd7a0' },
  plain: { de: 'Ebenen & Meere', color: '#a9d3ff' },
  valley: { de: 'Täler & Gräben', color: '#9ae6bf' },
  region: { de: 'Regionen', color: '#d9bdff' },
  volcano: { de: 'Vulkanisches', color: '#ff9e7c' },
  other: { de: 'Sonstiges', color: '#e0e6f2' },
};

export const typeInfo = (type) => {
  const [de, cls] = TYPES[type] ?? [type, 'other'];
  return { de, cls };
};
