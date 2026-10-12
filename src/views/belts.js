// Kleinkörper-Regionen als Partikelwolken (grobe, statistische Darstellung –
// keine echten Einzelobjekte). Jedes Teilchen läuft auf einer Kreisbahn mit
// Kepler-Umlaufzeit, die Gürtel bewegen sich also mit der Zeit mit.
import * as THREE from 'three';

const DEG = Math.PI / 180;
const J2000 = Date.UTC(2000, 0, 1, 12);

// Quellen der Bereichsgrenzen: NASA Solar System Exploration (Asteroidengürtel
// ~2,2–3,2 AE, Kuipergürtel ~30–50 AE); Trojaner auf Jupiters Bahn bei L4/L5.
export const BELTS = [
  { id: 'main', name: 'Asteroidengürtel', count: 5000, aMin: 2.1, aMax: 3.3, maxInc: 18, color: 0xb9a78a, labelAu: 2.7 },
  { id: 'trojans', name: 'Jupiter-Trojaner', count: 1400, trojan: true, maxInc: 22, color: 0xd4b07a },
  { id: 'kuiper', name: 'Kuipergürtel', count: 7000, aMin: 30, aMax: 50, maxInc: 20, color: 0x8fb3d9, labelAu: 44 },
];

function gauss() {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
}

export function createBelts(mapPoint) {
  const group = new THREE.Group();
  const belts = BELTS.map((belt) => {
    const n = belt.count;
    const params = new Float32Array(n * 4); // a, Inklination, Knoten, Phase
    for (let i = 0; i < n; i++) {
      let a, phase;
      if (belt.trojan) {
        a = 5.2 + gauss() * 0.15;
        phase = (i % 2 ? 60 : -60) + gauss() * 22; // relativ zu Jupiter
      } else {
        a = belt.aMin + Math.pow(Math.random(), 0.8) * (belt.aMax - belt.aMin);
        phase = Math.random() * 360;
      }
      params.set([a, Math.abs(gauss()) * belt.maxInc, Math.random() * 360, phase], i * 4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: belt.color, size: belt.id === 'kuiper' ? 1.4 : 1.6, sizeAttenuation: false,
      transparent: true, opacity: 0.55, depthWrite: false,
    }));
    group.add(points);
    return { ...belt, params, geo };
  });

  // jupiterLongitude: aktuelle heliozentrische Länge Jupiters (Grad)
  function update(date, blend, jupiterLongitude) {
    const days = (date.getTime() - J2000) / 86400000;
    const p = { x: 0, y: 0, z: 0 };
    for (const belt of belts) {
      const pos = belt.geo.attributes.position.array;
      for (let i = 0; i < belt.count; i++) {
        const a = belt.params[i * 4];
        const inc = belt.params[i * 4 + 1] * DEG;
        const node = belt.params[i * 4 + 2] * DEG;
        const L = belt.trojan
          ? (jupiterLongitude + belt.params[i * 4 + 3]) * DEG
          : (belt.params[i * 4 + 3] + (360 * days) / (365.25 * Math.pow(a, 1.5))) * DEG;
        const u = L - node;
        p.x = a * (Math.cos(node) * Math.cos(u) - Math.sin(node) * Math.sin(u) * Math.cos(inc));
        p.y = a * (Math.sin(node) * Math.cos(u) + Math.cos(node) * Math.sin(u) * Math.cos(inc));
        p.z = a * Math.sin(u) * Math.sin(inc);
        const v = mapPoint(p, blend);
        pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      }
      belt.geo.attributes.position.needsUpdate = true;
      belt.geo.computeBoundingSphere();
    }
  }

  return { group, update };
}
