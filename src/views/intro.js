// Intro-Animation der Systemansicht (startet mit dem Ereignis „galactic:intro“ des Startbildschirms):
// Kamera fliegt aus der Ferne heran, Sonne und Planeten erscheinen von innen nach außen,
// ihre Bahnen zeichnen sich nach, danach blenden Kleinkörper, Gürtel, habitable Zone,
// Zonen und Oortsche Wolke nacheinander ein.
const easeOutBack = (x) => { const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// Materialien einer Gruppe mit ihrer ursprünglichen Deckkraft merken
function collectMaterials(group) {
  const list = [];
  group.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) list.push({ m, opacity: m.opacity, transparent: m.transparent });
  });
  return list;
}

export function createIntro({ bodies, layers, ordered }) {
  let start = null;
  let fades = [];
  const DURATION = 8.5;

  function begin() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    start = performance.now() / 1000;
    // Ebenen, die nacheinander eingeblendet werden: [Gruppe, Startzeit, Dauer]
    const plan = [
      ['dwarfs', 4.0], ['asteroids', 4.5], ['comets', 4.9], ['belts', 5.3],
      ['hz', 6.0], ['zones', 6.4], ['planet9', 6.9], ['oort', 7.2],
    ];
    fades = plan.filter(([name]) => layers[name]).map(([name, t0]) => {
      const mats = collectMaterials(layers[name]);
      for (const e of mats) { e.m.transparent = true; e.m.opacity = 0; }
      return { mats, t0, dur: 1.1 };
    });
    step(start);
    return true;
  }

  // pro Bild aufrufen; gibt true zurück, solange die Animation läuft
  function step(nowSec) {
    if (start === null) return false;
    const t = nowSec - start;
    ordered.forEach((id, i) => {
      const b = bodies.get(id);
      if (!b) return;
      const t0 = id === 'sun' ? 0.2 : 0.9 + i * 0.32;
      const s = easeOutBack(clamp01((t - t0) / 0.8));
      b.mesh.scale.setScalar(Math.max(0.0001, s));
      if (b.orbit) b.orbit.material.opacity = b.orbit.userData.baseOpacity * easeOut(clamp01((t - t0 - 0.3) / 1.0));
    });
    for (const f of fades) {
      const k = easeOut(clamp01((t - f.t0) / f.dur));
      for (const e of f.mats) e.m.opacity = e.opacity * k;
    }
    if (t >= DURATION) { finish(); return false; }
    return true;
  }

  // Endzustand exakt wiederherstellen
  function finish() {
    for (const id of ordered) bodies.get(id)?.mesh.scale.setScalar(1);
    for (const f of fades) for (const e of f.mats) { e.m.opacity = e.opacity; e.m.transparent = e.transparent; }
    fades = [];
    start = null;
  }

  return { begin, step, running: () => start !== null };
}
