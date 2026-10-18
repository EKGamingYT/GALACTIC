// Live-Aktualisierung: ruft fn alle ms auf, solange der Tab sichtbar ist. Wird der Tab nach längerer Pause
// wieder sichtbar, wird sofort nachgeladen (statt bis zum nächsten Takt zu warten). skip() → diesen Takt auslassen.
export function every(ms, fn, { skip } = {}) {
  let last = Date.now(), busy = false;
  const run = async () => {
    if (busy || document.hidden || skip?.()) return;
    busy = true; last = Date.now();
    try { await fn(); } catch { /* nächster Takt versucht es erneut */ } finally { busy = false; }
  };
  const timer = setInterval(run, ms);
  const onVis = () => { if (!document.hidden && Date.now() - last > ms) run(); };
  document.addEventListener('visibilitychange', onVis);
  return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis); };
}
