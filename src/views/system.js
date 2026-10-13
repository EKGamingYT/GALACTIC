// 3D-Sonnensystem (three.js) mit zwei Darstellungsmodi:
//  - „Lehrbuch“: alle Bahnen flach in einer Ebene, Abstände gestaucht
//  - „Real“: echte Bahnneigungen, Abstände maßstabsgetreu (linear in AE)
// Zwischen den Modi wird weich überblendet (blend 0 → 1).
// Planetengrößen sind in beiden Modi vergrößert, sonst wären sie unsichtbar.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BODIES } from '../data/bodies.js';
import { heliocentricPosition, orbitPath } from '../lib/orbits.js';
import { planetTexture } from '../lib/textures.js';
import { createBelts, BELTS } from './belts.js';
import { createSun } from '../lib/sun.js';
import { createMoonSystems } from './moons.js';
import { createAtmosphere } from '../lib/atmosphere.js';
import { rotationPeriod } from '../data/rotation.js';
import { TEXTURES } from '../data/textures.js';
import { HABITABLE_ZONE, REFERENCE_DIRECTIONS, GALACTIC_NORTH, SOLAR_SYSTEM } from '../data/solarsystem.js';
import { OBLATENESS, axisScale, lumpiness } from '../data/shapes.js';
import { shapeGeometry, flattenGeometry } from '../lib/shape.js';
import { enableGasFlow, gasTime, GAS_FLOW } from '../lib/gasflow.js';

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

// Beleuchtung: Einstrahlung ∝ 1/r² (r in AE). Rein physikalisch wäre Neptun fast schwarz (1/900),
// daher wahrnehmungsgerechte Abbildung: Faktor = (1/r²)^0.25 = r^−0.5, auf [0,22 … 1,7] begrenzt.
const irradianceFactor = (rAu) => Math.min(1.7, Math.max(0.22, Math.pow(Math.max(rAu, 0.01), -0.5)));

// Relief (bumpMap = Farbkarte) für felsige Körper: Stärke je Körper, sonst Standardwert
const BUMP_SCALE = { mercury: 0.5, venus: 0.08, mars: 0.35 };
const BUMP_DEFAULT = 0.5;

// Beschriftungs-Priorität (höher gewinnt): Sonne/Planeten > Zwergplaneten > Gürtel/Zonen > Kleinkörper
const labelPriority = (body, layer) =>
  body.id === 'sun' ? 90 : !layer ? 80 : body.type === 'Zwergplanet' ? 60 : layer === 'dwarfs' ? 55 : 20;

export function createSystemView(container, { onSelect }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 2e6);
  camera.position.set(0, 120, 170);

  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  // Handys: kleinere Auflösung, weniger MSAA und ein gröberer Bloom (günstiger)
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const pixelRatio = Math.min(window.devicePixelRatio, coarse ? 1.5 : 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  // Nachbearbeitung: HDR-Rendern → Bloom (nur sehr helle Bereiche: Sonne/Korona) → Ausgabe (sRGB)
  const composer = new EffectComposer(renderer,
    new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: coarse ? 2 : 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const labels = new CSS2DRenderer();
  labels.domElement.className = 'labels';
  container.appendChild(labels.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 6;
  controls.maxDistance = 250000;

  scene.add(createStarfield());
  scene.add(new THREE.AmbientLight(0xffffff, 0.1)); // schwach: Nachtseiten dunkel, aber nicht schwarz
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
  const declutterItems = []; // { el, id, prio } – für die automatische Beschriftungs-Entzerrung
  const sun = createSun(4, loadTex(TEXTURES.sun.map));
  for (const body of [...BODIES, ...SMALL_BODIES]) {
    if (body.parent) continue;
    const isSun = body.id === 'sun';
    const tex = TEXTURES[body.id];
    const layer = LAYER_OF[body.type];
    // Kleinkörper etwas kleiner als Planeten, aber anklickbar
    const radius = isSun ? 4 : layer ? Math.max(0.18, scaleRadius(body.radiusKm || 1) * 0.8) : scaleRadius(body.radiusKm);
    const flat = OBLATENESS[body.id] || 0; // echte Abplattung der Planeten
    const isGas = !!GAS_FLOW[body.id];
    const lit = []; // Materialien, deren Farbe mit der Sonneneinstrahlung skaliert wird
    const pushLit = (m) => { m.userData.base = m.color.clone(); lit.push(m); };
    let mesh;
    if (isSun) mesh = sun.mesh;
    else {
      // Kleinkörper: Achsverhältnisse aus gemessenen Abmessungen + Beulen (Näherung, kein exaktes Formmodell)
      const geo = new THREE.SphereGeometry(radius, 64, 32);
      if (layer) shapeGeometry(geo, { scale: axisScale(body), lumps: lumpiness(body), id: body.id });
      else flattenGeometry(geo, flat);
      const map = tex ? loadTex(tex.map) : planetTexture(body);
      const mat = new THREE.MeshStandardMaterial({
        map, roughness: 0.95,
        emissive: new THREE.Color(body.color).multiplyScalar(0.05), // Nachtseite nie ganz schwarz
      });
      if (tex?.tint) mat.color.set(tex.tint); // Graustufen-Aufnahmen in echter Farbe einfärben
      if (isGas) enableGasFlow(mat, body.id); // fließende Wolkenbänder
      else if (body.id !== 'earth') { mat.bumpMap = map; mat.bumpScale = BUMP_SCALE[body.id] ?? BUMP_DEFAULT; } // Kraterrelief
      pushLit(mat);
      mesh = new THREE.Mesh(geo, mat);
    }
    mesh.userData.body = body;
    (layer ? layers[layer] : scene).add(mesh);
    if (tex?.clouds) { const c = createClouds(radius, tex.clouds, flat); mesh.add(c); pushLit(c.material); }
    const atmo = isSun ? null : createAtmosphere(body.id, radius, flat);
    if (atmo) mesh.add(atmo);
    if (body.ring) { const ring = createRing(radius, tex?.ring); mesh.add(ring); pushLit(ring.material); }
    const labelCls = !layer || layer === 'dwarfs' ? 'body-label' : 'minor-label';
    const label = makeLabel(body.name, labelCls, radius + (layer ? 0.5 : 0.9), () => onSelect(body), body.color);
    mesh.add(label);
    declutterItems.push({ el: label.element, id: body.id, prio: labelPriority(body, layer) });

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
    bodies.set(body.id, {
      body, mesh, orbit, tail, lit, atmo, minorLabel: labelCls === 'minor-label' ? label : null,
      // Eigenrotation: Periode in Stunden (mit Vorzeichen) und zuletzt berechneter Winkel für die Anti-Strobe-Prüfung
      spinHours: rotationPeriod(body), lastSpin: null,
    });
  }

  // --- Mondsysteme ----------------------------------------------------------------
  const meshRadius = (mesh) => {
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    return mesh.geometry.boundingSphere.radius * Math.max(mesh.scale.x, mesh.scale.y, mesh.scale.z);
  };
  const moons = createMoonSystems(scene, {
    planetRadiusKm: (id) => bodies.get(id).body.radiusKm,
    planetMesh: (id) => bodies.get(id).mesh,
    sceneRadius: (id) => meshRadius(bodies.get(id).mesh),
    loadTex,
    makeLabel: (text, cls, y, body) => {
      const l = makeLabel(text, cls, y, () => onSelect(body), body.color);
      declutterItems.push({ el: l.element, id: body.id, prio: 25 });
      return l;
    },
  });
  // Weltposition eines Körpers oder großen Mondes
  const worldPos = (id) => {
    const b = bodies.get(id);
    if (b) return b.mesh.position.clone();
    const m = moons.get(id);
    return m ? m.mesh.getWorldPosition(new THREE.Vector3()) : null;
  };

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
    declutterItems.push({ el: obj.element, id: null, prio: 40 });
    return { ...z, obj };
  });
  const trojanLabel = makeLabel('Trojaner (L4)', 'belt-label');
  layers.zones.add(trojanLabel);
  declutterItems.push({ el: trojanLabel.element, id: null, prio: 40 });

  // Grenze inneres/äußeres Sonnensystem: Außenrand des Asteroidengürtels
  const boundary = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(new Array(256).fill(0).map(() => new THREE.Vector3())),
    new THREE.LineDashedMaterial({ color: 0x8aa0c8, dashSize: 1.5, gapSize: 1.5, transparent: true, opacity: 0.35 })
  );
  layers.zones.add(boundary);

  // --- Zustand & Aktualisierung --------------------------------------------------------
  let date = new Date();
  // Für flüssige Rotation im Live-Modus (die Uhr meldet dort nur 1x pro Sekunde): simulierte Zeit zwischen
  // zwei setDate-Aufrufen fortschreiben, solange die Uhr etwa in Echtzeit läuft.
  let dateSetAt = performance.now();
  let simRate = 0; // simulierte ms pro realer ms, aus den letzten beiden setDate-Aufrufen
  const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
  function simMillis() {
    const base = date.getTime();
    const dtReal = Math.min(1500, performance.now() - dateSetAt);
    return simRate > 0.9 && simRate < 1.1 ? base + dtReal * simRate : base;
  }
  let blend = 0; // 0 = Lehrbuch, 1 = Real
  let blendTarget = 0;
  let selectedId = null;

  let lastLightMs = null;
  let geomDate = null, geomBlend = null; // Stand der zuletzt berechneten Bahnen/Gürtel
  function update() {
    // Bahnlinien und 13.000 Gürtelteilchen ändern sich in Sekunden kaum → nur neu rechnen, wenn sich
    // die Zeit um > 6 h verschoben hat oder die Darstellung überblendet (gegen Ruckler im Live-Modus)
    const geom = geomBlend !== blend || geomDate === null || Math.abs(date - geomDate) > 6 * 3600e3;
    for (const { body, mesh, orbit, tail, lit, atmo } of bodies.values()) {
      if (!orbit) continue;
      const helio = heliocentricPosition(body, date);
      mesh.position.copy(mapPoint(helio, blend));
      const rAu = Math.hypot(helio.x, helio.y, helio.z);
      if (tail) updateTail(tail, mesh.position, rAu);
      // Sonneneinstrahlung nur bei Datumswechsel nachführen (nicht bei jedem Überblendungs-Bild)
      if (lit && lastLightMs !== date.getTime()) {
        const f = irradianceFactor(rAu);
        for (const m of lit) m.color.copy(m.userData.base).multiplyScalar(f);
        atmo?.userData.setIrradiance(f);
      }
      if (geom) {
        const arr = orbit.geometry.attributes.position.array;
        orbitPath(body, date, ORBIT_STEPS).forEach((p, i) => {
          const v = mapPoint(p, blend);
          arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
        });
        orbit.geometry.attributes.position.needsUpdate = true;
        orbit.geometry.computeBoundingSphere();
      }
    }
    applyOrbitStyle();

    lastLightMs = date.getTime();
    moons.update(date, blend);
    const jup = heliocentricPosition(bodies.get('jupiter').body, date);
    const jupLon = Math.atan2(jup.y, jup.x) / (Math.PI / 180);
    if (!geom) return;
    geomDate = date.getTime();
    geomBlend = blend;
    belts.update(date, blend, jupLon);
    updateHabitableZone();

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

  // --- Bahnen: alle oder nur die des ausgewählten Körpers -----------------------------
  let orbitsOn = true;
  let orbitMode = 'all'; // 'all' | 'selected'
  function applyOrbitStyle() {
    for (const { body, orbit } of bodies.values()) {
      if (!orbit) continue;
      const sel = body.id === selectedId;
      orbit.visible = orbitsOn && (orbitMode === 'all' || sel);
      orbit.material.opacity = sel ? 0.9 : orbit.userData.baseOpacity;
    }
  }

  // --- Habitable Zone (Kopparapu et al.): konservatives Band + optimistische Ränder ------
  const HZ_SEG = 256;
  const hzGroup = new THREE.Group();
  scene.add(hzGroup);
  const hzBand = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
    color: 0x3ddc84, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false,
  }));
  {
    const idx = [];
    for (let i = 0; i < HZ_SEG; i++) {
      const a = i * 2, b = ((i + 1) % HZ_SEG) * 2;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    hzBand.geometry.setIndex(idx);
    hzBand.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(HZ_SEG * 2 * 3), 3));
  }
  const hzEdges = HABITABLE_ZONE.optimistic.map(() => new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(new Array(HZ_SEG).fill(0).map(() => new THREE.Vector3())),
    new THREE.LineDashedMaterial({ color: 0x3ddc84, dashSize: 0.6, gapSize: 0.6, transparent: true, opacity: 0.45 })));
  hzGroup.add(hzBand, ...hzEdges);
  const hzLabel = makeLabel('Habitable Zone', 'zone-label hz-label');
  hzGroup.add(hzLabel);
  declutterItems.push({ el: hzLabel.element, id: null, prio: 40 });
  layers.hz = hzGroup;

  function updateHabitableZone() {
    const [inner, outer] = HABITABLE_ZONE.conservative;
    const pos = hzBand.geometry.attributes.position.array;
    for (let i = 0; i < HZ_SEG; i++) {
      const deg = (i / HZ_SEG) * 360;
      polar(inner, deg).toArray(pos, i * 6);
      polar(outer, deg).toArray(pos, i * 6 + 3);
    }
    hzBand.geometry.attributes.position.needsUpdate = true;
    hzBand.geometry.computeBoundingSphere();
    HABITABLE_ZONE.optimistic.forEach((au, k) => {
      const arr = hzEdges[k].geometry.attributes.position.array;
      for (let i = 0; i < HZ_SEG; i++) polar(au, (i / HZ_SEG) * 360).toArray(arr, i * 3);
      hzEdges[k].geometry.attributes.position.needsUpdate = true;
      hzEdges[k].computeLineDistances();
    });
    hzLabel.position.copy(polar((inner + outer) / 2, 215));
  }

  // --- Sternansicht: weit herausgezoomt bleibt nur die Sonne als Stern ------------------
  // samt Koordinatenkreuz (ICRS über Quasare, Richtung galaktisches Zentrum/Nordpol).
  const STAR_VIEW_AU = 1500;
  const starGroup = new THREE.Group();
  starGroup.visible = false;
  scene.add(starGroup);
  const starGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: 0xfff1c9, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: false,
  }));
  starGlow.scale.setScalar(0.05);
  starGroup.add(starGlow);
  const systemLabel = makeLabel('Sonnensystem', 'system-label', 0, () => onSelect(SOLAR_SYSTEM));
  systemLabel.element.innerHTML = '<strong>Sonnensystem</strong><span>Stern: Sonne · G2V · 8 Planeten</span>';
  starGroup.add(systemLabel);
  const refArrows = new THREE.Group();
  starGroup.add(refArrows);
  for (const ref of REFERENCE_DIRECTIONS) {
    const d = new THREE.Vector3(ref.dir.x, ref.dir.z, -ref.dir.y).normalize(); // Ekliptik → Szene
    const arrow = new THREE.ArrowHelper(d, new THREE.Vector3(), 1, ref.color, 0.06, 0.025);
    arrow.line.material.transparent = true;
    arrow.line.material.opacity = 0.7;
    const lbl = makeLabel(ref.name, 'ref-label');
    lbl.position.set(0, 1.08, 0); // Pfeilspitze (lokale y-Achse des ArrowHelper)
    arrow.add(lbl);
    refArrows.add(arrow);
  }
  // Galaktische Ebene als feiner Kreis senkrecht zum galaktischen Nordpol
  {
    const n = new THREE.Vector3(GALACTIC_NORTH.x, GALACTIC_NORTH.z, -GALACTIC_NORTH.y).normalize();
    const u = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize();
    const v = new THREE.Vector3().crossVectors(n, u);
    const pts = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      pts.push(u.clone().multiplyScalar(Math.cos(a)).add(v.clone().multiplyScalar(Math.sin(a))).multiplyScalar(0.8));
    }
    refArrows.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xffb86b, transparent: true, opacity: 0.25 })));
  }
  const layerOn = {};
  let starView = false;
  function updateStarView() {
    const dist = camera.position.length();
    const want = dist > sceneDistance(STAR_VIEW_AU, blend);
    if (want !== starView) {
      starView = want;
      starGroup.visible = want;
      for (const [name, g] of Object.entries(layers)) g.visible = want ? false : layerOn[name] !== false;
      for (const b of bodies.values()) if (b.body.id !== 'sun') b.mesh.visible = !want;
      // Beschriftung „Sonne“ weicht in der Sternansicht dem Systemnamen
      const sunLabel = bodies.get('sun').mesh.children.find((c) => c.isCSS2DObject);
      if (sunLabel) sunLabel.visible = !want;
      container.classList.toggle('star-view', want);
    }
    if (want) refArrows.scale.setScalar(dist * 0.32); // Kreuz wächst mit, bleibt im Bild
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
    const hit = raycaster.intersectObjects([...[...bodies.values()].map((b) => b.mesh), ...moons.meshes()], false)[0];
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
    const mesh = bodies.get(bodyId)?.mesh ?? moons.get(bodyId)?.mesh;
    if (!mesh) return;
    // Ausdehnung aus der Begrenzungskugel (auch für verbeulte/skalierte Körper); bei Planeten mit
    // Monden so weit zurück, dass das Mondsystem ins Bild passt
    const r = meshRadius(mesh);
    const back = Math.max(r * 8 + 10, moons.extent(bodyId) * 2.2);
    const target = worldPos(bodyId);
    flyTo(target.clone().add(new THREE.Vector3(0, back * 0.45 + r * 2, back)), target, bodyId);
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
    composer.setSize(w, h);
    // Bloom läuft intern schon mit halber Auflösung; auf Handys noch gröber (¼)
    if (coarse) bloom.setSize(Math.ceil(w * pixelRatio / 2), Math.ceil(h * pixelRatio / 2));
    labels.setSize(w, h);
  }
  new ResizeObserver(resize).observe(container);

  let active = true;
  let lastFrame = null;
  let lastFollowPos = null;
  let lastDeclutter = 0;

  // Beschriftungen entzerren: nach Priorität sortieren; jede Beschriftung, die eine bereits
  // behaltene (wichtigere) überdeckt, wird per CSS-Klasse ausgeblendet (Opacity-Übergang).
  function declutter() {
    const items = [];
    for (const it of declutterItems) {
      if (it.el.style.display === 'none') continue; // von CSS2D/Ebene/Distanzregel bereits versteckt
      const r = it.el.getBoundingClientRect();
      if (!r.width) continue;
      items.push({ it, r, prio: it.id !== null && it.id === selectedId ? 100 : it.prio });
    }
    items.sort((a, b) => b.prio - a.prio);
    const kept = [];
    for (const { it, r } of items) {
      const hit = kept.some((k) => r.left < k.right + 2 && r.right > k.left - 2 && r.top < k.bottom + 1 && r.bottom > k.top - 1);
      if (it.hidden !== hit) { it.hidden = hit; it.el.classList.toggle('lbl-hide', hit); }
      if (!hit) kept.push(r);
    }
  }
  renderer.setAnimationLoop(() => {
    if (!active) return;
    const now = performance.now() / 1000;
    lastFrame = now;
    sun.tick(now, camera);
    gasTime.value = now;
    // Eigenrotation echt aus dem simulierten Datum: Winkel = 2π · (Zeit seit J2000 / Periode).
    // Anti-Strobe: springt der Winkel zwischen zwei Bildern um > 0,35 rad (schneller Zeitraffer),
    // bleibt der Körper einfach stehen, statt wild zu flackern.
    const sinceJ2000 = simMillis() - J2000_MS;
    for (const b of bodies.values()) {
      if (!b.spinHours) continue;
      const angle = (2 * Math.PI * sinceJ2000) / (Math.abs(b.spinHours) * 3600000) * Math.sign(b.spinHours);
      const jump = b.lastSpin === null ? 0 : Math.abs(angle - b.lastSpin);
      b.lastSpin = angle;
      if (jump <= 0.35) b.mesh.rotation.y = angle % (2 * Math.PI);
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
      const pos = worldPos(follow);
      if (lastFollowPos) {
        const delta = pos.clone().sub(lastFollowPos);
        camera.position.add(delta);
        controls.target.add(delta);
      }
    }
    lastFollowPos = follow ? worldPos(follow) : null;
    if (starView) moons.setVisible(false);
    else moons.updateVisibility(camera, selectedId);
    // Beschriftungen kleiner Objekte nur aus der Nähe (gegen Überlappung)
    for (const { mesh, minorLabel, body } of bodies.values()) {
      if (minorLabel) minorLabel.visible = body.id === selectedId || camera.position.distanceTo(mesh.position) < 45;
    }
    updateStarView();
    controls.update();
    composer.render();
    labels.render(scene, camera);
    if (now - lastDeclutter > 0.15) { lastDeclutter = now; declutter(); }
  });
  controls.addEventListener('start', () => { if (!flight) follow = null; });

  update();

  return {
    setDate(d) {
      const nowMs = performance.now();
      const dReal = nowMs - dateSetAt;
      if (dReal > 0) simRate = (d.getTime() - date.getTime()) / dReal;
      dateSetAt = nowMs;
      date = d;
      update();
    },
    getDate: () => date,
    setRealMode(real) {
      blendTarget = real ? 1 : 0;
      frame(52); // Überblick bis zum Kuipergürtel
    },
    setLayer(name, visible) {
      layerOn[name] = visible;
      if (name === 'orbits') { orbitsOn = visible; applyOrbitStyle(); return; }
      if (!starView) layers[name].visible = visible;
    },
    setOrbitMode(mode) { orbitMode = mode; applyOrbitStyle(); },
    select(id) { selectedId = id; applyOrbitStyle(); },
    focus,
    frame,
    setActive(v) { active = v; if (v) resize(); },
  };
}

// Weicher runder Lichtpunkt (für die Sonne in der Sternansicht)
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,236,190,0.9)');
  grad.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function makeLabel(text, className, y = 0, onClick, dotColor) {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  if (dotColor) el.style.setProperty('--dot', dotColor); // Farbpunkt vor dem Namen
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

// Wolkenschicht der Erde: dreht mit der Erde mit (Kind-Mesh) plus sehr langsamer eigener Drift
function createClouds(radius, file, flat = 0) {
  const clouds = new THREE.Mesh(
    flattenGeometry(new THREE.SphereGeometry(radius * 1.02, 64, 32), flat),
    new THREE.MeshStandardMaterial({ alphaMap: loader.load(`/textures/${file}`), transparent: true, depthWrite: false })
  );
  clouds.onBeforeRender = () => (clouds.rotation.y = performance.now() * 2e-6); // ~0,002 rad/s
  return clouds;
}

