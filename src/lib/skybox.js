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
  uniform vec3 uGalNorth; // galaktischer Nordpol (äquatorial)
  uniform float uGrid;     // 0 = aus, 1 = Himmelskoordinaten-Gitter einblenden
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
    vec3 col = texture2D(uMap, vec2(u, v)).rgb * uBright;
    if (uGrid > 0.0) {
      // Linien mit konstanter Bildschirmbreite (fwidth): Äquatorgitter alle 30° RA / 30° Dek.,
      // Himmelsäquator, Ekliptik (gelb) und galaktischer Äquator (orange)
      float raDeg = degrees(ra), decDeg = degrees(dec);
      // min(): an der RA-Naht (±180°) springt fwidth um 360° – sonst entstünde dort ein falscher Strich
      float wRa = min(fwidth(raDeg), 1.5) * 1.2, wDec = fwidth(decDeg) * 1.2;
      float gRa = 1.0 - smoothstep(0.0, wRa, abs(mod(raDeg + 15.0, 30.0) - 15.0));
      float gDec = 1.0 - smoothstep(0.0, wDec, abs(mod(decDeg + 15.0, 30.0) - 15.0));
      float grid = max(gRa * (1.0 - smoothstep(75.0, 88.0, abs(decDeg))), gDec);
      float eqLine = 1.0 - smoothstep(0.0, wDec * 1.6, abs(decDeg));
      float betaDeg = degrees(asin(clamp(ecl.z, -1.0, 1.0)));
      float eclLine = 1.0 - smoothstep(0.0, fwidth(betaDeg) * 1.8, abs(betaDeg));
      float bDeg = degrees(asin(clamp(dot(eq, uGalNorth), -1.0, 1.0)));
      float galLine = 1.0 - smoothstep(0.0, fwidth(bDeg) * 1.8, abs(bDeg));
      col = mix(col, vec3(0.45, 0.62, 1.0), grid * 0.22 * uGrid);
      col = mix(col, vec3(0.55, 0.75, 1.0), eqLine * 0.55 * uGrid);
      col = mix(col, vec3(1.0, 0.85, 0.35), eclLine * 0.6 * uGrid);
      col = mix(col, vec3(1.0, 0.6, 0.3), galLine * 0.5 * uGrid);
    }
    gl_FragColor = vec4(col, 1.0);
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
        uGrid: { value: 0 },
        // galaktischer Nordpol: RA 192,85948°, Dek. +27,12825° (J2000)
        uGalNorth: { value: new THREE.Vector3(
          Math.cos(27.12825 * Math.PI / 180) * Math.cos(192.85948 * Math.PI / 180),
          Math.cos(27.12825 * Math.PI / 180) * Math.sin(192.85948 * Math.PI / 180),
          Math.sin(27.12825 * Math.PI / 180)) },
      },
      vertexShader: vertex, fragmentShader: fragment, side: THREE.BackSide, depthWrite: false, depthTest: false,
    })
  );
  mesh.renderOrder = -1000; // immer zuerst, ganz hinten
  mesh.frustumCulled = false;
  return mesh;
}
