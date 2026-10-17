// Vorlagen realer Trägerraketen für das Ingenieurstool.
// Massen gelten je Stufe INSGESAMT (bei Boostern: alle Booster zusammen).
// parallel: true = brennt gleichzeitig mit der darauffolgenden Stufe (Booster/Seitenblöcke).
// null = kein offizieller Wert veröffentlicht → muss vom Nutzer eingetragen werden.
// „abgeleitet“ = aus zwei veröffentlichten Werten berechnet (z. B. Brutto − Treibstoff).
// Sammelquellen: jeweilige Wikipedia-Artikel (Stand 2026-10), die die Primärquellen zitieren.

export const LAUNCHERS = [
  {
    id: 'atlas-v-401', name: 'Atlas V 401', land: 'USA', nutzlast_kg: 5000,
    quelle: { name: 'ULA – Atlas V User’s Guide (2010), über Wikipedia „Atlas V“', url: 'https://en.wikipedia.org/wiki/Atlas_V' },
    stufen: [
      { name: 'Common Core Booster', triebwerke: [{ id: 'rd-180', anzahl: 1 }], treibstoff_kg: 284089, trocken_kg: 21054 },
      { name: 'Centaur III (SEC)', triebwerke: [{ id: 'rl10c-1', anzahl: 1 }], treibstoff_kg: 20830, trocken_kg: 2316,
        hinweis: 'Massen im Handbuch für die RL10A-Variante angegeben.' },
    ],
  },
  {
    id: 'soyuz-21b', name: 'Sojus-2.1b', land: 'Russland', nutzlast_kg: 7000,
    quelle: { name: 'Arianespace – Soyuz User’s Manual, über Wikipedia „Soyuz-2“', url: 'https://en.wikipedia.org/wiki/Soyuz-2' },
    stufen: [
      { name: '4 Booster (Block B/W/G/D)', parallel: true, triebwerke: [{ id: 'rd-107a', anzahl: 4 }], treibstoff_kg: 4 * 39160, trocken_kg: 4 * 3784 },
      { name: 'Zentralblock A', triebwerke: [{ id: 'rd-108a', anzahl: 1 }], treibstoff_kg: 90100, trocken_kg: 6545 },
      { name: 'Block I', triebwerke: [{ id: 'rd-0124', anzahl: 1 }], treibstoff_kg: 25400, trocken_kg: 2355 },
    ],
  },
  {
    id: 'sls-block1', name: 'SLS Block 1', land: 'USA', nutzlast_kg: 27000,
    quelle: { name: 'NASA – SLS Fact Sheets, Northrop Grumman Booster-Broschüre (2020), über Wikipedia „Space Launch System“', url: 'https://en.wikipedia.org/wiki/Space_Launch_System' },
    stufen: [
      { name: '2 Feststoffbooster', parallel: true, triebwerke: [{ id: 'sls-srb', anzahl: 2 }], treibstoff_kg: 2 * 628220, trocken_kg: 2 * 97530,
        hinweis: 'Treibstoff 1.385.000 lb je Booster (Northrop Grumman); Trockenmasse abgeleitet aus 1,6 Mio. lb Bruttomasse (NASA).' },
      { name: 'Zentralstufe', triebwerke: [{ id: 'rs-25', anzahl: 4 }], treibstoff_kg: 984000, trocken_kg: 97940 },
      { name: 'ICPS', triebwerke: [{ id: 'rl10b-2', anzahl: 1 }], treibstoff_kg: 28576, trocken_kg: 3490,
        hinweis: 'Treibstoff abgeleitet (32.066 kg brutto − 3.490 kg leer).' },
    ],
  },
  {
    id: 'ariane-62', name: 'Ariane 62', land: 'Europa', nutzlast_kg: 5000,
    quelle: { name: 'ESA / Avio / DLR / CNES, über Wikipedia „Ariane 6“', url: 'https://en.wikipedia.org/wiki/Ariane_6' },
    stufen: [
      { name: '2 × P120C', parallel: true, triebwerke: [{ id: 'p120c', anzahl: 2 }], treibstoff_kg: 2 * 141400, trocken_kg: 2 * 11200 },
      { name: 'Hauptstufe LLPM', triebwerke: [{ id: 'vulcain-2.1', anzahl: 1 }], treibstoff_kg: 140000, trocken_kg: null,
        hinweis: 'Trockenmasse und Vulcain-2.1-Isp nicht offiziell veröffentlicht – bitte eintragen.' },
      { name: 'Oberstufe ULPM', triebwerke: [{ id: 'vinci', anzahl: 1 }], treibstoff_kg: 32000, trocken_kg: 6000 },
    ],
  },
  {
    id: 'cz-5', name: 'Langer Marsch 5', land: 'China', nutzlast_kg: 10000,
    quelle: { name: 'E. Reich, „Raketen – Die internationale Enzyklopädie“ (2020), über Wikipedia „Long March 5“', url: 'https://en.wikipedia.org/wiki/Long_March_5' },
    stufen: [
      { name: '4 Booster (CZ-5-300)', parallel: true, triebwerke: [{ id: 'yf-100', anzahl: 8 }], treibstoff_kg: 4 * 142800, trocken_kg: 4 * 13800,
        hinweis: 'Treibstoff abgeleitet (156,6 t brutto − 13,8 t leer je Booster).' },
      { name: 'Zentralstufe (CZ-5-500)', triebwerke: [{ id: 'yf-77', anzahl: 2 }], treibstoff_kg: 165300, trocken_kg: 21600,
        hinweis: 'Trockenmasse abgeleitet (186,9 t − 165,3 t).' },
      { name: '2. Stufe (CZ-5-HO)', triebwerke: [{ id: 'yf-75d', anzahl: 2 }], treibstoff_kg: 29100, trocken_kg: 5100 },
    ],
  },
  {
    id: 'h3-22', name: 'H3-22', land: 'Japan', nutzlast_kg: 4000,
    quelle: { name: 'JAXA – H3 Startpläne/„What is SRB-3?“, über Wikipedia „H3 (rocket)“', url: 'https://en.wikipedia.org/wiki/H3_(rocket)' },
    stufen: [
      { name: '2 × SRB-3', parallel: true, triebwerke: [{ id: 'srb-3', anzahl: 2 }], treibstoff_kg: 2 * 67200, trocken_kg: 2 * 9000,
        hinweis: 'Trockenmasse abgeleitet (76,2 t − 67,2 t je Booster).' },
      { name: '1. Stufe', triebwerke: [{ id: 'le-9', anzahl: 2 }], treibstoff_kg: 226000, trocken_kg: 15000,
        hinweis: 'Trockenmasse abgeleitet (241 t − 226 t).' },
      { name: '2. Stufe', triebwerke: [{ id: 'le-5b-3', anzahl: 1 }], treibstoff_kg: 24600, trocken_kg: 3400,
        hinweis: 'Trockenmasse abgeleitet (28 t − 24,6 t).' },
    ],
  },
  {
    id: 'pslv-xl', name: 'PSLV-XL', land: 'Indien', nutzlast_kg: 1500,
    quelle: { name: 'ISRO, über Wikipedia „PSLV“', url: 'https://en.wikipedia.org/wiki/PSLV' },
    stufen: [
      { name: '6 × PSOM-XL', parallel: true, triebwerke: [{ id: 'psom-xl', anzahl: 6 }], treibstoff_kg: 6 * 12200, trocken_kg: null,
        hinweis: 'Real zünden 4 Booster am Boden, 2 in der Luft. Trockenmasse nicht veröffentlicht.' },
      { name: 'PS1 (S139)', triebwerke: [{ id: 's139', anzahl: 1 }], treibstoff_kg: 138200, trocken_kg: 30200 },
      { name: 'PS2 (Vikas)', triebwerke: [{ id: 'vikas', anzahl: 1 }], treibstoff_kg: 42000, trocken_kg: null },
      { name: 'PS3 (HPS3)', triebwerke: [{ id: 'hps3', anzahl: 1 }], treibstoff_kg: 7600, trocken_kg: null },
      { name: 'PS4', triebwerke: [{ id: 'ps4-l25', anzahl: 2 }], treibstoff_kg: 2500, trocken_kg: null },
    ],
  },
  // Für die folgenden Raketen veröffentlichen die Hersteller keine Stufenmassen.
  // Triebwerke und Anzahl sind belegt, Massen müssen selbst eingetragen werden.
  {
    id: 'falcon-9', name: 'Falcon 9 Block 5', land: 'USA', nutzlast_kg: null, ohneMassen: true,
    quelle: { name: 'SpaceX – Falcon 9', url: 'https://www.spacex.com/vehicles/falcon-9/' },
    stufen: [
      { name: '1. Stufe', triebwerke: [{ id: 'merlin-1d', anzahl: 9 }], treibstoff_kg: null, trocken_kg: null },
      { name: '2. Stufe', triebwerke: [{ id: 'merlin-vac', anzahl: 1 }], treibstoff_kg: null, trocken_kg: null },
    ],
  },
  {
    id: 'falcon-heavy', name: 'Falcon Heavy', land: 'USA', nutzlast_kg: null, ohneMassen: true,
    quelle: { name: 'SpaceX – Falcon Heavy', url: 'https://www.spacex.com/vehicles/falcon-heavy/' },
    stufen: [
      { name: '2 Seitenbooster', parallel: true, triebwerke: [{ id: 'merlin-1d', anzahl: 18 }], treibstoff_kg: null, trocken_kg: null },
      { name: 'Zentralstufe', triebwerke: [{ id: 'merlin-1d', anzahl: 9 }], treibstoff_kg: null, trocken_kg: null },
      { name: '2. Stufe', triebwerke: [{ id: 'merlin-vac', anzahl: 1 }], treibstoff_kg: null, trocken_kg: null },
    ],
  },
  {
    id: 'starship', name: 'Starship (Gen. 2)', land: 'USA', nutzlast_kg: null, ohneMassen: true,
    quelle: { name: 'SpaceX – Starship', url: 'https://www.spacex.com/vehicles/starship/' },
    stufen: [
      { name: 'Super Heavy', triebwerke: [{ id: 'raptor-2', anzahl: 33 }], treibstoff_kg: null, trocken_kg: null },
      { name: 'Starship', triebwerke: [{ id: 'raptor-2', anzahl: 3 }, { id: 'raptor-vac', anzahl: 3 }], treibstoff_kg: null, trocken_kg: null },
    ],
  },
  {
    id: 'electron', name: 'Electron', land: 'Neuseeland / USA', nutzlast_kg: null, ohneMassen: true,
    quelle: { name: 'Rocket Lab – Electron', url: 'https://www.rocketlabusa.com/launch/electron/' },
    stufen: [
      { name: '1. Stufe', triebwerke: [{ id: 'rutherford', anzahl: 9 }], treibstoff_kg: null, trocken_kg: null },
      { name: '2. Stufe', triebwerke: [{ id: 'rutherford-vac', anzahl: 1 }], treibstoff_kg: null, trocken_kg: null },
    ],
  },
];

export const launcherById = (id) => LAUNCHERS.find((l) => l.id === id);
