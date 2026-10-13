// Atmosphären-Schein für Planeten: zwei billige additive Hüllen mit Fresnel-Shader.
//  - Außenhülle (BackSide): weicher Halo, der hinter dem Planetenrand ausläuft
//  - Innenhülle (FrontSide): schmaler heller Saum am Rand der Planetenscheibe
// Die Sonne sitzt im Ursprung; die Seite zur Sonne leuchtet stärker, die Nachtseite kaum.
import * as THREE from 'three';

const vertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vSun;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    // Richtung zur Sonne (Weltursprung) im Blickraum
    vSun = normalize((viewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz - mv.xyz);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }
`;

const fragment = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uColor;
  uniform float uStrength;
  uniform float uPower;
  uniform float uK;     // Normierung für die Außenhülle (Randabstand → 1 am Planetenrand)
  uniform float uOuter; // 1 = Außenhülle (BackSide), 0 = Innensaum
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vSun;
  void main() {
    #include <logdepthbuf_fragment>
    float nv = dot(normalize(vN), normalize(vV));
    float f;
    if (uOuter > 0.5) {
      // Rückseiten der Hülle: -nv ist am Planetenrand maximal, am Hüllenrand 0
      f = pow(clamp(-nv / uK, 0.0, 1.0), uPower);
    } else {
      // Innensaum: Fresnel – stark am Scheibenrand, zur Mitte hin 0
      f = pow(clamp(1.0 - nv, 0.0, 1.0), uPower * 1.6) * 0.8;
    }
    // Tag-/Nachtseite: zur Sonne hin hell, abgewandt nur ein Hauch
    float lit = smoothstep(-0.35, 0.55, dot(normalize(vN), normalize(vSun)));
    f *= mix(0.12, 1.0, lit) * uStrength;
    gl_FragColor = vec4(uColor, clamp(f, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

// Atmosphären-Parameter je Körper: Farbe, Stärke, Hüllengröße (Faktor auf den Radius), Fresnel-Exponent
export const ATMOSPHERES = {
  earth:   { color: 0x4f9bff, strength: 1.0,  scale: 1.12, power: 3.0 },
  venus:   { color: 0xf2d9a0, strength: 1.7,  scale: 1.14, power: 2.4 },
  mars:    { color: 0xd9925a, strength: 0.55, scale: 1.05, power: 3.5 },
  jupiter: { color: 0xd8b48a, strength: 0.4,  scale: 1.07, power: 3.2 },
  saturn:  { color: 0xe6d09a, strength: 0.35, scale: 1.07, power: 3.2 },
  uranus:  { color: 0x8fe0e8, strength: 0.7,  scale: 1.09, power: 3.0 },
  neptune: { color: 0x4a70ff, strength: 0.7,  scale: 1.09, power: 3.0 },
  // Plutos dünne Stickstoff-Atmosphäre erscheint im Gegenlicht blau (Dunstschichten, New Horizons)
  pluto:   { color: 0x6fa8ff, strength: 0.45, scale: 1.06, power: 3.4 },
};

function shell(radius, cfg, outer, flatten) {
  const s = outer ? cfg.scale : 1.004;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(cfg.color) },
      uStrength: { value: cfg.strength },
      uPower: { value: cfg.power },
      // Planetenrand trifft die Hülle bei -n·v = sqrt(1 - 1/scale²)
      uK: { value: Math.sqrt(1 - 1 / (cfg.scale * cfg.scale)) },
      uOuter: { value: outer ? 1 : 0 },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: outer ? THREE.BackSide : THREE.FrontSide,
  });
  // 48x24 Segmente reichen für einen weichen Verlauf
  const geo = new THREE.SphereGeometry(radius * s, 48, 24);
  if (flatten) geo.scale(1, 1 - flatten, 1); // Hülle folgt der Abplattung des Planeten
  return new THREE.Mesh(geo, mat);
}

// Liefert eine Gruppe (Kind des Planeten-Meshes) oder null, falls der Körper keine Atmosphäre hat.
// `flatten`: Abplattung des Planeten. `group.userData.setIrradiance(f)` dämpft/verstärkt den Schein
// passend zur Sonneneinstrahlung (f = Beleuchtungsfaktor des Planeten).
export function createAtmosphere(id, radius, flatten = 0) {
  const cfg = ATMOSPHERES[id];
  if (!cfg) return null;
  const g = new THREE.Group();
  g.add(shell(radius, cfg, true, flatten), shell(radius, cfg, false, flatten));
  g.children.forEach((m) => (m.raycast = () => {})); // nicht anklickbar
  g.userData.setIrradiance = (f) => {
    const k = Math.min(1.2, Math.max(0.35, f));
    g.children.forEach((m) => (m.material.uniforms.uStrength.value = cfg.strength * k));
  };
  return g;
}
