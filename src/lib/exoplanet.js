// Darstellung von Exoplaneten: Oberflächentyp grob aus Größe und Gleichgewichtstemperatur
// (Lavawelt, heiß, gemäßigt, Eis, Gasriese) – eine künstlerische Einordnung, keine Aufnahme –
// beleuchtet vom eigenen Stern (Tag-/Nachtseite), nicht von der Sonne.
import * as THREE from 'three';
import { planetTexture } from './textures.js';

export function exoplanetLook(p, teqK) {
  const giant = (p.radiusEarth ?? 0) > 3.5 || (p.massEarth ?? 0) > 20;
  let color, kind;
  if (giant) [color, kind] = teqK > 800 ? ['#c98a58', 'Heißer Gasriese'] : teqK > 300 ? ['#d9b38c', 'Gasriese'] : ['#9fc0de', 'Kalter Gasriese'];
  else if (teqK > 1000) [color, kind] = ['#b2482e', 'Lavawelt'];
  else if (teqK > 400) [color, kind] = ['#b08060', 'Heißer Gesteinsplanet'];
  else if (teqK > 200) [color, kind] = ['#7d93ab', 'Gemäßigter Gesteinsplanet'];
  else [color, kind] = ['#c4c0b8', 'Eiswelt'];
  // atmo: Farbe + Stärke des Lichtsaums, glow: Eigenleuchten der Nachtseite (Lava), spec: Glanzlicht (Eis/Ozean)
  const fx = {
    'Lavawelt': { atmo: ['#ff7a3a', 0.25], glow: 1, spec: 0.1 },
    'Heißer Gesteinsplanet': { atmo: ['#ffb27a', 0.2], glow: 0.15, spec: 0.1 },
    'Gemäßigter Gesteinsplanet': { atmo: ['#7fb2ff', 0.6], glow: 0, spec: 0.35 },
    'Eiswelt': { atmo: ['#cfe6ff', 0.25], glow: 0, spec: 0.7 },
    'Heißer Gasriese': { atmo: ['#ffb070', 0.7], glow: 0.35, spec: 0.05 },
    'Gasriese': { atmo: ['#f3d9b0', 0.6], glow: 0, spec: 0.05 },
    'Kalter Gasriese': { atmo: ['#9cc8ff', 0.7], glow: 0, spec: 0.05 },
  }[kind];
  return { color, kind, texture: giant ? 'bands' : undefined, ...fx };
}

const vertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vUv = uv;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
    #include <logdepthbuf_vertex>
  }
`;
const fragment = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D uMap;
  uniform vec3 uStar;     // Weltposition des Muttersterns
  uniform vec3 uStarColor;
  uniform vec3 uAtmo;     // Farbe des Atmosphärensaums
  uniform float uAtmoK;   // Stärke des Saums
  uniform float uGlow;    // Glühen der Nachtseite (Lavawelten)
  uniform float uSpec;    // Glanzlicht
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    #include <logdepthbuf_fragment>
    vec3 N = normalize(vN);
    vec3 L = normalize(uStar - vW);
    vec3 V = normalize(cameraPosition - vW);
    float nl = dot(N, L);
    float d = max(nl, 0.0);
    vec3 tex = texture2D(uMap, vUv).rgb;
    vec3 light = mix(vec3(1.0), uStarColor, 0.35);
    // weicher Tag-Nacht-Übergang (Dämmerungszone)
    float day = smoothstep(-0.12, 0.25, nl);
    vec3 col = tex * (0.04 + d * 1.15 * light) * mix(0.6, 1.0, day);
    // Glanzlicht (Eis/Ozean)
    vec3 H = normalize(L + V);
    col += light * uSpec * pow(max(dot(N, H), 0.0), 48.0) * day;
    // Lavawelt: glühende Risse auf der Nachtseite, langsam pulsierend
    float cracks = smoothstep(0.55, 0.85, texture2D(uMap, vUv * 3.0).r + 0.15 * sin(uTime * 0.6 + vUv.x * 40.0));
    col += vec3(1.0, 0.35, 0.08) * uGlow * cracks * (1.0 - day) * 1.4;
    // Atmosphärensaum: am Rand (Fresnel), auf der beleuchteten Seite stärker, leicht über die Terminatorlinie
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    col += uAtmo * uAtmoK * rim * (0.15 + 1.1 * smoothstep(-0.3, 0.4, nl));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export function createExoplanetMaterial(look, seedId, starColor, timeUniform = { value: 0 }) {
  const map = planetTexture({ id: seedId, color: look.color, texture: look.texture });
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map }, uStar: { value: new THREE.Vector3() }, uStarColor: { value: new THREE.Color(starColor) },
      uAtmo: { value: new THREE.Color(look.atmo?.[0] ?? '#88aaff') }, uAtmoK: { value: look.atmo?.[1] ?? 0.3 },
      uGlow: { value: look.glow ?? 0 }, uSpec: { value: look.spec ?? 0.1 }, uTime: timeUniform,
    },
    vertexShader: vertex, fragmentShader: fragment,
  });
}
