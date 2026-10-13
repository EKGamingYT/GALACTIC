// Zusätzliche Karten-Layer der NASA Solar System Treks (WMTS, äquirektangulär, 2x1 Kacheln auf Stufe 0).
// Alle Layer wurden gegen die Server geprüft: WMTSCapabilities.xml (echtes TileMatrix-Maximum und Format) sowie
// eine echte Kachel -> HTTP 200 mit "Access-Control-Allow-Origin: *". Erde, Mond und Mars sind separat eingebunden.
// Quelle: https://trek.nasa.gov (NASA/JPL-Caltech, öffentlich nutzbar); Mosaike teils von DLR, ESA, JAXA.
// URL-Schema: https://trek.nasa.gov/tiles/{Körper}/EQ/{Layer}/1.0.0/default/default028mm/{z}/{y}/{x}.{ext}
export const PLANET_MAPS = {
  mercury: [
    { name: 'Farbmosaik', url: 'https://trek.nasa.gov/tiles/Mercury/EQ/Mercury_MESSENGER_MDIS_Basemap_EnhancedColor_Mosaic_Global_665m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg', maxLevel: 7, credit: 'NASA Mercury Trek – MESSENGER MDIS Enhanced-Color-Mosaik' },
    { name: 'Graustufen 166 m', url: 'https://trek.nasa.gov/tiles/Mercury/EQ/Mercury_MESSENGER_MDIS_Basemap_BDR_Mosaic_Global_166m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg', maxLevel: 7, credit: 'NASA Mercury Trek – MESSENGER MDIS Basemap (BDR)' },
    { name: 'Relief (farbig)', url: 'https://trek.nasa.gov/tiles/Mercury/EQ/Mercury_Messenger_USGS_DEM_665m_v2_HillshadeColor/1.0.0/default/default028mm/{z}/{y}/{x}.png', maxLevel: 5, credit: 'NASA Mercury Trek – MESSENGER MDIS/MLA, USGS-DEM-Hillshade' },
  ],
  venus: [
    { name: 'Radar-Farbmosaik', url: 'https://trek.nasa.gov/tiles/Venus/EQ/Venus_Magellan_C3-MDIR_Colorized_Global_Mosaic_4641m/1.0.0/default/default028mm/{z}/{y}/{x}.png', maxLevel: 4, credit: 'NASA Venus Trek – Magellan SAR (koloriert)' },
    { name: 'Radar-Mosaik 2 km', url: 'https://trek.nasa.gov/tiles/Venus/EQ/Venus_Magellan_C3-MDIR_Global_Mosaic_2025m/1.0.0/default/default028mm/{z}/{y}/{x}.png', maxLevel: 5, credit: 'NASA Venus Trek – Magellan SAR C3-MDIR' },
    { name: 'Relief (farbig)', url: 'https://trek.nasa.gov/tiles/Venus/EQ/Venus_Magellan_ClrHillshade_Global_4641m_gapfilled_v02/1.0.0/default/default028mm/{z}/{y}/{x}.png', maxLevel: 4, credit: 'NASA Venus Trek – Magellan SAR, Color-Hillshade' },
  ],
  ceres: [
    { name: 'Dawn-Mosaik (LAMO)', url: 'https://trek.nasa.gov/tiles/Ceres/EQ/CE_LAMO_G_00N_180E_EQU_CLR_scale.eq/1.0.0/default/default028mm/{z}/{y}/{x}.jpg', maxLevel: 7, credit: 'NASA Ceres Trek – Dawn FC LAMO-Mosaik' },
    { name: 'Relief (farbig)', url: 'https://trek.nasa.gov/tiles/Ceres/EQ/Ceres_Dawn_FC_HAMO_ClrShade_DLR_Global_60ppd_Oct2016/1.0.0/default/default028mm/{z}/{y}/{x}.jpg', maxLevel: 5, credit: 'NASA Ceres Trek – Dawn FC HAMO, DLR Color-Shaded-Relief' },
    { name: 'Relief (Hillshade)', url: 'https://trek.nasa.gov/tiles/Ceres/EQ/Ceres_Dawn_FC_HAMO_Shade_DLR_Global_60ppd_Oct2016/1.0.0/default/default028mm/{z}/{y}/{x}.jpg', maxLevel: 5, credit: 'NASA Ceres Trek – Dawn FC HAMO, DLR Hillshade' },
  ],
  vesta: [
    { name: 'Echtfarben', url: 'https://trek.nasa.gov/tiles/Vesta/EQ/Vesta_Dawn_HAMO_TrueClr_DLR_global_74ppd_IAU/1.0.0/default/default028mm/{z}/{y}/{x}.png', maxLevel: 6, credit: 'NASA Vesta Trek – Dawn FC HAMO, DLR Farbbild' },
    { name: 'Graustufen HAMO/LAMO', url: 'https://trek.nasa.gov/tiles/Vesta/EQ/VestaHAMOLAMOBlend.eq/1.0.0/default/default028mm/{z}/{y}/{x}.png', maxLevel: 7, credit: 'NASA Vesta Trek – Dawn FC HAMO/LAMO-Blend' },
    { name: 'Relief (farbig)', url: 'https://trek.nasa.gov/tiles/Vesta/EQ/Vesta_Dawn_HAMO_ClrShade_DLR_Global_48ppd/1.0.0/default/default028mm/{z}/{y}/{x}.png', maxLevel: 5, credit: 'NASA Vesta Trek – Dawn FC HAMO, DLR Color-Hillshade' },
  ],
  titan: [
    { name: 'ISS-Albedo (938 nm)', url: 'https://trek.nasa.gov/tiles/Titan/EQ/TitanISS2018June.proj.scale/1.0.0/default/default028mm/{z}/{y}/{x}.jpg', maxLevel: 3, credit: 'NASA Titan Trek – Cassini ISS Globalmosaik' },
    { name: 'VIMS-Farbverhältnis', url: 'https://trek.nasa.gov/tiles/Titan/EQ/Titan_global_32ppd_ColorRatio_v2/1.0.0/default/default028mm/{z}/{y}/{x}.png', maxLevel: 4, credit: 'NASA Titan Trek – Cassini VIMS Farbverhältnis-Mosaik' },
    { name: 'Radar (SAR)', url: 'https://trek.nasa.gov/tiles/Titan/EQ/Titan_SAR_HiSAR_MosaicThru_T104_Jan2015_clon180_128ppd/1.0.0/default/default028mm/{z}/{y}/{x}.png', maxLevel: 6, credit: 'NASA Titan Trek – Cassini RADAR SAR HiSAR-Mosaik' },
  ],
  europa: [
    { name: 'Farbmosaik', url: 'https://trek.nasa.gov/tiles/Europa/EQ/20150218_europa_global_map_20000x10000/1.0.0/default/default028mm/{z}/{y}/{x}.png', maxLevel: 5, credit: 'NASA Europa Trek – Voyager/Galileo SSI Farb-Blend-Mosaik' },
    { name: 'Graustufen 500 m', url: 'https://trek.nasa.gov/tiles/Europa/EQ/Europa_Voyager_GalileoSSI_global_mosaic_500m/1.0.0/default/default028mm/{z}/{y}/{x}.png', maxLevel: 5, credit: 'NASA Europa Trek – Voyager/Galileo SSI Mosaik' },
  ],
  ganymede: [
    { name: 'Farbmosaik', url: 'https://trek.nasa.gov/tiles/Ganymede/EQ/Ganymede_Voyager_GalileoSSI_Global_ClrMosaic_1435m/1.0.0/default/default028mm/{z}/{y}/{x}.png', maxLevel: 4, credit: 'NASA Ganymede Trek – Voyager/Galileo SSI Farbmosaik' },
    { name: 'Mosaik 359 m (mit Juno)', url: 'https://trek.nasa.gov/tiles/Ganymede/EQ/Ganymede_global_equi_000_359m_Juno/1.0.0/default/default028mm/{z}/{y}/{x}.png', maxLevel: 6, credit: 'NASA Ganymede Trek – Voyager, Galileo SSI und Juno JunoCam' },
  ],
  io: [
    { name: 'Farbmosaik', url: 'https://trek.nasa.gov/tiles/Io/EQ/Io_GalileoSSI_Voyager_Global_Mosaic_ClrMerge_1km/1.0.0/default/default028mm/{z}/{y}/{x}.png', maxLevel: 4, credit: 'NASA Io Trek – Voyager ISS/Galileo SSI Farbmosaik' },
    { name: 'Graustufen 1 km', url: 'https://trek.nasa.gov/tiles/Io/EQ/Io_GalileoSSI_Voyager_Global_Mosaic_1km/1.0.0/default/default028mm/{z}/{y}/{x}.png', maxLevel: 4, credit: 'NASA Io Trek – Voyager ISS/Galileo SSI Mosaik' },
    { name: 'Relief (farbig)', url: 'https://trek.nasa.gov/tiles/Io/EQ/IoDEM_ClrHillshade/1.0.0/default/default028mm/{z}/{y}/{x}.png', maxLevel: 4, credit: 'NASA Io Trek – Voyager/Galileo, DEM-Color-Hillshade' },
  ],
  callisto: [
    { name: 'Globalmosaik 1 km', url: 'https://trek.nasa.gov/tiles/Callisto/EQ/Callisto_Voyager_GalileoSSI_global_mosaic_1km/1.0.0/default/default028mm/{z}/{y}/{x}.png', maxLevel: 5, credit: 'NASA Callisto Trek – Voyager/Galileo SSI Mosaik' },
  ],
  enceladus: [
    { name: 'Farbmosaik', url: 'https://trek.nasa.gov/tiles/Enceladus/EQ/Enceladus_cyl_KH/1.0.0/default/default028mm/{z}/{y}/{x}.jpg', maxLevel: 5, credit: 'NASA Enceladus Trek – Cassini ISS Farbmosaik' },
    { name: 'Graustufen 100 m', url: 'https://trek.nasa.gov/tiles/Enceladus/EQ/Enceladus_Cassini_ISS_Global_Mosaic_100m_HPF/1.0.0/default/default028mm/{z}/{y}/{x}.png', maxLevel: 5, credit: 'NASA Enceladus Trek – Cassini ISS HPF-Mosaik' },
    { name: 'Relief (farbig)', url: 'https://trek.nasa.gov/tiles/Enceladus/EQ/Cassini_ISS_ClrHillshade_375m_Global/1.0.0/default/default028mm/{z}/{y}/{x}.png', maxLevel: 3, credit: 'NASA Enceladus Trek – Cassini ISS, Color-Hillshade' },
  ],
  mimas: [
    { name: 'Cassini-Mosaik', url: 'https://trek.nasa.gov/tiles/Mimas/EQ/MI_170630_DLR_basemap/1.0.0/default/default028mm/{z}/{y}/{x}.jpg', maxLevel: 4, credit: 'NASA Icy Moons Trek – Cassini ISS Globalmosaik (DLR); deckt nur ±87° Breite ab' },
  ],
  dione: [
    { name: 'Cassini-Mosaik (DLR)', url: 'https://trek.nasa.gov/tiles/Dione/EQ/DI_120723_DLR_basemap/1.0.0/default/default028mm/{z}/{y}/{x}.png', maxLevel: 5, credit: 'NASA Icy Moons Trek – Cassini ISS Globalmosaik (DLR)' },
    { name: 'Cassini/Voyager 154 m', url: 'https://trek.nasa.gov/tiles/Dione/EQ/Dione_Cassini_Voyageglobal_154m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg', maxLevel: 5, credit: 'NASA Icy Moons Trek – Cassini ISS und Voyager Globalmosaik' },
  ],
  rhea: [
    { name: 'Cassini-Mosaik', url: 'https://trek.nasa.gov/tiles/Rhea/EQ/RH_120803_DLR_basemap/1.0.0/default/default028mm/{z}/{y}/{x}.jpg', maxLevel: 4, credit: 'NASA Icy Moons Trek – Cassini ISS Globalmosaik (DLR)' },
  ],
  tethys: [
    { name: 'Cassini-Mosaik (DLR)', url: 'https://trek.nasa.gov/tiles/Tethys/EQ/TE_131203_DLR_basemap/1.0.0/default/default028mm/{z}/{y}/{x}.jpg', maxLevel: 4, credit: 'NASA Icy Moons Trek – Cassini ISS Globalmosaik (DLR)' },
    { name: 'Cassini 293 m', url: 'https://trek.nasa.gov/tiles/Tethys/EQ/Tethys_Cassini_mosaic_global_293m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg', maxLevel: 4, credit: 'NASA Icy Moons Trek – Cassini ISS Globalmosaik' },
  ],
  iapetus: [
    { name: 'Cassini/Voyager 783 m', url: 'https://trek.nasa.gov/tiles/Iapetus/EQ/Iapetus_Cassini_Voyager_mosaic_global_783m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg', maxLevel: 3, credit: 'NASA Icy Moons Trek – Cassini ISS und Voyager Globalmosaik' },
    { name: 'Cassini-Mosaik (DLR)', url: 'https://trek.nasa.gov/tiles/Iapetus/EQ/IA_080529_DLR_basemap/1.0.0/default/default028mm/{z}/{y}/{x}.jpg', maxLevel: 4, credit: 'NASA Icy Moons Trek – Cassini ISS Globalmosaik (DLR); deckt nur ±87° Breite ab' },
  ],
  phoebe: [
    { name: 'Cassini-Mosaik', url: 'https://trek.nasa.gov/tiles/Phoebe/EQ/PH_060315_DLR_basemap/1.0.0/default/default028mm/{z}/{y}/{x}.jpg', maxLevel: 2, credit: 'NASA Icy Moons Trek – Cassini ISS Globalmosaik (DLR)' },
  ],
  phobos: [
    { name: 'Ortho-Mosaik 4 m', url: 'https://trek.nasa.gov/tiles/Phobos/EQ/Base_Orthomosaik_MExLab/1.0.0/default/default028mm/{z}/{y}/{x}.png', maxLevel: 5, credit: 'NASA Phobos Trek – Mars Express SRC und Viking Orbiter VIS' },
    { name: 'Viking-Mosaik', url: 'https://trek.nasa.gov/tiles/Phobos/EQ/Phobos_Viking_Mosaic_40ppd_DLRcontrol/1.0.0/default/default028mm/{z}/{y}/{x}.jpg', maxLevel: 5, credit: 'NASA Phobos Trek – Viking Orbiter VIS Mosaik (DLR-Kontrolle)' },
    { name: 'Relief (farbig, grob)', url: 'https://trek.nasa.gov/tiles/Phobos/EQ/ClrHillshade_DTM_MExLab_200_final/1.0.0/default/default028mm/{z}/{y}/{x}.png', maxLevel: 0, credit: 'NASA Phobos Trek – Mars Express SRC und Viking Orbiter, Color-Hillshade' },
  ],
  ryugu: [
    { name: 'Hayabusa2-Mosaik', url: 'https://trek.nasa.gov/tiles/Ryugu/EQ/ryugu_global_v_band/1.0.0/default/default028mm/{z}/{y}/{x}.jpg', maxLevel: 4, credit: 'NASA Ryugu Trek – Hayabusa2 ONC-T Globalmosaik (JAXA)' },
  ],
  bennu: [
    { name: 'OSIRIS-REx-Mosaik', url: 'https://trek.nasa.gov/tiles/Bennu/EQ/Bennu_Global_Print_Mosaic_fix/1.0.0/default/default028mm/{z}/{y}/{x}.jpg', maxLevel: 7, credit: 'NASA Bennu Trek – OSIRIS-REx OCAMS Globalmosaik' },
  ],
};

// Mittlerer Radius der Körper in km (JPL Solar System Dynamics bzw. IAU-WGCCRE).
export const TREK_RADIUS_KM = {
  mercury: 2439.4, // IAU/JPL
  venus: 6051.8, // IAU/JPL
  ceres: 469.7, // JPL SBDB
  vesta: 261.385, // JPL SBDB
  titan: 2574.76, // JPL SSD
  europa: 1560.8, // JPL SSD
  ganymede: 2631.2, // JPL SSD
  io: 1821.49, // JPL SSD
  callisto: 2410.3, // JPL SSD
  enceladus: 252.1, // JPL SSD
  mimas: 198.2, // JPL SSD
  dione: 561.4, // JPL SSD
  rhea: 763.5, // JPL SSD
  tethys: 531.1, // JPL SSD
  iapetus: 734.3, // JPL SSD
  phoebe: 106.5, // JPL SSD
  phobos: 11.08, // JPL SSD
  ryugu: 0.448, // JPL SBDB
  bennu: 0.24222, // JPL SBDB
};
