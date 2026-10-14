// Nachbarsterne (≤ 20 Lichtjahre) mit ihren bekannten Exoplaneten.
// Richtung exakt aus RA/Dec (ICRS), Entfernung über den gemeinsamen Maßstab
// (jenseits von 1000 AE logarithmisch). Fliegt man an einen Stern heran,
// erscheinen seine Planetenbahnen (Bahnlage/-phase meist unbekannt → schematisch).
import * as THREE from 'three';
import DATA from '../data/nearbystars.json';
import { OBLIQUITY_DEG } from '../data/solarsystem.js';

const DEG = Math.PI / 180;
const AU_PER_LY = 63241.077;
export const STARS = DATA.stars;

// RA/Dec → Richtung in der Szene (äquatorial → ekliptikal → three.js (x, z, −y))
function direction(raDeg, decDeg) {
  const a = raDeg * DEG, d = decDeg * DEG, e = OBLIQUITY_DEG * DEG;
  const x = Math.cos(d) * Math.cos(a), y = Math.cos(d) * Math.sin(a), z = Math.sin(d);
  const ye = y * Math.cos(e) + z * Math.sin(e), ze = -y * Math.sin(e) + z * Math.cos(e);
  return new THREE.Vector3(x, ze, -ye).normalize();
}

export function starBody(s) {
  return {
    ...s,
    type: s.spectralType ? `Stern · ${s.spectralType}` : 'Stern',
    color: s.colorHex || '#ffffff',
    isStar: true,
  };
}

export function createStars(scene, { sceneDistance, nearDistance, makeLabel, glowTexture }) {
  const group = new THREE.Group();
  scene.add(group);
  const items = new Map();
  const planetMeshes = new Map(); // Exoplaneten-ID → Mesh
  const glow = glowTexture();

  for (const s of STARS) {
    if (s.raDeg == null || s.decDeg == null || !s.distanceLy) continue;
    const body = starBody(s);
    const dir = direction(s.raDeg, s.decDeg);
    const node = new THREE.Group();
    group.add(node);
    // Leuchtpunkt: Größe grob nach Helligkeit (scheinbare Größe aus 1 AE-Sicht wäre zu klein)
    const lum = s.radiusSun && s.teffK ? s.radiusSun ** 2 * (s.teffK / 5772) ** 4 : 0.05;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow, color: body.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false,
    }));
    sprite.scale.setScalar(Math.min(0.06, 0.012 + 0.008 * Math.log10(1 + lum * 30)));
    node.add(sprite);
    // kleine Kugel für die Nahansicht
    // Nahansicht: kleine, überhelle Kugel (HDR-Farbe > 1 → leuchtet im Bloom wie ein Stern)
    const r = Math.max(0.08, 0.8 * Math.sqrt(s.radiusSun || 0.1));
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(body.color).multiplyScalar(2.6) }));
    sphere.userData.body = body;
    node.add(sphere);
    const label = makeLabel(s.name, s.description ? 'star-label star-major' : 'star-label', r + 0.5, body);
    node.add(label);

    // Planetensystem (nur in der Nähe sichtbar)
    const sys = new THREE.Group();
    sys.visible = false;
    node.add(sys);
    const planets = (s.planets || []).filter((p) => p.aAu).map((p) => {
      const pts = [];
      for (let k = 0; k <= 128; k++) {
        const ang = (k / 128) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)));
      }
      const orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x9fb4d8, transparent: true, opacity: 0.35 }));
      const pr = Math.max(0.06, 0.12 * Math.pow(p.radiusEarth || 1.2, 0.5));
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(pr, 24, 12),
        new THREE.MeshBasicMaterial({ color: (p.radiusEarth || 1) > 4 ? 0xd9b98c : 0x9aa7b8 }));
      const planetBody = { ...p, id: `planet-${s.id}-${p.name}`, type: `Exoplanet von ${s.name}`, color: '#9aa7b8', isExoplanet: true, host: s.name };
      mesh.userData.body = planetBody;
      planetMeshes.set(planetBody.id, mesh);
      const pl = makeLabel(p.name, 'minor-label', pr + 0.2, planetBody);
      mesh.add(pl);
      sys.add(orbit, mesh);
      return { p, orbit, mesh };
    });
    items.set(body.id, { s, body, dir, node, sprite, sphere, label, sys, planets, extent: 0 });
  }

  // Position abhängig von Lehrbuch/Real; Planetenbahnen im selben Nahmaßstab wie unser System
  function update(date, blend) {
    const days = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 864e5;
    for (const it of items.values()) {
      it.node.position.copy(it.dir).multiplyScalar(sceneDistance(it.s.distanceLy * AU_PER_LY, blend));
      let extent = 0;
      for (const { p, orbit, mesh } of it.planets) {
        const d = nearDistance(p.aAu, blend);
        extent = Math.max(extent, d);
        orbit.scale.setScalar(d);
        // Bahnphase unbekannt → schematisch ab J2000 mit echter Umlaufzeit
        const ang = p.periodDays ? (2 * Math.PI * days) / p.periodDays : 0;
        mesh.position.set(Math.cos(ang) * d, 0, Math.sin(ang) * d);
      }
      it.extent = Math.max(extent, 4);
    }
  }

  // Labels nur aus großer Entfernung (Sternansicht) bzw. in der Nähe; Planetensysteme nur nah dran
  // farOut: Kamera weit außerhalb des Sonnensystems – erst dann die Sterne als eigene Punkte zeigen
  // (im System selbst stecken sie schon im echten Himmelshintergrund, doppelt wäre nur Unruhe)
  function updateVisibility(camera, starView, selectedId, farOut) {
    for (const it of items.values()) {
      const dist = camera.position.distanceTo(it.node.position);
      const near = dist < it.extent * 8;
      it.node.visible = farOut || near || selectedId === it.body.id;
      it.sys.visible = near || selectedId === it.body.id;
      // Aus der Ferne nur bekannte Sterne beschriften, die übrigen erst beim Heranfliegen
      const major = !!it.s.description;
      const close = dist < it.node.position.length() * 0.35;
      it.label.visible = (starView && major) || close || near || selectedId === it.body.id;
      it.sphere.visible = dist < it.extent * 40;
    }
  }

  return {
    update,
    updateVisibility,
    meshes: () => [...items.values()].flatMap((it) => [it.sphere, ...it.planets.map((p) => p.mesh)]),
    get: (id) => items.get(id),
    // Ziel für Kameraflüge: Mesh (für die Größe) und Weltposition
    focusMesh: (id) => items.get(id)?.sphere ?? planetMeshes.get(id),
    extent: (id) => items.get(id)?.extent ?? 0,
    bodies: () => [...items.values()].map((it) => it.body),
  };
}
