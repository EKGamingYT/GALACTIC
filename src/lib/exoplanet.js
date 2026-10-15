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
  return { color, kind, texture: giant ? 'bands' : undefined };
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
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    #include <logdepthbuf_fragment>
    vec3 L = normalize(uStar - vW);
    float d = max(dot(normalize(vN), L), 0.0);
    vec3 tex = texture2D(uMap, vUv).rgb;
    vec3 col = tex * (0.05 + d * 1.15 * mix(vec3(1.0), uStarColor, 0.35));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export function createExoplanetMaterial(look, seedId, starColor) {
  const map = planetTexture({ id: seedId, color: look.color, texture: look.texture });
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map }, uStar: { value: new THREE.Vector3() }, uStarColor: { value: new THREE.Color(starColor) } },
    vertexShader: vertex, fragmentShader: fragment,
  });
}
