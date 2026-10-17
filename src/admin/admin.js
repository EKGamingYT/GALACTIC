// Admin-Panel G.A.L.A.C.T.I.C.
//  • Start: Terminal-Animation (Serververbindung → Berechtigung → Daten), danach öffnet sich das Panel animiert
//  • Bereiche: Übersicht, Organisationen (Verzeichnis + Vollformular), Stationen, Routen, Schlüssel, Besucher, Allgemein
//  • Admin-Token nur in sessionStorage; alle Fremddaten per textContent (kein innerHTML mit Daten → XSS-sicher)
import './admin.css';
import {
  adminOverview, adminCreateAgency, adminUpdateAgency, adminDeleteAgency, adminIssueKey, adminSetKeyActive,
  adminDeleteStation, adminDeleteRoute, adminSetSetting, getSettings, adminDeleteKey, AGENCY_FIELDS, STATION_KINDS, ROUTE_KINDS, AGENCY_CATEGORIES,
} from '../lib/stationsApi.js';

const STORE = 'galactic_admin_token';
const BYPASS = 'galactic_admin_preview';
let token = null;
let data = null;
let tab = 'overview';
const ui = { orgSearch: '', orgCat: '', stationSearch: '', routeSearch: '' };

const app = document.getElementById('app') || document.body;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
};
const svg = (paths, size = 16) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.8');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  for (const d of paths) { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.append(p); }
  return s;
};
const ICON = {
  overview: ['M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 7h6V4h-6z'],
  orgs: ['M3 21h18', 'M5 21V8l7-4 7 4v13', 'M9 21v-5h6v5', 'M9 11h.01M15 11h.01'],
  stations: ['M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  routes: ['M4 19c4 0 4-14 8-14s4 14 8 14', 'M4 19h.01M20 19h.01'],
  keys: ['M15 7a4 4 0 1 1-3.9 4.9L3 20v-3h3v-3h3l1.1-1.1A4 4 0 0 1 15 7z'],
  visits: ['M3 3v18h18', 'M7 15l4-5 4 3 5-7'],
  general: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'],
  refresh: ['M21 12a9 9 0 1 1-2.6-6.4', 'M21 3v6h-6'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  plus: ['M12 5v14M5 12h14'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3'],
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6'],
  key: ['M15 7a4 4 0 1 1-3.9 4.9L3 20v-3h3v-3h3l1.1-1.1A4 4 0 0 1 15 7z'],
  x: ['M18 6L6 18M6 6l12 12'],
  ext: ['M15 3h6v6', 'M10 14L21 3', 'M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5'],
};
const btn = (label, { icon, kind = 'primary', small, onclick, title, type = 'button' } = {}) =>
  el('button', { type, class: `ab-btn ${kind}${small ? ' sm' : ''}`, onclick, title }, icon ? svg(ICON[icon], small ? 14 : 16) : null, label ? el('span', { text: label }) : null);

const fmtDate = (s) => { if (!s) return 'nie'; try { return new Date(s).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return s; } };
const fmtNum = (n) => (n == null || n === '' ? '–' : Number(n).toLocaleString('de-DE'));
const fmtDeg = (lat, lon) => (lat == null ? '–' : `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? 'O' : 'W'}`);
const fmtKm = (m) => (m == null ? '–' : m >= 1000 ? `${(m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} km` : `${Math.round(m)} m`);
const fmtDur = (s) => { s = Math.round(s || 0); if (s < 60) return `${s} s`; if (s < 3600) return `${Math.floor(s / 60)} min ${s % 60 ? `${s % 60} s` : ''}`.trim(); return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`; };
const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function getToken() { try { return sessionStorage.getItem(STORE); } catch { return null; } }
function setToken(t) { try { t ? sessionStorage.setItem(STORE, t) : sessionStorage.removeItem(STORE); } catch { /* egal */ } token = t; }

// --- Meldungen ---------------------------------------------------------------------------------------
let toastTimer = 0;
function toast(msg, bad = false) {
  let t = document.querySelector('.ab-toast');
  if (!t) { t = el('div', { class: 'ab-toast', role: 'status' }); document.body.append(t); }
  t.textContent = msg;
  t.dataset.bad = bad ? '1' : '';
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
}
function confirmBox(title, text, okLabel = 'Löschen') {
  return new Promise((resolve) => {
    const close = (v) => { ov.classList.add('out'); setTimeout(() => ov.remove(), 180); resolve(v); };
    const ov = el('div', { class: 'ab-modal', onclick: (e) => { if (e.target === ov) close(false); } },
      el('div', { class: 'ab-dialog' },
        el('h3', { text: title }), el('p', { text: text }),
        el('div', { class: 'ab-row end' }, btn('Abbrechen', { kind: 'ghost', onclick: () => close(false) }), btn(okLabel, { kind: 'danger', icon: 'trash', onclick: () => close(true) }))));
    document.body.append(ov);
  });
}

// führt Admin-Aktion aus; null → Token ungültig
async function act(button, fn, okMsg) {
  button?.classList.add('busy'); if (button) button.disabled = true;
  try {
    const r = await fn();
    if (r === null) { setToken(null); toast('Token ungültig – bitte neu anmelden.', true); startBoot(); return null; }
    if (okMsg) toast(okMsg);
    await reload();
    return r;
  } catch (e) { toast(e.message || 'Fehler', true); return undefined; }
  finally { button?.classList.remove('busy'); if (button) button.disabled = false; }
}
async function reload() {
  const res = await adminOverview(token);
  if (res == null) { setToken(null); startBoot(); return false; }
  data = res;
  renderTab(false);
  return true;
}

// =====================================================================================================
// Start: Terminal-Animation
// =====================================================================================================
async function startBoot(errorMsg = '') {
  const lines = el('div', { class: 'ab-term-lines' });
  const bar = el('i');
  const term = el('div', { class: 'ab-term' },
    el('div', { class: 'ab-term-head' }, el('span', { class: 'd r' }), el('span', { class: 'd y' }), el('span', { class: 'd g' }),
      el('b', { text: 'galactic-admin — secure session' })),
    lines,
    el('div', { class: 'ab-term-bar' }, bar));
  const stage = el('div', { class: 'ab-boot' },
    el('div', { class: 'ab-boot-logo' }, logoMark(), el('div', {}, el('h1', { text: 'G.A.L.A.C.T.I.C.' }), el('p', { text: 'Mission Control · Admin' }))),
    term);
  app.replaceChildren(stage);

  const wait = (ms) => sleep(reduced ? 0 : ms);
  const progress = (p) => { bar.style.width = `${Math.round(p * 100)}%`; };
  async function line(text, { ok = '', delay = 260, cls = '' } = {}) {
    const row = el('div', { class: `ab-tl ${cls}` }, el('span', { class: 'p', text: '›' }), el('span', { class: 't' }), el('span', { class: 's' }));
    lines.append(row);
    const t = row.querySelector('.t');
    if (reduced) t.textContent = text;
    else for (let i = 0; i <= text.length; i += 2) { t.textContent = text.slice(0, i); await sleep(8); }
    t.textContent = text;
    lines.scrollTop = lines.scrollHeight;
    await wait(delay);
    return {
      done(state = ok || 'OK', kind = 'ok') { const s = row.querySelector('.s'); s.textContent = state; s.dataset.k = kind; },
    };
  }

  progress(0.05);
  (await line('galactic-admin v2 · Sitzung wird gestartet', { delay: 180 })).done('', '');
  const conn = await line('Verbinde mit Datenbank-Server eu-central-1 (Frankfurt) …', { delay: 120 });
  const t0 = performance.now();
  try { await getSettings(); conn.done(`${Math.round(performance.now() - t0)} ms`); }
  catch { conn.done('FEHLER', 'bad'); await line('Server nicht erreichbar – Netzwerk prüfen und neu laden.', { cls: 'bad' }); return; }
  progress(0.3);
  (await line('TLS 1.3 · Ende-zu-Ende verschlüsselt', { delay: 160 })).done('gesichert');
  progress(0.4);

  if (!token) { await line('Admin-Token erforderlich', { delay: 120, cls: 'warn' }); return showLogin(term, errorMsg); }
  await authenticateAndOpen(line, progress, term);
}

async function authenticateAndOpen(line, progress, term) {
  const auth = await line('Prüfe Admin-Berechtigung …', { delay: 80 });
  const res = await adminOverview(token).catch(() => undefined);
  if (res === undefined) { auth.done('FEHLER', 'bad'); return; }
  if (res === null) { auth.done('ABGELEHNT', 'bad'); setToken(null); await sleep(300); return showLogin(term, 'Token ungültig, gesperrt oder zu viele Fehlversuche.'); }
  auth.done('berechtigt');
  data = res;
  try { localStorage.setItem('galactic_is_admin', '1'); } catch { /* egal */ }
  progress(0.6);
  (await line(`Organisationen geladen (${data.agencies.length})`, { delay: 140 })).done('OK');
  (await line(`Stationen ${data.stations.length} · Routen ${data.routes.length} · Schlüssel ${data.keys.length}`, { delay: 140 })).done('OK');
  progress(0.85);
  (await line(`Besucherstatistik · ${fmtNum(data.visits?.total ?? 0)} Aufrufe gesamt`, { delay: 140 })).done('OK');
  (await line(`Wartungsmodus: ${data.settings?.maintenance?.enabled ? 'AKTIV' : 'aus'}`, { delay: 160 })).done(data.settings?.maintenance?.enabled ? 'aktiv' : 'aus', data.settings?.maintenance?.enabled ? 'warn' : 'ok');
  progress(1);
  (await line('System bereit · Panel wird geöffnet', { delay: reduced ? 0 : 380, cls: 'go' })).done('▶', 'ok');
  // Übergang: Terminal zieht sich zusammen, Panel öffnet sich
  app.querySelector('.ab-boot')?.classList.add('leaving');
  await sleep(reduced ? 0 : 520);
  renderShell();
}

function showLogin(term, error) {
  const input = el('input', { type: 'password', autocomplete: 'off', maxlength: '200', placeholder: 'ADM-…', 'aria-label': 'Admin-Token' });
  const err = el('p', { class: 'ab-login-err', role: 'alert', text: error || '' });
  const form = el('form', { class: 'ab-login', onsubmit: async (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    setToken(v);
    form.classList.add('sending');
    form.querySelector('button').disabled = true;
    const lines = term.querySelector('.ab-term-lines');
    const bar = term.querySelector('.ab-term-bar i');
    form.remove();
    const line = async (text, o = {}) => {
      const row = el('div', { class: `ab-tl ${o.cls || ''}` }, el('span', { class: 'p', text: '›' }), el('span', { class: 't', text }), el('span', { class: 's' }));
      lines.append(row); lines.scrollTop = lines.scrollHeight;
      await sleep(reduced ? 0 : (o.delay ?? 200));
      return { done(state = 'OK', kind = 'ok') { const s = row.querySelector('.s'); s.textContent = state; s.dataset.k = kind; } };
    };
    await authenticateAndOpen(line, (p) => { bar.style.width = `${Math.round(p * 100)}%`; }, term);
  } },
    el('label', { text: 'Admin-Token' }),
    el('div', { class: 'ab-login-row' }, input, btn('Anmelden', { type: 'submit', icon: 'key' })),
    el('p', { class: 'ab-hint', text: 'Fehlversuche werden serverseitig protokolliert und gebremst. Das Token bleibt nur in diesem Tab gespeichert.' }),
    err);
  term.append(form);
  input.focus();
}

function logoMark() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 64 64'); s.setAttribute('class', 'ab-logo'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<defs><radialGradient id="abg" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="#6ea8ff"/><stop offset="1" stop-color="#b98cff"/></radialGradient></defs>'
    + '<circle cx="32" cy="32" r="29" fill="none" stroke="rgba(130,170,255,.2)"/><g class="ab-orbit"><circle cx="32" cy="3" r="2.4" fill="#fff"/></g>'
    + '<circle cx="32" cy="32" r="11" fill="url(#abg)"/><ellipse cx="32" cy="32" rx="24" ry="8" transform="rotate(-22 32 32)" fill="none" stroke="#9fb6ff" stroke-width="1.6" opacity=".55"/>';
  return s; // statisches SVG ohne Fremddaten
}

// =====================================================================================================
// Panel
// =====================================================================================================
const TABS = [
  ['overview', 'Übersicht'], ['orgs', 'Organisationen'], ['stations', 'Stationen'], ['routes', 'Routen'],
  ['keys', 'Schlüssel'], ['visits', 'Besucher'], ['general', 'Allgemein'],
];
const ICON_FOR = { overview: 'overview', orgs: 'orgs', stations: 'stations', routes: 'routes', keys: 'keys', visits: 'visits', general: 'general' };

function renderShell() {
  const nav = el('nav', { class: 'ab-nav', 'aria-label': 'Bereiche' });
  for (const [id, label] of TABS) {
    nav.append(el('button', { class: `ab-navbtn${tab === id ? ' on' : ''}`, 'data-tab': id, onclick: () => { tab = id; renderTab(true); } },
      svg(ICON[ICON_FOR[id]], 18), el('span', { text: label }), el('em', { class: 'ab-navcount', 'data-for': id })));
  }
  const refresh = btn('Aktualisieren', { kind: 'ghost', icon: 'refresh', small: true, onclick: async (e) => {
    const b = e.currentTarget; b.classList.add('spin'); await reload(); toast('Daten aktualisiert.'); setTimeout(() => b.classList.remove('spin'), 500);
  } });
  const logout = btn('Abmelden', { kind: 'ghost', icon: 'logout', small: true, onclick: () => { setToken(null); data = null; toast('Abgemeldet.'); startBoot(); } });
  const shell = el('div', { class: 'ab-shell opening' },
    el('aside', { class: 'ab-side' },
      el('div', { class: 'ab-brand' }, logoMark(), el('div', {}, el('b', { text: 'G.A.L.A.C.T.I.C.' }), el('span', { text: 'Mission Control' }))),
      nav,
      el('div', { class: 'ab-side-foot' }, el('span', { class: 'ab-live' }, 'verbunden'))),
    el('div', { class: 'ab-mainwrap' },
      el('header', { class: 'ab-top' }, el('h1', { class: 'ab-title' }), el('div', { class: 'ab-top-actions' }, refresh, logout)),
      el('main', { class: 'ab-content' })));
  app.replaceChildren(shell);
  requestAnimationFrame(() => shell.classList.remove('opening'));
  renderTab(true);
}

function renderTab(animate) {
  const content = app.querySelector('.ab-content');
  if (!content) return renderShell();
  app.querySelectorAll('.ab-navbtn').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const counts = { orgs: data.agencies.length, stations: data.stations.length, routes: data.routes.length, keys: data.keys.length };
  app.querySelectorAll('.ab-navcount').forEach((c) => { const n = counts[c.dataset.for]; c.textContent = n != null ? String(n) : ''; });
  app.querySelector('.ab-title').textContent = TABS.find(([id]) => id === tab)[1];
  const view = { overview: viewOverview, orgs: viewOrgs, stations: viewStations, routes: viewRoutes, keys: viewKeys, visits: viewVisits, general: viewGeneral }[tab]();
  if (animate && !reduced) view.classList.add('enter');
  content.replaceChildren(view);
}

// --- Übersicht ----------------------------------------------------------------------------------------
function statCard(label, value, sub, tone, icon, go) {
  const b = el('b', { text: '0' });
  const card = el(go ? 'button' : 'div', { class: `ab-stat${go ? ' link' : ''}`, 'data-tone': tone || '', type: go ? 'button' : null, title: go ? `Zu „${TABS.find(([id]) => id === go)?.[1]}"` : null,
    onclick: go ? () => { tab = go; renderTab(true); } : null },
    el('div', { class: 'ab-stat-ic' }, svg(ICON[icon], 18)), el('div', {}, b, el('span', { text: label }), sub ? el('small', { text: sub }) : null),
    go ? el('i', { class: 'ab-stat-go', text: '→' }) : null);
  countUp(b, value);
  return card;
}
function countUp(node, target) {
  const n = Number(target);
  if (!Number.isFinite(n) || reduced) { node.textContent = typeof target === 'number' ? fmtNum(target) : String(target); return; }
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / 700); node.textContent = fmtNum(Math.round(n * (1 - (1 - k) ** 3))); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function visitsChart(daily) {
  const days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - i); days.push(d.toISOString().slice(0, 10)); } // Tage in UTC wie der Server
  const map = Object.fromEntries((daily || []).map((x) => [String(x.day).slice(0, 10), x]));
  const vals = days.map((d) => map[d]?.visitors ?? 0), secs = days.map((d) => map[d]?.seconds ?? 0);
  const max = Math.max(1, ...vals);
  const wrap = el('div', { class: 'ab-chart' });
  days.forEach((d, i) => {
    const h = Math.round((vals[i] / max) * 100);
    wrap.append(el('div', { class: 'ab-bar', title: `${new Date(d).toLocaleDateString('de-DE')}: ${vals[i]} Besucher · ${fmtDur(secs[i])} Verweildauer gesamt` },
      el('i', { style: { height: `${Math.max(h, vals[i] ? 4 : 1)}%`, animationDelay: `${i * 30}ms` } }),
      el('span', { text: new Date(d).toLocaleDateString('de-DE', { day: '2-digit' }) })));
  });
  return wrap;
}
function viewOverview() {
  const v = data.visits || {};
  const activeKeys = data.keys.filter((k) => k.active).length;
  const m = data.settings?.maintenance?.enabled;
  const recent = [
    ...data.stations.map((s) => ({ t: s.updated_at, text: `Station „${s.name}" (${s.body}) · ${s.agency}`, k: 'station' })),
    ...data.routes.map((r) => ({ t: r.created_at, text: `Route „${r.name}" zu ${r.station} · ${r.agency}`, k: 'route' })),
    ...data.keys.filter((k) => k.last_used_at).map((k) => ({ t: k.last_used_at, text: `Schlüssel „${k.label || '–'}" benutzt · ${orgName(k.agency_id)}`, k: 'key' })),
    ...data.agencies.filter((a) => !a.is_reference).map((a) => ({ t: a.created_at, text: `Organisation „${a.name}" angelegt`, k: 'org' })),
  ].sort((a, b) => new Date(b.t) - new Date(a.t)).slice(0, 10);
  return el('div', { class: 'ab-view' },
    m ? el('div', { class: 'ab-banner warn' }, el('b', { text: 'Wartungsmodus ist aktiv' }), el('span', { text: ' – Besucher sehen die Wartungsseite.' }),
      btn('Ändern', { kind: 'ghost', small: true, onclick: () => { tab = 'general'; renderTab(true); } })) : null,
    el('div', { class: 'ab-stats' },
      statCard('Organisationen', data.agencies.length, `${data.agencies.filter((a) => a.is_reference).length} Referenz · ${data.agencies.filter((a) => !a.is_reference).length} eigene`, '', 'orgs', 'orgs'),
      statCard('Schlüssel aktiv', activeKeys, `von ${data.keys.length} ausgegeben`, '', 'keys', 'keys'),
      statCard('Stationen', data.stations.length, `${new Set(data.stations.map((s) => s.body)).size} Himmelskörper`, '', 'stations', 'stations'),
      statCard('Routen', data.routes.length, 'geplante Verbindungen', '', 'routes', 'routes'),
      statCard('Besucher (24 h)', v.visitors24h ?? 0, `${v.visitors7d ?? 0} in 7 Tagen`, '', 'visits', 'visits'),
      statCard('Fehlversuche (24 h)', (data.activity.failed_key_24h || 0) + (data.activity.failed_admin_24h || 0),
        `Schlüssel ${data.activity.failed_key_24h} · Admin ${data.activity.failed_admin_24h}`, data.activity.failed_admin_24h ? 'danger' : data.activity.failed_key_24h ? 'warn' : '', 'general', 'keys')),
    el('div', { class: 'ab-grid2' },
      el('section', { class: 'ab-card' }, el('h2', { text: 'Besucher · letzte 14 Tage' }), visitsChart(v.daily)),
      el('section', { class: 'ab-card' }, el('h2', { text: 'Letzte Aktivität' }),
        recent.length ? el('ul', { class: 'ab-feed' }, recent.map((r) => el('li', { 'data-k': r.k }, el('span', { text: r.text }), el('time', { text: fmtDate(r.t) }))))
          : el('p', { class: 'ab-empty', text: 'Noch keine Aktivität.' }))));
}
const orgName = (id) => data.agencies.find((a) => a.id === id)?.name ?? '–';

// --- Organisationen -------------------------------------------------------------------------------------
function viewOrgs() {
  const search = el('label', { class: 'ab-search' }, svg(ICON.search, 16), el('input', { type: 'search', placeholder: 'Organisation suchen …', value: ui.orgSearch,
    oninput: (e) => { ui.orgSearch = e.target.value; renderList(); } }));
  const cat = el('select', { class: 'ab-select', 'aria-label': 'Kategorie filtern', onchange: (e) => { ui.orgCat = e.target.value; renderList(); } },
    el('option', { value: '', text: 'Alle Kategorien' }), AGENCY_CATEGORIES.map((c) => el('option', { value: c, text: c, selected: ui.orgCat === c })));
  const list = el('div', { class: 'ab-orggrid' });
  function renderList() {
    const q = norm(ui.orgSearch);
    const rows = data.agencies.filter((a) => (!ui.orgCat || a.category === ui.orgCat)
      && (!q || [a.name, a.short_name, a.country, a.headquarters, a.category].some((x) => norm(x).includes(q))));
    list.replaceChildren(...(rows.length ? rows.map(orgCard) : [el('p', { class: 'ab-empty', text: 'Keine Organisation gefunden.' })]));
  }
  renderList();
  return el('div', { class: 'ab-view' },
    el('div', { class: 'ab-toolbar' }, search, cat, el('span', { class: 'ab-grow' }), btn('Neue Organisation', { icon: 'plus', onclick: () => openOrgDrawer(null) })),
    list);
}
function orgCard(a) {
  const keys = data.keys.filter((k) => k.agency_id === a.id);
  const initials = (a.short_name || a.name).replace(/[^A-Za-zÄÖÜäöü0-9]/g, '').slice(0, 3).toUpperCase();
  const facts = el('dl', { class: 'ab-facts' });
  const fact = (l, v, href) => { if (v == null || v === '') return; facts.append(el('dt', { text: l }), el('dd', {}, href ? el('a', { href, target: '_blank', rel: 'noopener', text: v }) : v)); };
  fact('Land', a.country); fact('Hauptsitz', a.headquarters); fact('Gegründet', a.founded ? String(a.founded) : null);
  fact('Mitarbeitende', a.employees != null ? fmtNum(a.employees) : null); fact('Budget', a.budget_usd_m != null ? `${fmtNum(a.budget_usd_m)} Mio. USD/Jahr` : null);
  if (a.website) fact('Website', a.website.replace(/^https?:\/\//, ''), a.website);
  if (a.email) fact('E-Mail', a.email, `mailto:${a.email}`);
  fact('Telefon', a.phone); fact('Ansprechpartner', a.contact_person); fact('Anschrift', a.address);
  const card = el('article', { class: 'ab-org' },
    el('div', { class: 'ab-org-head' },
      a.logo ? el('img', { class: 'ab-avatar img', src: a.logo, alt: `Logo ${a.name}`, loading: 'lazy' }) : el('div', { class: 'ab-avatar', text: initials || '?' }),
      el('div', { class: 'ab-org-title' }, el('h3', { text: a.name }),
        el('p', {}, a.short_name && a.short_name !== a.name ? el('b', { text: a.short_name }) : null,
          el('span', { text: [a.category, a.country].filter(Boolean).join(' · ') || 'ohne Kategorie' }))),
      el('div', { class: 'ab-tags' }, a.is_reference ? el('span', { class: 'ab-tag ref', text: 'Referenz' }) : null,
        a.status && a.status !== 'aktiv' ? el('span', { class: 'ab-tag', text: a.status }) : null)),
    a.description ? el('p', { class: 'ab-desc', text: a.description }) : null,
    facts,
    a.notes ? el('p', { class: 'ab-notes', text: a.notes }) : null,
    el('div', { class: 'ab-org-meta' },
      el('span', { text: `${a.stations} Stationen` }), el('span', { text: `${a.routes} Routen` }), el('span', { text: `${keys.filter((k) => k.active).length}/${keys.length} Schlüssel aktiv` }),
      a.source_url ? el('a', { href: a.source_url, target: '_blank', rel: 'noopener', text: 'Quelle ↗' }) : null),
    el('div', { class: 'ab-row' },
      btn('Bearbeiten', { kind: 'ghost', small: true, icon: 'edit', onclick: () => openOrgDrawer(a) }),
      btn('Schlüssel ausgeben', { kind: 'ghost', small: true, icon: 'key', onclick: (e) => issueKey(a, e.currentTarget) }),
      el('span', { class: 'ab-grow' }),
      btn('', { kind: 'ghost danger', small: true, icon: 'trash', title: 'Organisation löschen', onclick: async (e) => {
        const b = e.currentTarget;
        if (await confirmBox('Organisation löschen?', `„${a.name}" mit allen Schlüsseln, Stationen und Routen endgültig löschen?`)) act(b, () => adminDeleteAgency(token, a.id), 'Organisation gelöscht.');
      } })));
  return card;
}

function fieldInput(f, value) {
  let inp;
  if (f.type === 'select') {
    inp = el('select', {}, el('option', { value: '', text: '– bitte wählen –' }), f.options().map((o) => el('option', { value: o, text: o })));
    if (value && ![...inp.options].some((o) => o.value === value)) inp.append(el('option', { value, text: value }));
    inp.value = value ?? (f.key === 'status' ? 'aktiv' : '');
  } else if (f.type === 'textarea') {
    inp = el('textarea', { rows: '3', maxlength: f.key === 'notes' ? '4000' : '2000' }); inp.value = value ?? '';
  } else {
    inp = el('input', { type: f.type || 'text', maxlength: '300', placeholder: f.placeholder || '', min: f.min, max: f.max, step: f.step, required: f.required });
    inp.value = value ?? '';
  }
  return inp;
}
function openOrgDrawer(agency) {
  const inputs = {};
  const groups = {};
  for (const f of AGENCY_FIELDS) (groups[f.group] ||= []).push(f);
  const form = el('form', { class: 'ab-orgform' });
  // Logo: eigenes Bild hochladen (PNG/JPG/WebP/SVG) – wird verkleinert und als Bilddaten gespeichert
  let logo = agency?.logo ?? '';
  const preview = el('div', { class: 'ab-logo-prev' });
  const drawPrev = () => preview.replaceChildren(logo ? el('img', { src: logo, alt: 'Logo-Vorschau' })
    : el('span', { text: (inputs.short_name?.value || inputs.name?.value || '?').slice(0, 3).toUpperCase() }));
  const file = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', class: 'ab-file' });
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    try { logo = await imageToDataUrl(f); drawPrev(); } catch (err) { toast(err.message, true); }
  });
  form.append(el('fieldset', {}, el('legend', { text: 'Logo' }),
    el('div', { class: 'ab-logo-row' }, preview,
      el('div', {}, el('p', { class: 'ab-hint', text: 'Optional – ohne eigenes Logo erscheint ein Emblem bzw. das Kürzel. Bilder werden auf 256 px verkleinert.' }),
        el('div', { class: 'ab-row' }, el('label', { class: 'ab-btn ghost sm' }, svg(ICON.plus, 14), el('span', { text: 'Bild wählen' }), file),
          btn('Entfernen', { kind: 'ghost danger', small: true, onclick: () => { logo = ''; file.value = ''; drawPrev(); } }))))));
  for (const [g, fields] of Object.entries(groups)) {
    const fs = el('fieldset', { class: g.includes('privat') ? 'private' : '' }, el('legend', { text: g }));
    if (g.includes('privat')) fs.append(el('p', { class: 'ab-hint', text: 'Nur im Admin-Panel sichtbar – nicht öffentlich abrufbar.' }));
    const grid = el('div', { class: 'ab-fgrid' });
    for (const f of fields) {
      inputs[f.key] = fieldInput(f, agency?.[f.key]);
      grid.append(el('label', { class: f.type === 'textarea' ? 'wide' : '' }, el('span', { text: f.label + (f.required ? ' *' : '') }), inputs[f.key]));
    }
    fs.append(grid);
    form.append(fs);
  }
  const close = () => { ov.classList.add('out'); setTimeout(() => ov.remove(), 220); };
  const save = btn(agency ? 'Änderungen speichern' : 'Organisation anlegen', { type: 'submit', icon: agency ? 'edit' : 'plus' });
  form.append(el('div', { class: 'ab-row end ab-formfoot' }, btn('Abbrechen', { kind: 'ghost', onclick: close }), save));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {};
    for (const f of AGENCY_FIELDS) payload[f.key] = String(inputs[f.key].value ?? '').trim();
    payload.logo = logo;
    const r = await act(save, () => (agency ? adminUpdateAgency(token, agency.id, payload) : adminCreateAgency(token, payload)),
      agency ? 'Organisation aktualisiert.' : 'Organisation angelegt.');
    if (r) close();
  });
  const ov = el('div', { class: 'ab-drawer-wrap', onclick: (e) => { if (e.target === ov) close(); } },
    el('aside', { class: 'ab-drawer' },
      el('header', {}, el('h2', { text: agency ? `Bearbeiten: ${agency.name}` : 'Neue Organisation' }), btn('', { kind: 'ghost', icon: 'x', small: true, title: 'Schließen', onclick: close })),
      form));
  document.body.append(ov);
  drawPrev();
  setTimeout(() => inputs.name.focus(), 50);
}

async function issueKey(a, button) {
  const label = await promptBox('Neuer Stationsschlüssel', `Bezeichnung für den Schlüssel von „${a.name}" (optional, z. B. „Missionsplanung 2027"):`);
  if (label === null) return;
  const key = await act(button, () => adminIssueKey(token, a.id, label || null));
  if (key) showKeyOnce(a.name, key);
}
// Bild verkleinern (max. 256 px) und als data-URL liefern; SVG bleibt Vektor (wird nur per <img> gezeigt)
async function imageToDataUrl(f) {
  if (f.size > 3000000) throw new Error('Bild zu groß (max. 3 MB).');
  if (f.type === 'image/svg+xml') {
    const txt = await f.text();
    if (txt.length > 250000) throw new Error('SVG zu groß.');
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(txt)));
  }
  const bmp = await createImageBitmap(f);
  const s = Math.min(1, 256 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/webp', 0.9);
  return url.startsWith('data:image/webp') ? url : c.toDataURL('image/png');
}
function promptBox(title, text) {
  return new Promise((resolve) => {
    const input = el('input', { type: 'text', maxlength: '120' });
    const close = (v) => { ov.classList.add('out'); setTimeout(() => ov.remove(), 180); resolve(v); };
    const ov = el('div', { class: 'ab-modal', onclick: (e) => { if (e.target === ov) close(null); } },
      el('form', { class: 'ab-dialog', onsubmit: (e) => { e.preventDefault(); close(input.value.trim()); } },
        el('h3', { text: title }), el('p', { text }), input,
        el('div', { class: 'ab-row end' }, btn('Abbrechen', { kind: 'ghost', onclick: () => close(null) }), btn('Ausgeben', { type: 'submit', icon: 'key' }))));
    document.body.append(ov);
    input.focus();
  });
}
function showKeyOnce(agencyName, key) {
  const ov = el('div', { class: 'ab-modal' });
  const close = () => { ov.classList.add('out'); setTimeout(() => ov.remove(), 180); };
  ov.append(el('div', { class: 'ab-dialog keyout' },
    el('h3', { text: 'Stationsschlüssel ausgegeben' }),
    el('p', { text: `Für ${agencyName}. Jetzt kopieren und sicher übermitteln – er wird nur dieses eine Mal angezeigt.` }),
    el('code', { class: 'ab-keyval', text: key }),
    el('div', { class: 'ab-row end' },
      btn('Kopieren', { kind: 'ghost', onclick: async () => { try { await navigator.clipboard.writeText(key); toast('In die Zwischenablage kopiert.'); } catch { toast('Bitte manuell markieren.', true); } } }),
      btn('Fertig', { onclick: close }))));
  document.body.append(ov);
}

// --- Stationen, Routen, Schlüssel ----------------------------------------------------------------------
function tableView(rows, columns, emptyText, searchKey, searchPlaceholder) {
  const tbody = el('tbody');
  const count = el('span', { class: 'ab-count' });
  const draw = () => {
    const q = norm(ui[searchKey]);
    const vis = rows.filter((r) => !q || columns.some((c) => norm(c.text?.(r)).includes(q)));
    count.textContent = `${vis.length} von ${rows.length}`;
    tbody.replaceChildren(...(vis.length ? vis.map((r) => el('tr', {}, columns.map((c) => el('td', { class: c.cls || '' }, c.cell ? c.cell(r) : c.text(r)))))
      : [el('tr', {}, el('td', { colspan: String(columns.length), class: 'ab-empty', text: rows.length ? 'Keine Treffer.' : emptyText }))]));
  };
  draw();
  return el('div', { class: 'ab-view' },
    el('div', { class: 'ab-toolbar' },
      el('label', { class: 'ab-search' }, svg(ICON.search, 16), el('input', { type: 'search', placeholder: searchPlaceholder, value: ui[searchKey], oninput: (e) => { ui[searchKey] = e.target.value; draw(); } })),
      el('span', { class: 'ab-grow' }), count),
    el('div', { class: 'ab-card flush' }, el('div', { class: 'ab-tablewrap' },
      el('table', { class: 'ab-table' }, el('thead', {}, el('tr', {}, columns.map((c) => el('th', { text: c.head })))), tbody))));
}
const statusBadge = (s) => el('span', { class: 'ab-badge', 'data-s': s, text: s });
function delBtn(what, name, fn) {
  return btn('', { kind: 'ghost danger', small: true, icon: 'trash', title: `${what} löschen`, onclick: async (e) => {
    const b = e.currentTarget;
    if (await confirmBox(`${what} löschen?`, `„${name}" endgültig löschen?`)) act(b, fn, `${what} gelöscht.`);
  } });
}
function viewStations() {
  return tableView(data.stations, [
    { head: 'Station', text: (s) => s.name, cell: (s) => el('div', {}, el('strong', { text: s.name }), s.description ? el('small', { text: s.description }) : null) },
    { head: 'Körper', text: (s) => s.body }, { head: 'Organisation', text: (s) => s.agency },
    { head: 'Art', text: (s) => STATION_KINDS[s.kind] || s.kind }, { head: 'Status', text: (s) => s.status, cell: (s) => statusBadge(s.status) },
    { head: 'Position', text: (s) => fmtDeg(s.lat, s.lon), cls: 'mono' }, { head: 'Ø', text: (s) => fmtKm(2 * s.radius_m) },
    { head: 'Besatzung', text: (s) => (s.crew != null ? String(s.crew) : '–') }, { head: 'Geändert', text: (s) => fmtDate(s.updated_at) },
    { head: '', text: () => '', cell: (s) => delBtn('Station', s.name, () => adminDeleteStation(token, s.id)) },
  ], 'Noch keine Stationen geplant.', 'stationSearch', 'Station, Körper oder Organisation …');
}
function viewRoutes() {
  return tableView(data.routes, [
    { head: 'Route', text: (r) => r.name, cell: (r) => el('strong', { text: r.name }) }, { head: 'Art', text: (r) => ROUTE_KINDS[r.kind] || r.kind },
    { head: 'Station', text: (r) => r.station }, { head: 'Körper', text: (r) => r.body }, { head: 'Organisation', text: (r) => r.agency },
    { head: 'Punkte', text: (r) => String(r.points) }, { head: 'Erstellt', text: (r) => fmtDate(r.created_at) },
    { head: '', text: () => '', cell: (r) => delBtn('Route', r.name, () => adminDeleteRoute(token, r.id)) },
  ], 'Noch keine Routen angelegt.', 'routeSearch', 'Route, Station oder Organisation …');
}
function viewKeys() {
  ui.keySearch ??= '';
  return tableView(data.keys, [
    { head: 'Bezeichnung', text: (k) => k.label || '(ohne Bezeichnung)', cell: (k) => el('strong', { text: k.label || '(ohne Bezeichnung)' }) },
    { head: 'Organisation', text: (k) => orgName(k.agency_id) },
    { head: 'Status', text: (k) => (k.active ? 'aktiv' : 'gesperrt'), cell: (k) => statusBadge(k.active ? 'aktiv' : 'gesperrt') },
    { head: 'Erstellt', text: (k) => fmtDate(k.created_at) }, { head: 'Zuletzt benutzt', text: (k) => fmtDate(k.last_used_at) },
    { head: '', text: () => '', cell: (k) => el('div', { class: 'ab-row nowrap' },
      btn(k.active ? 'Sperren' : 'Entsperren', { kind: 'ghost', small: true, icon: k.active ? 'x' : 'key',
        onclick: (e) => act(e.currentTarget, () => adminSetKeyActive(token, k.id, !k.active), k.active ? 'Schlüssel gesperrt.' : 'Schlüssel entsperrt.') }),
      btn('', { kind: 'ghost danger', small: true, icon: 'trash', title: 'Schlüssel löschen', onclick: async (e) => {
        const b = e.currentTarget;
        if (await confirmBox('Schlüssel löschen?', `„${k.label || 'ohne Bezeichnung'}" von ${orgName(k.agency_id)} endgültig löschen? Die Organisation kann damit sofort keine Stationen mehr anlegen oder ändern.`)) act(b, () => adminDeleteKey(token, k.id), 'Schlüssel gelöscht.');
      } })) },
  ], 'Noch keine Schlüssel ausgegeben – über „Organisationen → Schlüssel ausgeben".', 'keySearch', 'Bezeichnung oder Organisation …');
}

// --- Besucher -------------------------------------------------------------------------------------------
function viewVisits() {
  const v = data.visits || {};
  const dwell = v.dwell || [];
  const maxS = Math.max(1, ...dwell.map((d) => d.seconds));
  return el('div', { class: 'ab-view' },
    el('div', { class: 'ab-stats' },
      statCard('Besucher gesamt', v.visitors_total ?? 0, 'eindeutige Sitzungen', '', 'visits'),
      statCard('Besucher (24 h)', v.visitors24h ?? 0, '', '', 'visits'),
      statCard('Besucher (7 Tage)', v.visitors7d ?? 0, '', '', 'overview'),
      statCard('Besucher (30 Tage)', v.visitors30d ?? 0, '', '', 'overview'),
      statCard('Ø Verweildauer', fmtDur(v.avg_session_s ?? 0), 'je Besuch (30 Tage)', '', 'general')),
    el('div', { class: 'ab-grid2' },
      el('section', { class: 'ab-card' }, el('h2', { text: 'Besucher pro Tag (14 Tage)' }), visitsChart(v.daily)),
      el('section', { class: 'ab-card' }, el('h2', { text: 'Ansichten nach Verweildauer (30 Tage)' }),
        dwell.length ? el('ul', { class: 'ab-paths' }, dwell.map((d) => el('li', {},
          el('span', { text: pathLabel(d.path) }), el('i', { style: { width: `${(d.seconds / maxS) * 100}%` } }),
          el('b', { text: fmtDur(d.seconds), title: `${d.visitors} Besucher · Ø ${fmtDur(d.avg)} je Besucher` }))))
          : el('p', { class: 'ab-empty', text: 'Noch keine Verweildauer erfasst.' }))),
    el('p', { class: 'ab-hint', text: 'Gezählt werden nur normale Besucher – Admins (angemeldet oder in der Admin-Vorschau) sind ausgeschlossen. „Meistbesucht" richtet sich nach der tatsächlich sichtbaren Verweildauer (Abschnitte unter 3 s zählen nicht), nicht nach Klicks – wiederholtes Rein- und Rausklicken verfälscht die Auswertung daher nicht. Gespeichert werden weder IP-Adressen noch personenbezogene Daten, nur eine zufällige, gehashte Sitzungskennung; Löschung nach 180 Tagen.' }));
}
function pathLabel(p) {
  if (p.startsWith('#/body/')) return `Karte: ${p.slice(7)}`;
  return { '#/system': 'Sonnensystem', '#/sky': 'Himmel · SPHEREx', '#/engineer': 'Ingenieurstool', '/': 'Startseite' }[p] || p;
}

// --- Allgemein (Wartung, Hinweisbanner) -----------------------------------------------------------------------
function toggle(checked, onchange) {
  const input = el('input', { type: 'checkbox', role: 'switch', checked, onchange });
  return el('label', { class: 'ab-switch' }, input, el('i'));
}
function viewGeneral() {
  const m = data.settings?.maintenance || { enabled: false, message: '' };
  const a = data.settings?.announcement || { enabled: false, text: '' };
  const mMsg = el('textarea', { rows: '3', maxlength: '500' }); mMsg.value = m.message || '';
  const aMsg = el('textarea', { rows: '2', maxlength: '300' }); aMsg.value = a.text || '';
  let mOn = !!m.enabled, aOn = !!a.enabled;
  const mState = el('span', { class: `ab-state${mOn ? ' on' : ''}`, text: mOn ? 'AKTIV' : 'aus' });
  const aState = el('span', { class: `ab-state${aOn ? ' on' : ''}`, text: aOn ? 'sichtbar' : 'aus' });
  return el('div', { class: 'ab-view' },
    el('section', { class: `ab-card ab-setting${mOn ? ' warn' : ''}` },
      el('div', { class: 'ab-setting-head' },
        el('div', {}, el('h2', { text: 'Wartungsmodus' }), el('p', { class: 'ab-hint', text: 'Besucher sehen statt der App eine Wartungsseite. Du selbst kannst die Seite über „Vorschau als Admin" weiter ansehen.' })),
        mState, toggle(mOn, (e) => { mOn = e.target.checked; mState.textContent = mOn ? 'AKTIV' : 'aus'; mState.classList.toggle('on', mOn); })),
      el('label', { class: 'ab-field' }, el('span', { text: 'Text der Wartungsseite' }), mMsg),
      el('div', { class: 'ab-row end' },
        btn('Vorschau als Admin', { kind: 'ghost', icon: 'ext', onclick: () => { try { localStorage.setItem(BYPASS, '1'); } catch { /* egal */ } window.open('/', '_blank', 'noopener'); } }),
        btn('Speichern', { onclick: (e) => act(e.currentTarget, () => adminSetSetting(token, 'maintenance', { enabled: mOn, message: mMsg.value.trim() }), mOn ? 'Wartungsmodus aktiviert.' : 'Wartungsmodus beendet.') }))),
    el('section', { class: 'ab-card ab-setting' },
      el('div', { class: 'ab-setting-head' },
        el('div', {}, el('h2', { text: 'Hinweisbanner' }), el('p', { class: 'ab-hint', text: 'Kurze Meldung oben in der App für alle Besucher (z. B. neue Funktionen, geplante Wartung).' })),
        aState, toggle(aOn, (e) => { aOn = e.target.checked; aState.textContent = aOn ? 'sichtbar' : 'aus'; aState.classList.toggle('on', aOn); })),
      el('label', { class: 'ab-field' }, el('span', { text: 'Bannertext' }), aMsg),
      el('div', { class: 'ab-row end' }, btn('Speichern', { onclick: (e) => act(e.currentTarget, () => adminSetSetting(token, 'announcement', { enabled: aOn, text: aMsg.value.trim() }), 'Hinweisbanner gespeichert.') }))),
    el('section', { class: 'ab-card' }, el('h2', { text: 'System' }),
      el('dl', { class: 'ab-facts wide' },
        el('dt', { text: 'Datenbank' }), el('dd', { text: 'Supabase · eu-central-1 (Frankfurt)' }),
        el('dt', { text: 'Admin-Vorschau in diesem Browser' }), el('dd', {}, (() => { let on = false; try { on = localStorage.getItem(BYPASS) === '1'; } catch { /* egal */ }
          return el('span', {}, on ? 'aktiv ' : 'aus ', on ? btn('Zurücksetzen', { kind: 'ghost', small: true, onclick: () => { try { localStorage.removeItem(BYPASS); } catch { /* egal */ } toast('Admin-Vorschau beendet.'); renderTab(false); } }) : null); })()),
        el('dt', { text: 'Fehlversuche (24 h)' }), el('dd', { text: `Schlüssel ${data.activity.failed_key_24h} · Admin ${data.activity.failed_admin_24h}` }))));
}

// --- Start ------------------------------------------------------------------------------------------
// Nur im lokalen Dev-Server: Panel mit Beispieldaten ansehen (Optik-Test ohne Anmeldung, kein Serverzugriff)
if (import.meta.env.DEV) window.__adminPreview = (demo) => { data = demo; token = 'dev-preview'; renderShell(); };
token = getToken();
startBoot();
