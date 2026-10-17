// Ingenieurstool › Verzeichnis: alle katalogisierten Objekte im All (CelesTrak SATCAT, zur Laufzeit geladen)
// und kuratierte Steckbriefe bedeutender Missionen (src/data/spacecraft.js).
// Ausgabe ausschließlich über textContent / Textknoten.

import './spacecraft.css';
import { SPACECRAFT, SC_TYPES, SC_STATUS } from '../data/spacecraft.js';
import { OWNER_DE, SITE_DE, TYPE_DE, OPS_DE, CENTER_DE, ORBITTYPE_DE } from '../data/spacecraftCodes.js';
import { loadSatcat, satcatLoaded, SATCAT_URL, SATCAT_INFO_URL } from '../data/spacecraftSatcat.js';

// --- Helfer ---------------------------------------------------------------------------------------------
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'style') n.style.cssText = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}
const SVGNS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs = {}, text) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
}
const clear = (n) => { while (n.firstChild) n.firstChild.remove(); };
const put = (n, ...kids) => { for (const c of kids.flat(Infinity)) if (c != null && c !== false) n.append(c); };
const nf = new Map();
function fmt(x, d = 0) {
  if (x == null || !Number.isFinite(x)) return '–';
  let f = nf.get(d);
  if (!f) { f = new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }); nf.set(d, f); }
  return f.format(x);
}
function fmtDate(iso) {
  if (!iso) return '–';
  const [y, m, d] = iso.split('-');
  return d ? `${d}.${m}.${y}` : iso;
}
function fmtMass(kg) {
  if (kg == null) return '–';
  if (kg >= 10000) return `${fmt(kg / 1000, 1)} t`;
  return `${fmt(kg, kg < 10 ? 1 : 0)} kg`;
}
function link(q) { return el('a', { href: q.url, target: '_blank', rel: 'noopener noreferrer', text: q.name }); }
const ownerName = (c) => OWNER_DE[c] || c || 'unbekannt';
// Kurzname für Diagramme: lange Namen mit Klammerzusatz → Zusatz (z. B. „ESA“), sonst ohne Klammer
const shortOwner = (c) => { const n = ownerName(c); const m = /\(([^)]+)\)$/.exec(n); return n.length > 24 && m ? m[1] : n.replace(/ \(.*\)$/, ''); };
const siteName = (c) => SITE_DE[c] || c || '–';
let uid = 0;
const nextId = (p) => `sc-${p}-${++uid}`;
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const store = {
  get(k, d) { try { const v = localStorage.getItem(`galactic.sc.${k}`); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`galactic.sc.${k}`, v); } catch { /* egal */ } },
};
function segGroup(label, options, value, onChange) {
  const g = el('div', { class: 'seg sc-seg', role: 'group', 'aria-label': label });
  const btns = options.map(([id, name]) => el('button', { type: 'button', text: name, 'aria-pressed': String(id === value), onclick: () => set(id, true) }));
  function set(id, fire) {
    value = id;
    btns.forEach((b, i) => { const on = options[i][0] === id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    if (fire) onChange(id);
  }
  g.append(...btns);
  set(value, false);
  return g;
}
function selectEl(label, options, value, onChange) {
  const s = el('select', { class: 'eng-select', 'aria-label': label });
  for (const o of options) s.append(el('option', { value: o[0], text: o[1] }));
  s.value = value;
  s.addEventListener('change', () => onChange(s.value));
  return s;
}
function field(label, control) {
  return el('label', { class: 'sc-field' }, el('span', { class: 'eng-field-l', text: label }), control);
}
const statusPill = (key) => {
  const s = SC_STATUS[key] || { name: key, tone: 'off' };
  return el('span', { class: `sc-pill ${s.tone}`, text: s.name });
};
const typeBadge = (key) => {
  const t = SC_TYPES[key];
  return el('span', { class: 'sc-type', style: `--c:${t?.color || '#8a97b5'}`, text: t?.name || key });
};
// Kategorien des SATCAT-Status für Filter und Anzeige
function satStatus(r) {
  if (r.decay) return r.otype === 'LAN' ? 'gelandet' : r.otype === 'DOC' ? 'angekoppelt' : r.center && r.center !== 'EA' ? 'eingeschlagen/beendet' : 'verglüht';
  if (r.active) return 'aktiv';
  return 'im Orbit';
}

// =========================================================================================================
export function buildDirectory(panel) {
  const VIEWS = [['missionen', 'Bedeutende Missionen'], ['katalog', 'Alle Objekte (SATCAT)'], ['statistik', 'Statistik']];
  let view = store.get('view', 'missionen');
  if (!VIEWS.some((v) => v[0] === view)) view = 'missionen';
  const boxes = Object.fromEntries(VIEWS.map(([id]) => [id, el('div', { class: 'sc-view' })]));
  const built = {};
  const dialog = createDialog();

  const nav = segGroup('Ansicht des Verzeichnisses', VIEWS, view, (id) => show(id));
  panel.append(
    el('div', { class: 'sc-head' },
      el('div', {},
        el('h3', { class: 'sc-h', text: 'Verzeichnis der Objekte im All' }),
        el('p', { class: 'eng-hint', text: `Alle seit 1957 katalogisierten Objekte (Nutzlasten, Raketenstufen, Trümmer) aus dem CelesTrak-Satellitenkatalog sowie ${SPACECRAFT.length} kuratierte Steckbriefe bedeutender Missionen.` })),
      nav),
    ...Object.values(boxes), dialog.node);

  const ctx = { dialog, openMission: (m) => dialog.mission(m), openObject: (r) => dialog.object(r), show: (id) => { nav.querySelectorAll('button')[VIEWS.findIndex((v) => v[0] === id)]?.click(); } };

  function show(id) {
    view = id; store.set('view', id);
    for (const [k, b] of Object.entries(boxes)) b.hidden = k !== id;
    if (!built[id]) {
      built[id] = true;
      if (id === 'missionen') buildMissions(boxes[id], ctx);
      if (id === 'katalog') buildCatalog(boxes[id], ctx);
      if (id === 'statistik') buildStats(boxes[id], ctx);
    }
    boxes[id].dispatchEvent(new CustomEvent('sc-show'));
  }
  show(view);
}

// --- Lade-Anzeige für den SATCAT -------------------------------------------------------------------------
function satcatLoader(box, onReady, { auto = true } = {}) {
  const bar = el('i');
  const txt = el('span', { class: 'sc-load-t', text: 'Katalog wird geladen …' });
  const retry = el('button', { type: 'button', class: 'eng-btn', text: 'Katalog laden', hidden: !auto ? null : true });
  const wrap = el('div', { class: 'sc-load' },
    el('div', { class: 'sc-load-h' }, txt, retry),
    el('div', { class: 'eng-bar sc-load-bar' }, bar),
    el('p', { class: 'eng-hint' }, 'Quelle: ', link({ name: 'CelesTrak SATCAT (T. S. Kelso)', url: SATCAT_INFO_URL }),
      ' – rund 7 MB, wird im Browser für 24 Stunden zwischengespeichert.'));
  box.append(wrap);
  function start(force) {
    retry.hidden = true;
    bar.style.width = '0%';
    txt.textContent = 'Katalog wird geladen …';
    loadSatcat({
      force,
      onProgress: (p, got, total, phase) => {
        if (phase === 'cache') txt.textContent = 'Aus dem Zwischenspeicher …';
        else if (phase === 'snapshot') {
          txt.textContent = `CelesTrak nicht erreichbar – lade gespeicherte Momentaufnahme …${got ? ` ${fmt(got / 1048576, 1)} MB` : ''}`;
          if (p != null) bar.style.width = `${(p * 100).toFixed(1)}%`;
        }
        else if (phase === 'parse') { txt.textContent = 'Katalog wird aufbereitet …'; bar.style.width = '100%'; }
        else {
          if (p != null) bar.style.width = `${(p * 100).toFixed(1)}%`;
          txt.textContent = `Lade Katalog … ${fmt(got / 1048576, 1)}${total ? ` von ${fmt(total / 1048576, 1)}` : ''} MB`;
        }
      },
    }).then((data) => { wrap.remove(); onReady(data); })
      .catch((e) => {
        txt.textContent = `Katalog konnte nicht geladen werden (${e && e.message ? e.message : 'Netzwerkfehler'}).`;
        retry.textContent = 'Erneut versuchen';
        retry.hidden = false;
      });
  }
  retry.addEventListener('click', () => start(false));
  if (auto) start(false);
  return { reload: () => start(true) };
}

// =========================================================================================================
// Kuratierte Missionen
function buildMissions(box, ctx) {
  const lands = new Map();
  for (const m of SPACECRAFT) for (const l of m.land.split(' / ')) lands.set(l, (lands.get(l) || 0) + 1);
  const state = { q: '', typ: 'alle', land: 'alle', status: 'alle', sort: store.get('msort', 'neu'), mode: store.get('mmode', 'karten') };

  const search = el('input', { type: 'search', class: 'sc-search', placeholder: 'Suche: Name, Ziel, Betreiber, COSPAR …', 'aria-label': 'Missionen durchsuchen', autocomplete: 'off', spellcheck: 'false' });
  search.addEventListener('input', debounce(() => { state.q = search.value.trim().toLowerCase(); render(); }, 120));
  const typeSeg = segGroup('Typ', [['alle', 'Alle'], ...Object.entries(SC_TYPES).map(([k, t]) => [k, t.plural])], 'alle', (v) => { state.typ = v; render(); });
  const landSel = selectEl('Land', [['alle', 'Alle Länder'], ...[...lands].sort((a, b) => b[1] - a[1]).map(([l, n]) => [l, `${l} (${n})`])], 'alle', (v) => { state.land = v; render(); });
  const statSel = selectEl('Status', [['alle', 'Jeder Status'], ...Object.entries(SC_STATUS).map(([k, s]) => [k, s.name])], 'alle', (v) => { state.status = v; render(); });
  const sortSel = selectEl('Sortierung', [['neu', 'Start: neueste zuerst'], ['alt', 'Start: älteste zuerst'], ['name', 'Name A–Z'], ['masse', 'Masse: schwerste zuerst']], state.sort, (v) => { state.sort = v; store.set('msort', v); render(); });
  const modeSeg = segGroup('Darstellung', [['karten', 'Karten'], ['liste', 'Liste']], state.mode, (v) => { state.mode = v; store.set('mmode', v); render(); });
  const count = el('span', { class: 'sc-count', 'aria-live': 'polite' });
  const kpiBox = el('div', { class: 'sc-mkpis' });
  const list = el('div');

  box.append(
    el('section', { class: 'eng-card sc-toolbar' },
      el('div', { class: 'sc-tool-row' }, search, count),
      el('div', { class: 'sc-tool-row' }, typeSeg),
      el('div', { class: 'sc-tool-row' }, field('Land', landSel), field('Status', statSel), field('Sortierung', sortSel), el('div', { class: 'sc-push' }, modeSeg))),
    kpiBox, list);

  // Kennzahlen je Typ (klickbar als Filter)
  for (const [k, t] of Object.entries(SC_TYPES)) {
    const n = SPACECRAFT.filter((m) => m.typ === k).length;
    kpiBox.append(el('button', { type: 'button', class: 'sc-mkpi', style: `--c:${t.color}`, onclick: () => typeSeg.querySelectorAll('button')[Object.keys(SC_TYPES).indexOf(k) + 1].click() },
      el('span', { class: 'v', text: fmt(n) }), el('span', { class: 'k', text: t.plural })));
  }

  function filtered() {
    const q = state.q;
    let a = SPACECRAFT.filter((m) => (state.typ === 'alle' || m.typ === state.typ)
      && (state.land === 'alle' || m.land.split(' / ').includes(state.land))
      && (state.status === 'alle' || m.status === state.status)
      && (!q || `${m.name} ${m.ziel} ${m.betreiber} ${m.land} ${m.cospar} ${m.norad} ${m.start.rakete || ''} ${m.zweck}`.toLowerCase().includes(q)));
    const by = { neu: (x, y) => y.start.datum.localeCompare(x.start.datum), alt: (x, y) => x.start.datum.localeCompare(y.start.datum),
      name: (x, y) => x.name.localeCompare(y.name, 'de'), masse: (x, y) => (y.masse_kg ?? -1) - (x.masse_kg ?? -1) }[state.sort];
    return a.sort(by);
  }

  function render() {
    const a = filtered();
    count.textContent = `${fmt(a.length)} von ${fmt(SPACECRAFT.length)}`;
    clear(list);
    if (!a.length) { list.append(el('p', { class: 'sc-empty', text: 'Keine Mission passt zu den Filtern.' })); return; }
    if (state.mode === 'karten') {
      list.append(el('div', { class: 'sc-cards' }, a.map((m) => el('button', {
        type: 'button', class: 'sc-card', style: `--c:${SC_TYPES[m.typ].color}`, onclick: () => ctx.openMission(m), 'aria-label': `${m.name} – Steckbrief öffnen`,
      },
      el('span', { class: 'sc-card-top' }, typeBadge(m.typ), el('span', { class: 'sc-year', text: m.start.datum.slice(0, 4) })),
      el('span', { class: 'sc-card-n', text: m.name }),
      el('span', { class: 'sc-card-l', text: `${m.land} · ${m.betreiber}` }),
      el('span', { class: 'sc-card-z', text: m.ziel }),
      el('span', { class: 'sc-card-b' }, statusPill(m.status), m.masse_kg ? el('span', { class: 'sc-card-m', text: fmtMass(m.masse_kg) }) : null)))));
    } else {
      const tb = el('tbody');
      for (const m of a) {
        const tr = el('tr', { tabindex: '0', class: 'sc-tr', onclick: () => ctx.openMission(m), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ctx.openMission(m); } } },
          el('th', { scope: 'row' }, el('span', { class: 'eng-dot', style: `--c:${SC_TYPES[m.typ].color}` }), m.name, el('span', { class: 'sub', text: SC_TYPES[m.typ].name })),
          el('td', { text: fmtDate(m.start.datum) }),
          el('td', { class: 'wrap', text: m.land }),
          el('td', { class: 'wrap', text: m.ziel }),
          el('td', { text: fmtMass(m.masse_kg) }),
          el('td', {}, statusPill(m.status)));
        tb.append(tr);
      }
      list.append(el('div', { class: 'eng-scroll sc-tablewrap' }, el('table', { class: 'eng-table cat sc-table' },
        el('thead', {}, el('tr', {}, ['Mission', 'Start', 'Land', 'Ziel / Bahn', 'Masse', 'Status'].map((h) => el('th', { scope: 'col', text: h })))), tb)));
    }
  }
  render();
}

// =========================================================================================================
// Gesamtkatalog mit virtueller Liste
function buildCatalog(box, ctx) {
  const holder = el('div');
  box.append(holder);
  satcatLoader(holder, (data) => ready(data));

  function ready(data) {
    const rows = data.rows;
    const owners = new Map();
    let minY = 9999, maxY = 0;
    for (const r of rows) { owners.set(r.owner, (owners.get(r.owner) || 0) + 1); if (r.year) { minY = Math.min(minY, r.year); maxY = Math.max(maxY, r.year); } }
    const state = { q: '', type: 'alle', owner: 'alle', status: 'alle', y0: null, y1: null, sort: store.get('csort', 'norad-desc') };

    const search = el('input', { type: 'search', class: 'sc-search', placeholder: 'Suche: Name, COSPAR-ID (1998-067A) oder NORAD-Nummer …', 'aria-label': 'Katalog durchsuchen', autocomplete: 'off', spellcheck: 'false' });
    search.addEventListener('input', debounce(() => { state.q = search.value.trim().toUpperCase(); apply(); }, 150));
    const typeSeg = segGroup('Objekttyp', [['alle', 'Alle'], ['PAY', 'Nutzlasten'], ['R/B', 'Raketenstufen'], ['DEB', 'Trümmer'], ['UNK', 'Unbekannt']], 'alle', (v) => { state.type = v; apply(); });
    const ownerSel = selectEl('Betreiber / Land', [['alle', 'Alle Betreiber/Länder'], ...[...owners].sort((a, b) => b[1] - a[1]).map(([c, n]) => [c, `${ownerName(c)} (${fmt(n)})`])], 'alle', (v) => { state.owner = v; apply(); });
    const statSel = selectEl('Status', [['alle', 'Jeder Status'], ['orbit', 'Im All (nicht verglüht)'], ['aktiv', 'Aktiv (in Betrieb)'], ['weg', 'Verglüht / gelandet / eingeschlagen']], 'alle', (v) => { state.status = v; apply(); });
    const sortSel = selectEl('Sortierung', [
      ['norad-desc', 'Katalognummer: neueste zuerst'], ['norad-asc', 'Katalognummer: älteste zuerst'], ['name', 'Name A–Z'],
      ['start-desc', 'Startdatum: neueste zuerst'], ['start-asc', 'Startdatum: älteste zuerst'], ['decay-desc', 'Verglüht: zuletzt zuerst'],
      ['apo-desc', 'Apogäum: höchstes zuerst'], ['period-desc', 'Umlaufzeit: längste zuerst']], state.sort, (v) => { state.sort = v; store.set('csort', v); apply(); });
    const yIn = (ph, key) => {
      const i = el('input', { type: 'text', inputmode: 'numeric', class: 'sc-year-in', placeholder: ph, 'aria-label': key === 'y0' ? 'Startjahr von' : 'Startjahr bis', maxlength: '4' });
      i.addEventListener('input', debounce(() => { const v = parseInt(i.value, 10); state[key] = Number.isFinite(v) ? v : null; apply(); }, 200));
      return i;
    };
    const count = el('span', { class: 'sc-count', 'aria-live': 'polite' });
    const meta = el('p', { class: 'eng-hint' },
      `Stand des Katalogs: ${data.fetched ? new Date(data.fetched).toLocaleString('de-DE') : 'unbekannt'}${data.snapshot ? ' (gespeicherte Momentaufnahme – CelesTrak war nicht erreichbar)' : data.fromCache ? ' (Zwischenspeicher)' : ''} · `,
      link({ name: 'CelesTrak SATCAT', url: SATCAT_INFO_URL }), ' · ',
      el('button', { type: 'button', class: 'sc-linkbtn', text: 'neu laden', onclick: () => { clear(box); box.append(holder); clear(holder); satcatLoader(holder, ready, { auto: false }).reload(); } }));

    const list = createVirtualList((r) => ctx.openObject(r));
    clear(box);
    box.append(
      el('section', { class: 'eng-card sc-toolbar' },
        el('div', { class: 'sc-tool-row' }, search, count),
        el('div', { class: 'sc-tool-row' }, typeSeg),
        el('div', { class: 'sc-tool-row' },
          field('Betreiber / Land', ownerSel), field('Status', statSel),
          field(`Startjahr (${minY}–${maxY})`, el('span', { class: 'sc-years' }, yIn(String(minY), 'y0'), '–', yIn(String(maxY), 'y1'))),
          field('Sortierung', sortSel)),
        meta),
      list.node);

    const SORTS = {
      'norad-desc': (a, b) => b.norad - a.norad, 'norad-asc': (a, b) => a.norad - b.norad, name: (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
      'start-desc': (a, b) => (b.launch > a.launch ? 1 : b.launch < a.launch ? -1 : b.norad - a.norad), 'start-asc': (a, b) => (a.launch > b.launch ? 1 : a.launch < b.launch ? -1 : a.norad - b.norad),
      'decay-desc': (a, b) => (b.decay || '').localeCompare(a.decay || ''), 'apo-desc': (a, b) => (b.apo ?? -1) - (a.apo ?? -1), 'period-desc': (a, b) => (b.period ?? -1) - (a.period ?? -1),
    };
    function apply() {
      const q = state.q;
      const qNum = /^\d+$/.test(q) ? +q : null;
      const out = [];
      for (const r of rows) {
        if (state.type !== 'alle' && r.type !== state.type) continue;
        if (state.owner !== 'alle' && r.owner !== state.owner) continue;
        if (state.status === 'orbit' && r.decay) continue;
        if (state.status === 'aktiv' && !(r.active && !r.decay)) continue;
        if (state.status === 'weg' && !r.decay) continue;
        if (state.y0 != null && !(r.year >= state.y0)) continue;
        if (state.y1 != null && !(r.year <= state.y1)) continue;
        if (q) { if (qNum != null ? r.norad !== qNum && !r.key.includes(q) : !r.key.includes(q)) continue; }
        out.push(r);
      }
      out.sort(SORTS[state.sort]);
      count.textContent = `${fmt(out.length)} von ${fmt(rows.length)} Objekten`;
      list.set(out);
    }
    apply();
  }
}

function createVirtualList(onOpen) {
  const head = el('div', { class: 'sc-vrow sc-vhead', 'aria-hidden': 'true' },
    ['NORAD', 'Name / COSPAR', 'Typ', 'Betreiber / Land', 'Start', 'Status', 'Bahn (Peri × Apo, Neigung)'].map((h) => el('span', { text: h })));
  const spacer = el('div', { class: 'sc-vspace' });
  const port = el('div', { class: 'sc-vport', role: 'list', 'aria-label': 'Katalogobjekte' }, spacer);
  const node = el('section', { class: 'eng-card sc-vcard' }, head, port);
  let data = [];
  let rowH = 40;
  const pool = [];
  let raf = 0;
  const mq = window.matchMedia('(max-width: 720px)');
  const measure = () => { rowH = mq.matches ? 62 : 40; port.style.setProperty('--rh', `${rowH}px`); };
  mq.addEventListener?.('change', () => { measure(); spacer.style.height = `${data.length * rowH}px`; draw(); });
  measure();

  function rowNode() {
    const b = el('button', { type: 'button', class: 'sc-vrow', role: 'listitem' });
    const cells = Array.from({ length: 7 }, (_, i) => el('span', { class: `c${i}` }));
    b.append(...cells);
    b.addEventListener('click', () => { if (b._r) onOpen(b._r); });
    b._c = cells;
    return b;
  }
  function fill(b, r) {
    b._r = r;
    const c = b._c;
    c[0].textContent = String(r.norad);
    clear(c[1]); c[1].append(el('span', { class: 'n', text: r.name || '(ohne Namen)' }), el('span', { class: 'id', text: r.cospar }));
    c[2].textContent = TYPE_DE[r.type] || r.type; c[2].className = `c2 t-${r.ti}`;
    c[3].textContent = ownerName(r.owner);
    c[4].textContent = fmtDate(r.launch);
    const st = satStatus(r);
    c[5].textContent = r.decay ? `${st} ${fmtDate(r.decay)}` : st;
    c[5].className = `c5 ${r.decay ? 'off' : r.active ? 'ok' : ''}`;
    c[6].textContent = r.center && r.center !== 'EA' && !r.peri ? (CENTER_DE[r.center] ? `um ${CENTER_DE[r.center]}` : '–')
      : r.peri != null && r.apo != null ? `${fmt(r.peri)} × ${fmt(r.apo)} km, ${fmt(r.incl, 1)}°` : '–';
    b.setAttribute('aria-label', `${r.name}, ${r.cospar}, ${TYPE_DE[r.type]}, ${ownerName(r.owner)}`);
  }
  function draw() {
    raf = 0;
    const top = port.scrollTop;
    const h = port.clientHeight || 600;
    const first = Math.max(0, Math.floor(top / rowH) - 6);
    const last = Math.min(data.length, Math.ceil((top + h) / rowH) + 6);
    const need = last - first;
    while (pool.length < need) { const b = rowNode(); pool.push(b); port.append(b); }
    for (let i = 0; i < pool.length; i++) {
      const b = pool[i];
      const idx = first + i;
      if (i < need) {
        b.hidden = false;
        b.style.transform = `translateY(${idx * rowH}px)`;
        if (b._r !== data[idx]) fill(b, data[idx]);
      } else { b.hidden = true; b._r = null; }
    }
  }
  port.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(draw); }, { passive: true });
  window.addEventListener('resize', () => { if (!raf) raf = requestAnimationFrame(draw); });
  return {
    node,
    set(arr) {
      data = arr;
      spacer.style.height = `${arr.length * rowH}px`;
      port.scrollTop = 0;
      for (const b of pool) b._r = null;
      draw();
      // erste Darstellung, falls der Tab gerade erst sichtbar wurde
      requestAnimationFrame(draw);
    },
  };
}

// =========================================================================================================
// Statistik
function buildStats(box, ctx) {
  // kuratierte Kennzahlen sind sofort verfügbar
  const cur = el('section', { class: 'eng-card' }, el('h3', { text: 'Kuratierte Missionen nach Typ und Status' }));
  const statusCounts = Object.keys(SC_STATUS).map((k) => [k, SPACECRAFT.filter((m) => m.status === k).length]);
  cur.append(el('div', { class: 'sc-mkpis inline' }, Object.entries(SC_TYPES).map(([k, t]) => el('div', { class: 'sc-mkpi', style: `--c:${t.color}` },
    el('span', { class: 'v', text: fmt(SPACECRAFT.filter((m) => m.typ === k).length) }), el('span', { class: 'k', text: t.plural })))),
  el('p', { class: 'eng-hint', text: statusCounts.map(([k, n]) => `${SC_STATUS[k].name}: ${n}`).join(' · ') }));
  const holder = el('div');
  box.append(holder, cur);
  // Diagrammbreite = tatsächliche Kartenbreite, damit Schrift in Originalgröße erscheint
  const chartW = () => Math.round(Math.min(1300, Math.max(560, (box.clientWidth || 900) - 34)));
  satcatLoader(holder, (data) => {
    const rows = data.rows;
    const inOrbit = rows.filter((r) => !r.decay);
    const launches = new Map(); // "YYYY-NNN" → Besitzer des ersten Stücks
    for (const r of rows) {
      const m = /^(\d{4})-(\d{3})/.exec(r.cospar);
      if (!m) continue;
      const k = `${m[1]}-${m[2]}`;
      const prev = launches.get(k);
      if (!prev || r.cospar < prev.cospar) launches.set(k, { cospar: r.cospar, owner: r.owner, year: +m[1] });
    }
    const kp = (k, v, s, tone) => el('div', { class: `eng-kpi hero${tone ? ` ${tone}` : ''}` }, el('span', { class: 'k', text: k }), el('span', { class: 'v', text: v }), s ? el('span', { class: 's', text: s }) : null);
    const ofType = (a, t) => a.filter((r) => r.type === t).length;
    box.insertBefore(el('section', { class: 'eng-card' },
      el('h3', { text: 'Gesamtkatalog in Zahlen' }),
      el('div', { class: 'eng-kpis big' },
        kp('Katalogisierte Objekte', fmt(rows.length), 'seit 1957', 'hi'),
        kp('Davon noch im All', fmt(inOrbit.length), `${fmt((inOrbit.length / rows.length) * 100, 0)} %`, 'hi'),
        kp('Aktive Nutzlasten', fmt(inOrbit.filter((r) => r.type === 'PAY' && r.active).length)),
        kp('Trümmerteile im All', fmt(ofType(inOrbit, 'DEB'))),
        kp('Raketenstufen im All', fmt(ofType(inOrbit, 'R/B'))),
        kp('Erfolgreiche Starts', fmt(launches.size), 'mit katalogisiertem Objekt')),
      el('p', { class: 'eng-hint' }, `Stand: ${data.fetched ? new Date(data.fetched).toLocaleDateString('de-DE') : '–'} · Quelle: `, link({ name: 'CelesTrak SATCAT', url: SATCAT_INFO_URL }),
        '. Erfasst sind nur Objekte, die das US Space Force/Space-Track-System katalogisiert; kleinste Trümmer (< ≈ 10 cm) fehlen.')), cur);

    // Objekte im All je Land (Top 12), gestapelt nach Typ
    const by = new Map();
    for (const r of inOrbit) {
      const o = by.get(r.owner) || [0, 0, 0, 0];
      o[r.ti]++; by.set(r.owner, o);
    }
    const top = [...by].sort((a, b) => b[1].reduce((x, y) => x + y) - a[1].reduce((x, y) => x + y)).slice(0, 12);
    box.insertBefore(el('section', { class: 'eng-card' },
      el('h3', { text: 'Objekte im All je Betreiber/Land' }),
      stackedBars(top.map(([c, v]) => ({ label: shortOwner(c), vals: v })),
        ['Nutzlasten', 'Raketenstufen', 'Trümmer', 'unbekannt'], ['#6ea8ff', '#b98cff', '#ff8f6b', '#8a97b5'], chartW()),
      el('p', { class: 'eng-hint', text: 'Zuordnung nach SATCAT-„Owner“ (Betreiber bzw. Herkunftsland). „Sowjetunion/GUS“ umfasst auch russische Objekte.' })), cur);

    // Starts pro Jahr, gestapelt nach Ländergruppe
    const years = [];
    const y0 = 1957; const y1 = new Date().getFullYear();
    for (let y = y0; y <= y1; y++) years.push({ y, v: [0, 0, 0, 0] });
    const grp = (o) => (o === 'US' ? 0 : o === 'CIS' ? 1 : o === 'PRC' ? 2 : 3);
    for (const l of launches.values()) { const e = years[l.year - y0]; if (e) e.v[grp(l.owner)]++; }
    box.insertBefore(el('section', { class: 'eng-card' },
      el('h3', { text: 'Starts pro Jahr' }),
      columnChart(years, ['USA', 'Sowjetunion/Russland', 'China', 'übrige'], ['#6ea8ff', '#ff8f6b', '#ffcc55', '#3ddc84'], chartW()),
      el('p', { class: 'eng-hint', text: 'Laufendes Jahr nur bis zum Katalogstand. Gezählt werden internationale Startbezeichnungen (COSPAR „Jahr-Nummer“), also Starts, die mindestens ein Objekt in eine Bahn brachten – Fehlstarts fehlen. Zuordnung nach Betreiber des ersten Objekts.' })), cur);
  });
}

// Horizontale, gestapelte Balken mit Achse
function stackedBars(rows, names, colors, W = 900) {
  const LW = 170, RW = 70, RH = 26, top = 6;
  const max = Math.max(...rows.map((r) => r.vals.reduce((a, b) => a + b, 0)), 1);
  const step = niceStep(max, 5);
  const H = rows.length * RH + top + 22;
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'sc-chart', role: 'img', 'aria-label': 'Balkendiagramm: Objekte im All je Betreiber' });
  const sx = (v) => LW + (v / (Math.ceil(max / step) * step)) * (W - LW - RW);
  for (let v = 0; v <= Math.ceil(max / step) * step + 1e-9; v += step) {
    svg.append(sv('line', { x1: sx(v), x2: sx(v), y1: top, y2: H - 18, class: 'grid' }), sv('text', { x: sx(v), y: H - 4, 'text-anchor': 'middle', class: 'ax' }, fmt(v)));
  }
  rows.forEach((r, i) => {
    const y = top + i * RH;
    svg.append(sv('text', { x: LW - 8, y: y + 16, 'text-anchor': 'end', class: 'lbl' }, r.label));
    let acc = 0;
    r.vals.forEach((v, k) => {
      if (!v) return;
      const rect = sv('rect', { x: sx(acc), y: y + 4, width: Math.max(0.5, sx(acc + v) - sx(acc)), height: RH - 9, fill: colors[k], rx: 2 });
      rect.append(sv('title', {}, `${r.label} – ${names[k]}: ${fmt(v)}`));
      svg.append(rect);
      acc += v;
    });
    svg.append(sv('text', { x: sx(acc) + 6, y: y + 16, class: 'val' }, fmt(acc)));
  });
  return el('div', {}, svg, legend(names, colors));
}

function columnChart(years, names, colors, W = 900) {
  const H = 280, L = 44, R = 8, T = 10, B = 26;
  const max = Math.max(...years.map((e) => e.v.reduce((a, b) => a + b, 0)), 1);
  const step = niceStep(max, 5);
  const top = Math.ceil(max / step) * step;
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'sc-chart', role: 'img', 'aria-label': 'Säulendiagramm: Starts pro Jahr' });
  const bw = (W - L - R) / years.length;
  const sy = (v) => H - B - (v / top) * (H - T - B);
  for (let v = 0; v <= top + 1e-9; v += step) svg.append(sv('line', { x1: L, x2: W - R, y1: sy(v), y2: sy(v), class: 'grid' }), sv('text', { x: L - 6, y: sy(v) + 4, 'text-anchor': 'end', class: 'ax' }, fmt(v)));
  years.forEach((e, i) => {
    const x = L + i * bw;
    let acc = 0;
    const g = sv('g', { class: 'col' });
    e.v.forEach((v, k) => {
      if (!v) return;
      g.append(sv('rect', { x: x + 0.6, y: sy(acc + v), width: Math.max(0.6, bw - 1.2), height: sy(acc) - sy(acc + v), fill: colors[k] }));
      acc += v;
    });
    g.append(sv('rect', { x, y: T, width: bw, height: H - T - B, fill: 'transparent' }));
    g.append(sv('title', {}, `${e.y}: ${fmt(acc)} Starts (${names.map((n, k) => `${n} ${e.v[k]}`).join(', ')})`));
    svg.append(g);
    if (e.y % 10 === 0) svg.append(sv('text', { x: x + bw / 2, y: H - 8, 'text-anchor': 'middle', class: 'ax' }, String(e.y)));
  });
  return el('div', {}, el('div', { class: 'sc-chart-scroll' }, svg), legend(names, colors));
}
function legend(names, colors) {
  return el('ul', { class: 'eng-legend list' }, names.map((n, i) => el('li', { style: `--c:${colors[i]}`, text: n })));
}
function niceStep(max, n) {
  const raw = max / n;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

// =========================================================================================================
// Detail-Dialog (Steckbrief)
function createDialog() {
  const body = el('div', { class: 'sc-dlg-body' });
  const closeBtn = el('button', { type: 'button', class: 'eng-btn ghost icon sc-dlg-x', 'aria-label': 'Schließen', title: 'Schließen', text: '×' });
  const node = el('dialog', { class: 'sc-dlg', 'aria-labelledby': nextId('dlg') }, closeBtn, body);
  const titleId = node.getAttribute('aria-labelledby');
  closeBtn.addEventListener('click', () => node.close());
  node.addEventListener('click', (e) => { if (e.target === node) node.close(); });
  function open() {
    if (typeof node.showModal === 'function') { if (!node.open) node.showModal(); } else node.setAttribute('open', '');
    body.scrollTop = 0;
    closeBtn.focus({ preventScroll: true });
  }
  const dl = (pairs) => el('dl', { class: 'sc-facts' }, pairs.filter(([, v]) => v != null && v !== '' && v !== '–').map(([k, v]) => el('div', { class: 'sc-fact' }, el('dt', { text: k }), el('dd', {}, v))));

  function orbitPairs(r) {
    return [
      ['Bahnzentrum', CENTER_DE[r.center] || (/^\d+$/.test(r.center) ? `gekoppelt an NORAD ${r.center}` : r.center)],
      ['Bahnart', ORBITTYPE_DE[r.otype] || r.otype],
      ['Umlaufzeit', r.period != null ? `${fmt(r.period, 2)} min` : null],
      ['Bahnneigung', r.incl != null ? `${fmt(r.incl, 2)}°` : null],
      ['Perigäum', r.peri != null ? `${fmt(r.peri)} km` : null],
      ['Apogäum', r.apo != null ? `${fmt(r.apo)} km` : null],
      ['Radarquerschnitt', r.rcs != null ? `${fmt(r.rcs, 2)} m²` : null],
    ];
  }

  function mission(m) {
    clear(body);
    const t = SC_TYPES[m.typ];
    const satBox = el('div');
    put(body,
      el('header', { class: 'sc-dlg-h', style: `--c:${t.color}` },
        el('div', { class: 'sc-dlg-tags' }, typeBadge(m.typ), statusPill(m.status)),
        el('h3', { id: titleId, text: m.name }),
        el('p', { class: 'sc-dlg-sub', text: `${m.land} · ${m.betreiber}` })),
      el('p', { class: 'sc-dlg-lead', text: m.zweck }),
      el('p', { class: 'sc-dlg-st', text: `Status: ${m.statusText}` }),
      el('h4', { text: 'Steckbrief' }),
      dl([
        ['Start', `${fmtDate(m.start.datum)}`],
        ['Trägerrakete', m.start.rakete],
        ['Startplatz', m.start.ort],
        ['Ziel / Bahn', m.ziel],
        ['Masse', m.masse_kg != null ? `${fmtMass(m.masse_kg)}${m.masseQuelle ? ` (laut ${m.masseQuelle})` : ''}` : null],
        ['Elektrische Leistung', m.leistung_W != null ? `${fmt(m.leistung_W)} W (nominal, NSSDCA)` : null],
        ['Abmessungen', m.abmessungen],
        ['COSPAR-ID', m.cospar],
        ['NORAD-Nr.', m.norad ? String(m.norad) : null],
      ]),
      m.instrumente ? [el('h4', { text: 'Instrumente / Experimente (NSSDCA)' }),
        el('ul', { class: 'sc-chips' }, m.instrumente.map((i) => el('li', { text: i })), m.instrumenteMehr ? el('li', { class: 'more', text: `+ ${m.instrumenteMehr} weitere` }) : null)] : null,
      el('h4', { text: 'Bahndaten aus dem Gesamtkatalog' }), satBox,
      el('h4', { text: 'Quellen' }),
      el('ul', { class: 'sc-srcs' }, m.quellen.map((q) => el('li', {}, link(q)))));
    const fillSat = (data) => {
      clear(satBox);
      const r = data.byNorad.get(m.norad);
      if (!r) { satBox.append(el('p', { class: 'eng-hint', text: 'Kein SATCAT-Eintrag gefunden.' })); return; }
      satBox.append(dl([['Katalogname', r.name], ['Status', `${satStatus(r)}${r.decay ? ` (${fmtDate(r.decay)})` : ''}`], ...orbitPairs(r)]),
        el('p', { class: 'eng-hint', text: 'Bahnwerte laut SATCAT; bei Objekten jenseits der Erdbahn gibt der Katalog keine Bahnelemente an.' }));
    };
    if (satcatLoaded()) fillSat(satcatLoaded());
    else satBox.append(el('button', { type: 'button', class: 'eng-btn ghost small', text: 'SATCAT-Daten laden (≈ 7 MB)', onclick: (e) => { e.currentTarget.disabled = true; e.currentTarget.textContent = 'Lädt …'; loadSatcat().then(fillSat).catch(() => { clear(satBox); satBox.append(el('p', { class: 'eng-error', text: 'Katalog konnte nicht geladen werden.' })); }); } }));
    open();
  }

  function object(r) {
    clear(body);
    const cur = SPACECRAFT.find((m) => m.norad === r.norad);
    put(body,
      el('header', { class: 'sc-dlg-h', style: '--c:#6ea8ff' },
        el('div', { class: 'sc-dlg-tags' }, el('span', { class: `sc-type t-${r.ti}`, text: TYPE_DE[r.type] || r.type }), el('span', { class: `sc-pill ${r.decay ? 'off' : r.active ? 'ok' : 'go'}`, text: satStatus(r) })),
        el('h3', { id: titleId, text: r.name || '(ohne Namen)' }),
        el('p', { class: 'sc-dlg-sub', text: `${ownerName(r.owner)} · COSPAR ${r.cospar} · NORAD ${r.norad}` })),
      cur ? el('button', { type: 'button', class: 'eng-btn sc-dlg-cta', text: `Steckbrief „${cur.name}“ öffnen`, onclick: () => mission(cur) }) : null,
      el('h4', { text: 'Katalogdaten' }),
      dl([
        ['Objekttyp', TYPE_DE[r.type] || r.type],
        ['Betreiber / Land', `${ownerName(r.owner)} (${r.owner})`],
        ['Startdatum', fmtDate(r.launch)],
        ['Startplatz', r.site ? `${siteName(r.site)} (${r.site})` : null],
        ['Betriebsstatus', r.ops ? `${OPS_DE[r.ops] || r.ops}` : 'keine Angabe'],
        ['Verglüht / beendet am', r.decay ? fmtDate(r.decay) : null],
        ...orbitPairs(r),
      ]),
      el('h4', { text: 'Quelle' }),
      el('ul', { class: 'sc-srcs' }, el('li', {}, link({ name: `CelesTrak SATCAT – Eintrag ${r.norad}`, url: `https://celestrak.org/satcat/table-satcat.php?CATNR=${r.norad}` })),
        el('li', {}, link({ name: 'Erläuterung der SATCAT-Felder', url: SATCAT_INFO_URL }))));
    open();
  }
  return { node, mission, object };
}

export { SATCAT_URL };
