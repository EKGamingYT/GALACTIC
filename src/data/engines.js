// Triebwerkskatalog für das Ingenieurstool.
// Nur veröffentlichte Werte (Hersteller, Raumfahrtagenturen). Wo kein belastbarer Wert vorliegt: null.
// Alle Werte wurden zusätzlich mit der Sammeltabelle „Comparison of orbital rocket engines“
// (Wikipedia, Stand 2026-10) abgeglichen, die die jeweiligen Primärquellen verlinkt.
//
// Felder:
//   schubSL_kN / schubVak_kN  Schub auf Meereshöhe / im Vakuum (kN, Feststoff: Maximalschub)
//   ispSL_s / ispVak_s        spezifischer Impuls Meereshöhe / Vakuum (s)
//   masse_kg                  Triebwerks-Trockenmasse (bei Feststoffmotoren: null, steckt in der Stufe)
//   leistung_kW               nur elektrische Antriebe: elektrische Eingangsleistung
//   art                       'fluessig' | 'fest' | 'elektrisch'
//   hinweis                   Einschränkungen der Angabe

const ABGLEICH = 'https://en.wikipedia.org/wiki/Comparison_of_orbital_rocket_engines';

const SPACEX_F9 = { name: 'SpaceX – Falcon 9', url: 'https://www.spacex.com/vehicles/falcon-9/' };
const SPACEX_SS = { name: 'SpaceX – Starship', url: 'https://www.spacex.com/vehicles/starship/' };
const ENERGOMASH = { name: 'NPO Energomasch', url: 'https://www.engine.space/' };
const L3H_RS25 = { name: 'L3Harris (Aerojet Rocketdyne) – RS-25', url: 'https://www.l3harris.com/all-capabilities/rs-25-engine' };
const L3H_RL10 = { name: 'L3Harris (Aerojet Rocketdyne) – RL10', url: 'https://www.l3harris.com/all-capabilities/rl10-engine' };
const BLUE = { name: 'Blue Origin – Engines', url: 'https://www.blueorigin.com/engines' };
const ESA_A6 = { name: 'ESA – Ariane 6', url: 'https://www.esa.int/Enabling_Support/Space_Transportation/Ariane' };
const ESA_A5 = { name: 'ESA – Ariane 5', url: 'https://www.esa.int/Enabling_Support/Space_Transportation/Ariane' };
const ROCKETLAB = { name: 'Rocket Lab – Electron', url: 'https://www.rocketlabusa.com/launch/electron/' };
const CALT = { name: 'CALT / CASC (über Abgleichtabelle)', url: ABGLEICH };
const ISRO_PSLV = { name: 'ISRO – PSLV', url: 'https://www.isro.gov.in/PSLV_CON.html' };
const ISRO_LVM3 = { name: 'ISRO – LVM3', url: 'https://www.isro.gov.in/LVM3.html' };
const JAXA_H2A = { name: 'JAXA – H-IIA', url: 'https://global.jaxa.jp/projects/rockets/h2a/' };
const JAXA_H3 = { name: 'JAXA – H3', url: 'https://global.jaxa.jp/projects/rockets/h3/' };
const NASA_SATURN = { name: 'NASA – Saturn V News Reference (1968)', url: 'https://www.nasa.gov/history/afj/ap08fj/pdf/sat5-newsref.pdf' };
const NASA_SRB = { name: 'NASA – SLS Solid Rocket Booster Fact Sheet', url: 'https://www.nasa.gov/wp-content/uploads/2022/02/sls_solid_rocket_booster_fact_sheet_final_508_june2018.pdf' };
const NASA_SEP = { name: 'NASA Glenn – Solar Electric Propulsion', url: 'https://www1.grc.nasa.gov/space/sep/' };
const ESA_SMART1 = { name: 'ESA – SMART-1 Elektrischer Antrieb', url: 'https://www.esa.int/Science_Exploration/Space_Science/SMART-1' };
const FAKEL = { name: 'OKB Fakel – SPT-100', url: 'https://www.fakel-russia.com/en/' };

export const ENGINES = [
  // --- Flüssigtriebwerke: USA -------------------------------------------------------------
  {
    id: 'merlin-1d', name: 'Merlin 1D', hersteller: 'SpaceX', land: 'USA', treibstoff: 'RP-1 / LOX', art: 'fluessig',
    schubSL_kN: 845, schubVak_kN: 914, ispSL_s: 282, ispVak_s: 311, masse_kg: 470,
    einsatz: ['Falcon 9', 'Falcon Heavy'], quelle: SPACEX_F9,
    hinweis: 'Schub = Stufenschub (7.607 / 8.227 kN) ÷ 9; Isp aus früheren SpaceX-Datenblättern.',
  },
  {
    id: 'merlin-vac', name: 'Merlin 1D Vacuum', hersteller: 'SpaceX', land: 'USA', treibstoff: 'RP-1 / LOX', art: 'fluessig',
    schubSL_kN: null, schubVak_kN: 981, ispSL_s: null, ispVak_s: 348, masse_kg: null,
    einsatz: ['Falcon 9 (2. Stufe)', 'Falcon Heavy (2. Stufe)'], quelle: SPACEX_F9,
  },
  {
    id: 'raptor-2', name: 'Raptor 2', hersteller: 'SpaceX', land: 'USA', treibstoff: 'CH₄ / LOX', art: 'fluessig',
    schubSL_kN: 2256, schubVak_kN: null, ispSL_s: null, ispVak_s: 347, masse_kg: 1630,
    einsatz: ['Starship Super Heavy', 'Starship'], quelle: SPACEX_SS,
    hinweis: 'SpaceX-Angabe (2024): 230 tf, 347 s, 1.630 kg. Bezugsdruck der Isp nicht genannt – hier als Vakuumwert geführt; Bodenwert unveröffentlicht.',
  },
  {
    id: 'raptor-vac', name: 'Raptor Vacuum (Gen. 2)', hersteller: 'SpaceX', land: 'USA', treibstoff: 'CH₄ / LOX', art: 'fluessig',
    schubSL_kN: null, schubVak_kN: 2530, ispSL_s: null, ispVak_s: null, masse_kg: null,
    einsatz: ['Starship'], quelle: SPACEX_SS,
    hinweis: 'Offizielle Isp nicht veröffentlicht – Δv-Berechnung erst mit eigenem Wert möglich.',
  },
  {
    id: 'rs-25', name: 'RS-25 (109 % RPL)', hersteller: 'Aerojet Rocketdyne / L3Harris', land: 'USA', treibstoff: 'LH₂ / LOX', art: 'fluessig',
    schubSL_kN: 1860, schubVak_kN: 2279, ispSL_s: 366, ispVak_s: 452.3, masse_kg: 3527,
    einsatz: ['Space Shuttle', 'SLS'], quelle: L3H_RS25,
  },
  {
    id: 'rl10b-2', name: 'RL10B-2', hersteller: 'Aerojet Rocketdyne / L3Harris', land: 'USA', treibstoff: 'LH₂ / LOX', art: 'fluessig',
    schubSL_kN: null, schubVak_kN: 110.1, ispSL_s: null, ispVak_s: 465.5, masse_kg: 301,
    einsatz: ['Delta IV (DCSS)', 'SLS (ICPS)'], quelle: L3H_RL10,
  },
  {
    id: 'rl10c-1', name: 'RL10C-1', hersteller: 'Aerojet Rocketdyne / L3Harris', land: 'USA', treibstoff: 'LH₂ / LOX', art: 'fluessig',
    schubSL_kN: null, schubVak_kN: 101.8, ispSL_s: null, ispVak_s: 449.7, masse_kg: 190,
    einsatz: ['Atlas V (Centaur)'], quelle: L3H_RL10,
  },
  {
    id: 'be-4', name: 'BE-4', hersteller: 'Blue Origin', land: 'USA', treibstoff: 'CH₄ / LOX', art: 'fluessig',
    schubSL_kN: 2447, schubVak_kN: null, ispSL_s: null, ispVak_s: null, masse_kg: null,
    einsatz: ['New Glenn', 'Vulcan Centaur'], quelle: BLUE,
    hinweis: '550.000 lbf auf Meereshöhe; Isp vom Hersteller nicht veröffentlicht.',
  },
  {
    id: 'be-3u', name: 'BE-3U', hersteller: 'Blue Origin', land: 'USA', treibstoff: 'LH₂ / LOX', art: 'fluessig',
    schubSL_kN: null, schubVak_kN: 710, ispSL_s: null, ispVak_s: null, masse_kg: null,
    einsatz: ['New Glenn (2. Stufe)'], quelle: BLUE,
    hinweis: '160.000 lbf im Vakuum; Isp vom Hersteller nicht veröffentlicht.',
  },
  {
    id: 'f-1', name: 'F-1', hersteller: 'Rocketdyne', land: 'USA', treibstoff: 'RP-1 / LOX', art: 'fluessig',
    schubSL_kN: 6770, schubVak_kN: 7770, ispSL_s: 263, ispVak_s: 304, masse_kg: 8391,
    einsatz: ['Saturn V (S-IC)'], quelle: NASA_SATURN,
  },
  {
    id: 'j-2', name: 'J-2', hersteller: 'Rocketdyne', land: 'USA', treibstoff: 'LH₂ / LOX', art: 'fluessig',
    schubSL_kN: null, schubVak_kN: 1033.1, ispSL_s: null, ispVak_s: 421, masse_kg: 1438,
    einsatz: ['Saturn V (S-II, S-IVB)', 'Saturn IB'], quelle: NASA_SATURN,
  },
  // --- Flüssigtriebwerke: Russland ----------------------------------------------------------
  {
    id: 'rd-180', name: 'RD-180', hersteller: 'NPO Energomasch', land: 'Russland', treibstoff: 'RP-1 / LOX', art: 'fluessig',
    schubSL_kN: 3827, schubVak_kN: 4152, ispSL_s: 311.9, ispVak_s: 338.4, masse_kg: 5480,
    einsatz: ['Atlas III', 'Atlas V'], quelle: ENERGOMASH,
  },
  {
    id: 'rd-171m', name: 'RD-171M', hersteller: 'NPO Energomasch', land: 'Russland / Ukraine', treibstoff: 'RP-1 / LOX', art: 'fluessig',
    schubSL_kN: 7257, schubVak_kN: 7904, ispSL_s: 309.5, ispVak_s: 337.2, masse_kg: 9300,
    einsatz: ['Zenit', 'Energija (Booster, RD-170)'], quelle: ENERGOMASH,
  },
  {
    id: 'rd-107a', name: 'RD-107A', hersteller: 'NPO Energomasch', land: 'Russland', treibstoff: 'RP-1 / LOX', art: 'fluessig',
    schubSL_kN: 839.5, schubVak_kN: 1020.9, ispSL_s: 263.3, ispVak_s: 320.2, masse_kg: 1090,
    einsatz: ['Sojus-2 (Booster, Block B/W/G/D)'], quelle: ENERGOMASH,
  },
  {
    id: 'rd-108a', name: 'RD-108A', hersteller: 'NPO Energomasch', land: 'Russland', treibstoff: 'RP-1 / LOX', art: 'fluessig',
    schubSL_kN: 792.5, schubVak_kN: 990.2, ispSL_s: 257.7, ispVak_s: 320.6, masse_kg: 1075,
    einsatz: ['Sojus-2 (Zentralblock A)'], quelle: ENERGOMASH,
  },
  {
    id: 'rd-0110', name: 'RD-0110', hersteller: 'KBChA Woronesch', land: 'Russland', treibstoff: 'RP-1 / LOX', art: 'fluessig',
    schubSL_kN: null, schubVak_kN: 298, ispSL_s: null, ispVak_s: 326, masse_kg: null,
    einsatz: ['Sojus-2.1a (Block I)', 'Sojus-U'], quelle: { name: 'KBChA (über Abgleichtabelle)', url: ABGLEICH },
  },
  {
    id: 'rd-0124', name: 'RD-0124', hersteller: 'KBChA Woronesch', land: 'Russland', treibstoff: 'RP-1 / LOX', art: 'fluessig',
    schubSL_kN: null, schubVak_kN: 294.3, ispSL_s: null, ispVak_s: 359, masse_kg: 520,
    einsatz: ['Sojus-2.1b (Block I)', 'Angara (3. Stufe)'], quelle: { name: 'KBChA (über Abgleichtabelle)', url: ABGLEICH },
  },
  // --- Flüssigtriebwerke: Europa -----------------------------------------------------------------
  {
    id: 'vulcain-2', name: 'Vulcain 2', hersteller: 'ArianeGroup', land: 'Europa', treibstoff: 'LH₂ / LOX', art: 'fluessig',
    schubSL_kN: 939.5, schubVak_kN: 1359, ispSL_s: 318, ispVak_s: 429, masse_kg: 1800,
    einsatz: ['Ariane 5 (EPC)'], quelle: ESA_A5,
  },
  {
    id: 'vulcain-2.1', name: 'Vulcain 2.1', hersteller: 'ArianeGroup', land: 'Europa', treibstoff: 'LH₂ / LOX', art: 'fluessig',
    schubSL_kN: null, schubVak_kN: 1370, ispSL_s: null, ispVak_s: null, masse_kg: null,
    einsatz: ['Ariane 6 (LLPM)'], quelle: ESA_A6,
    hinweis: 'Isp für Version 2.1 nicht offiziell beziffert – für Berechnungen eigenen Wert setzen.',
  },
  {
    id: 'vinci', name: 'Vinci', hersteller: 'ArianeGroup', land: 'Europa', treibstoff: 'LH₂ / LOX', art: 'fluessig',
    schubSL_kN: null, schubVak_kN: 180, ispSL_s: null, ispVak_s: 457, masse_kg: 280,
    einsatz: ['Ariane 6 (ULPM)'], quelle: ESA_A6,
  },
  {
    id: 'aestus', name: 'Aestus', hersteller: 'ArianeGroup', land: 'Europa', treibstoff: 'N₂O₄ / MMH', art: 'fluessig',
    schubSL_kN: null, schubVak_kN: 30, ispSL_s: null, ispVak_s: 324, masse_kg: 111,
    einsatz: ['Ariane 5 (EPS)'], quelle: ESA_A5,
  },
  // --- Flüssigtriebwerke: Neuseeland/USA ----------------------------------------------------------
  {
    id: 'rutherford', name: 'Rutherford', hersteller: 'Rocket Lab', land: 'Neuseeland / USA', treibstoff: 'RP-1 / LOX', art: 'fluessig',
    schubSL_kN: 24.9, schubVak_kN: null, ispSL_s: null, ispVak_s: 311, masse_kg: 35,
    einsatz: ['Electron (1. Stufe)'], quelle: ROCKETLAB,
    hinweis: 'Herstellerangabe 311 s ohne Bezugsdruck – hier als Vakuumwert geführt.',
  },
  {
    id: 'rutherford-vac', name: 'Rutherford Vacuum', hersteller: 'Rocket Lab', land: 'Neuseeland / USA', treibstoff: 'RP-1 / LOX', art: 'fluessig',
    schubSL_kN: null, schubVak_kN: 25.8, ispSL_s: null, ispVak_s: 343, masse_kg: null,
    einsatz: ['Electron (2. Stufe)'], quelle: ROCKETLAB,
  },
  // --- Flüssigtriebwerke: China ----------------------------------------------------------------------
  {
    id: 'yf-100', name: 'YF-100', hersteller: 'AALPT (CASC)', land: 'China', treibstoff: 'RP-1 / LOX', art: 'fluessig',
    schubSL_kN: 1199.2, schubVak_kN: 1339.5, ispSL_s: 300, ispVak_s: 335.1, masse_kg: 1912,
    einsatz: ['Langer Marsch 5/6/7 (Booster, 1. Stufe)'], quelle: CALT,
  },
  {
    id: 'yf-77', name: 'YF-77', hersteller: 'AALPT (CASC)', land: 'China', treibstoff: 'LH₂ / LOX', art: 'fluessig',
    schubSL_kN: 518, schubVak_kN: 700, ispSL_s: 316.7, ispVak_s: 428, masse_kg: 1054,
    einsatz: ['Langer Marsch 5 (Zentralstufe)'], quelle: CALT,
  },
  {
    id: 'yf-75d', name: 'YF-75D', hersteller: 'AALPT (CASC)', land: 'China', treibstoff: 'LH₂ / LOX', art: 'fluessig',
    schubSL_kN: null, schubVak_kN: 88.4, ispSL_s: null, ispVak_s: 442.6, masse_kg: 265,
    einsatz: ['Langer Marsch 5 (2. Stufe)'], quelle: CALT,
  },
  // --- Flüssigtriebwerke: Indien ---------------------------------------------------------------------
  {
    id: 'vikas', name: 'Vikas', hersteller: 'ISRO (LPSC)', land: 'Indien', treibstoff: 'N₂O₄ / UDMH', art: 'fluessig',
    schubSL_kN: null, schubVak_kN: 804, ispSL_s: null, ispVak_s: 293, masse_kg: null,
    einsatz: ['PSLV (PS2)', 'GSLV', 'LVM3 (L110)'], quelle: ISRO_PSLV,
  },
  {
    id: 'ce-20', name: 'CE-20', hersteller: 'ISRO (LPSC)', land: 'Indien', treibstoff: 'LH₂ / LOX', art: 'fluessig',
    schubSL_kN: null, schubVak_kN: 186.36, ispSL_s: null, ispVak_s: null, masse_kg: 588,
    einsatz: ['LVM3 (C25)'], quelle: ISRO_LVM3,
    hinweis: 'Isp in den zugänglichen ISRO-Angaben nicht eindeutig – weggelassen.',
  },
  {
    id: 'ps4-l25', name: 'PS4-Triebwerk (L-2-5)', hersteller: 'ISRO (LPSC)', land: 'Indien', treibstoff: 'MON / MMH', art: 'fluessig',
    schubSL_kN: null, schubVak_kN: 7.4, ispSL_s: null, ispVak_s: 308, masse_kg: null,
    einsatz: ['PSLV (PS4, 2 Triebwerke)'], quelle: ISRO_PSLV,
  },
  // --- Flüssigtriebwerke: Japan ----------------------------------------------------------------------
  {
    id: 'le-7a', name: 'LE-7A', hersteller: 'Mitsubishi Heavy Industries', land: 'Japan', treibstoff: 'LH₂ / LOX', art: 'fluessig',
    schubSL_kN: 870, schubVak_kN: 1098, ispSL_s: 338, ispVak_s: 438, masse_kg: 1800,
    einsatz: ['H-IIA', 'H-IIB'], quelle: JAXA_H2A,
  },
  {
    id: 'le-9', name: 'LE-9', hersteller: 'Mitsubishi Heavy Industries', land: 'Japan', treibstoff: 'LH₂ / LOX', art: 'fluessig',
    schubSL_kN: null, schubVak_kN: 1471, ispSL_s: null, ispVak_s: 425, masse_kg: 2400,
    einsatz: ['H3 (1. Stufe)'], quelle: JAXA_H3,
  },
  {
    id: 'le-5b-3', name: 'LE-5B-3', hersteller: 'Mitsubishi Heavy Industries', land: 'Japan', treibstoff: 'LH₂ / LOX', art: 'fluessig',
    schubSL_kN: null, schubVak_kN: 137, ispSL_s: null, ispVak_s: 448, masse_kg: null,
    einsatz: ['H3 (2. Stufe)'], quelle: JAXA_H3,
  },

  // --- Feststoffmotoren (Schub = Maximalschub) -----------------------------------------------------------
  {
    id: 'p120c', name: 'P120C', hersteller: 'Avio / ArianeGroup (Europropulsion)', land: 'Europa', treibstoff: 'HTPB (fest)', art: 'fest',
    schubSL_kN: null, schubVak_kN: 4780, ispSL_s: null, ispVak_s: 280, masse_kg: null,
    einsatz: ['Ariane 6 (Booster)', 'Vega C (1. Stufe)'], quelle: ESA_A6,
    hinweis: 'Maximalschub; reale Brenndauer ≈ 134 s (mittlerer Schub niedriger).',
  },
  {
    id: 'sls-srb', name: 'SLS-Booster (5 Segmente)', hersteller: 'Northrop Grumman', land: 'USA', treibstoff: 'PBAN (fest)', art: 'fest',
    schubSL_kN: 14600, schubVak_kN: 16000, ispSL_s: null, ispVak_s: 269, masse_kg: null,
    einsatz: ['SLS Block 1'], quelle: NASA_SRB,
    hinweis: 'Maximalschub; reale Brenndauer ≈ 126 s.',
  },
  {
    id: 'srb-3', name: 'SRB-3', hersteller: 'IHI Aerospace', land: 'Japan', treibstoff: 'HTPB (fest)', art: 'fest',
    schubSL_kN: null, schubVak_kN: 2300, ispSL_s: null, ispVak_s: 283.6, masse_kg: null,
    einsatz: ['H3 (Booster)'], quelle: JAXA_H3,
    hinweis: 'Maximalschub; reale Brenndauer ≈ 110 s.',
  },
  {
    id: 's139', name: 'S139 (PS1)', hersteller: 'ISRO (VSSC)', land: 'Indien', treibstoff: 'HTPB (fest)', art: 'fest',
    schubSL_kN: null, schubVak_kN: 4847, ispSL_s: 237, ispVak_s: 269, masse_kg: null,
    einsatz: ['PSLV (1. Stufe)'], quelle: ISRO_PSLV,
    hinweis: 'Maximalschub; reale Brenndauer ≈ 110 s.',
  },
  {
    id: 'psom-xl', name: 'PSOM-XL (S12)', hersteller: 'ISRO (VSSC)', land: 'Indien', treibstoff: 'HTPB (fest)', art: 'fest',
    schubSL_kN: null, schubVak_kN: 703.5, ispSL_s: null, ispVak_s: 262, masse_kg: null,
    einsatz: ['PSLV-XL (Booster)'], quelle: ISRO_PSLV,
    hinweis: 'Maximalschub; reale Brenndauer ≈ 70 s.',
  },
  {
    id: 'hps3', name: 'HPS3 / S7 (PS3)', hersteller: 'ISRO (VSSC)', land: 'Indien', treibstoff: 'HTPB (fest)', art: 'fest',
    schubSL_kN: null, schubVak_kN: 250, ispSL_s: null, ispVak_s: 295, masse_kg: null,
    einsatz: ['PSLV (3. Stufe)'], quelle: ISRO_PSLV,
  },

  // --- Elektrische Antriebe (nicht für Startstufen) --------------------------------------------------------
  {
    id: 'next-c', name: 'NEXT-C (Ionentriebwerk)', hersteller: 'NASA Glenn / Aerojet Rocketdyne', land: 'USA', treibstoff: 'Xenon', art: 'elektrisch',
    schubSL_kN: null, schubVak_kN: 0.000236, ispSL_s: null, ispVak_s: 4190, masse_kg: null, leistung_kW: 6.9,
    einsatz: ['DART'], quelle: NASA_SEP,
  },
  {
    id: 'nstar', name: 'NSTAR (Ionentriebwerk)', hersteller: 'NASA / Hughes', land: 'USA', treibstoff: 'Xenon', art: 'elektrisch',
    schubSL_kN: null, schubVak_kN: 0.000092, ispSL_s: null, ispVak_s: 3100, masse_kg: null, leistung_kW: 2.3,
    einsatz: ['Deep Space 1', 'Dawn'], quelle: NASA_SEP,
  },
  {
    id: 'spt-100', name: 'SPT-100 (Hall-Triebwerk)', hersteller: 'OKB Fakel', land: 'Russland', treibstoff: 'Xenon', art: 'elektrisch',
    schubSL_kN: null, schubVak_kN: 0.000083, ispSL_s: null, ispVak_s: 1600, masse_kg: null, leistung_kW: 1.35,
    einsatz: ['Geostationäre Kommunikationssatelliten'], quelle: FAKEL,
  },
  {
    id: 'pps-1350', name: 'PPS-1350-G (Hall-Triebwerk)', hersteller: 'Snecma (Safran)', land: 'Europa', treibstoff: 'Xenon', art: 'elektrisch',
    schubSL_kN: null, schubVak_kN: 0.000068, ispSL_s: null, ispVak_s: 1640, masse_kg: null, leistung_kW: 1.35,
    einsatz: ['SMART-1'], quelle: ESA_SMART1,
  },
];

export const ENGINE_ABGLEICH = { name: 'Wikipedia – Comparison of orbital rocket engines (Abgleich)', url: ABGLEICH };
export const engineById = (id) => ENGINES.find((e) => e.id === id);
