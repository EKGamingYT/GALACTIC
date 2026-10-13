// Hilfen für Körperformen: Achsenverhältnisse anwenden und Kleinkörper mit glattem 3D-Rauschen beulen.
// Hinweis: Das sind Näherungen aus gemessenen Abmessungen, keine exakten Formmodelle.
import * as THREE from 'three';

function hash3(x, y, z, seed) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Glattes Value-Noise im Bereich [−1, 1]
function noise3(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz, seed);
  const l = (a, b, t) => a + (b - a) * t;
  const n = l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
  return n * 2 - 1;
}

const seedOf = (id) => [...id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 17);

// Kugelgeometrie aus Radius, Achsskalierung [sx, sy, sz] und optionaler Beulung formen.
// Normale werden an Nähten (doppelte Eckpunkte der UV-Naht/Pole) gemittelt, damit keine Kante sichtbar bleibt.
export function shapeGeometry(geo, { scale = null, lumps = null, id = '' }) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const seed = seedOf(id);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const len = v.length();
    if (len === 0) continue;
    v.divideScalar(len); // Einheitsrichtung
    let k = 1;
    if (lumps) {
      // zwei Oktaven: große Beulen + kleinere Unebenheiten
      const n = noise3(v.x * 1.4 + 3.1, v.y * 1.4 + 1.7, v.z * 1.4 + 5.3, seed) * 0.7
        + noise3(v.x * 3.2, v.y * 3.2, v.z * 3.2, seed + 11) * 0.3;
      k += lumps.amp * n;
      if (lumps.ridge) k += lumps.ridge * (Math.exp(-((v.y / 0.38) ** 2)) - 0.4); // Äquatorwulst, Pole eingezogen
    }
    v.multiplyScalar(len * k);
    if (scale) v.set(v.x * scale[0], v.y * scale[1], v.z * scale[2]);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  // gleiche Position → gleiche Normale
  const nor = geo.attributes.normal, groups = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`;
    (groups.get(key) || groups.set(key, []).get(key)).push(i);
  }
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    v.set(0, 0, 0);
    for (const i of idx) v.add(new THREE.Vector3().fromBufferAttribute(nor, i));
    v.normalize();
    for (const i of idx) nor.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

// Nur Abplattung (Polachse y skalieren) – für Planeten und ihre Hüllen
export function flattenGeometry(geo, f) {
  if (f) geo.scale(1, 1 - f, 1);
  return geo;
}
