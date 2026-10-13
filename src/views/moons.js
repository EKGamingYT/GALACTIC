// Mondsysteme: alle bekannten Monde (JPL, mittlere Bahnelemente) um ihre Planeten.
// - Große Monde: Kugeln mit Bahnlinie und Beschriftung, anklickbar
// - Kleine Monde: Punktwolke je Planet
// Abstände werden logarithmisch gestaucht (sonst lägen die meisten Monde im Planeten
// bzw. unsichtbar weit draußen); Bahnneigungen und Umlaufzeiten sind echt.
// Ein Mondsystem wird erst eingeblendet, wenn die Kamera nah genug am Planeten ist.
import * as THREE from 'three';
import MOONS from '../data/moons.json';
import { julianDate } from '../lib/orbits.js';
import { OBLIQUITY_DEG } from '../data/solarsystem.js';

const DEG = Math.PI / 180;
const STEPS = 128;
export const MOON_LIST = MOONS.moons;

// RA/Dec (J2000, äquatorial) → Einheitsvektor im ekliptikalen System
function eqToEcl(raDeg, decDeg) {
  const a = raDeg * DEG, d = decDeg * DEG, e = OBLIQUITY_DEG * DEG;
  const x = Math.cos(d) * Math.cos(a), y = Math.cos(d) * Math.sin(a), z = Math.sin(d);
  return new THREE.Vector3(x, y * Math.cos(e) + z * Math.sin(e), -y * Math.sin(e) + z * Math.cos(e));
}

// Basis der Bezugsebene einer Bahn (ekliptikal): z = Pol der Ebene, x = aufsteigender
// Knoten der Ebene auf dem Himmelsäquator (JPL-Konvention für Laplace/Äquator-Elemente).
const ICRS_POLE = eqToEcl(0, 90);
function frameBasis(moon) {
  if (moon.frameCode === 'ecliptic' || !moon.framePole) {
    return [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  }
  const z = eqToEcl(moon.framePole.raDeg, moon.framePole.decDeg);
  const x = new THREE.Vector3().crossVectors(ICRS_POLE, z);
  if (x.lengthSq() < 1e-9) x.set(1, 0, 0);
  x.normalize();
  return [x, new THREE.Vector3().crossVectors(z, x), z];
}

// Position (km, ekliptikal, relativ zum Planeten) für exzentrische Anomalie E
function orbitPoint(m, basis, E) {
  const { aKm: a, e } = m;
  const i = m.iDeg * DEG, O = m.nodeDeg * DEG, w = m.periDeg * DEG;
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i);
  const X = (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp;
  const Y = (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp;
  const Z = sw * si * xp + cw * si * yp;
  const [bx, by, bz] = basis;
  return new THREE.Vector3().addScaledVector(bx, X).addScaledVector(by, Y).addScaledVector(bz, Z);
}

function eccentricAnomaly(m, jd) {
  let M = (m.MDeg + (360 / m.periodDays) * (jd - m.epochJd)) * DEG;
  M = Math.atan2(Math.sin(M), Math.cos(M));
  let E = M + m.e * Math.sin(M);
  for (let k = 0; k < 8; k++) E -= (E - m.e * Math.sin(E) - M) / (1 - m.e * Math.cos(E));
  return E;
}

export function createMoonSystems(scene, { planetRadiusKm, planetMesh, sceneRadius, makeLabel, loadTex }) {
  const systems = new Map(); // parent → { group, items, points, extent }
  const byId = new Map();

  for (const m of MOON_LIST) {
    if (!m.aKm || !m.periodDays) continue;
    if (!systems.has(m.parent)) {
      const group = new THREE.Group();
      group.visible = false;
      scene.add(group);
      systems.set(m.parent, { group, items: [], minor: [], extent: 0 });
    }
    const sys = systems.get(m.parent);
    const rp = sceneRadius(m.parent);
    const ratio = Math.max(1.05, m.aKm / planetRadiusKm(m.parent));
    // Logarithmische Stauchung: innere Monde knapp außerhalb, äußere Irreguläre weiter draußen
    const display = rp * (1.6 + 2.3 * Math.log10(ratio));
    const basis = frameBasis(m);
    const item = { m, basis, k: display / m.aKm, display };
    sys.extent = Math.max(sys.extent, m.major ? display : 0);

    if (m.major) {
      const r = Math.max(0.07, 0.22 * Math.pow((m.radiusKm || 50) / 1000, 0.45) * 0.75);
      const mat = new THREE.MeshStandardMaterial({
        color: m.id === 'moon' ? 0xffffff : moonColor(m), roughness: 0.95,
        map: m.id === 'moon' ? loadTex('2k_moon.jpg') : null,
      });
      item.mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), mat);
      item.mesh.userData.body = toBody(m);
      sys.group.add(item.mesh);
      const lbl = makeLabel(m.name, 'minor-label moon-label', r + 0.25, item.mesh.userData.body);
      item.mesh.add(lbl);
      item.label = lbl;
      // Bahnlinie
      const pts = [];
      for (let s = 0; s <= STEPS; s++) pts.push(orbitPoint(m, basis, (s / STEPS) * Math.PI * 2).multiplyScalar(item.k));
      item.orbitPts = pts;
      item.orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(() => new THREE.Vector3())),
        new THREE.LineBasicMaterial({ color: 0x9fb4d8, transparent: true, opacity: 0.28 }));
      sys.group.add(item.orbit);
      sys.items.push(item);
      byId.set(item.mesh.userData.body.id, item);
    } else {
      sys.minor.push(item);
    }
  }
  // Kleine Monde als eine Punktwolke je Planet
  for (const [parent, sys] of systems) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sys.minor.length * 3), 3));
    sys.points = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xb9c2d0, size: 2, sizeAttenuation: false }));
    sys.group.add(sys.points);
    sys.extent = Math.max(sys.extent, sceneRadius(parent) * 4);
  }

  // Ekliptik (x, y, z) → Szene (x, z, −y); im Lehrbuch-Modus flach (z · blend)
  const toScene = (v, blend) => new THREE.Vector3(v.x, v.z * blend, -v.y);

  let lastBlend = null;
  function update(date, blend) {
    const jd = julianDate(date);
    for (const [parent, sys] of systems) {
      sys.group.position.copy(planetMesh(parent).position);
      for (const it of sys.items) {
        it.mesh.position.copy(toScene(orbitPoint(it.m, it.basis, eccentricAnomaly(it.m, jd)).multiplyScalar(it.k), blend));
        if (lastBlend !== blend) {
          const arr = it.orbit.geometry.attributes.position.array;
          it.orbitPts.forEach((p, s) => toScene(p, blend).toArray(arr, s * 3));
          it.orbit.geometry.attributes.position.needsUpdate = true;
          it.orbit.geometry.computeBoundingSphere();
        }
      }
      const arr = sys.points.geometry.attributes.position.array;
      sys.minor.forEach((it, s) => toScene(orbitPoint(it.m, it.basis, eccentricAnomaly(it.m, jd)).multiplyScalar(it.k), blend).toArray(arr, s * 3));
      sys.points.geometry.attributes.position.needsUpdate = true;
      sys.points.geometry.computeBoundingSphere();
    }
    lastBlend = blend;
  }

  // Ein Mondsystem nur zeigen, wenn die Kamera nah genug ist (gegen Gedränge im Überblick)
  function updateVisibility(camera, forceId) {
    for (const [parent, sys] of systems) {
      sys.group.position.copy(planetMesh(parent).position);
      const near = camera.position.distanceTo(sys.group.position) < sys.extent * 4.5;
      sys.group.visible = near || forceId === parent || byId.get(forceId)?.m.parent === parent;
    }
  }

  return {
    update,
    updateVisibility,
    meshes: () => [...byId.values()].map((it) => it.mesh),
    labels: () => [...byId.values()].map((it) => it.label),
    get: (id) => byId.get(id),
    extent: (parent) => systems.get(parent)?.extent ?? 0,
    setVisible(v) { for (const sys of systems.values()) if (!v) sys.group.visible = false; },
  };
}

// Mondobjekt im Format der Info-Panels (auch für die Suche)
export const moonBodies = () => MOON_LIST.map(toBody);

function toBody(m) {
  const PARENT = { earth: 'der Erde', mars: 'des Mars', jupiter: 'des Jupiter', saturn: 'des Saturn', uranus: 'des Uranus', neptune: 'des Neptun', pluto: 'des Pluto' };
  return {
    ...m,
    id: `moon-${m.id}`,
    type: `Mond ${PARENT[m.parent] ?? ''}`.trim(),
    color: '#' + new THREE.Color(moonColor(m)).getHexString(),
    isMoon: true,
  };
}

// Grobe Farbe nach bekannter Oberfläche (Eis hell, Io schwefelgelb, Titan orange …)
function moonColor(m) {
  const C = { io: 0xe8d36a, europa: 0xd9cfc0, ganymede: 0xa89f92, callisto: 0x6d655c, titan: 0xd99a4a, enceladus: 0xf2f6fa,
    triton: 0xd8c6c0, iapetus: 0x9a8f80, phobos: 0x7a6e62, deimos: 0x8a7e70, charon: 0x9a9590, miranda: 0xbfc4c8 };
  return C[m.id] ?? 0xb0b4ba;
}
