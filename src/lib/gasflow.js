// Animierte Wolkenbänder der Gasriesen: MeshStandardMaterial wird per onBeforeCompile so gepatcht,
// dass die u-Koordinate der Farbkarte breitenabhängig verschoben wird (Scherung × Zeit, benachbarte
// Bänder strömen gegenläufig wie die Zonalwinde) plus etwas Rauschturbulenz.
import * as THREE from 'three';

// Gemeinsame Zeit-Uniform (Sekunden), vom Aufrufer pro Bild gesetzt
export const gasTime = { value: 0 };

// Stärke je Planet: flow = Bandgeschwindigkeit (Textur-u pro Sekunde), turb = Rauschverwirbelung (Textur-uv)
export const GAS_FLOW = {
  jupiter: { flow: 0.0012, turb: 0.0045, seed: 1.3 },
  saturn:  { flow: 0.0010, turb: 0.0035, seed: 4.1 },
  uranus:  { flow: 0.0003, turb: 0.0012, seed: 2.7 },
  neptune: { flow: 0.0004, turb: 0.0015, seed: 6.2 },
};

const NOISE = /* glsl */ `
  uniform float uGasTime;
  uniform float uFlow;
  uniform float uTurb;
  uniform float uSeed;
  float gHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float gNoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(gHash(i), gHash(i + vec3(1,0,0)), f.x), mix(gHash(i + vec3(0,1,0)), gHash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(gHash(i + vec3(0,0,1)), gHash(i + vec3(1,0,1)), f.x), mix(gHash(i + vec3(0,1,1)), gHash(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
`;

// Karte muss horizontal wiederholen (u wird über 1 hinaus verschoben)
export function enableGasFlow(material, id) {
  const cfg = GAS_FLOW[id];
  if (!cfg || !material.map) return;
  material.map.wrapS = THREE.RepeatWrapping;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGasTime = gasTime;
    shader.uniforms.uFlow = { value: cfg.flow };
    shader.uniforms.uTurb = { value: cfg.turb };
    shader.uniforms.uSeed = { value: cfg.seed };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${NOISE}\nvoid main() {`)
      .replace('#include <map_fragment>', /* glsl */ `
        #ifdef USE_MAP
          vec2 gUv = vMapUv;
          float gLat = gUv.y - 0.5;
          // Zonalwinde: Mischung aus Sinuswellen über die Breite → Bänder laufen gegeneinander
          float jet = 0.6 * sin(gLat * 34.0 + uSeed) + 0.4 * sin(gLat * 13.0 + uSeed * 2.0);
          gUv.x += jet * uFlow * uGasTime;
          // Turbulenz: langsam wabernde Verwirbelung, entlang der Bänder gestreckt
          vec3 gp = vec3(gUv.x * 22.0, gUv.y * 11.0, uGasTime * 0.03 + uSeed);
          gUv += (vec2(gNoise(gp), gNoise(gp + 17.3)) - 0.5) * uTurb * 6.0;
          vec4 sampledDiffuseColor = texture2D(map, gUv);
          diffuseColor *= sampledDiffuseColor;
        #endif
      `);
  };
  material.customProgramCacheKey = () => 'gasflow';
}
