// Nachbarsterne (Katalog bis ~50 Lichtjahre) mit ihren bekannten Exoplaneten.
// Richtung exakt aus RA/Dec (ICRS), Entfernung über den gemeinsamen Maßstab
// (jenseits von 1000 AE logarithmisch). Fliegt man an einen Stern heran,
// erscheinen seine Planetenbahnen (Bahnlage/-phase meist unbekannt → schematisch).
import * as THREE from 'three';
import DATA from '../data/nearbystars.json';
import { OBLIQUITY_DEG } from '../data/solarsystem.js';
import { SYSTEMS } from '../data/systems.js';
import { exoplanetLook, createExoplanetMaterial } from '../lib/exoplanet.js';

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

// Unsichtbare, größere Trefferkugel: kleine Körper lassen sich so auch aus der Ferne anklicken
function hitProxy(target) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  m.userData.body = target.userData.body;
  m.userData.radius = target.geometry.parameters.radius;
  target.add(m);
  return m;
}

export function createStars(scene, { sceneDistance, nearDistance, makeLabel, glowTexture, makeStarSurface, timeUniform }) {
  const group = new THREE.Group();
  scene.add(group);
  const items = new Map();
  const planetMeshes = new Map(); // Exoplaneten-ID → Mesh
  const planetHost = new Map();   // Exoplaneten-ID → Stern-ID
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
    // Punktgröße nach scheinbarer Helligkeit (wie am Himmel): hell = groß, schwach = winzig
    const size = s.vmag != null ? 0.026 * Math.pow(10, -0.06 * (s.vmag - 2)) : 0.008 + 0.006 * Math.log10(1 + lum * 30);
    sprite.scale.setScalar(Math.min(0.045, Math.max(0.005, size)));
    if (s.vmag > 9) sprite.material.opacity = Math.max(0.45, 1 - (s.vmag - 9) * 0.08);
    node.add(sprite);
    // kleine Kugel für die Nahansicht
    // Nahansicht: kleine, überhelle Kugel (HDR-Farbe > 1 → leuchtet im Bloom wie ein Stern)
    const member = SYSTEMS.find((x) => x.systemId === s.system)?.members.find((m) => m.id === s.id);
    const L = member?.L ?? lum;
    // Radius (R☉): aus dem Katalog, sonst aus Leuchtkraft und Temperatur (L = R²·T⁴)
    const radiusSun = s.radiusSun ?? (s.teffK ? Math.sqrt(L) / (s.teffK / 5772) ** 2 : 0.3);
    // Szenengröße wie bei unserer Sonne (4 Einheiten bei 1 R☉), wurzelgestaucht; endgültig in update()
    const r = Math.min(6, Math.max(0.6, 4 * Math.sqrt(radiusSun)));
    // Oberfläche: derselbe animierte Granulations-Shader wie unsere Sonne, in der Sternfarbe
    // Sterntyp bestimmt Granulation, Flecken, Helligkeit und Korona (siehe sun.js)
    const surface = makeStarSurface ? makeStarSurface(body.color, s.spectralType) : null;
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24),
      surface ? surface.material : new THREE.MeshBasicMaterial({ color: new THREE.Color(body.color).multiplyScalar(1.5) }));
    if (surface) sphere.add(surface.corona);
    // weicher Lichthof in Sternfarbe (wächst mit der Kugel) – lässt auch kleine Zwerge sichtbar strahlen
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow, color: body.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5,
    }));
    halo.scale.setScalar(4.2);
    halo.raycast = () => {};
    sphere.add(halo);
    sphere.userData.body = body;
    node.add(sphere);
    sphere.scale.setScalar(r);
    const sphereHit = hitProxy(sphere);
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
      // gleiche Größenformel wie unsere Planeten; Radius unbekannt → grob aus der (Mindest-)Masse
      const rEarth = p.radiusEarth ?? (p.massEarth ? Math.min(12, Math.pow(p.massEarth, p.massEarth > 20 ? 0.1 : 0.28) * (p.massEarth > 20 ? 6 : 1)) : 1.2);
      const pr = Math.max(0.35, 0.22 * Math.pow((rEarth * 6371) / 1000, 0.45));
      // Gleichgewichtstemperatur wie im Infofeld (Albedo 0,3): T ≈ 254,9 K · L^¼ / √a
      const teqK = Math.round(254.9 * Math.pow(Math.max(L, 1e-5), 0.25) / Math.sqrt(p.aAu));
      const look = exoplanetLook(p, teqK);
      const id = `planet-${s.id}-${p.name}`;
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(pr, 32, 16), createExoplanetMaterial(look, id, body.color, timeUniform));
      const planetBody = {
        ...p, id, type: `Exoplanet von ${s.name}`, color: look.color, isExoplanet: true, host: s.name,
        teqK, kind: look.kind, // Einordnung + Darstellung geschätzt (keine Aufnahme vorhanden)
      };
      mesh.userData.body = planetBody;
      const hit = hitProxy(mesh);
      planetMeshes.set(planetBody.id, mesh);
      planetHost.set(planetBody.id, s.id);
      const pl = makeLabel(p.name, 'minor-label', pr + 0.2, planetBody);
      mesh.add(pl);
      sys.add(orbit, mesh);
      return { p, orbit, mesh, hit };
    });
    // Habitable Zone als grünes Band (wie beim Sonnensystem), Radien aus der Leuchtkraft
    const hz = SYSTEMS.find((x) => x.systemId === s.system)?.members.find((m) => m.id === s.id)?.hz ?? null;
    const hzRing = hz ? new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
      color: 0x3ddc84, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false,
    })) : null;
    if (hzRing) { hzRing.rotation.x = -Math.PI / 2; sys.add(hzRing); }
    items.set(body.id, { s, body, dir, node, sprite, sphere, sphereHit, r, surface, label, sys, planets, hz, hzRing, extent: 0 });
  }

  // Mehrfachsysteme: aus der Ferne ein gemeinsamer Systemname am Hauptstern statt vieler Einzelnamen
  for (const sysInfo of SYSTEMS) {
    if (sysInfo.members.length < 2) continue;
    const primary = items.get(sysInfo.primaryId);
    if (!primary) continue;
    const lbl = makeLabel(sysInfo.name, 'star-label star-major system-name', 1.2, sysInfo);
    lbl.element.dataset.count = `${sysInfo.members.length}★`;
    primary.node.add(lbl);
    primary.systemLabel = lbl;
    for (const m of sysInfo.members) { const it = items.get(m.id); if (it) it.inMulti = sysInfo.primaryId; }
  }

  // Aus der Ferne beschriftet werden nur die ~45 wichtigsten Systeme (beschrieben, mit Planeten, hell, nah) –
  // bei über 1000 Systemen wäre jede andere Regel ein Namensteppich
  const LABEL_BUDGET = 45;
  const score = (x) => (x.description || x.members.some((m) => m.description) ? 4 : 0) + Math.min(3, x.planets.length) * 0.8
    + Math.max(0, 3 - Math.min(...x.members.map((m) => m.vmag ?? 20)) / 2) + 12 / Math.max(4, x.distanceLy);
  [...SYSTEMS].sort((a, b) => score(b) - score(a)).forEach((sysInfo, rank) => {
    for (const m of sysInfo.members) { const it = items.get(m.id); if (it) it.major = rank < LABEL_BUDGET; }
  });

  // Position abhängig von Lehrbuch/Real; Planetenbahnen im selben Nahmaßstab wie unser System
  let ringBlend = null;
  function update(date, blend) {
    if (ringBlend !== blend) {
      ringBlend = blend;
      for (const it of items.values()) {
        if (!it.hzRing) continue;
        it.hzRing.geometry.dispose();
        it.hzRing.geometry = new THREE.RingGeometry(nearDistance(it.hz[0], blend), nearDistance(it.hz[1], blend), 96);
      }
      // Sternkugel nie über die innerste Planetenbahn hinaus (Rote Zwerge haben sehr enge Systeme)
      for (const it of items.values()) {
        const inner = Math.min(...it.planets.map((q) => nearDistance(q.p.aAu, blend)));
        const rr = Math.min(it.r, Math.max(0.3, inner * 0.45));
        it.sphere.scale.setScalar(rr);
        it.label.position.y = rr + 0.5;
        // Planeten in engen Systemen verkleinern, damit sich Nachbarn nicht berühren
        const radii = [rr, ...it.planets.map((q) => nearDistance(q.p.aAu, blend))].sort((a, b) => a - b);
        let gap = Infinity;
        for (let k = 1; k < radii.length; k++) gap = Math.min(gap, radii[k] - radii[k - 1]);
        for (const q of it.planets) {
          const base = q.mesh.geometry.parameters.radius;
          q.mesh.scale.setScalar(Math.min(1, Math.max(0.15, (0.4 * gap) / base)));
        }
      }
    }
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
        mesh.rotation.y = (2 * Math.PI * days) / 1.7; // Eigenrotation (unbekannt → schematisch)
        mesh.material.uniforms.uStar.value.copy(it.node.position); // Licht kommt vom eigenen Stern
      }
      it.extent = Math.max(extent, it.hz ? nearDistance(it.hz[1], blend) : 0, 4);
    }
  }

  // Labels nur aus großer Entfernung (Sternansicht) bzw. in der Nähe; Planetensysteme nur nah dran
  // farOut: Kamera weit außerhalb des Sonnensystems – erst dann die Sterne als eigene Punkte zeigen
  // (im System selbst stecken sie schon im echten Himmelshintergrund, doppelt wäre nur Unruhe)
  const tmp = new THREE.Vector3();
  function updateVisibility(camera, starView, selectedId, farOut) {
    // Ist ein Sternsystem (Stern/Exoplanet) gewählt und die Kamera dort, gehört die Bühne nur ihm:
    // durch den logarithmischen Maßstab liegen fremde Systeme in derselben Richtung sonst mitten im Bild
    const focusIt = items.get(planetHost.get(selectedId) ?? selectedId);
    const inFocus = focusIt && camera.position.distanceTo(focusIt.node.position) < focusIt.extent * 30;
    for (const it of items.values()) {
      const dist = camera.position.distanceTo(it.node.position);
      if (inFocus && it.s.system !== focusIt.s.system) {
        // ganz ausblenden – der echte Himmelshintergrund zeigt diese Sterne ohnehin
        it.node.visible = it.sys.visible = it.sphere.visible = it.label.visible = false;
        if (it.systemLabel) it.systemLabel.visible = false;
        continue;
      }
      const near = dist < it.extent * 8;
      it.node.visible = farOut || near || selectedId === it.body.id;
      it.sys.visible = near || selectedId === it.body.id;
      // Aus der Ferne nur bekannte Sterne beschriften (Beschreibung, Planeten oder ≤ 15 Lj), die übrigen erst beim Heranfliegen
      const major = it.major;
      const close = dist < it.extent * 25; // wirklich herangeflogen
      const sel = selectedId === it.body.id;
      if (it.inMulti) {
        // Mitglieder eines Mehrfachsystems: aus der Ferne nur der Systemname, nah dran die Einzelsterne
        it.label.visible = close || near || sel;
        if (it.systemLabel) it.systemLabel.visible = starView && it.major && !close && !near && !sel;
      } else {
        it.label.visible = (starView && major) || close || near || sel;
      }
      it.sphere.visible = dist < it.extent * 40;
      // Trefferkugeln: etwa 14 px auf dem Bildschirm, nie kleiner als der Körper selbst
      const px = 0.012 * Math.tan((camera.fov * Math.PI) / 360) * 2;
      // (nur für gerade Sichtbares – bei ~1500 Sternen spart das viel Rechenzeit pro Bild)
      const hits = [...(it.sphere.visible ? [it.sphereHit] : []), ...(it.sys.visible ? it.planets.map((q) => q.hit) : [])];
      for (const h of hits) {
        const d = camera.position.distanceTo(h.parent.getWorldPosition(tmp));
        h.scale.setScalar(Math.max(h.userData.radius, (d * px) / h.parent.scale.x));
      }
    }
  }

  // Koronen der gerade sichtbaren Sterne an die Kamera anpassen
  function tickSurfaces(camera) {
    for (const it of items.values()) if (it.surface && it.node.visible && it.sphere.visible) it.surface.tick(camera, it.sphere);
  }

  return {
    update,
    updateVisibility,
    tickSurfaces,
    // nur, was gerade zu sehen ist – versteckte Planetensysteme sollen keine Klicks abfangen
    meshes: () => [...items.values()].filter((it) => it.node.visible).flatMap((it) => [
      ...(it.sphere.visible ? [it.sphere, it.sphereHit] : []),
      ...(it.sys.visible ? it.planets.flatMap((q) => [q.mesh, q.hit]) : []),
    ]),
    get: (id) => items.get(id),
    // Ziel für Kameraflüge: Mesh (für die Größe) und Weltposition
    focusMesh: (id) => items.get(id)?.sphere ?? planetMeshes.get(id),
    extent: (id) => items.get(id)?.extent ?? 0,
    // Weltposition des Muttersterns eines Exoplaneten (sonst null)
    hostPos: (id) => (planetHost.has(id) ? items.get(planetHost.get(id)).node.position.clone() : null),
    bodies: () => [...items.values()].map((it) => it.body),
  };
}
