// Dynamischer Sternenhimmel für das 3D-Sonnensystem: 2MASS-Farbkarte (J/H/Ks, Skrutskie et al. 2006) als
// HiPS-Kacheln vom CDS Strasbourg (ID CDS/P/2MASS/color, Ordnung 0–9, 512-px-JPEG, äquatorial).
//
// - Detail nach Bildfeld: Aus Kamera-FOV und Bildhöhe folgt die HEALPix-Ordnung (ein Kachelpixel ≈ ein
//   Bildschirmpunkt); geladen werden nur die Kacheln im Blickkegel. Die 12 Kacheln der Ordnung 0 bilden die
//   sofort sichtbare Grundlage und bleiben dauerhaft im Speicher; bis feinere da sind, springen gröbere ein.
// - Echte Parallaxe: Der HiPS zeigt den Himmel von der Erde aus. Alle Sterne des Nachbarsterne-Katalogs
//   (≤ 50 Lj, src/data/nearbystars.json) werden darin an ihrer von der ERDE aus gesehenen Richtung
//   weich ausgeblendet (Scheibchen mit dem örtlichen Himmelshintergrund gefüllt, Radius nach geschätzter
//   Ks-Helligkeit); gezeichnet werden sie stattdessen als 3D-Lichtpunkte (src/views/stars.js), die sich beim
//   Fliegen richtig verschieben. Fernere Sterne bleiben im Bild: Ihre Parallaxe innerhalb der 50-Lj-Blase
//   ist klein (bei 500 Lj höchstens ~6°, meist deutlich weniger – sie liegen großteils noch viel weiter
//   weg) und wird bewusst vernachlässigt; der Hintergrund ist für sie „unendlich fern“.
// - Ausfallsicher: Bis alle Grundkacheln geladen sind (oder wenn CDS nicht erreichbar ist) bleibt die lokale
//   Skybox (src/lib/skybox.js) darunter sichtbar.
import * as THREE from 'three';
import STARS_DATA from '../data/nearbystars.json';
import { OBLIQUITY_DEG } from '../data/solarsystem.js';
import { SKY_GRID_GLSL, GAL_NORTH_EQ } from './skybox.js';
import {
  DEG, tilePixelAngle, lonlat2vec, fromThree, orderForPixel, viewRadius, tileMeta,
  tileGeometry, createTileLoader, selectTiles,
} from './hips.js';

export const TWOMASS = { id: '2mass', path: '/2MASS/Color', ext: 'jpg', maxOrder: 9, width: 512, frame: 'eq' };
const MASK_N = 24; // höchstens so viele ausgeblendete Sterne je Kachel (die hellsten zuerst)

// --- Geschätzte Ks-Helligkeit der Nachbarsterne (für Größe der Ausblendung) -------------------------------
// V−Ks nach Effektivtemperatur (Hauptreihe, grob nach Pecaut & Mamajek 2013)
const V_K = [[9700, 0], [8000, 0.4], [7000, 0.75], [6500, 1.05], [6000, 1.35], [5770, 1.55], [5300, 1.9], [5000, 2.2],
  [4600, 2.65], [4200, 3.2], [3900, 3.65], [3600, 4.2], [3400, 4.6], [3200, 5.0], [3050, 5.5], [2900, 6.2], [2700, 7.0], [2500, 7.6]];
// absolute Ks-Helligkeit kühler Zwerge nach Temperatur (für Sterne ohne V-Helligkeit im Katalog)
const MK = [[3900, 4.5], [3500, 5.5], [3200, 6.8], [3000, 7.8], [2800, 8.8], [2500, 9.6], [2000, 10.8], [1500, 12], [1200, 13.5], [900, 15], [500, 18], [300, 21]];
function interp(table, t) {
  if (t >= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (t >= table[i][0]) {
      const [t0, v0] = table[i - 1], [t1, v1] = table[i];
      return v1 + ((v0 - v1) * (t - t1)) / (t0 - t1);
    }
  }
  return table[table.length - 1][1];
}
const SPEC_TEFF = { O: 30000, B: 15000, A: 8500, F: 6500, G: 5600, K: 4500, M: 3300, L: 1800, T: 1100, Y: 400 };
function estimateKs(s) {
  const teff = s.teffK ?? SPEC_TEFF[(s.spectralType || '').trim()[0]] ?? null;
  if (s.vmag != null) return s.vmag - (teff ? interp(V_K, teff) : 2);
  const dm = 5 * Math.log10(s.distanceLy / 3.26156) - 5; // Entfernungsmodul
  if (/^D/.test(s.spectralType || '')) return 12.5 + dm;  // Weißer Zwerg
  return teff ? interp(MK, teff) + dm : null;
}
// Radius der Ausblendung (rad): helle Sterne erscheinen in 2MASS als große, überstrahlte Scheiben
const maskRadius = (k) => Math.min(420, Math.max(7, 9 * Math.pow(10, 0.15 * (9 - k)))) / 3600 * DEG;

// Ausblend-Liste: Richtung (äquatorial und three-äquatorial), Radius, Helligkeit
const MASKS = STARS_DATA.stars
  .filter((s) => s.raDeg != null && s.decDeg != null && s.distanceLy)
  .map((s) => ({ s, k: estimateKs(s) }))
  .filter((m) => m.k != null && m.k < 11.5) // noch schwächere Punkte sind in 2MASS kaum zu sehen
  .map(({ s, k }) => {
    const v = lonlat2vec(s.raDeg, s.decDeg);
    return { v, t: new THREE.Vector4(v[0], v[2], -v[1], maskRadius(k)), k };
  })
  .sort((a, b) => a.k - b.k);

const VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  varying vec3 vDir;
  void main() {
    vUv = uv;
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;
const FRAG = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D map;
  uniform float uBright;   // dynamische Himmelshelligkeit (nach Kameraabstand, aus system.js)
  uniform float uGain;
  uniform float uBlack;    // Schwarzwert: Grundrauschen/Himmelsglühen der 2MASS-Aufnahmen abziehen
  uniform float uGamma;    // > 1: schwache Sterne/Rauschen zurücknehmen
  uniform float uSat;
  uniform float uEps;
  uniform vec3 uGalNorth;
  uniform float uGrid;
  uniform vec4 uMask[${MASK_N}]; // three-äquatoriale Richtung + Radius (rad)
  uniform int uMaskN;
  uniform float uTexel;    // Winkel eines Kachelpixels (rad)
  uniform float uUvPerRad; // Kachel-UV je Radiant (ungefähr)
  varying vec2 vUv;
  varying vec3 vDir;
  ${SKY_GRID_GLSL}
  vec3 tone(vec3 c) {
    c = max(c - uBlack, 0.0) / (1.0 - uBlack);
    float l = max(max(c.r, c.g), c.b);
    // Kontrastkurve (uGamma > 1 drückt das dichte Gewimmel schwacher Sterne und das Rauschen) und weiche
    // Schulter bis höchstens ~0,9: helle 2MASS-Sterne brennen nicht aus und lösen keinen Bloom aus (Schwelle 1,0)
    float k = pow(l, uGamma) * uGain;
    k = 0.9 * k / (1.0 + k);
    vec3 t = c * (k / max(l, 1e-5));
    float y = dot(t, vec3(0.2126, 0.7152, 0.0722));
    return max(mix(vec3(y), t, uSat), 0.0);
  }
  void main() {
    #include <logdepthbuf_fragment>
    vec3 d = normalize(vDir);
    vec2 gx = dFdx(vUv), gy = dFdy(vUv);
    vec3 col = texture(map, vUv).rgb;
    // Nachbarsterne (≤ 50 Lj) aus dem Erd-Himmel herausnehmen – sie werden als 3D-Lichtpunkte gezeichnet
    for (int i = 0; i < ${MASK_N}; i++) {
      if (i >= uMaskN) break;
      vec4 m = uMask[i];
      float r = max(m.w, 2.5 * uTexel);
      float a = distance(d, m.xyz);
      if (a < r) {
        // Ersatz: dunkelster von vier Punkten im Abstand 1,8 r ringsum (örtlicher Hintergrund)
        float o = 1.8 * r * uUvPerRad;
        vec3 bg = min(min(textureGrad(map, vUv + vec2(o, 0.0), gx, gy).rgb, textureGrad(map, vUv - vec2(o, 0.0), gx, gy).rgb),
                      min(textureGrad(map, vUv + vec2(0.0, o), gx, gy).rgb, textureGrad(map, vUv - vec2(0.0, o), gx, gy).rgb));
        col = mix(bg, col, smoothstep(0.55 * r, r, a)); // (überbelichtete 2MASS-Kerne sind innen schwarz)
      }
    }
    col = tone(col) * uBright;
    if (uGrid > 0.0) {
      vec3 eq = vec3(d.x, -d.z, d.y);
      vec3 ecl = vec3(eq.x, eq.y * cos(uEps) + eq.z * sin(uEps), -eq.y * sin(uEps) + eq.z * cos(uEps));
      col = skyGrid(col, eq, ecl, uGalNorth, uGrid);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

// fallback: Mesh der lokalen Skybox (createSkybox) – liefert uBright/uGrid und dient als Rückfall
export function createHipsSky({ renderer, fallback, def = TWOMASS, maxTiles = 110 }) {
  const group = new THREE.Group();
  // three-äquatorial → Szene (Ekliptik): Drehung um die x-Achse (Frühlingspunkt) um −ε
  group.rotation.x = -OBLIQUITY_DEG * DEG;
  group.scale.setScalar(1000);
  group.updateMatrixWorld();
  const toLocal = group.quaternion.clone().invert();

  const shared = {
    uBright: fallback.material.uniforms.uBright,
    uGrid: fallback.material.uniforms.uGrid,
    uGain: { value: 3.0 }, uBlack: { value: 0.004 }, uGamma: { value: 1.5 }, uSat: { value: 0.8 },
    uEps: { value: OBLIQUITY_DEG * DEG }, uGalNorth: { value: GAL_NORTH_EQ.clone() },
  };
  const layer = { def, cache: new Map(), order: 0, pending: 0 };
  let changed = true, lastKey = '';

  function masksFor(order, ipix) {
    const m = tileMeta(order, ipix), texel = tilePixelAngle(order, def.width);
    const list = [];
    for (const s of MASKS) {
      const reach = m.r + Math.max(s.t.w, 2.5 * texel) * 1.05;
      const cosd = s.v[0] * m.c[0] + s.v[1] * m.c[1] + s.v[2] * m.c[2];
      if (cosd > Math.cos(reach)) { list.push(s.t); if (list.length >= MASK_N) break; } // MASKS ist nach Helligkeit sortiert
    }
    return list;
  }

  const loader = createTileLoader({
    maxTiles, maxInflight: 6, layers: () => [layer],
    colorSpace: THREE.SRGBColorSpace, // sRGB-JPEG → linear (die Szene rendert linear in HDR, Ausgabe sRGB)
    anisotropy: () => Math.min(4, renderer.capabilities.getMaxAnisotropy()),
    makeMesh: (r, tex, order, ipix) => {
      const masks = masksFor(order, ipix);
      const texel = tilePixelAngle(order, def.width);
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
        uniforms: {
          ...shared, map: { value: tex },
          uMask: { value: [...masks, ...new Array(MASK_N - masks.length).fill(new THREE.Vector4(0, 0, 0, 0))] },
          uMaskN: { value: masks.length }, uTexel: { value: texel }, uUvPerRad: { value: 1 / (texel * def.width) },
        },
      });
      const mesh = new THREE.Mesh(tileGeometry(def, order, ipix), mat);
      mesh.renderOrder = -900 + order; // nach der Rückfall-Skybox (−1000), vor allem anderen; feinere oben
      mesh.frustumCulled = false;
      mesh.raycast = () => {};
      return mesh;
    },
    onSettled: () => { changed = true; },
  });

  const fwd = new THREE.Vector3();
  let baseReady = false;
  function update(camera, heightPx) {
    group.position.copy(camera.position); // unendlich fern: wandert mit der Kamera
    camera.getWorldDirection(fwd).applyQuaternion(toLocal);
    const fov = camera.fov / (camera.zoom || 1);
    const key = `${fwd.x.toFixed(3)},${fwd.y.toFixed(3)},${fwd.z.toFixed(3)},${fov.toFixed(3)},${camera.aspect.toFixed(3)},${heightPx}`;
    if (!changed && key === lastKey) return;
    changed = false;
    lastKey = key;
    const dir = fromThree(fwd);
    const pxAngle = (fov * DEG) / (Math.max(1, heightPx) * Math.min(1.5, window.devicePixelRatio || 1));
    const order = orderForPixel(def, pxAngle);
    loader.beginFrame();
    // Grundlage: ganzer Himmel in Ordnung 0 (12 Kacheln), immer angefordert und nie verdrängt
    const base = [];
    for (let p = 0; p < 12; p++) {
      const e = loader.request(layer, 0, p, -1);
      if (e) e.pinned = true;
      if (e?.state === 'ready') base.push(e);
    }
    const draw = selectTiles(loader, layer, order, dir, viewRadius(fov, camera.aspect), 120);
    for (const e of base) { e.keep = true; draw.add(e); }
    baseReady = base.length === 12;
    group.clear();
    for (const e of draw) group.add(e.mesh);
    loader.abortStale();
    loader.flush();
    // Rückfall: lokale Skybox, bis die Grundkacheln vollständig sind (bzw. solange CDS nicht antwortet)
    fallback.visible = !baseReady;
  }

  return {
    group,
    update,
    uniforms: shared,
    // true, sobald der 2MASS-Himmel steht – erst dann sind die Nachbarsterne darin ausgeblendet
    get ready() { return baseReady; },
    get order() { return layer.order; },
    stats: () => ({ order: layer.order, pending: layer.pending, loaded: loader.loadedCount, inflight: loader.net.inflight, fails: loader.net.fails }),
  };
}
