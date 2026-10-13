// Echte Körperformen (Näherungen aus gemessenen Abmessungen, KEINE exakten Formmodelle).
// Abplattung f = (a − c) / a → Polachse = Äquatorachse · (1 − f).
export const OBLATENESS = {
  jupiter: 0.06487,
  saturn: 0.09796,
  uranus: 0.02293,
  neptune: 0.01708,
  earth: 0.00335,
  mars: 0.00589,
};

// Skalierung (x, y, z) der Einheitskugel aus den Achsmaßen `extentKm` eines Kleinkörpers.
// y ist die Rotationsachse (Pol). Die Achsen werden auf das geometrische Mittel normiert, damit die
// angezeigte Gesamtgröße (Volumen) gleich bleibt – nur die Verhältnisse ändern sich.
//  - 3 Werte [a, b, c]: a = längste Achse (x), b = mittlere (z), c = kürzeste = Rotationsachse (y)
//  - 2 Werte [Äquator, Pol] (z. B. Ryugu): rotationssymmetrisch abgeplattet
//  - 2 Werte bei Kometen [Länge, Breite] (z. B. Halley): länglich, Breite = Höhe
export function axisScale(body) {
  const e = body.extentKm;
  if (!Array.isArray(e) || e.length < 2 || e.some((v) => !(v > 0))) return null;
  let a, b, c;
  if (e.length >= 3) [a, b, c] = e;
  else if (body.type === 'Komet') [a, b, c] = [e[0], e[1], e[1]];
  else [a, b, c] = [e[0], e[0], e[1]];
  const g = Math.cbrt(a * b * c);
  return [a / g, c / g, b / g]; // (x, y = Pol, z)
}

// Kleine, unregelmäßige Körper bekommen zusätzlich Beulen (Rauschverschiebung der Oberfläche).
// Rückgabe: { amp: Beulenstärke relativ zum Radius, ridge: Äquatorwulst (Kreisel-Form) } oder null.
export function lumpiness(body) {
  const small = body.type === 'Asteroid' || body.type === 'Erdnaher Asteroid' || body.type === 'Komet';
  const r = body.radiusKm;
  if (!small || !(r < 300)) return null;
  const amp = r < 5 ? 0.18 : r < 30 ? 0.15 : r < 150 ? 0.12 : 0.1;
  // Bennu und Ryugu: „Kreisel“ mit Äquatorwulst
  const ridge = body.id === 'bennu' || body.id === 'ryugu' ? 0.09 : 0;
  return { amp, ridge };
}
