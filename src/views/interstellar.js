// Interstellare Umgebung der Sonne (nur in der Sternansicht): galaktische Ebene mit Entfernungsringen,
// Richtung zum galaktischen Zentrum, Lokale Interstellare Wolke (LIC) und G-Wolke.
// Richtungen exakt (IAU-Definition der galaktischen Koordinaten, J2000); Lage und Größe der beiden
// Wolken sind vereinfachte Näherungen (Kugeln) nach Redfield & Linsky 2008 – als „schematisch“ gekennzeichnet.
import * as THREE from 'three';
import { OBLIQUITY_DEG } from '../data/solarsystem.js';

const DEG = Math.PI / 180;
const AU_PER_LY = 63241.077;
// äquatorial (J2000) → galaktisch; Transponierte = galaktisch → äquatorial
const R = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.4448296300, 0.7469822445],
  [-0.8676661490, -0.1980763734, 0.4559837762],
];

// galaktische Länge/Breite → Richtung in der Szene (äquatorial → ekliptikal → three.js (x, z, −y))
export function galacticDir(lDeg, bDeg) {
  const l = lDeg * DEG, b = bDeg * DEG;
  const g = [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
  const x = R[0][0] * g[0] + R[1][0] * g[1] + R[2][0] * g[2];
  const y = R[0][1] * g[0] + R[1][1] * g[1] + R[2][1] * g[2];
  const z = R[0][2] * g[0] + R[1][2] * g[1] + R[2][2] * g[2];
  const e = OBLIQUITY_DEG * DEG;
  const ye = y * Math.cos(e) + z * Math.sin(e), ze = -y * Math.sin(e) + z * Math.cos(e);
  return new THREE.Vector3(x, ze, -ye).normalize();
}

const RINGS_LY = [10, 20, 30, 40, 50];
// Wolken: Mittelpunkt (l, b, Abstand in Lj) und Radius in Lj – Näherung
const CLOUDS = [
  { name: 'Lokale Interstellare Wolke', l: 135, b: 0, dLy: 5, rLy: 5.4, color: 0x6ea8ff },
  { name: 'G-Wolke (mit α Centauri)', l: 315.7, b: -0.7, dLy: 6.5, rLy: 5.8, color: 0xb98cff },
];

export function createInterstellar(scene, { sceneDistance, makeLabel }) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  // Basis der galaktischen Ebene in der Szene
  const ex = galacticDir(0, 0), ey = galacticDir(90, 0), ez = galacticDir(0, 90);
  const plane = new THREE.Group();
  plane.matrixAutoUpdate = false;
  plane.matrix.makeBasis(ex, ez, ey.clone().negate()); // lokale x = Richtung Zentrum, lokale y = galaktischer Nordpol
  group.add(plane);

  const rings = RINGS_LY.map((ly) => {
    const pts = [];
    for (let k = 0; k <= 180; k++) { const a = (k / 180) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a))); }
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({
      color: 0x8fb4ff, transparent: true, opacity: ly % 50 === 0 ? 0.32 : 0.16, depthWrite: false,
    }));
    const label = makeLabel(`${ly} Lj`, 'zone-label ring-label', 0);
    plane.add(line, label);
    return { ly, line, label };
  });

  // Strahl zum galaktischen Zentrum (Sagittarius A*, 26.700 Lj entfernt)
  const gcLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]),
    new THREE.LineDashedMaterial({ color: 0xffb86b, dashSize: 0.02, gapSize: 0.012, transparent: true, opacity: 0.55 }));
  gcLine.computeLineDistances();
  const gcLabel = makeLabel('→ Galaktisches Zentrum (Sgr A*, 26.700 Lj)', 'zone-label gc-label', 0);
  plane.add(gcLine, gcLabel);

  const clouds = CLOUDS.map((c) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshBasicMaterial({
      color: c.color, transparent: true, opacity: 0.035, depthWrite: false, side: THREE.DoubleSide,
    }));
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1, 2)),
      new THREE.LineBasicMaterial({ color: c.color, transparent: true, opacity: 0.06, depthWrite: false }));
    mesh.add(edge);
    mesh.raycast = () => {};
    const label = makeLabel(`${c.name} · schematisch`, 'zone-label', 1.05);
    mesh.add(label);
    group.add(mesh);
    return { c, mesh, dir: galacticDir(c.l, c.b) };
  });

  // Maßstab: jenseits von 50.000 AE proportional → Kugeln/Ringe einfach mit k = Szene/AE skalieren
  let lastBlend = null;
  function update(blend) {
    if (blend === lastBlend) return;
    lastBlend = blend;
    const k = (ly) => sceneDistance(ly * AU_PER_LY, blend);
    for (const r of rings) {
      const d = k(r.ly);
      r.line.scale.setScalar(d);
      r.label.position.set(0, 0, d); // Beschriftung am Ring (Seite zum galaktischen Norden hin gedreht)
    }
    const far = k(55);
    gcLine.scale.setScalar(far);
    gcLabel.position.set(far, 0, 0);
    for (const { c, mesh, dir } of clouds) {
      mesh.position.copy(dir).multiplyScalar(k(c.dLy));
      mesh.scale.setScalar(k(c.rLy));
    }
  }

  return { group, update };
}
