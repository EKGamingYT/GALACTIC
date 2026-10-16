// Admin-Panel für das Stationsschlüssel-System (eigene Seite admin.html).
// Sicherheit:
//  - Das Admin-Token liegt NUR in sessionStorage (endet mit dem Tab), nie in localStorage/URL/Cookies.
//  - Jede Prüfung passiert serverseitig in den RPCs (supabase/schema.sql); Fehlversuche werden dort
//    protokolliert und gebremst – das Panel selbst ist nur eine Oberfläche.
//  - Alle Daten aus der Datenbank landen ausschließlich per textContent/value im DOM (kein innerHTML → kein XSS).
import './admin.css';
import { adminOverview, adminCreateAgency, adminIssueKey, adminSetKeyActive } from '../lib/stationsApi.js';

const STORE = 'galactic_admin_token';
const app = document.getElementById('app');

// --- sessionStorage (kann in privaten Fenstern o. ä. werfen) -----------------------------------------
const tokenStore = {
  get() { try { return sessionStorage.getItem(STORE); } catch { return null; } },
  set(v) { try { sessionStorage.setItem(STORE, v); } catch { /* Sitzung bleibt dann nur im Speicher */ } },
  clear() { try { sessionStorage.removeItem(STORE); } catch { /* ignorieren */ } },
};

let token = tokenStore.get();
let data = null; // letzte Übersicht

// --- DOM-Helfer: Text immer über textContent, Attribute über Properties --------------------------------
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

function setMsg(node, text, kind = 'error') {
  node.className = `msg ${kind}`;
  node.textContent = text || '';
}

const dateFmt = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
function fmtDate(v) {
  if (!v) return 'nie';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '–' : dateFmt.format(d);
}

// Serverfehler in verständliche Meldungen übersetzen (Text kommt aus der DB → nur als textContent ausgeben)
function errorText(err) {
  const m = String(err?.message || err || '');
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Server nicht erreichbar – Internetverbindung prüfen.';
  if (/duplicate key|unique/i.test(m)) return 'Eine Organisation mit diesem Namen existiert bereits.';
  if (/check constraint/i.test(m)) return 'Eingabe ungültig (Länge prüfen: Name 2–120, Land bis 80, Bezeichnung bis 120 Zeichen).';
  return m || 'Unbekannter Fehler.';
}

async function busy(button, fn) {
  const prev = button.textContent;
  button.disabled = true;
  button.textContent = 'Bitte warten …';
  try { return await fn(); } finally { button.disabled = false; button.textContent = prev; }
}

// --- Abmelden / Sitzung ungültig -------------------------------------------------------------------------
function logout(message) {
  token = null;
  data = null;
  tokenStore.clear();
  renderLogin(message);
}

// Antwort null/false bei Admin-RPCs = Token (inzwischen) ungültig → zurück zur Anmeldung
function sessionLost() {
  logout('Sitzung ungültig – das Admin-Token wurde nicht (mehr) akzeptiert. Bitte erneut anmelden.');
}

// --- Anmeldung -------------------------------------------------------------------------------------------
function renderLogin(message) {
  const input = el('input', {
    id: 'adm-token', type: 'password', autocomplete: 'current-password', required: true, maxLength: 200,
    spellcheck: false, autocapitalize: 'off',
  });
  const msg = el('p', { class: 'msg', role: 'alert', 'aria-live': 'polite' });
  const submit = el('button', { class: 'btn primary', type: 'submit', text: 'Anmelden' });

  const form = el('form', { class: 'form', onsubmit: async (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (!value) { setMsg(msg, 'Bitte das Admin-Token eingeben.'); return; }
    setMsg(msg, '');
    await busy(submit, async () => {
      try {
        const res = await adminOverview(value);
        if (!res) {
          setMsg(msg, 'Admin-Token ungültig.');
          input.select();
          return;
        }
        token = value;
        tokenStore.set(value);
        data = res;
        renderDashboard();
      } catch (err) {
        setMsg(msg, errorText(err));
      }
    });
  } },
    el('div', { class: 'field' }, el('label', { htmlFor: 'adm-token', text: 'Admin-Token' }), input),
    submit,
    msg,
  );

  app.replaceChildren(
    header(false),
    el('main', { class: 'adm-main' },
      el('section', { class: 'card login' },
        el('h2', { text: 'Anmeldung' }),
        el('div', { class: 'form' },
          el('p', { class: 'muted small', text: 'Das Token wird nur für diesen Browser-Tab gespeichert (sessionStorage) und beim Abmelden bzw. Schließen des Tabs verworfen.' }),
          el('p', { class: 'msg info small', text: 'Hinweis: Fehlversuche werden serverseitig protokolliert und gebremst – nach zu vielen Versuchen ist die Anmeldung vorübergehend gesperrt.' }),
          form,
        ),
      ),
    ),
  );
  if (message) setMsg(msg, message);
  input.focus();
}

function header(loggedIn) {
  return el('header', { class: 'adm-top' },
    el('div', { class: 'adm-brand' }, 'G.A.L.A.C.T.I.C.', el('span', { text: 'Stationsschlüssel · Admin' })),
    el('div', { class: 'spacer' }),
    loggedIn && el('button', { class: 'btn sm', type: 'button', text: 'Aktualisieren', onclick: (e) => refresh(e.currentTarget) }),
    loggedIn && el('button', { class: 'btn sm danger', type: 'button', text: 'Abmelden', onclick: () => logout() }),
  );
}

// --- Dashboard -------------------------------------------------------------------------------------------
// Feste Bereiche, damit ein neu ausgegebener Schlüssel beim Neuladen der Übersicht nicht verschwindet
let overviewBox, overviewMsg, secretBox, keyAgencySelect;

function renderDashboard() {
  overviewMsg = el('p', { class: 'msg', role: 'status', 'aria-live': 'polite' });
  overviewBox = el('div', { class: 'agencies' });
  secretBox = el('div', { 'aria-live': 'polite' });

  app.replaceChildren(
    header(true),
    el('main', { class: 'adm-main' },
      el('div', { class: 'grid-2' }, agencyForm(), keyForm()),
      secretBox,
      el('section', { class: 'card' },
        el('div', { class: 'overview-head' }, el('h2', { text: 'Organisationen & Schlüssel' })),
        overviewMsg,
        overviewBox,
      ),
    ),
  );
  renderOverview();
}

async function refresh(button) {
  const run = async () => {
    try {
      const res = await adminOverview(token);
      if (!res) { sessionLost(); return false; }
      data = res;
      renderOverview();
      return true;
    } catch (err) {
      setMsg(overviewMsg, errorText(err));
      return false;
    }
  };
  return button ? busy(button, run) : run();
}

function agencyForm() {
  const name = el('input', { id: 'adm-ag-name', type: 'text', required: true, minLength: 2, maxLength: 120, autocomplete: 'off' });
  const country = el('input', { id: 'adm-ag-country', type: 'text', maxLength: 80, autocomplete: 'off', placeholder: 'optional' });
  const msg = el('p', { class: 'msg', role: 'status', 'aria-live': 'polite' });
  const submit = el('button', { class: 'btn primary', type: 'submit', text: 'Organisation anlegen' });

  return el('section', { class: 'card' },
    el('h2', { text: 'Organisation anlegen' }),
    el('form', { class: 'form', onsubmit: async (e) => {
      e.preventDefault();
      const n = name.value.trim();
      const c = country.value.trim();
      if (n.length < 2) { setMsg(msg, 'Der Name muss mindestens 2 Zeichen lang sein.'); return; }
      setMsg(msg, '');
      await busy(submit, async () => {
        try {
          const id = await adminCreateAgency(token, n, c);
          if (!id) { sessionLost(); return; }
          name.value = '';
          country.value = '';
          if (await refresh()) {
            setMsg(msg, `Organisation „${n}“ angelegt.`, 'ok');
            if (keyAgencySelect) keyAgencySelect.value = id;
          }
        } catch (err) {
          setMsg(msg, errorText(err));
        }
      });
    } },
      el('div', { class: 'field' }, el('label', { htmlFor: 'adm-ag-name', text: 'Name' }), name),
      el('div', { class: 'field' }, el('label', { htmlFor: 'adm-ag-country', text: 'Land' }), country),
      submit,
      msg,
    ),
  );
}

function keyForm() {
  keyAgencySelect = el('select', { id: 'adm-key-agency', required: true });
  const label = el('input', { id: 'adm-key-label', type: 'text', maxLength: 120, autocomplete: 'off', placeholder: 'z. B. „Missionsplanung 2027“' });
  const msg = el('p', { class: 'msg', role: 'status', 'aria-live': 'polite' });
  const submit = el('button', { class: 'btn primary', type: 'submit', text: 'Schlüssel ausgeben' });

  return el('section', { class: 'card' },
    el('h2', { text: 'Schlüssel ausgeben' }),
    el('form', { class: 'form', onsubmit: async (e) => {
      e.preventDefault();
      const agencyId = keyAgencySelect.value;
      const agency = data?.agencies?.find((a) => a.id === agencyId);
      if (!agency) { setMsg(msg, 'Bitte zuerst eine Organisation wählen.'); return; }
      const l = label.value.trim();
      setMsg(msg, '');
      await busy(submit, async () => {
        try {
          const key = await adminIssueKey(token, agencyId, l || null);
          if (!key) { sessionLost(); return; }
          label.value = '';
          showSecret(key, agency.name, l);
          await refresh();
        } catch (err) {
          setMsg(msg, errorText(err));
        }
      });
    } },
      el('div', { class: 'field' }, el('label', { htmlFor: 'adm-key-agency', text: 'Organisation' }), keyAgencySelect),
      el('div', { class: 'field' }, el('label', { htmlFor: 'adm-key-label', text: 'Bezeichnung (Label)' }), label),
      submit,
      msg,
    ),
  );
}

function fillAgencySelect() {
  if (!keyAgencySelect) return;
  const prev = keyAgencySelect.value;
  const agencies = data?.agencies || [];
  const opts = agencies.length
    ? [el('option', { value: '', text: '– Organisation wählen –', disabled: true }),
       ...agencies.map((a) => el('option', { value: a.id, text: a.country ? `${a.name} (${a.country})` : a.name }))]
    : [el('option', { value: '', text: 'Noch keine Organisation angelegt' })];
  keyAgencySelect.replaceChildren(...opts);
  keyAgencySelect.value = agencies.some((a) => a.id === prev) ? prev : '';
}

// --- Neuer Schlüssel: genau einmal sichtbar ---------------------------------------------------------------
function showSecret(key, agencyName, label) {
  const field = el('input', { type: 'text', readOnly: true, value: key, spellcheck: false, 'aria-label': 'Neuer Stationsschlüssel' });
  const copyMsg = el('p', { class: 'small muted', role: 'status', 'aria-live': 'polite' });
  const copyBtn = el('button', { class: 'btn primary', type: 'button', text: 'Kopieren', onclick: async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(key); ok = true; } catch {
      field.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
    }
    copyMsg.textContent = ok ? 'In die Zwischenablage kopiert.' : 'Kopieren nicht möglich – bitte manuell markieren und kopieren (Strg+C).';
  } });
  const closeBtn = el('button', { class: 'btn', type: 'button', text: 'Gesichert – ausblenden', onclick: () => {
    if (confirm('Schlüssel wirklich ausblenden? Er kann danach NICHT mehr angezeigt werden.')) secretBox.replaceChildren();
  } });

  secretBox.replaceChildren(
    el('section', { class: 'secret', role: 'alert' },
      el('p', {}, el('strong', { text: 'Neuer Stationsschlüssel' }), ` für „${agencyName}“${label ? ` · ${label}` : ''}`),
      el('div', { class: 'secret-row' }, field, copyBtn, closeBtn),
      el('p', { class: 'small' },
        el('strong', { text: 'Nur jetzt sichtbar: ' }),
        'Der Schlüssel wird nur als Hash gespeichert und kann später nicht mehr angezeigt werden. Jetzt kopieren und sicher an die Organisation übergeben. Bei Verlust einen neuen Schlüssel ausgeben und den alten sperren.'),
      copyMsg,
    ),
  );
  field.focus();
  field.select();
  secretBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// --- Übersicht -------------------------------------------------------------------------------------------
function renderOverview() {
  fillAgencySelect();
  setMsg(overviewMsg, '');
  const agencies = data?.agencies || [];
  const keys = data?.keys || [];

  const byAgency = new Map();
  for (const k of keys) {
    if (!byAgency.has(k.agency_id)) byAgency.set(k.agency_id, []);
    byAgency.get(k.agency_id).push(k);
  }

  if (!agencies.length) {
    overviewBox.replaceChildren(el('p', { class: 'empty', text: 'Noch keine Organisationen angelegt.' }));
    return;
  }

  overviewBox.replaceChildren(...agencies.map((a) => {
    const aKeys = byAgency.get(a.id) || [];
    const activeCount = aKeys.filter((k) => k.active).length;
    const stations = Number(a.stations) || 0;
    return el('article', { class: 'agency' },
      el('div', { class: 'agency-head' },
        el('h3', { text: a.name }),
        el('span', { class: 'muted', text: a.country || 'Land: –' }),
        el('span', { class: 'pill', text: `${stations} ${stations === 1 ? 'Station' : 'Stationen'}` }),
        el('span', { class: 'pill', text: `${activeCount}/${aKeys.length} Schlüssel aktiv` }),
      ),
      aKeys.length ? keyTable(aKeys) : el('p', { class: 'empty', text: 'Noch keine Schlüssel ausgegeben.' }),
    );
  }));
}

function keyTable(keys) {
  return el('div', { class: 'table-wrap' },
    el('table', {},
      el('thead', {}, el('tr', {},
        ['Bezeichnung', 'Status', 'Erstellt', 'Zuletzt benutzt', ''].map((t) => el('th', { scope: 'col', text: t })))),
      el('tbody', {}, keys.map(keyRow)),
    ),
  );
}

function keyRow(k) {
  const btn = el('button', {
    class: `btn sm${k.active ? ' danger' : ''}`, type: 'button', text: k.active ? 'Sperren' : 'Entsperren',
    onclick: () => toggleKey(k, btn),
  });
  return el('tr', { class: k.active ? '' : 'inactive' },
    el('td', { class: 'label', dataset: { th: 'Bezeichnung' }, text: k.label || '(ohne Bezeichnung)' }),
    el('td', { dataset: { th: 'Status' } }, el('span', { class: `pill ${k.active ? 'on' : 'off'}`, text: k.active ? 'aktiv' : 'gesperrt' })),
    el('td', { class: 'date', dataset: { th: 'Erstellt' }, text: fmtDate(k.created_at) }),
    el('td', { class: 'date', dataset: { th: 'Zuletzt benutzt' }, text: fmtDate(k.last_used_at) }),
    el('td', {}, btn),
  );
}

async function toggleKey(k, btn) {
  const next = !k.active;
  const name = k.label || 'ohne Bezeichnung';
  if (!next && !confirm(`Schlüssel „${name}“ sperren? Die Organisation kann damit sofort keine Stationen mehr bearbeiten.`)) return;
  await busy(btn, async () => {
    try {
      const ok = await adminSetKeyActive(token, k.id, next);
      // false = Token ungültig ODER Schlüssel nicht gefunden → über die Übersicht klären
      if (!ok) {
        const res = await adminOverview(token);
        if (!res) { sessionLost(); return; }
        data = res;
        renderOverview();
        setMsg(overviewMsg, 'Schlüssel nicht gefunden – die Übersicht wurde neu geladen.');
        return;
      }
      if (await refresh()) setMsg(overviewMsg, next ? `Schlüssel „${name}“ entsperrt.` : `Schlüssel „${name}“ gesperrt.`, 'ok');
    } catch (err) {
      setMsg(overviewMsg, errorText(err));
    }
  });
}

// --- Start -----------------------------------------------------------------------------------------------
async function init() {
  if (!token) { renderLogin(); return; }
  app.replaceChildren(header(false), el('main', { class: 'adm-main' }, el('p', { class: 'muted', text: 'Sitzung wird geprüft …' })));
  try {
    const res = await adminOverview(token);
    if (!res) { sessionLost(); return; }
    data = res;
    renderDashboard();
  } catch (err) {
    // Netzwerk-/Bremsfehler: Token behalten, Meldung zeigen, Anmeldung erneut ermöglichen
    renderLogin(errorText(err));
  }
}

init();
