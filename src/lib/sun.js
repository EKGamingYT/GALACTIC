// Animierte Sonne: prozedurale Granulation (fBm-Rauschen) mit Randverdunkelung
// im Shader, dazu ein pulsierender Korona-Schein.
import * as THREE from 'three';

const vertex = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vPos = position;
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  uniform float uTime;
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vView;

  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.07; a *= 0.5; }
    return v;
  }

  void main() {
    vec3 p = normalize(vPos) * 3.2;
    float t = uTime * 0.04;
    // zwei Rauschschichten, gegeneinander verschoben → wabernde Granulation
    float n = fbm(p + vec3(t, -t * 0.7, t * 0.4));
    float cells = fbm(p * 3.5 - vec3(t * 1.6));
    float heat = clamp(n * 0.65 + cells * 0.45, 0.0, 1.0);
    vec3 col = mix(vec3(0.95, 0.35, 0.05), vec3(1.0, 0.85, 0.45), heat);
    col = mix(col, vec3(1.0, 0.97, 0.85), pow(heat, 4.0));
    // Sonnenflecken (selten, dunkel)
    float spot = smoothstep(0.72, 0.8, fbm(p * 0.9 + vec3(7.0, t * 0.2, 3.0)));
    col *= 1.0 - spot * 0.55;
    // Randverdunkelung
    float mu = clamp(dot(vNormal, vView), 0.0, 1.0);
    col *= 0.45 + 0.55 * pow(mu, 0.45);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createSun(radius) {
  const uniforms = { uTime: { value: 0 } };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 96, 48),
    new THREE.ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: fragment })
  );

  // Korona: weicher, leicht pulsierender Schein
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,230,170,0.95)');
  g.addColorStop(0.22, 'rgba(255,180,80,0.55)');
  g.addColorStop(0.45, 'rgba(255,130,40,0.16)');
  g.addColorStop(1, 'rgba(255,110,30,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas), depthWrite: false, blending: THREE.AdditiveBlending, transparent: true,
  }));
  corona.scale.setScalar(radius * 7);
  mesh.add(corona);

  return {
    mesh,
    tick(seconds) {
      uniforms.uTime.value = seconds;
      corona.scale.setScalar(radius * (7 + Math.sin(seconds * 0.8) * 0.25));
      mesh.rotation.y = seconds * 0.01;
    },
  };
}
