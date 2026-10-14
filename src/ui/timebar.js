// Zeitleiste: Umschalter Live/Zeitraffer, Abspielsteuerung, Zeitraum und Scrubber.
import { UNITS, MIN_DATE, MAX_DATE } from '../lib/time.js';

const toInput = (t) => new Date(t).toISOString().slice(0, 10);
const fromInput = (s) => new Date(`${s}T12:00:00Z`).getTime();
const fmtDate = (t) =>
  new Date(t).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

const AMOUNTS = [1, 2, 5, 10, 30, 100];

// Schlanke Inline-Symbole (currentColor) statt Unicode-Zeichen: einheitlich scharf auf allen Systemen
const ICON = {
  toStart: '<path d="M6 5h2v14H6zM19 5v14L9.5 12z"/>',
  back: '<path d="M17 5v14L6 12z"/>',
  pause: '<path d="M7 5h3.4v14H7zM13.6 5H17v14h-3.4z"/>',
  fwd: '<path d="M7 5v14l11-7z"/>',
  toEnd: '<path d="M16 5h2v14h-2zM5 5v14l9.5-7z"/>',
  loop: '<path d="M17 3l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 12V10a3 3 0 0 1 3-3h15M7 21l-4-4 4-4M21 12v2a3 3 0 0 1-3 3H3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="currentColor">${ICON[k]}</svg>`;

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
      <output class="tb-now" aria-live="off"></output>
      <div class="tb-play" role="group" aria-label="Wiedergabe">
        <button data-act="toStart" title="Zum Anfang" aria-label="Zum Anfang">${icon('toStart')}</button>
        <button data-act="back" title="Rückwärts abspielen" aria-label="Rückwärts abspielen">${icon('back')}</button>
        <button data-act="pause" title="Pause" aria-label="Pause">${icon('pause')}</button>
        <button data-act="fwd" title="Vorwärts abspielen" aria-label="Vorwärts abspielen">${icon('fwd')}</button>
        <button data-act="toEnd" title="Zum Ende" aria-label="Zum Ende">${icon('toEnd')}</button>
        <button class="tb-loop" data-act="loop" title="Endlosschleife" aria-label="Endlosschleife" aria-pressed="false">${icon('loop')}</button>
      </div>
      <label class="tb-speed">
        <span class="tb-cap">Tempo</span>
        <select data-k="amount">${AMOUNTS.map((a) => `<option>${a}</option>`).join('')}</select>
        <select data-k="unit">${Object.entries(UNITS).map(([k, u]) => `<option value="${k}">${u.label}</option>`).join('')}</select>
        <span class="tb-per">/ s</span>
      </label>
    </div>
    <div class="tb-row tb-range">
      <label><span class="tb-cap">Von</span> <input type="date" data-k="start" min="${min}" max="${max}" /></label>
      <input type="range" class="scrub" min="0" max="1000" step="1" aria-label="Zeitpunkt im Zeitraum" />
      <label><span class="tb-cap">Bis</span> <input type="date" data-k="end" min="${min}" max="${max}" /></label>
      <label><span class="tb-cap">Gehe zu</span> <input type="date" data-k="time" min="${min}" max="${max}" /></label>
    </div>
    <p class="tb-hint"><svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/></svg>Bahngenauigkeit (JPL-Näherung): Jahre 1800–2050</p>`;
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
    scrub.style.setProperty('--p', `${scrub.value / 10}%`);
  });

  clock.onChange((s) => {
    const timelapse = s.mode === 'timelapse';
    el.classList.toggle('is-live', !timelapse);
    el.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === s.mode));
    q('.tb-now').innerHTML = `${fmtDate(s.time)}${timelapse ? '' : '<span class="tb-tag">Echtzeit</span>'}`;
    q('[data-act=back]').classList.toggle('on', s.playing && s.direction < 0);
    q('[data-act=fwd]').classList.toggle('on', s.playing && s.direction > 0);
    q('[data-act=pause]').classList.toggle('on', !s.playing);
    q('[data-act=loop]').classList.toggle('on', s.loop);
    q('[data-act=loop]').setAttribute('aria-pressed', String(!!s.loop));
    q('[data-k=amount]').value = String(s.amount);
    q('[data-k=unit]').value = s.unit;
    for (const k of ['start', 'end', 'time']) {
      const inp = q(`input[data-k=${k}]`);
      if (document.activeElement !== inp) inp.value = toInput(s[k]);
    }
    if (!scrubbing) scrub.value = String(Math.round(((s.time - s.start) / (s.end - s.start)) * 1000));
    scrub.style.setProperty('--p', `${scrub.value / 10}%`); // Füllstand der Schiene (CSS)
  });

  return el;
}
