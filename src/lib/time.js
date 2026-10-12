// Zeitmodell: „Live“ folgt der echten Uhr, „Zeitraffer“ spielt einen frei
// gewählten Zeitraum vorwärts/rückwärts ab.

export const DAY = 86400000;
export const UNITS = {
  hour: { label: 'Stunden', ms: DAY / 24 },
  day: { label: 'Tage', ms: DAY },
  week: { label: 'Wochen', ms: 7 * DAY },
  month: { label: 'Monate', ms: 30.436875 * DAY },
  year: { label: 'Jahre', ms: 365.25 * DAY },
};

// Gültigkeitsbereich der verwendeten JPL-Bahnelemente (Standish, Tabelle 1).
export const MIN_DATE = new Date('1800-01-01T00:00:00Z');
export const MAX_DATE = new Date('2050-12-31T23:59:59Z');

const clampDate = (t) => Math.min(MAX_DATE.getTime(), Math.max(MIN_DATE.getTime(), t));

export function createClock() {
  const listeners = new Set();
  const now = Date.now();
  const state = {
    mode: 'live',            // 'live' | 'timelapse'
    time: now,
    start: now - 365.25 * DAY,
    end: now + 365.25 * DAY,
    unit: 'day',
    amount: 10,              // Einheiten pro Sekunde
    direction: 1,            // 1 vorwärts, -1 rückwärts
    playing: false,
    loop: true,
  };

  const emit = () => listeners.forEach((fn) => fn(state));

  function set(patch) {
    Object.assign(state, patch);
    if (state.mode === 'live') state.time = Date.now();
    state.start = clampDate(state.start);
    state.end = clampDate(Math.max(state.end, state.start + DAY));
    state.time = clampDate(state.time);
    emit();
  }

  let last = performance.now();
  let liveAcc = 0;
  function tick(nowMs) {
    const dt = Math.min(0.25, (nowMs - last) / 1000);
    last = nowMs;

    if (state.mode === 'live') {
      liveAcc += dt;
      if (liveAcc >= 1) { liveAcc = 0; state.time = Date.now(); emit(); }
    } else if (state.playing) {
      let t = state.time + state.direction * state.amount * UNITS[state.unit].ms * dt;
      if (t > state.end || t < state.start) {
        if (state.loop) t = state.direction > 0 ? state.start : state.end;
        else { t = Math.min(state.end, Math.max(state.start, t)); state.playing = false; }
      }
      state.time = t;
      emit();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return {
    state,
    set,
    onChange: (fn) => { listeners.add(fn); fn(state); },
    date: () => new Date(state.time),
  };
}
