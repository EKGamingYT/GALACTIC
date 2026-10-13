// Lexikon zur Punktabfrage auf der Erde: Ortsname (OpenStreetMap Nominatim,
// höchstens 1 Anfrage pro Klick) und nahe Wikipedia-Artikel (Geosuche).
const WIKI = 'https://de.wikipedia.org/w/api.php';

export async function placeName(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&zoom=14&accept-language=de`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const d = await res.json();
  return d.display_name || null;
}

// Bis zu drei Artikel im Umkreis (10 km), der nächste mit Kurzbeschreibung
export async function nearbyArticles(lat, lon) {
  const geo = await (await fetch(
    `${WIKI}?action=query&list=geosearch&gscoord=${lat}%7C${lon}&gsradius=10000&gslimit=3&format=json&origin=*`
  )).json();
  if (geo.error) throw new Error(geo.error.info); // z. B. „Search is currently too busy“
  const hits = geo.query?.geosearch ?? [];
  if (!hits.length) return [];
  const ids = hits.map((h) => h.pageid).join('|');
  const ex = await (await fetch(
    `${WIKI}?action=query&prop=extracts&exintro=1&explaintext=1&exsentences=3&pageids=${ids}&format=json&origin=*`
  )).json();
  return hits.map((h) => ({
    title: h.title,
    distKm: h.dist / 1000,
    extract: ex.query?.pages?.[h.pageid]?.extract ?? '',
    url: `https://de.wikipedia.org/?curid=${h.pageid}`,
  }));
}
