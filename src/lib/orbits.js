// Bahnberechnung nach Standish (JPL), Ergebnis in heliozentrischen
// ekliptikalen J2000-Koordinaten (AU).

const DEG = Math.PI / 180;

export function julianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

function solveKepler(M, e) {
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 12; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

function currentElements(body, date) {
  const T = (julianDate(date) - 2451545.0) / 36525;
  return body.elements.map((v, i) => v + body.rates[i] * T);
}

function toEcliptic(a, e, I, omega, node, E) {
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(omega), sw = Math.sin(omega);
  const cO = Math.cos(node), sO = Math.sin(node);
  const cI = Math.cos(I), sI = Math.sin(I);
  return {
    x: (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    y: (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    z: sw * sI * xp + cw * sI * yp,
  };
}

// Liefert [a, e, I, ω, Ω, M] (Grad) zum Datum – für große Planeten aus den
// Standish-Elementen, für Kleinkörper aus JPL-Elementen zur Epoche (Zweikörper-Näherung).
function elementsAt(body, date) {
  if (body.kepler) {
    const k = body.kepler;
    const M = k.M + k.n * (julianDate(date) - k.epochJd);
    return [k.a, k.e, k.i, k.peri, k.node, M];
  }
  const [a, e, I, L, peri, node] = currentElements(body, date);
  return [a, e, I, peri - node, node, L - peri];
}

export function heliocentricPosition(body, date) {
  const [a, e, I, w, node, Mdeg] = elementsAt(body, date);
  let M = (Mdeg % 360) * DEG;
  if (M > Math.PI) M -= 2 * Math.PI;
  if (M < -Math.PI) M += 2 * Math.PI;
  const E = solveKepler(M, e);
  return toEcliptic(a, e, I * DEG, w * DEG, node * DEG, E);
}

// Vollständige Bahnellipse (für die Darstellung), `steps` Punkte.
// Bei stark exzentrischen Bahnen (Kometen) liegen die Punkte nahe dem Perihel
// (E = 0 bzw. 2π) dichter, damit die enge Kurve um die Sonne glatt bleibt.
export function orbitPath(body, date, steps = 360) {
  const [a, e, I, w, node] = elementsAt(body, date);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const u = (i / steps) * 2 - 1; // -1 … 1
    const E = e > 0.5
      ? Math.PI * (1 + Math.sign(u) * Math.pow(Math.abs(u), 0.6))
      : (i / steps) * 2 * Math.PI;
    pts.push(toEcliptic(a, e, I * DEG, w * DEG, node * DEG, E));
  }
  return pts;
}

export function distance(p) {
  return Math.hypot(p.x, p.y, p.z);
}
