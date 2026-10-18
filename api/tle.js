// Proxy für aktuelle Bahnelemente (TLE) von CelesTrak: Raumstationen + ausgewählte Wissenschaftssatelliten.
// CelesTrak bittet, Daten höchstens alle ~2 h abzurufen – das Vercel-CDN hält die Antwort für alle Besucher 2 h vor.
const CATNR = [20580, 25994, 27424, 49260, 43013, 39634, 54234]; // Hubble, Terra, Aqua, Landsat 9, NOAA-20, Sentinel-1A, SWOT
export default async function handler(req, res) {
  const get = (q) => fetch(`https://celestrak.org/NORAD/elements/gp.php?${q}&FORMAT=tle`, { signal: AbortSignal.timeout(9000) })
    .then((r) => (r.ok ? r.text() : ''));
  try {
    const parts = await Promise.all([get('GROUP=stations'), ...CATNR.map((n) => get(`CATNR=${n}`))]);
    const text = parts.filter((t) => t && /^1 /m.test(t)).join('\n').replace(/\r/g, '');
    if (!text) { res.setHeader('Cache-Control', 'public, s-maxage=300'); return res.status(502).send('CelesTrak nicht erreichbar'); }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=7200, stale-while-revalidate=21600');
    return res.status(200).send(text);
  } catch {
    res.setHeader('Cache-Control', 'public, s-maxage=120');
    return res.status(504).send('CelesTrak nicht erreichbar');
  }
}
