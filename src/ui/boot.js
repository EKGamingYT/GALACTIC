// Startbildschirm „Uplink“ – der JS-Teil (Markup, kritisches CSS und die CSS-Zeitleiste
// Bodenstation → Satelliten-Relais → Datenzentren stehen in index.html und laufen schon, bevor dieses Modul geladen ist).
//
// Dieses Modul
//   1. koppelt die Statuszeilen „Sternkatalog … System bereit“ an echte Fortschritte
//      (THREE.DefaultLoadingManager für die Texturen, Ereignis „galactic:ready“ aus main.js),
//   2. beschleunigt die CSS-Zeitleiste, falls die App früher fertig ist (nie mehr als ~1,5 s Wartezeit nach „bereit“),
//   3. blendet den Schirm aus und löst danach genau einmal „galactic:intro“ aus (system.js startet die Kamerafahrt),
//   4. erlaubt Überspringen per Klick/Tipp oder Esc – auch bei reduzierter Bewegung (dort kurze statische Version).
import * as THREE from 'three';

const MAX_MS = 10000;      // spätestens ~10 s nach Seitenaufruf fertig (Textur-Nachlader laufen im Hintergrund weiter)
const CSS_BUDGET_MS = 250; // ist die App bereit: Rest der CSS-Zeitleiste in höchstens so langer Zeit abspielen
const HOLD_MS = 100;       // „System bereit“ kurz stehen lassen
const FADE_MS = 420;       // = Dauer der CSS-Blende in index.html
const FADE_FAST_MS = 220;  // beim Überspringen
const MIN_STATIC_MS = 600; // reduzierte Bewegung: mindestens so lange sichtbar
const TEX_QUIET_MS = 120;  // Texturen gelten als fertig, wenn so lange nichts Neues dazukam

window.__galacticBoot = true; // sagt dem Notfall-Rückfall in index.html, dass dieses Modul übernommen hat

let introSent = false;
function sendIntro() {
  if (introSent) return;
  introSent = true;
  window.dispatchEvent(new Event('galactic:intro'));
}

const root = document.getElementById('boot');
if (root) start(root);
else window.addEventListener('galactic:ready', sendIntro, { once: true }); // ohne Schirm (z. B. Hot-Reload): Intro direkt

function start(root) {
  const t0 = performance.now();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sub = root.querySelector('#boot-sub');
  const sr = root.querySelector('#boot-sr');
  const bar = root.querySelector('.boot-bar');

  // --- echter Zustand -------------------------------------------------------------------------
  let ready = false; // main.js hat die Ansichten aufgebaut (und ein, zwei Bilder gezeichnet)
  const tex = { started: false, seen: false, loaded: 0, total: 0, last: 0 };
  const manager = THREE.DefaultLoadingManager;
  const hook = (name, fn) => {
    const prev = manager[name];
    manager[name] = (...a) => { fn(...a); if (prev) prev.apply(manager, a); };
  };
  hook('onStart', (_u, l, t) => { tex.started = true; tex.loaded = l; tex.total = t; tex.last = performance.now(); });
  hook('onProgress', (_u, l, t) => { tex.started = tex.seen = true; tex.loaded = l; tex.total = t; tex.last = performance.now(); });
  hook('onLoad', () => { tex.last = performance.now(); });
  const texIdle = () => !tex.started || (tex.loaded >= tex.total && performance.now() - tex.last > TEX_QUIET_MS);

  // --- Zeitleiste der CSS-Phase (Bodenstation … Datenkanäle) ------------------------------------------
  const clock = reduced ? null : root.querySelector('.bt-clock')?.getAnimations?.()[0];
  const cssEnd = clock ? clock.effect.getComputedTiming().endTime : 0;
  const cssDone = () => !clock || clock.playState === 'finished' || (clock.currentTime ?? 0) >= cssEnd;
  const cssAnimations = () => root.getAnimations({ subtree: true })
    .filter((a) => 'animationName' in a && a.effect.getComputedTiming().iterations !== Infinity);
  const cssRate = (r) => cssAnimations().forEach((a) => { try { a.updatePlaybackRate(r); } catch { /* egal */ } });
  const cssFinish = () => cssAnimations().forEach((a) => { try { a.finish(); } catch { /* egal */ } });

  // --- Statuszeilen der JS-Phase ----------------------------------------------------------------
  const quick = reduced ? 0 : 1;
  const steps = [
    { key: 'cat', dur: 100 * quick },                                  // gebündelte Sterndaten sind mit dem Skript da
    { key: 'orb', dur: 100 * quick, gate: () => ready },               // Bahnen entstehen beim Aufbau der Systemansicht
    { key: 'tex', dur: 100 * quick, gate: () => ready && (skipped || texIdle()) },
    { key: 'go', dur: 160 * quick, gate: () => !reduced || performance.now() - t0 >= MIN_STATIC_MS },
  ].map((s) => ({ ...s, t: 0, el: root.querySelector(`[data-s="${s.key}"]`) }));
  const texInfo = steps[2].el.querySelector('.bt-i');

  let i = -1;            // laufender Schritt der JS-Phase
  let skipped = false;
  let finished = false;
  let shown = 0;
  let last = t0;

  const say = (text) => { if (sr) sr.textContent = text; };
  const phase = (text) => { if (sub) sub.textContent = text; };
  const texText = () => {
    if (!tex.seen) return tex.started ? '…' : '';
    return `${Math.min(tex.loaded, tex.total)}/${tex.total}`;
  };
  const setBar = (v) => {
    shown = Math.max(shown, Math.min(1, v));
    bar.style.setProperty('--p', shown.toFixed(3));
  };

  function begin(k) {
    i = k;
    steps[k].el.classList.add('act');
    if (steps[k].key === 'go') root.classList.add('go');
  }
  function complete(k) {
    const s = steps[k];
    if (s.key === 'tex') texInfo.textContent = tex.started ? texText() : '';
    s.el.classList.remove('act');
    s.el.classList.add('ok');
  }

  function frac(k) {
    const s = steps[k];
    if (s.key === 'tex' && tex.seen) return Math.min(0.95, tex.loaded / (tex.total || 1));
    return Math.min(s.gate && !s.gate() ? 0.9 : 1, s.dur ? s.t / s.dur : 1);
  }

  function tick() {
    if (finished) return;
    const now = performance.now();
    let budget = skipped ? Infinity : now - last; // Zeit seit dem letzten Takt (nach einem langen Frame können mehrere Schritte fertig werden)
    last = now;

    if (!cssDone()) { setBar(0.5 * (clock ? Math.min(1, (clock.currentTime ?? 0) / cssEnd) : 1)); return; }
    if (i < 0) {
      phase('System wird geladen');
      say('System wird geladen');
      begin(0);
    }
    while (i < steps.length) {
      const s = steps[i];
      if (s.key === 'tex') texInfo.textContent = texText();
      const need = Math.max(0, s.dur - s.t);
      if (budget < need) { s.t += budget; break; }
      budget -= need;
      s.t = s.dur;
      if (s.gate && !s.gate()) break; // wartet auf den echten Zustand
      complete(i);
      if (i + 1 < steps.length) begin(i + 1);
      else return allDone();
    }
    let done = 0;
    for (let k = 0; k < steps.length; k++) done += k < i ? 1 : k === i ? frac(k) : 0;
    setBar(0.5 + 0.5 * done / steps.length);
  }

  function allDone() {
    setBar(1);
    phase('Bereit');
    say('System bereit');
    finish(skipped ? 'fast' : 'normal');
  }

  function finish(mode) {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    cancelAnimationFrame(raf);
    clearTimeout(cap);
    window.removeEventListener('keydown', onKey);
    const fast = mode === 'fast';
    // „System bereit“ kurz stehen lassen, dann ausblenden; erst danach beginnt das Intro der Systemansicht
    setTimeout(() => {
      if (fast) root.classList.add('fast');
      root.classList.add('done');
      setTimeout(() => { root.remove(); sendIntro(); }, (fast || reduced ? FADE_FAST_MS : FADE_MS) + 30);
    }, fast || reduced ? 0 : HOLD_MS);
  }

  // --- Überspringen ---------------------------------------------------------------------------------
  function skip() {
    if (skipped || finished) return;
    skipped = true;
    root.classList.add('skipped');
    cssFinish();
    tick(); // wartet nur noch auf „bereit“ – Texturen laden im Hintergrund weiter
  }
  const onKey = (e) => { if (e.key === 'Escape') skip(); };
  root.addEventListener('click', skip);
  window.addEventListener('keydown', onKey);

  // --- App bereit (main.js, nach dem ersten route()) ------------------------------------------------------
  window.addEventListener('galactic:ready', () => {
    const go = () => {
      if (ready) return;
      ready = true;
      // früher fertig als die CSS-Zeitleiste? Dann den Rest zügig abspielen
      if (clock && !cssDone()) {
        const rest = cssEnd - (clock.currentTime ?? 0);
        if (rest > CSS_BUDGET_MS) cssRate(rest / CSS_BUDGET_MS);
      }
    };
    // erst nach zwei gezeichneten Bildern (wie bisher); Rückfall-Timer, falls der Tab im Hintergrund keine Frames bekommt
    requestAnimationFrame(() => requestAnimationFrame(go));
    setTimeout(go, 250);
  }, { once: true });

  // --- Notbremse: nie länger als ~10 s ---------------------------------------------------------------------------
  const cap = setTimeout(() => {
    if (finished) return;
    skipped = true;
    cssFinish();
    ready = true;
    steps.forEach((s, k) => { if (k >= Math.max(i, 0)) { s.el.classList.add('ok'); s.el.classList.remove('act'); } });
    texInfo.textContent = tex.started ? texText() : '';
    allDone();
  }, Math.max(2500, MAX_MS - t0));

  // --- los ----------------------------------------------------------------------------------------------------
  root.classList.add('run');
  setBar(0);
  let raf = 0;
  const loop = () => { tick(); if (!finished) raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  const timer = setInterval(tick, 150); // läuft auch weiter, wenn der Tab im Hintergrund keine Frames bekommt
}
