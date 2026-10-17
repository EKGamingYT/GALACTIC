// Admin-Panel: Organisationen mit vollen Stammdaten anlegen/bearbeiten/löschen, Stationsschlüssel ausgeben
// und sperren, sowie ALLE Stationen und Routen aller Organisationen sehen und verwalten.
// Admin-Token nur in sessionStorage (endet mit dem Tab). Gesamtes DOM per textContent/Properties (kein innerHTML) → XSS-sicher.
import './admin.css';
import {
  adminOverview, adminCreateAgency, adminUpdateAgency, adminDeleteAgency, adminIssueKey, adminSetKeyActive,
  adminDeleteStation, adminDeleteRoute, AGENCY_FIELDS, STATION_KINDS, ROUTE_KINDS,
} from '../lib/stationsApi.js';

const STORE = 'galactic_admin_token';
let token = null;
let data = null;

const app = document.getElementById('app') || document.body;

const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
  }
  for (const c of kids) if (c != null) n.append(c);
  return n;
};
const fmtDate = (s) => { if (!s) return 'nie'; try { return new Date(s).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return s; } };
const fmtDeg = (lat, lon) => (lat == null ? '–' : `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? 'O' : 'W'}`);
const fmtKm = (m) => (m == null ? '–' : m >= 1000 ? `${(m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} km` : `${Math.round(m)} m`);

function getToken() { try { return sessionStorage.getItem(STORE); } catch { return null; } }
function setToken(t) { try { t ? sessionStorage.setItem(STORE, t) : sessionStorage.removeItem(STORE); } catch { /* egal */ } token = t; }

async function refresh() {
  const res = await adminOverview(token);
  if (res == null) { setToken(null); renderLogin('Sitzung abgelaufen oder Token ungültig – bitte neu anmelden.'); return false; }
  data = res;
  renderApp();
  return true;
}

// Admin-Aktion ausführen, Meldung zeigen, neu laden; null = Token ungültig → Anmeldung
async function run(btn, fn, okMsg) {
  if (btn) btn.disabled = true;
  try {
    const r = await fn();
    if (r === null) { setToken(null); renderLogin('Token ungültig – bitte neu anmelden.'); return null; }
    if (okMsg) toast(okMsg);
    await refresh();
    return r;
  } catch (e) {
    toast(e.message || 'Fehler', true);
    if (btn) btn.disabled = false;
    return undefined;
  }
}

let toastTimer = 0;
function toast(msg, bad = false) {
  let t = document.querySelector('.adm-toast');
  if (!t) { t = el('div', { class: 'adm-toast' }); document.body.append(t); }
  t.textContent = msg;
  t.dataset.bad = bad ? '1' : '';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 4000);
}

// --- Anmeldung -------------------------------------------------------------------------------------
function renderLogin(error = '') {
  app.replaceChildren(
    el('div', { class: 'adm-top' }, el('span', { class: 'adm-brand' }, 'G.A.L.A.C.T.I.C.', el('span', { text: 'Admin' }))),
    el('main', { class: 'adm-login' },
      el('form', { class: 'adm-card', onsubmit: async (e) => {
        e.preventDefault();
        const t = e.target.querySelector('input').value.trim();
        if (!t) return;
        setToken(t);
        e.target.querySelector('button').disabled = true;
        await refresh();
      } },
        el('h1', { text: 'Anmeldung' }),
        el('p', { class: 'muted small', text: 'Admin-Token eingeben. Fehlversuche werden serverseitig gebremst. Das Token wird nur in diesem Browser-Tab gehalten (sessionStorage).' }),
        el('label', { text: 'Admin-Token', for: 'tok' }),
        el('input', { id: 'tok', type: 'password', autocomplete: 'off', autofocus: '', maxlength: '200' }),
        el('button', { type: 'submit' }, 'Anmelden'),
        error ? el('p', { class: 'adm-err', role: 'alert', text: error }) : null,
      )),
  );
  app.querySelector('#tok')?.focus();
}

// --- Hauptansicht ----------------------------------------------------------------------------------
function statRow() {
  const active = data.keys.filter((x) => x.active).length;
  const stat = (label, value, tone) => el('div', { class: 'adm-stat', 'data-tone': tone || '' }, el('b', { text: String(value) }), el('span', { text: label }));
  return el('div', { class: 'adm-stats' },
    stat('Organisationen', data.agencies.length),
    stat('Schlüssel aktiv', `${active}/${data.keys.length}`),
    stat('Stationen', data.stations.length),
    stat('Routen', data.routes.length),
    stat('Fehlversuche Schlüssel (24 h)', data.activity.failed_key_24h, data.activity.failed_key_24h > 0 ? 'warn' : ''),
    stat('Fehlversuche Admin (24 h)', data.activity.failed_admin_24h, data.activity.failed_admin_24h > 0 ? 'danger' : ''),
  );
}

function agencyForm(agency, onDone) {
  const inputs = {};
  const form = el('form', { class: 'adm-form' });
  for (const f of AGENCY_FIELDS) {
    const inp = f.textarea
      ? el('textarea', { rows: '2', maxlength: '2000' })
      : el('input', { type: f.type || 'text', maxlength: '200', ...(f.required ? { required: '' } : {}), placeholder: f.placeholder || '' });
    inp.value = agency ? (agency[f.key] ?? '') : '';
    inputs[f.key] = inp;
    form.append(el('label', { class: f.textarea ? 'wide' : '' }, el('span', { text: f.label + (f.required ? ' *' : '') }), inp));
  }
  form.append(el('div', { class: 'adm-row wide' },
    el('button', { type: 'submit' }, agency ? 'Speichern' : 'Organisation anlegen'),
    agency ? el('button', { type: 'button', class: 'ghost', onclick: () => onDone?.() }, 'Abbrechen') : null));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {};
    for (const f of AGENCY_FIELDS) payload[f.key] = inputs[f.key].value.trim();
    const btn = form.querySelector('button[type=submit]');
    const r = await run(btn, () => (agency ? adminUpdateAgency(token, agency.id, payload) : adminCreateAgency(token, payload)),
      agency ? 'Organisation aktualisiert.' : 'Organisation angelegt.');
    if (r !== undefined && r !== null) onDone?.();
  });
  return form;
}

function keyRow(k) {
  return el('div', { class: 'adm-key' },
    el('span', { class: 'adm-kdot', 'data-on': k.active ? '1' : '' }),
    el('div', { class: 'adm-kmain' },
      el('strong', { text: k.label || '(ohne Bezeichnung)' }),
      el('small', { text: `erstellt ${fmtDate(k.created_at)} · zuletzt benutzt ${fmtDate(k.last_used_at)}` })),
    el('span', { class: 'adm-badge', 'data-on': k.active ? '1' : '', text: k.active ? 'aktiv' : 'gesperrt' }),
    el('button', { class: 'ghost small', onclick: (e) => run(e.target, () => adminSetKeyActive(token, k.id, !k.active), k.active ? 'Schlüssel gesperrt.' : 'Schlüssel entsperrt.') },
      k.active ? 'Sperren' : 'Entsperren'),
  );
}

function agencyCard(a) {
  const keys = data.keys.filter((k) => k.agency_id === a.id);
  const card = el('article', { class: 'adm-ag' });
  const render = (editing) => {
    card.replaceChildren(el('div', { class: 'adm-ag-head' },
      el('div', {}, el('h3', { text: a.name }), el('p', { class: 'muted small', text: [a.category, a.country].filter(Boolean).join(' · ') || '—' })),
      el('div', { class: 'adm-ag-count' }, el('span', { text: `${a.stations} Stationen` }), el('span', { text: `${a.routes} Routen` }))));
    if (editing) { card.append(agencyForm(a, () => render(false))); return; }
    const dl = el('dl', { class: 'adm-facts' });
    const fact = (l, v) => { if (v) dl.append(el('dt', { text: l }), el('dd', { text: v })); };
    fact('Ansprechpartner', a.contact_person);
    if (a.email) dl.append(el('dt', { text: 'E-Mail' }), el('dd', {}, el('a', { href: `mailto:${a.email}`, text: a.email })));
    fact('Telefon', a.phone);
    if (a.website) dl.append(el('dt', { text: 'Website' }), el('dd', {}, el('a', { href: a.website, target: '_blank', rel: 'noopener', text: a.website })));
    fact('Beschreibung', a.description);
    fact('Angelegt', fmtDate(a.created_at));
    card.append(dl, el('p', { class: 'adm-sub', text: `Stationsschlüssel (${keys.length})` }));
    const list = el('div', { class: 'adm-keys' });
    if (!keys.length) list.append(el('p', { class: 'muted small', text: 'Noch kein Schlüssel ausgegeben.' }));
    keys.forEach((k) => list.append(keyRow(k)));
    card.append(list, el('div', { class: 'adm-row' },
      el('button', { class: 'ghost', onclick: () => render(true) }, 'Bearbeiten'),
      el('button', { class: 'ghost', onclick: () => issueKey(a) }, 'Schlüssel ausgeben'),
      el('button', { class: 'ghost danger', onclick: () => deleteAgency(a) }, 'Löschen')));
  };
  render(false);
  return card;
}

async function issueKey(a) {
  const label = prompt(`Bezeichnung für den neuen Schlüssel von „${a.name}" (optional):`, '');
  if (label === null) return;
  const key = await run(null, () => adminIssueKey(token, a.id, label.trim() || null));
  if (key) showKeyOnce(a.name, key);
}

function showKeyOnce(agencyName, key) {
  const ov = el('div', { class: 'adm-modal', onclick: (e) => { if (e.target === ov) ov.remove(); } });
  ov.append(el('div', { class: 'adm-card adm-keyout' },
    el('h3', { text: 'Neuer Stationsschlüssel' }),
    el('p', { class: 'small', text: `Für ${agencyName}. Jetzt kopieren – er wird danach nicht mehr angezeigt.` }),
    el('code', { class: 'adm-keyval', text: key }),
    el('div', { class: 'adm-row' },
      el('button', { onclick: async () => { try { await navigator.clipboard.writeText(key); toast('Kopiert.'); } catch { toast('Bitte manuell markieren.', true); } } }, 'Kopieren'),
      el('button', { class: 'ghost', onclick: () => ov.remove() }, 'Schließen')),
  ));
  document.body.append(ov);
}

async function deleteAgency(a) {
  if (!confirm(`Organisation „${a.name}" wirklich löschen? Alle ihre Schlüssel, Stationen und Routen werden mitgelöscht.`)) return;
  await run(null, () => adminDeleteAgency(token, a.id), 'Organisation gelöscht.');
}

function stationRow(s) {
  return el('tr', {},
    el('td', {}, el('strong', { text: s.name }), s.description ? el('small', { class: 'muted', text: s.description }) : null),
    el('td', { text: s.body }), el('td', { text: s.agency }), el('td', { text: STATION_KINDS[s.kind] || s.kind }),
    el('td', {}, el('span', { class: 'adm-badge', 'data-status': s.status, text: s.status })),
    el('td', { text: fmtDeg(s.lat, s.lon) }), el('td', { text: `Ø ${fmtKm(2 * s.radius_m)}` }), el('td', { text: fmtDate(s.updated_at) }),
    el('td', {}, el('button', { class: 'ghost danger small', onclick: (e) => { if (confirm(`Station „${s.name}" löschen?`)) run(e.target, () => adminDeleteStation(token, s.id), 'Station gelöscht.'); } }, 'Löschen')),
  );
}

function routeRow(r) {
  return el('tr', {},
    el('td', { text: r.name }), el('td', { text: ROUTE_KINDS[r.kind] || r.kind }), el('td', { text: r.station }),
    el('td', { text: r.body }), el('td', { text: r.agency }), el('td', { text: `${r.points} Punkte` }), el('td', { text: fmtDate(r.created_at) }),
    el('td', {}, el('button', { class: 'ghost danger small', onclick: (e) => { if (confirm(`Route „${r.name}" löschen?`)) run(e.target, () => adminDeleteRoute(token, r.id), 'Route gelöscht.'); } }, 'Löschen')),
  );
}

function table(headers, rows, emptyText) {
  if (!rows.length) return el('p', { class: 'muted small', text: emptyText });
  const t = el('table', { class: 'adm-table' },
    el('thead', {}, el('tr', {}, ...headers.map((h) => el('th', { text: h })))),
    el('tbody', {}, ...rows));
  return el('div', { class: 'adm-tablewrap' }, t);
}

function renderApp() {
  app.replaceChildren(
    el('div', { class: 'adm-top' },
      el('span', { class: 'adm-brand' }, 'G.A.L.A.C.T.I.C.', el('span', { text: 'Admin' })),
      el('div', { class: 'adm-top-actions' },
        el('button', { class: 'ghost small', onclick: () => refresh() }, 'Aktualisieren'),
        el('button', { class: 'ghost small', onclick: () => { setToken(null); renderLogin(); } }, 'Abmelden'))),
    el('main', { class: 'adm-main' },
      statRow(),
      el('section', { class: 'adm-sec' },
        el('h2', { text: 'Neue Organisation' }),
        el('p', { class: 'muted small', text: 'Mit allen Stammdaten. E-Mail, Telefon und Ansprechpartner sind nicht öffentlich sichtbar – nur hier im Admin-Panel.' }),
        el('div', { class: 'adm-card' }, agencyForm(null, () => {}))),
      el('section', { class: 'adm-sec' },
        el('h2', {}, 'Organisationen ', el('span', { class: 'adm-n', text: String(data.agencies.length) })),
        data.agencies.length ? el('div', { class: 'adm-ag-grid' }, ...data.agencies.map(agencyCard))
          : el('p', { class: 'muted small', text: 'Noch keine Organisation angelegt.' })),
      el('section', { class: 'adm-sec' },
        el('h2', {}, 'Alle Stationen ', el('span', { class: 'adm-n', text: String(data.stations.length) })),
        table(['Name', 'Körper', 'Organisation', 'Art', 'Status', 'Position', 'Radius', 'Geändert', ''], data.stations.map(stationRow), 'Noch keine Stationen angelegt.')),
      el('section', { class: 'adm-sec' },
        el('h2', {}, 'Alle Routen ', el('span', { class: 'adm-n', text: String(data.routes.length) })),
        table(['Name', 'Art', 'Station', 'Körper', 'Organisation', 'Umfang', 'Erstellt', ''], data.routes.map(routeRow), 'Noch keine Routen angelegt.')),
    ),
  );
}

// --- Start -----------------------------------------------------------------------------------------
token = getToken();
if (token) refresh().catch(() => renderLogin());
else renderLogin();
