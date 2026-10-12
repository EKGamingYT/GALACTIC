// Himmelskörper des Atlas.
// Physikalische Werte: NASA Planetary Fact Sheet (nssdc.gsfc.nasa.gov/planetary/factsheet).
// Bahnelemente: E. M. Standish, "Keplerian Elements for Approximate Positions of the
// Major Planets", JPL (ssd.jpl.nasa.gov/planets/approx_pos.html), Tabelle 1, gültig 1800–2050.
// Format: [a (AU), e, I (°), L (°), Länge Perihel ϖ (°), Länge aufst. Knoten Ω (°)]
// plus Änderung pro julianischem Jahrhundert in gleicher Reihenfolge.

const trekTiles = (body, layer) =>
  `https://trek.nasa.gov/tiles/${body}/EQ/${layer}/1.0.0/default/default028mm/{z}/{y}/{x}.jpg`;

export const BODIES = [
  {
    id: 'sun', name: 'Sonne', type: 'Stern', color: '#ffcc55',
    radiusKm: 695700, gravity: 274, dayHours: 609.1, meanTempC: 5500, moons: null,
  },
  {
    id: 'mercury', name: 'Merkur', type: 'Planet', color: '#a3a3a3',
    radiusKm: 2439.7, gravity: 3.7, dayHours: 4222.6, meanTempC: 167, moons: 0,
    elements: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    rates: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  },
  {
    id: 'venus', name: 'Venus', type: 'Planet', color: '#e8c27a',
    radiusKm: 6051.8, gravity: 8.9, dayHours: 2802, meanTempC: 464, moons: 0,
    elements: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    rates: [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
  },
  {
    id: 'earth', name: 'Erde', type: 'Planet', color: '#4a86e8',
    radiusKm: 6371, gravity: 9.8, dayHours: 24, meanTempC: 15, moons: 1,
    elements: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0],
    rates: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0],
    map: {
      // NASA GIBS: Blue Marble, EPSG:4326, 512-px-Kacheln.
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-08-01/500m/{z}/{y}/{x}.jpeg',
      tileSize: 512, maxLevel: 7, credit: 'NASA GIBS – Blue Marble',
      // GIBS-EPSG:4326-Raster: Kachel auf Ebene 0 = 288°, Ursprung (-180, 90)
      tilingRect: [-180, -198, 396, 90],
    },
    children: ['moon'],
  },
  {
    id: 'moon', name: 'Mond', type: 'Mond', parent: 'earth', color: '#cfcfcf',
    radiusKm: 1737.4, gravity: 1.62, dayHours: 708.7, meanTempC: -20, moons: null,
    map: {
      url: trekTiles('Moon', 'LRO_WAC_Mosaic_Global_303ppd_v02'),
      tileSize: 256, maxLevel: 8, credit: 'NASA Moon Trek – LRO WAC Mosaik',
    },
  },
  {
    id: 'mars', name: 'Mars', type: 'Planet', color: '#c8532a',
    radiusKm: 3389.5, gravity: 3.7, dayHours: 24.7, meanTempC: -65, moons: 2,
    elements: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    rates: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
    map: {
      url: trekTiles('Mars', 'Mars_Viking_MDIM21_ClrMosaic_global_232m'),
      tileSize: 256, maxLevel: 7, credit: 'NASA Mars Trek – Viking MDIM 2.1 Farbmosaik',
    },
  },
  {
    id: 'jupiter', name: 'Jupiter', type: 'Planet', color: '#d9b38c', texture: 'bands',
    radiusKm: 69911, gravity: 23.1, dayHours: 9.9, meanTempC: -110, moons: 95,
    elements: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    rates: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  },
  {
    id: 'saturn', name: 'Saturn', type: 'Planet', color: '#e6d39c', texture: 'bands', ring: true,
    radiusKm: 58232, gravity: 9.0, dayHours: 10.7, meanTempC: -140, moons: 274,
    elements: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    rates: [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  },
  {
    id: 'uranus', name: 'Uranus', type: 'Planet', color: '#a6dde6', texture: 'bands',
    radiusKm: 25362, gravity: 8.7, dayHours: 17.2, meanTempC: -195, moons: 29,
    elements: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
    rates: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  },
  {
    id: 'neptune', name: 'Neptun', type: 'Planet', color: '#4a6ee0', texture: 'bands',
    radiusKm: 24622, gravity: 11.0, dayHours: 16.1, meanTempC: -200, moons: 16,
    elements: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    rates: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.01262724],
  },
  {
    id: 'pluto', name: 'Pluto', type: 'Zwergplanet', color: '#cdb59c',
    radiusKm: 1188.3, gravity: 0.62, dayHours: 153.3, meanTempC: -225, moons: 5,
    elements: [39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
    rates: [-0.00031596, 0.0000517, 0.00004818, 145.20780515, -0.04062942, -0.01183482],
  },
];

export const bodyById = (id) => BODIES.find((b) => b.id === id);
export const mappedBodies = () => BODIES.filter((b) => b.map);
