// Echter Sternenhimmel als Hintergrund: NASA SVS „Deep Star Maps 2020“ (äquatoriale,
// äquirektanguläre Karte). Pro Bildpunkt wird aus der Blickrichtung RA/Dec berechnet –
// so liegt die Milchstraße exakt richtig, ohne Naht an der Kartenkante.
import * as THREE from 'three';
import { OBLIQUITY_DEG } from '../data/solarsystem.js';

const vertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const fragment = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D uMap;
  uniform float uEps;      // Schiefe der Ekliptik (rad)
  uniform float uRaSign;   // +1: RA nimmt im Bild nach rechts zu, −1: nach links
  uniform float uRaOffset; // u-Position von RA = 0 (0 = linker Rand, 0.5 = Mitte)
  uniform float uBright;
  varying vec3 vDir;
  void main() {
    #include <logdepthbuf_fragment>
    vec3 s = normalize(vDir);
    // Szene (x, y, z) = Ekliptik (x, z, −y)  →  Ekliptik → Äquator
    vec3 ecl = vec3(s.x, -s.z, s.y);
    vec3 eq = vec3(ecl.x, ecl.y * cos(uEps) - ecl.z * sin(uEps), ecl.y * sin(uEps) + ecl.z * cos(uEps));
    float ra = atan(eq.y, eq.x);             // −π … π
    float dec = asin(clamp(eq.z, -1.0, 1.0));
    float u = fract(uRaOffset + uRaSign * ra / (2.0 * PI));
    float v = 0.5 + dec / PI;
    gl_FragColor = vec4(texture2D(uMap, vec2(u, v)).rgb * uBright, 1.0);
    #include <colorspace_fragment>
  }
`;

export function createSkybox(url, { raSign = -1, raOffset = 0.5, brightness = 0.85 } = {}) {
  const map = new THREE.TextureLoader().load(url);
  map.colorSpace = THREE.SRGBColorSpace;
  map.generateMipmaps = false; // keine Mipmap-Naht an der RA-Kante
  map.minFilter = THREE.LinearFilter;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 32),
    new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: map }, uEps: { value: OBLIQUITY_DEG * Math.PI / 180 },
        uRaSign: { value: raSign }, uRaOffset: { value: raOffset }, uBright: { value: brightness },
      },
      vertexShader: vertex, fragmentShader: fragment, side: THREE.BackSide, depthWrite: false, depthTest: false,
    })
  );
  mesh.renderOrder = -1000; // immer zuerst, ganz hinten
  mesh.frustumCulled = false;
  return mesh;
}
