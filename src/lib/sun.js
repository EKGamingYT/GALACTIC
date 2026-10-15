// Animierte Sonne: echte Sonnentextur, durch fBm-Rauschen animiert, mit Randverdunkelung
// im Shader, dazu eine dynamische Korona (Billboard mit Flammen/Protuberanzen am Rand).
import * as THREE from 'three';

const vertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec2 vUv;
  void main() {
    vPos = position;
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }
`;

const fragment = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uTime;
  uniform sampler2D uMap;
  uniform vec3 uTint;      // Sternfarbe (andere Sterne); Sonne: Textur unverändert
  uniform float uTintMix;  // 0 = Sonnentextur, 1 = in Sternfarbe umgefärbt
  uniform vec4 uKind;      // x: Zellgröße, y: Konvektion (0 glatt … 1 brodelnd), z: Fleckenanteil, w: Wolkenbänder (Braune Zwerge)
  uniform float uBright;   // Gesamthelligkeit (Weiße Zwerge heller, Braune Zwerge dunkel)
  varying vec2 vUv;
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
    #include <logdepthbuf_fragment>
    vec3 p = normalize(vPos) * 3.2 * uKind.x;
    float t = uTime * 0.04;
    // zwei Rauschschichten, gegeneinander verschoben → wabernde Granulation
    float n = fbm(p + vec3(t, -t * 0.7, t * 0.4));
    float cells = fbm(p * 3.5 - vec3(t * 1.6));
    float heat = mix(0.55, clamp(n * 0.65 + cells * 0.45, 0.0, 1.0), uKind.y);
    // echte Sonnentextur, durch das Rauschen leicht verzerrt → „kochende“ Oberfläche
    vec2 warp = vec2(n - 0.5, cells - 0.5) * 0.012;
    vec3 tex = texture2D(uMap, vUv + warp).rgb;
    vec3 col = tex * (0.75 + heat * 0.6);
    col = mix(col, vec3(1.0, 0.85, 0.45), heat * 0.25);
    col = mix(col, vec3(1.0, 0.97, 0.85), pow(heat, 4.0));
    // Sonnenflecken (selten, dunkel)
    float spot = smoothstep(0.8 - uKind.z * 0.25, 0.86 - uKind.z * 0.25, fbm(p * 0.9 + vec3(7.0, t * 0.2, 3.0)));
    col *= 1.0 - spot * (0.4 + uKind.z * 0.25);
    // Braune Zwerge: Wolkenbänder wie bei Gasriesen statt Granulation
    float bands = 0.5 + 0.5 * sin(normalize(vPos).y * 22.0 + fbm(p * 1.5 + vec3(t * 0.3)) * 4.0);
    col *= mix(1.0, 0.55 + 0.6 * bands, uKind.w);
    // Randverdunkelung
    float mu = clamp(dot(vNormal, vView), 0.0, 1.0);
    col *= 0.45 + 0.55 * pow(mu, 0.45);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    // Farbe kräftiger (pow), sonst brennt der Bloom jeden Stern weiß-gelb aus
    col = mix(col, lum * pow(uTint, vec3(1.6)) * 1.3, uTintMix);
    gl_FragColor = vec4(col * 1.9 * uBright, 1.0); // HDR (> 1) → löst den Bloom-Glanz aus
    #include <colorspace_fragment>
  }
`;

// --- Korona: Billboard in der Sonnenmitte, Flammen radial nach außen strömend ---------------
// Die Ebene liegt in der Sonnenmitte und steht senkrecht zur Sichtlinie auf die Mitte. Der Tiefentest
// der Sonnenkugel verdeckt sie innen; ihre Größe ist in „scheinbaren Silhouettenradien“ skaliert
// (uRim, pro Bild aktualisiert), damit Kugelrand und Koronarand auch aus der Nähe lückenlos aneinanderliegen.
const coronaVertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uSize;   // halbe Kantenlänge in Welteinheiten (= Ausdehnung × scheinbarer Silhouettenradius)
  varying vec2 vP;
  void main() {
    vP = position.xy;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec3 c = normalize(mv.xyz);                          // Sichtlinie zur Sonnenmitte
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), c));
    vec3 up = cross(c, right);
    mv.xyz += (right * position.x + up * position.y) * uSize;
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }
`;

const coronaFragment = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uTime;
  uniform float uSpan; // Ausdehnung des Billboards in Sonnenradien
  uniform vec3 uHot;   // Farbe am Rand (heiß)
  uniform vec3 uCool;  // Farbe weiter draußen
  uniform float uFlame; // Flammen-/Protuberanzstärke
  varying vec2 vP;

  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p, int oct) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { if (i >= oct) break; v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }

  void main() {
    float r = length(vP) * uSpan;            // Abstand in Sonnenradien
    if (r < 0.97 || r > uSpan * 0.98) discard; // innen verdeckt die Kugel (Tiefentest)
    #include <logdepthbuf_fragment>
    vec2 dir = vP / max(length(vP), 1e-4);   // Richtung statt Winkel → keine Naht
    float h = r - 1.0;                       // Höhe über dem Sonnenrand
    float t = uTime;

    // Flammenlänge je Richtung: wandert langsam → mal hier, mal dort eine Protuberanz
    float lenN = fbm(vec3(dir * 1.7, t * 0.05), 3);
    float reach = 0.18 + 3.4 * pow(max(lenN - 0.22, 0.0), 1.5);
    // Flammenzungen strömen nach außen (Zeit läuft gegen die Höhe)
    float streak = fbm(vec3(dir * 7.0, h * 1.6 - t * 0.35), 4);
    float tongues = smoothstep(0.30, 0.85, streak);
    float flame = clamp(1.0 - h / reach, 0.0, 1.0);
    flame = flame * flame * (0.35 + 1.1 * tongues) * uFlame;
    flame *= smoothstep(-0.05, 0.04, h);

    // weicher Grundschein (pulsiert leicht)
    float pulse = 1.0 + 0.08 * sin(t * 0.8) + 0.05 * sin(t * 1.9 + dir.x * 3.0);
    float glow = (0.62 * exp(-max(h, 0.0) * 2.6) + 0.2 * exp(-max(h, 0.0) * 0.7)) * pulse;

    float inten = flame * 1.2 + glow;
    inten *= 1.0 - smoothstep(uSpan * 0.5, uSpan * 0.97, r); // nach außen ausblenden

    // heiß = gelb-weiß am Rand, kühler = orange-rot weiter draußen
    float hot = clamp(inten * 0.6 - h * 0.3, 0.0, 1.0);
    vec3 col = mix(uCool, uHot, hot);
    col = mix(col, vec3(1.0, 0.95, 0.75), pow(hot, 3.0) * 0.35);
    gl_FragColor = vec4(col * 1.6, clamp(inten, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

export function createSun(radius, map) {
  const uniforms = { uTime: { value: 0 }, uMap: { value: map }, uTint: { value: new THREE.Color(1, 1, 1) }, uTintMix: { value: 0 },
    uKind: { value: new THREE.Vector4(1, 1, 0.3, 0) }, uBright: { value: 1 } };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 96, 48),
    new THREE.ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: fragment })
  );

  // Korona: ein einziger Billboard-Quad (additiv), 6 scheinbare Sonnenradien Kantenlänge je Seite
  const span = 6;
  const coronaUniforms = {
    uTime: uniforms.uTime, uSpan: { value: span }, uSize: { value: radius * span },
    uHot: { value: new THREE.Color(1.0, 0.82, 0.38) }, uCool: { value: new THREE.Color(1.0, 0.28, 0.04) }, uFlame: { value: 1 },
  };
  const corona = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: coronaUniforms, vertexShader: coronaVertex, fragmentShader: coronaFragment,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })
  );
  corona.frustumCulled = false; // Vertex-Shader verschiebt die Ecken weit über die Geometrie hinaus
  corona.raycast = () => {};
  mesh.add(corona);

  const camPos = new THREE.Vector3();
  const sunPos = new THREE.Vector3();
  // Radius der Kugel für die Randberechnung minimal verkleinert: das Kugelnetz ist ein Vieleck
  // innerhalb des echten Kreises, so bleibt garantiert keine Haarlücke.
  const rr = radius * 0.996;

  // Die Eigenrotation (mesh.rotation.y) setzt der Aufrufer aus dem simulierten Datum
  return {
    mesh,
    time: uniforms.uTime, // gemeinsam genutzt von den Oberflächen der Nachbarsterne
    tick(seconds, camera) {
      uniforms.uTime.value = seconds;
      if (!camera) return;
      // Scheinbarer Silhouettenradius auf der Ebene durch die Mitte, senkrecht zur Sichtlinie:
      // rim = r·d/√(d²−r²) mit d = Kameraabstand zur Sonnenmitte
      camera.getWorldPosition(camPos);
      mesh.getWorldPosition(sunPos);
      const d = Math.max(camPos.distanceTo(sunPos), rr * 1.02);
      coronaUniforms.uSize.value = (rr * d / Math.sqrt(d * d - rr * rr)) * span;
    },
  };
}

// Sternparameter je Spektralklasse: [Zellgröße, Konvektion, Flecken, Bänder, Helligkeit, Flammen]
// Heiße A/F-Sterne haben kaum Konvektion (glatte Oberfläche), K/M-Zwerge große Zellen und viele Sternflecken,
// M-Zwerge zudem starke Flare-Aktivität, Weiße Zwerge sind glatt und gleißend, Braune Zwerge zeigen Wolkenbänder.
const KIND = {
  A: [1.4, 0.15, 0.0, 0, 1.25, 0.5], F: [1.2, 0.45, 0.1, 0, 1.12, 0.7], G: [1.0, 1.0, 0.3, 0, 1.0, 1.0],
  K: [0.8, 1.0, 0.35, 0, 0.95, 1.1], M: [0.6, 1.0, 0.45, 0, 0.9, 1.5], D: [2.0, 0.05, 0.0, 0, 1.6, 0.25],
  L: [0.5, 0.6, 0.2, 1, 0.55, 0.15],
};
export function spectralKind(spectralType) {
  const sp = (spectralType || '').trim().toUpperCase();
  if (/^(D|WD)/.test(sp)) return 'D';
  const c = sp.replace(/^(ESD|USD|SD)/, '')[0] || 'M';
  if ('OBA'.includes(c)) return 'A';
  if ('LTY'.includes(c)) return 'L';
  return 'FGKM'.includes(c) ? c : 'M';
}

// Oberfläche + Korona eines anderen Sterns: gleicher Shader wie die Sonne, in Sternfarbe und mit Typ-Parametern
export function createStarBody(map, color, kind, timeUniform) {
  const k = KIND[kind] ?? KIND.G;
  const tint = new THREE.Color(color);
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: timeUniform, uMap: { value: map }, uTint: { value: tint }, uTintMix: { value: 1 },
      uKind: { value: new THREE.Vector4(k[0], k[1], k[2], k[3]) }, uBright: { value: k[4] } },
    vertexShader: vertex, fragmentShader: fragment,
  });
  const span = 5;
  const coronaUniforms = {
    uTime: timeUniform, uSpan: { value: span }, uSize: { value: span },
    uHot: { value: tint.clone().lerp(new THREE.Color(1, 1, 1), 0.35) }, uCool: { value: tint.clone().multiplyScalar(0.6) },
    uFlame: { value: k[5] },
  };
  const corona = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: coronaUniforms, vertexShader: coronaVertex, fragmentShader: coronaFragment,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  corona.frustumCulled = false;
  corona.raycast = () => {};
  const camPos = new THREE.Vector3(), pos = new THREE.Vector3();
  return {
    material, corona,
    // pro Bild für sichtbare Sterne: Koronagröße an den scheinbaren Rand anpassen (wie bei der Sonne)
    tick(camera, mesh) {
      const r = mesh.scale.x * 0.996;
      camera.getWorldPosition(camPos);
      mesh.getWorldPosition(pos);
      const d = Math.max(camPos.distanceTo(pos), r * 1.02);
      coronaUniforms.uSize.value = ((r * d) / Math.sqrt(d * d - r * r)) * span; // Weltmaß (Billboard im Sichtraum)
    },
  };
}
