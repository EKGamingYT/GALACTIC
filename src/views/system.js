// 3D-Sonnensystem (three.js). Entfernungen werden nichtlinear gestaucht,
// Größen übertrieben – sonst wären die Planeten unsichtbar klein.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { BODIES } from '../data/bodies.js';
import { heliocentricPosition, orbitPath, distance } from '../lib/orbits.js';

const scaleDistance = (au) => 14 * Math.pow(au, 0.55);
const scaleRadius = (km) => Math.max(0.35, 0.22 * Math.pow(km / 1000, 0.45));

// Ekliptik (x, y, z) -> three.js (x, z, -y), Abstand gestaucht.
function toScene(p) {
  const r = distance(p);
  const k = r > 0 ? scaleDistance(r) / r : 0;
  return new THREE.Vector3(p.x * k, p.z * k, -p.y * k);
}

export function createSystemView(container, { onSelect }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
  camera.position.set(0, 120, 170);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.className = 'labels';
  container.appendChild(labels.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 8;
  controls.maxDistance = 900;

  scene.add(createStarfield());
  scene.add(new THREE.AmbientLight(0xffffff, 0.18));
  scene.add(new THREE.PointLight(0xfff2d0, 3, 0, 0));

  const meshes = new Map();
  const orbitLines = new Map();

  for (const body of BODIES) {
    if (body.parent) continue;
    const isSun = body.id === 'sun';
    const radius = isSun ? 4 : scaleRadius(body.radiusKm);
    const material = isSun
      ? new THREE.MeshBasicMaterial({ color: body.color })
      : new THREE.MeshStandardMaterial({ color: body.color, roughness: 0.85 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), material);
    mesh.userData.body = body;
    scene.add(mesh);
    meshes.set(body.id, mesh);

    if (isSun) mesh.add(createGlow(radius));
    if (body.ring) mesh.add(createRing(radius));

    const label = document.createElement('div');
    label.className = 'body-label';
    label.textContent = body.name;
    label.addEventListener('click', () => onSelect(body));
    const labelObj = new CSS2DObject(label);
    labelObj.position.set(0, radius + 0.9, 0);
    mesh.add(labelObj);
  }

  let date = new Date();

  function updatePositions() {
    for (const body of BODIES) {
      if (!body.elements) continue;
      meshes.get(body.id).position.copy(toScene(heliocentricPosition(body, date)));

      orbitLines.get(body.id)?.removeFromParent();
      const pts = orbitPath(body, date).map(toScene);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: body.color, transparent: true, opacity: 0.35 })
      );
      scene.add(line);
      orbitLines.set(body.id, line);
    }
  }
  updatePositions();

  // Auswahl per Klick (Raycasting); kurzer Klick, kein Ziehen.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downAt = null;
  renderer.domElement.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects([...meshes.values()], false)[0];
    if (hit) onSelect(hit.object.userData.body);
  });

  // Sanftes Heranfliegen an einen Körper.
  let flight = null;
  function focus(bodyId) {
    const mesh = meshes.get(bodyId);
    if (!mesh) return;
    const target = mesh.position.clone();
    const r = mesh.geometry.parameters.radius;
    const offset = new THREE.Vector3(0, r * 4 + 4, r * 8 + 10);
    flight = {
      t: 0,
      fromPos: camera.position.clone(), toPos: target.clone().add(offset),
      fromTarget: controls.target.clone(), toTarget: target,
    };
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
  renderer.setAnimationLoop(() => {
    if (!active) return;
    if (flight) {
      flight.t = Math.min(1, flight.t + 0.02);
      const k = 1 - Math.pow(1 - flight.t, 3);
      camera.position.lerpVectors(flight.fromPos, flight.toPos, k);
      controls.target.lerpVectors(flight.fromTarget, flight.toTarget, k);
      if (flight.t >= 1) flight = null;
    }
    controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
  });

  return {
    setDate(d) { date = d; updatePositions(); },
    getDate: () => date,
    focus,
    setActive(v) { active = v; if (v) resize(); },
  };
}

function createStarfield() {
  const count = 6000;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(1500 + Math.random() * 1500);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false }));
}

function createGlow(radius) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,220,140,0.9)');
  g.addColorStop(0.35, 'rgba(255,170,60,0.35)');
  g.addColorStop(1, 'rgba(255,140,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas), depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sprite.scale.setScalar(radius * 7);
  return sprite;
}

function createRing(radius) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 1.3, radius * 2.3, 96),
    new THREE.MeshBasicMaterial({ color: 0xd8c690, side: THREE.DoubleSide, transparent: true, opacity: 0.55 })
  );
  ring.rotation.x = -Math.PI / 2 + 0.47; // ~26,7° Achsneigung
  return ring;
}
