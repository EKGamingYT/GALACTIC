// Proxy für NASA DONKI (koronale Massenauswürfe, letzte 7 Tage).
// Der API-Schlüssel bleibt serverseitig (Vercel-Umgebungsvariable NASA_API_KEY, sonst DEMO_KEY), und das Vercel-CDN
// hält die Antwort 30 min für alle Besucher vor – so reicht selbst das kleine Kontingent des DEMO_KEY.
export default async function handler(req, res) {
  const key = process.env.NASA_API_KEY || 'DEMO_KEY';
  const ymd = (d) => d.toISOString().slice(0, 10);
  const end = new Date(), start = new Date(Date.now() - 7 * 86400000);
  try {
    const r = await fetch(`https://api.nasa.gov/DONKI/CME?startDate=${ymd(start)}&endDate=${ymd(end)}&api_key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(9000) });
    if (!r.ok) {
      res.setHeader('Cache-Control', 'public, s-maxage=120');
      return res.status(502).json({ error: `DONKI antwortet mit HTTP ${r.status}` });
    }
    const data = await r.json();
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=1800, stale-while-revalidate=3600');
    res.setHeader('X-Galactic-Key', key === 'DEMO_KEY' ? 'demo' : 'eigener');
    return res.status(200).json(data);
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(504).json({ error: 'DONKI nicht erreichbar' });
  }
}
