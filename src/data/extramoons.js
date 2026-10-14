// Monde von Zwergplaneten und Asteroiden, die die JPL-Satellitentabellen nicht führen.
// Werte aus der Fachliteratur (gerundet, teils unsicher); Bahnlage im Atlas schematisch
// (Ebene der Ekliptik), weil Neigung/Phase für die meisten nur grob bekannt sind.
// Quellen: Brown & Butler 2018 (Dysnomia), Ragozzine & Brown 2009 (Haumea-Monde),
// Parker et al. 2016 (MK2), Kiss et al. 2017 (Xiangliu), Morgado et al. 2023 (Weywot),
// Brown et al. 2010 / Sickafoose et al. 2019 (Vanth), Daly et al. 2023 / Thomas et al. 2023 (Dimorphos).
const base = { e: 0, iDeg: 0, nodeDeg: 0, periDeg: 0, MDeg: 0, epochJd: 2451545, frameCode: 'ecliptic', framePole: null,
  frame: 'Ekliptik (schematisch)', retrograde: false, gm: null, densityGcm3: null, albedo: null, major: true, schematic: true };

export const EXTRA_MOONS = [
  { ...base, id: 'dysnomia', name: 'Dysnomia', parent: 'eris', aKm: 37273, periodDays: 15.786, radiusKm: 350,
    description: 'Einziger bekannter Mond der Eris (entdeckt 2005). Über seine Bahn ließ sich die Masse der Eris bestimmen.' },
  { ...base, id: 'hiiaka', name: 'Hiʻiaka', parent: 'haumea', aKm: 49880, periodDays: 49.12, radiusKm: 160,
    description: 'Äußerer und größerer Mond Haumeas, mit Oberfläche aus fast reinem Wassereis.' },
  { ...base, id: 'namaka', name: 'Namaka', parent: 'haumea', aKm: 25657, periodDays: 18.28, radiusKm: 85,
    description: 'Innerer, kleinerer Mond Haumeas auf einer gestörten, exzentrischen Bahn.' },
  { ...base, id: 'mk2', name: 'S/2015 (136472) 1 (MK2)', parent: 'makemake', aKm: 21000, periodDays: 12.4, radiusKm: 87,
    description: 'Dunkler kleiner Mond des Makemake, 2016 mit dem Hubble-Teleskop entdeckt; Bahn noch kaum bestimmt.' },
  { ...base, id: 'xiangliu', name: 'Xiangliu', parent: 'gonggong', aKm: 24021, periodDays: 25.22, radiusKm: 50,
    description: 'Mond des Gonggong, auf Hubble-Archivbildern gefunden (2016).' },
  { ...base, id: 'weywot', name: 'Weywot', parent: 'quaoar', aKm: 13289, periodDays: 12.43, radiusKm: 85,
    description: 'Mond des Quaoar; liegt in Resonanz mit Quaoars ungewöhnlichem Ring.' },
  { ...base, id: 'vanth', name: 'Vanth', parent: 'orcus', aKm: 9000, periodDays: 9.54, radiusKm: 221,
    description: 'Großer Mond des Orcus – im Verhältnis zu seinem Zentralkörper ähnlich groß wie Charon zu Pluto.' },
  { ...base, id: 'dimorphos', name: 'Dimorphos', parent: 'didymos', aKm: 1.19, periodDays: 0.4733, radiusKm: 0.0755,
    description: 'Ziel der NASA-Mission DART: Der Einschlag am 26.9.2022 verkürzte seine Umlaufzeit um 33 Minuten auf ≈ 11,37 h.' },
];
