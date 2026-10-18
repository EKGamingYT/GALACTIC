// Kompakter Weltraumwetter-Abruf für andere Module (Stationsplanung, Kolonie-Logistik):
// NOAA-Skalen G/S/R aktuell + Wahrscheinlichkeit eines Strahlungssturms (≥ S1) in den nächsten 3 Tagen.
// Quelle: NOAA SWPC (gemeinfrei). 5 min zwischengespeichert, damit mehrere Module sich einen Abruf teilen.
const URL = 'https://services.swpc.noaa.gov/products/noaa-scales.json';
let cache = null, at = 0, pending = null;

export function getScales() {
  if (cache && Date.now() - at < 300000) return Promise.resolve(cache);
  pending ??= fetch(URL, { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then((j) => {
      const cur = j['0'] || {};
      cache = {
        S: +cur.S?.Scale || 0, G: +cur.G?.Scale || 0, R: +cur.R?.Scale || 0,
        sProb: Math.max(0, ...['1', '2', '3'].map((k) => +j[k]?.S?.Prob || 0)),
        time: `${cur.DateStamp ?? ''} ${cur.TimeStamp ?? ''} UTC`.trim(),
      };
      at = Date.now();
      return cache;
    })
    .finally(() => { pending = null; });
  return pending;
}

// Hinweis für Oberflächenstationen ohne Magnetfeld-Schutz (Mond, Mars); null = nichts Auffälliges
export function surfaceRadiationNotice(s) {
  if (!s) return null;
  if (s.S >= 3) return { level: 'bad', text: `Starker Strahlungssturm (S${s.S}) läuft: Außeneinsätze aussetzen, Crew in den Schutzraum.` };
  if (s.S >= 1) return { level: 'warn', text: `Strahlungssturm S${s.S} läuft: Außeneinsätze nur kurz, Schutzraum bereithalten.` };
  if (s.sProb >= 25) return { level: 'warn', text: `Erhöhte Wahrscheinlichkeit für einen Strahlungssturm in den nächsten 3 Tagen (${s.sProb} %).` };
  return null;
}
