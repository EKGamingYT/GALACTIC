// Zeitleiste: Umschalter Live/Zeitraffer, Abspielsteuerung, Zeitraum und Scrubber.
import { UNITS, MIN_DATE, MAX_DATE } from '../lib/time.js';

const toInput = (t) => new Date(t).toISOString().slice(0, 10);
const fromInput = (s) => new Date(`${s}T12:00:00Z`).getTime();
const fmtDate = (t) =>
  new Date(t).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

const AMOUNTS = [1, 2, 5, 10, 30, 100];

export function createTimebar(parent, clock) {
  const el = document.createElement('div');
  el.className = 'timebar';
  const min = toInput(MIN_DATE), max = toInput(MAX_DATE);
  el.innerHTML = `
    <div class="tb-row">
      <div class="seg" role="tablist" aria-label="Zeitmodus">
        <button data-mode="live"><span class="live-dot"></span>Live</button>
        <button data-mode="timelapse">Zeitraffer</button>
      </div>
      <output class="tb-now" aria-live="polite"></output>
      <div class="tb-play">
        <button data-act="toStart" title="Zum Anfang">⏮</button>
        <button data-act="back" title="Rückwärts abspielen">◀</button>
        <button data-act="pause" title="Pause">❚❚</button>
        <button data-act="fwd" title="Vorwärts abspielen">▶</button>
        <button data-act="toEnd" title="Zum Ende">⏭</button>
      </div>
      <label class="tb-speed">
        <select data-k="amount">${AMOUNTS.map((a) => `<option>${a}</option>`).join('')}</select>
        <select data-k="unit">${Object.entries(UNITS).map(([k, u]) => `<option value="${k}">${u.label}</option>`).join('')}</select>
        <span>/ s</span>
      </label>
      <button class="tb-loop" data-act="loop" title="Endlosschleife">↻ Schleife</button>
    </div>
    <div class="tb-row tb-range">
      <label>Von <input type="date" data-k="start" min="${min}" max="${max}" /></label>
      <input type="range" class="scrub" min="0" max="1000" step="1" aria-label="Zeitpunkt im Zeitraum" />
      <label>Bis <input type="date" data-k="end" min="${min}" max="${max}" /></label>
      <label>Gehe zu <input type="date" data-k="time" min="${min}" max="${max}" /></label>
    </div>
    <p class="tb-hint">Bahngenauigkeit (JPL-Näherung): Jahre 1800–2050</p>`;
  parent.appendChild(el);

  const q = (s) => el.querySelector(s);
  const scrub = q('.scrub');
  let scrubbing = false;

  el.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => {
    const mode = b.dataset.mode;
    clock.set(mode === 'live'
      ? { mode, playing: false }
      : { mode, time: clock.state.time, playing: false });
  }));

  const acts = {
    toStart: () => clock.set({ time: clock.state.start }),
    toEnd: () => clock.set({ time: clock.state.end }),
    back: () => clock.set({ direction: -1, playing: true }),
    fwd: () => clock.set({ direction: 1, playing: true }),
    pause: () => clock.set({ playing: false }),
    loop: () => clock.set({ loop: !clock.state.loop }),
  };
  el.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => acts[b.dataset.act]()));

  el.querySelectorAll('select[data-k]').forEach((s) => (s.onchange = () =>
    clock.set({ [s.dataset.k]: s.dataset.k === 'amount' ? Number(s.value) : s.value })));

  el.querySelectorAll('input[type=date][data-k]').forEach((inp) => (inp.onchange = () => {
    if (!inp.value) return;
    const k = inp.dataset.k;
    const t = fromInput(inp.value);
    const patch = { [k]: t };
    // „Gehe zu“ außerhalb des Zeitraums erweitert diesen
    if (k === 'time') {
      if (t < clock.state.start) patch.start = t;
      if (t > clock.state.end) patch.end = t;
    }
    clock.set(patch);
  }));

  scrub.addEventListener('input', () => {
    scrubbing = true;
    const { start, end } = clock.state;
    clock.set({ time: start + (end - start) * (scrub.value / 1000), playing: false });
    scrubbing = false;
  });

  clock.onChange((s) => {
    const timelapse = s.mode === 'timelapse';
    el.classList.toggle('is-live', !timelapse);
    el.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === s.mode));
    q('.tb-now').textContent = fmtDate(s.time) + (timelapse ? '' : ' · Echtzeit');
    q('[data-act=back]').classList.toggle('on', s.playing && s.direction < 0);
    q('[data-act=fwd]').classList.toggle('on', s.playing && s.direction > 0);
    q('[data-act=pause]').classList.toggle('on', !s.playing);
    q('[data-act=loop]').classList.toggle('on', s.loop);
    q('[data-k=amount]').value = String(s.amount);
    q('[data-k=unit]').value = s.unit;
    for (const k of ['start', 'end', 'time']) {
      const inp = q(`input[data-k=${k}]`);
      if (document.activeElement !== inp) inp.value = toInput(s[k]);
    }
    if (!scrubbing) scrub.value = String(Math.round(((s.time - s.start) / (s.end - s.start)) * 1000));
  });

  return el;
}
