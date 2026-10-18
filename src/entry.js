// Einstieg der App: Zugangssperre → Wartungsmodus prüfen → App laden; dazu Hinweisbanner und Besucherzählung.
// Einstellungen kommen aus Supabase (site_settings, öffentlich lesbar). Antwortet der Server nicht schnell genug,
// startet die App trotzdem (Wartung darf die Seite nicht durch Netzprobleme blockieren).
import { ensureAccess } from './gate.js';
import { getSettings, logVisit, logViewTime } from './lib/stationsApi.js';
import { every } from './lib/live.js';

const PREVIEW = 'galactic_admin_preview'; // vom Admin-Panel gesetzt: Seite trotz Wartung ansehen

function sessionId() {
  try {
    let s = sessionStorage.getItem('galactic_sid');
    if (!s) { s = crypto.randomUUID(); sessionStorage.setItem('galactic_sid', s); }
    return s;
  } catch { return null; }
}
// Admins (im Admin-Panel angemeldet oder Admin-Vorschau) zählen nicht als Besucher
function isAdmin() {
  try { return localStorage.getItem('galactic_is_admin') === '1' || localStorage.getItem(PREVIEW) === '1'; } catch { return false; }
}
const viewPath = () => location.hash.split('?')[0] || '/';
function countVisit() {
  const sid = sessionId();
  if (sid && !isAdmin()) logVisit(viewPath(), sid).catch(() => {});
}

// Verweildauer je Ansicht: zählt nur sichtbare Zeit; Abschnitte unter 3 s (schnelles Durchklicken) zählen nicht
const dwell = { path: null, since: 0 };
function dwellFlush() {
  if (!dwell.path || !dwell.since) return;
  const s = Math.round((performance.now() - dwell.since) / 1000);
  const sid = sessionId();
  if (sid && s >= 3 && !isAdmin()) logViewTime(dwell.path, sid, Math.min(s, 1800));
  dwell.since = 0;
}
function dwellStart() { dwell.path = viewPath(); dwell.since = document.visibilityState === 'visible' ? performance.now() : 0; }
function trackDwell() {
  dwellStart();
  window.addEventListener('hashchange', () => { dwellFlush(); dwellStart(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') dwellFlush(); else dwellStart(); });
  window.addEventListener('pagehide', dwellFlush);
  setInterval(() => { if (dwell.since && performance.now() - dwell.since > 600000) { dwellFlush(); dwellStart(); } }, 60000); // lange Sitzungen in 10-min-Abschnitten
}

function maintenanceScreen(message) {
  document.getElementById('boot')?.remove();
  const style = document.createElement('style');
  style.textContent = `
    .mnt{position:fixed;inset:0;display:grid;place-items:center;padding:20px;color:#e8eefc;font:15px/1.6 Inter,system-ui,sans-serif;text-align:center;
      background:radial-gradient(1.2px 1.2px at 12% 22%,#fff9,transparent 60%),radial-gradient(1px 1px at 78% 14%,#fff8,transparent 60%),
      radial-gradient(1.4px 1.4px at 64% 72%,#cfe0ffcc,transparent 60%),radial-gradient(ellipse at 50% 42%,#0e1a38 0%,#070c1b 55%,#04060d 100%)}
    .mnt div{max-width:520px}.mnt svg{width:72px;height:72px;margin-bottom:14px;filter:drop-shadow(0 0 20px rgba(110,168,255,.5))}
    .mnt .o{transform-origin:32px 32px;animation:mspin 4s linear infinite}@keyframes mspin{to{transform:rotate(360deg)}}
    .mnt h1{margin:0 0 6px;font:700 22px Orbitron,system-ui,sans-serif;letter-spacing:.2em;background:linear-gradient(90deg,#fff,#bcd3ff 60%,#d6bfff);-webkit-background-clip:text;background-clip:text;color:transparent}
    .mnt b{display:inline-block;margin-bottom:18px;padding:3px 12px;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#04060d;background:#ffcc55;border-radius:999px}
    .mnt p{margin:0;color:#c3cde6}`;
  document.head.append(style);
  const wrap = document.createElement('div');
  wrap.className = 'mnt';
  // statisches Gerüst; der Text aus der Datenbank kommt nur per textContent hinein
  wrap.innerHTML = `<div><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="none" stroke="rgba(130,170,255,.25)"/>
    <g class="o"><circle cx="32" cy="3" r="2.6" fill="#fff"/></g><circle cx="32" cy="32" r="11" fill="#7da6ff"/>
    <ellipse cx="32" cy="32" rx="24" ry="8" transform="rotate(-22 32 32)" fill="none" stroke="#b98cff" stroke-width="1.8" opacity=".6"/></svg>
    <h1>G.A.L.A.C.T.I.C.</h1><b>Wartung</b><p></p></div>`;
  wrap.querySelector('p').textContent = message || 'Wir arbeiten gerade an der Seite – bitte schau später wieder vorbei.';
  document.body.append(wrap);
}

function announcement(text) {
  if (!text) return;
  let dismissed = '';
  try { dismissed = sessionStorage.getItem('galactic_banner_off') || ''; } catch { /* egal */ }
  if (dismissed === text) return;
  document.getElementById('galactic-banner')?.remove();
  const bar = document.createElement('div');
  bar.id = 'galactic-banner';
  bar.setAttribute('role', 'status');
  bar.style.cssText = 'position:fixed;left:50%;top:64px;z-index:40;transform:translateX(-50%);display:flex;gap:12px;align-items:center;max-width:min(720px,calc(100vw - 24px));'
    + 'padding:9px 10px 9px 16px;color:#e8eefc;font:13px/1.4 Inter,system-ui,sans-serif;background:rgba(14,24,52,.92);border:1px solid rgba(110,168,255,.45);'
    + 'border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.45);backdrop-filter:blur(12px)';
  const span = document.createElement('span');
  span.textContent = text;
  const x = document.createElement('button');
  x.textContent = '×';
  x.setAttribute('aria-label', 'Hinweis schließen');
  x.style.cssText = 'flex:none;width:26px;height:26px;color:#8a97b5;font-size:17px;background:none;border:0;border-radius:50%;cursor:pointer';
  x.onclick = () => { bar.remove(); try { sessionStorage.setItem('galactic_banner_off', text); } catch { /* egal */ } };
  bar.append(span, x);
  document.body.append(bar);
}

async function start() {
  if (!ensureAccess()) return;
  let preview = false;
  try { preview = localStorage.getItem(PREVIEW) === '1'; } catch { /* egal */ }
  let settings = {};
  try { settings = await Promise.race([getSettings(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500))]); } catch { /* ohne Einstellungen starten */ }
  if (settings.maintenance?.enabled && !preview) { maintenanceScreen(settings.maintenance.message); return; }
  await import('./main.js');
  if (settings.announcement?.enabled) announcement(settings.announcement.text);
  // Live: Wartungsmodus und Hinweisbanner greifen auch bei lange offenem Fenster (alle 2 min)
  let lastText = settings.announcement?.enabled ? settings.announcement.text : '';
  every(120000, async () => {
    const s = await getSettings();
    if (s.maintenance?.enabled && !preview && !isAdmin()) { location.reload(); return; }
    const text = s.announcement?.enabled ? s.announcement.text : '';
    if (text !== lastText) { lastText = text; document.getElementById('galactic-banner')?.remove(); announcement(text); }
  });
  countVisit();
  window.addEventListener('hashchange', countVisit);
  trackDwell();
}
start();
