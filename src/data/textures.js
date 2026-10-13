// Oberflächentexturen (in public/textures). Quellen siehe CREDITS.md:
// Planeten/Sonne/Mond: Solar System Scope (CC BY 4.0, basiert auf NASA-Daten);
// Ceres, Vesta: NASA Dawn / USGS (gemeinfrei); Pluto: NASA New Horizons / USGS (gemeinfrei).
// `artistic`: keine echten Aufnahmen vorhanden – künstlerische Darstellung.
export const TEXTURES = {
  sun: { map: '2k_sun.jpg' },
  mercury: { map: '2k_mercury.jpg' },
  venus: { map: '2k_venus_atmosphere.jpg' },
  earth: { map: '2k_earth_daymap.jpg', clouds: '2k_earth_clouds.jpg' },
  moon: { map: '2k_moon.jpg' },
  mars: { map: '2k_mars.jpg' },
  jupiter: { map: '2k_jupiter.jpg' },
  saturn: { map: '2k_saturn.jpg', ring: '2k_saturn_ring_alpha.png' },
  uranus: { map: '2k_uranus.jpg' },
  neptune: { map: '2k_neptune.jpg' },
  pluto: { map: 'pluto_newhorizons.jpg', tint: '#e2c09a' }, // Graustufen-Mosaik → echtes Beige/Rotbraun
  ceres: { map: 'ceres_dawn.jpg' },
  vesta: { map: 'vesta_dawn.jpg' },
  eris: { map: '2k_eris_fictional.jpg', artistic: true },
  haumea: { map: '2k_haumea_fictional.jpg', artistic: true, scale: [1.3, 0.65, 1.05] }, // stark abgeplattet
  makemake: { map: '2k_makemake_fictional.jpg', artistic: true },
};
