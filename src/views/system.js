// 3D-Sonnensystem (three.js) mit zwei Darstellungsmodi:
//  - „Lehrbuch“: alle Bahnen flach in einer Ebene, Abstände gestaucht
//  - „Real“: echte Bahnneigungen, Abstände maßstabsgetreu (linear in AE)
// Zwischen den Modi wird weich überblendet (blend 0 → 1).
// Planetengrößen sind in beiden Modi vergrößert, sonst wären sie unsichtbar.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { BODIES } from '../data/bodies.js';
import { heliocentricPosition, orbitPath } from '../lib/orbits.js';
import { planetTexture } from '../lib/textures.js';
import { createBelts, BELTS } from './belts.js';
import { createSun } from '../lib/sun.js';
import { TEXTURES } from '../data/textures.js';

const loader = new THREE.TextureLoader();
function loadTex(file) {
  const tex = loader.load(`/textures/${file}`);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
import SMALL from '../data/smallbodies.json';

// Ebene je Kleinkörper-Kategorie
const LAYER_OF = {
  'Zwergplanet': 'dwarfs', 'Zwergplanet-Kandidat': 'dwarfs',
  'Asteroid': 'asteroids', 'Erdnaher Asteroid': 'asteroids', 'Komet': 'comets',
};
export const SMALL_BODIES = SMALL.bodies;

const AU_REAL = 30; // Szeneneinheiten pro AE im Realmodus
const compressed = (au) => 14 * Math.pow(au, 0.55);
const linear = (au) => AU_REAL * au;
const scaleRadius = (km) => Math.max(0.35, 0.22 * Math.pow(km / 1000, 0.45));
const lerp = (a, b, t) => a + (b - a) * t;

// Abstand r (AE) im aktuellen Überblendungszustand
const sceneDistance = (au, blend) => lerp(compressed(au), linear(au), blend);

// Ekliptik (x, y, z in AE) -> three.js (x, z, -y)
function mapPoint(p, blend) {
  const z = p.z * blend; // Lehrbuch: auf die Ekliptik projiziert
  const r = Math.hypot(p.x, p.y, z);
  const k = r > 0 ? sceneDistance(r, blend) / r : 0;
  return new THREE.Vector3(p.x * k, z * k, -p.y * k);
}

const ORBIT_STEPS = 360;

export function createSystemView(container, { onSelect }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 2e6);
  camera.position.set(0, 120, 170);

  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.className = 'labels';
  container.appendChild(labels.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 6;
  controls.maxDistance = 80000;

  scene.add(createStarfield());
  scene.add(new THREE.AmbientLight(0xffffff, 0.22));
  scene.add(new THREE.PointLight(0xfff2d0, 3, 0, 0));

  const layers = {
    orbits: new THREE.Group(),
    belts: new THREE.Group(),
    zones: new THREE.Group(),
    dwarfs: new THREE.Group(),
    asteroids: new THREE.Group(),
    comets: new THREE.Group(),
  };
  const smallOrbits = [];
  Object.values(layers).forEach((g) => scene.add(g));

  // --- Körper ----------------------------------------------------------------
  const bodies = new Map(); // id -> { body, mesh, orbit }
  const sun = createSun(4, loadTex(TEXTURES.sun.map));
  for (const body of [...BODIES, ...SMALL_BODIES]) {
    if (body.parent) continue;
    const isSun = body.id === 'sun';
    const tex = TEXTURES[body.id];
    const layer = LAYER_OF[body.type];
    // Kleinkörper etwas kleiner als Planeten, aber anklickbar
    const radius = isSun ? 4 : layer ? Math.max(0.18, scaleRadius(body.radiusKm || 1) * 0.8) : scaleRadius(body.radiusKm);
    const mesh = isSun
      ? sun.mesh
      : new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32),
        new THREE.MeshStandardMaterial({ map: tex ? loadTex(tex.map) : planetTexture(body), roughness: 0.95 }));
    mesh.userData.body = body;
    (layer ? layers[layer] : scene).add(mesh);
    if (tex?.scale) mesh.scale.set(...tex.scale);
    if (tex?.clouds) mesh.add(createClouds(radius, tex.clouds));
    if (body.ring) mesh.add(createRing(radius, tex?.ring));
    const labelCls = !layer || layer === 'dwarfs' ? 'body-label' : 'minor-label';
    const label = makeLabel(body.name, labelCls, radius + (layer ? 0.5 : 0.9), () => onSelect(body));
    mesh.add(label);

    let orbit = null;
    if (body.elements || body.kepler) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((ORBIT_STEPS + 1) * 3), 3));
      orbit = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: body.color, transparent: true, opacity: layer ? 0.2 : 0.35 }));
      orbit.userData.baseOpacity = orbit.material.opacity;
      if (layer) { layers[layer].add(orbit); smallOrbits.push(orbit); } else layers.orbits.add(orbit);
    }
    const tail = body.type === 'Komet' ? createTail() : null;
    if (tail) layers.comets.add(tail);
    bodies.set(body.id, { body, mesh, orbit, tail, minorLabel: labelCls === 'minor-label' ? label : null });
  }

  // --- Gürtel & Zonen ----------------------------------------------------------
  const belts = createBelts(mapPoint);
  layers.belts.add(belts.group);

  const zoneLabels = [
    { text: 'Inneres Sonnensystem', au: 1.2, angle: -50, cls: 'zone-label' },
    { text: 'Äußeres Sonnensystem', au: 14, angle: -50, cls: 'zone-label' },
    ...BELTS.filter((b) => b.labelAu).map((b) => ({ text: b.name, au: b.labelAu, angle: 140, cls: 'belt-label' })),
  ].map((z) => {
    const obj = makeLabel(z.text, z.cls);
    layers.zones.add(obj);
    return { ...z, obj };
  });
  const trojanLabel = makeLabel('Trojaner (L4)', 'belt-label');
  layers.zones.add(trojanLabel);

  // Grenze inneres/äußeres Sonnensystem: Außenrand des Asteroidengürtels
  const boundary = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(new Array(256).fill(0).map(() => new THREE.Vector3())),
    new THREE.LineDashedMaterial({ color: 0x8aa0c8, dashSize: 1.5, gapSize: 1.5, transparent: true, opacity: 0.35 })
  );
  layers.zones.add(boundary);

  // --- Zustand & Aktualisierung --------------------------------------------------------
  let date = new Date();
  let blend = 0; // 0 = Lehrbuch, 1 = Real
  let blendTarget = 0;
  let selectedId = null;

  function update() {
    for (const { body, mesh, orbit, tail } of bodies.values()) {
      if (!orbit) continue;
      const helio = heliocentricPosition(body, date);
      mesh.position.copy(mapPoint(helio, blend));
      if (tail) updateTail(tail, mesh.position, Math.hypot(helio.x, helio.y, helio.z));
      const arr = orbit.geometry.attributes.position.array;
      orbitPath(body, date, ORBIT_STEPS).forEach((p, i) => {
        const v = mapPoint(p, blend);
        arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
      });
      orbit.geometry.attributes.position.needsUpdate = true;
      orbit.geometry.computeBoundingSphere();
      orbit.material.opacity = body.id === selectedId ? 0.9 : orbit.userData.baseOpacity;
    }

    const jup = heliocentricPosition(bodies.get('jupiter').body, date);
    const jupLon = Math.atan2(jup.y, jup.x) / (Math.PI / 180);
    belts.update(date, blend, jupLon);

    for (const z of zoneLabels) z.obj.position.copy(polar(z.au, z.angle));
    trojanLabel.position.copy(polar(5.2, jupLon + 60));
    const ring = boundary.geometry.attributes.position.array;
    for (let i = 0; i < 256; i++) {
      const v = polar(3.3, (i / 256) * 360);
      ring[i * 3] = v.x; ring[i * 3 + 1] = v.y; ring[i * 3 + 2] = v.z;
    }
    boundary.geometry.attributes.position.needsUpdate = true;
    boundary.computeLineDistances();
  }

  const polar = (au, deg) =>
    mapPoint({ x: au * Math.cos(deg * Math.PI / 180), y: au * Math.sin(deg * Math.PI / 180), z: 0 }, blend);

  // --- Auswahl per Klick ------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downAt = null;
  renderer.domElement.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects([...bodies.values()].map((b) => b.mesh), false)[0];
    if (hit) onSelect(hit.object.userData.body);
  });

  // --- Kamera-Flüge -------------------------------------------------------------------
  let flight = null;
  let follow = null; // Körper, dem die Kamera nach dem Anflug folgt
  function flyTo(toPos, toTarget, followId = null) {
    flight = {
      t: 0,
      fromPos: camera.position.clone(), toPos,
      fromTarget: controls.target.clone(), toTarget,
    };
    follow = followId;
  }

  function focus(bodyId) {
    const { mesh } = bodies.get(bodyId) || {};
    if (!mesh) return;
    const r = mesh.geometry.parameters.radius;
    const target = mesh.position.clone();
    flyTo(target.clone().add(new THREE.Vector3(0, r * 4 + 4, r * 8 + 10)), target, bodyId);
  }

  // Überblick über einen Bereich bis `au` AE
  function frame(au) {
    const d = sceneDistance(au, blendTarget) * 1.25 + 8;
    flyTo(new THREE.Vector3(0, d * 0.75, d * 1.05), new THREE.Vector3());
  }

  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labels.setSize(w, h);
  }
  new ResizeObserver(resize).observe(container);

  let active = true;
  let lastFrame = null;
  let lastFollowPos = null;
  renderer.setAnimationLoop(() => {
    if (!active) return;
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, now - (lastFrame ?? now));
    lastFrame = now;
    sun.tick(now);
    // Eigenrotation (visuell verlangsamt; Richtung aus der Tageslänge, Venus rückläufig)
    for (const { body, mesh } of bodies.values()) {
      if (body.id === 'sun') continue;
      const day = body.dayHours ?? body.rotationHours ?? 24;
      const dir = body.id === 'venus' || body.id === 'uranus' ? -1 : 1;
      mesh.rotation.y += dir * dt * Math.min(0.6, Math.max(0.02, 2.4 / day));
    }
    if (blend !== blendTarget) {
      blend += Math.sign(blendTarget - blend) * 0.025;
      if (Math.abs(blend - blendTarget) < 0.025) blend = blendTarget;
      update();
    }
    if (flight) {
      flight.t = Math.min(1, flight.t + 0.02);
      const k = 1 - Math.pow(1 - flight.t, 3);
      camera.position.lerpVectors(flight.fromPos, flight.toPos, k);
      controls.target.lerpVectors(flight.fromTarget, flight.toTarget, k);
      if (flight.t >= 1) flight = null;
    } else if (follow) {
      // Kamera wandert mit dem verfolgten Körper mit
      const pos = bodies.get(follow).mesh.position;
      if (lastFollowPos) {
        const delta = pos.clone().sub(lastFollowPos);
        camera.position.add(delta);
        controls.target.add(delta);
      }
    }
    lastFollowPos = follow ? bodies.get(follow).mesh.position.clone() : null;
    // Beschriftungen kleiner Objekte nur aus der Nähe (gegen Überlappung)
    for (const { mesh, minorLabel, body } of bodies.values()) {
      if (minorLabel) minorLabel.visible = body.id === selectedId || camera.position.distanceTo(mesh.position) < 45;
    }
    controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
  });
  controls.addEventListener('start', () => { if (!flight) follow = null; });

  update();

  return {
    setDate(d) { date = d; update(); },
    getDate: () => date,
    setRealMode(real) {
      blendTarget = real ? 1 : 0;
      frame(52); // Überblick bis zum Kuipergürtel
    },
    setLayer(name, visible) {
      layers[name].visible = visible;
      if (name === 'orbits') smallOrbits.forEach((o) => (o.visible = visible));
    },
    select(id) { selectedId = id; update(); },
    focus,
    frame,
    setActive(v) { active = v; if (v) resize(); },
  };
}

function makeLabel(text, className, y = 0, onClick) {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  if (onClick) el.addEventListener('click', onClick);
  const obj = new CSS2DObject(el);
  obj.position.set(0, y, 0);
  return obj;
}

function createStarfield() {
  const count = 8000;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(400000 + Math.random() * 400000);
    pos.set([v.x, v.y, v.z], i * 3);
    c.setHSL(0.55 + Math.random() * 0.15, 0.4, 0.7 + Math.random() * 0.3);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.5, sizeAttenuation: false, vertexColors: true }));
}

// Kometenschweif: zeigt von der Sonne weg, wächst in Sonnennähe (< 5 AE)
function createTail() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array([0.85, 0.93, 1, 0, 0, 0]), 3));
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending }));
}

function updateTail(tail, pos, rAu) {
  tail.visible = rAu < 5;
  const len = Math.min(25, 6 / Math.max(rAu, 0.3));
  const end = pos.clone().add(pos.clone().normalize().multiplyScalar(len));
  tail.geometry.attributes.position.array.set([pos.x, pos.y, pos.z, end.x, end.y, end.z]);
  tail.geometry.attributes.position.needsUpdate = true;
  tail.geometry.computeBoundingSphere();
}

function createRing(radius, ringFile) {
  const inner = radius * 1.25, outer = radius * 2.3;
  const geo = new THREE.RingGeometry(inner, outer, 128);
  // UV radial ausrichten, damit die Ringtextur (Streifen von innen nach außen) passt
  const pos = geo.attributes.position, uv = geo.attributes.uv, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
  }
  const ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    ...(ringFile ? { map: loadTex(ringFile) } : { color: 0xd8c690, opacity: 0.55 }),
    side: THREE.DoubleSide, transparent: true, depthWrite: false,
  }));
  ring.rotation.x = -Math.PI / 2 + 0.47; // ~26,7° Achsneigung
  return ring;
}

// Wolkenschicht der Erde, dreht sich leicht schneller als die Oberfläche
function createClouds(radius, file) {
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.02, 64, 32),
    new THREE.MeshStandardMaterial({ alphaMap: loader.load(`/textures/${file}`), transparent: true, depthWrite: false })
  );
  clouds.onBeforeRender = () => (clouds.rotation.y += 0.0004);
  return clouds;
}

