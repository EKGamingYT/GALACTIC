// Mission Control → Missions-Zeitleiste: zoom-/verschiebbare Zeitachse aller Raumfahrt-Meilensteine
// (historisch und geplant) mit Spuren je Zielkörper oder Agentur, Filtern, Detailkarte und Countdown.
// Alle Daten-/Fremdtexte werden ausschließlich per textContent gesetzt.
import './timeline.css';
import { MISSION_EVENTS, KINDS, STATUS, TARGETS, LANES } from '../../data/missions.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const DAY = 86400000;
const DOMAIN_MIN = Date.UTC(1955, 0, 1);
const DOMAIN_MAX = Date.UTC(2037, 0, 1);
const MIN_SPAN = 45 * DAY;
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const MONTHS_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const LANE_ORDER = ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'small', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
const PRIVATE = /SpaceX|Blue Origin|Virgin|Intuitive|Firefly|ispace|Astrobotic|SpaceIL|Boeing|AT&T|Advanced Space/;

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function sv(tag, attrs) {
  const n = document.createElementNS(SVGNS, tag);
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

// Zeitpunkt eines Ereignisses (unscharfe Daten auf die Periodenmitte) und Periodenanfang/-ende.
function parse(ev) {
  const [y, m = 1, d = 1] = ev.date.split('-').map(Number);
  if (ev.precision === 'year') return { t: Date.UTC(y, 6, 1), from: Date.UTC(y, 0, 1), to: Date.UTC(y + 1, 0, 1) };
  if (ev.precision === 'month') return { t: Date.UTC(y, m - 1, 15), from: Date.UTC(y, m - 1, 1), to: Date.UTC(y, m, 1) };
  const t = Date.UTC(y, m - 1, d);
  return { t, from: t, to: t + DAY };
}
const isoOf = (t) => new Date(t).toISOString().slice(0, 10);

function fmtDate(ev) {
  const [y, m, d] = ev.date.split('-').map(Number);
  if (ev.precision === 'year') return `${y}`;
  if (ev.precision === 'month') return `${MONTHS_LONG[m - 1]} ${y}`;
  return `${d}. ${MONTHS_LONG[m - 1]} ${y}`;
}
const fmtShort = (ev) => {
  const [y, m, d] = ev.date.split('-');
  return ev.precision === 'year' ? y : ev.precision === 'month' ? `${m}/${y}` : `${d}.${m}.${y}`;
};

const agencyLane = (a) => {
  if (PRIVATE.test(a)) return 'Privatunternehmen';
  if (/^NASA|JPL|US Army|US Navy|BMDO/.test(a)) return 'NASA / USA';
  if (/UdSSR|Roskosmos/.test(a)) return 'UdSSR / Roskosmos';
  if (/^ESA|CNES/.test(a)) return 'ESA / Europa';
  if (/CNSA|CMSA|CAS|^China/.test(a)) return 'China';
  if (/JAXA|ISAS/.test(a)) return 'Japan';
  if (/ISRO/.test(a)) return 'Indien';
  return 'Weitere';
};
const AGENCY_LANES = ['NASA / USA', 'UdSSR / Roskosmos', 'ESA / Europa', 'China', 'Japan', 'Indien', 'Privatunternehmen', 'Weitere'];

export function createTimelinePanel(container) {
  const events = MISSION_EVENTS.map((ev) => ({ ...ev, ...parse(ev), lane: TARGETS[ev.target]?.lane || 'earth', alane: agencyLane(ev.agency) }));

  const state = {
    laneMode: 'target', agency: '', country: '', target: '', status: '', q: '',
    t0: Date.UTC(1956, 0, 1), t1: Date.UTC(2036, 0, 1), selected: null, active: false,
  };
  let filtered = events;
  let timer = 0;
  let raf = 0;

  // --- Gerüst ---------------------------------------------------------------------------------
  const root = el('section', 'tl');
  const head = el('div', 'tl-head');
  const hTitle = el('div');
  hTitle.append(el('h2', null, 'Missions-Zeitleiste'),
    el('p', null, `${events.length} Starts, Landungen, Vorbeiflüge, Orbiteinschüsse und Missionsenden von 1957 bis in die 2030er – historische und geplante Ereignisse aller Raumfahrtnationen.`));
  const next = el('div', 'tl-next');
  next.setAttribute('aria-live', 'polite');
  const nextLabel = el('span', 'tl-next-label', 'Nächstes Ereignis');
  const nextVal = el('strong', 'tl-next-val', '–');
  const nextName = el('button', 'tl-next-name', '');
  nextName.type = 'button';
  next.append(nextLabel, nextVal, nextName);
  head.append(hTitle, next);

  // Filterleiste
  const bar = el('div', 'tl-card tl-bar');
  const mkSelect = (label, key, options) => {
    const wrap = el('label', 'tl-field');
    wrap.append(el('span', null, label));
    const s = el('select');
    s.append(new Option('Alle', ''));
    for (const [v, t] of options) s.append(new Option(t, v));
    s.addEventListener('change', () => { state[key] = s.value; applyFilter(); });
    wrap.append(s);
    return { wrap, s };
  };
  const uniq = (f) => [...new Set(events.map(f))].sort((a, b) => a.localeCompare(b, 'de'));
  const fAgency = mkSelect('Agentur', 'agency', uniq((e) => e.agency).map((a) => [a, a]));
  const fCountry = mkSelect('Land', 'country', uniq((e) => e.country).map((a) => [a, a]));
  const fTarget = mkSelect('Ziel', 'target', Object.keys(TARGETS).filter((k) => events.some((e) => e.target === k))
    .map((k) => [k, TARGETS[k].name]).sort((a, b) => a[1].localeCompare(b[1], 'de')));
  const fStatus = mkSelect('Status', 'status', Object.keys(STATUS).map((k) => [k, STATUS[k].name]));
  const searchWrap = el('label', 'tl-field tl-search');
  searchWrap.append(el('span', null, 'Suche'));
  const search = el('input');
  search.type = 'search';
  search.placeholder = 'Mission, Agentur, Ziel …';
  search.autocomplete = 'off';
  let qTimer = 0;
  search.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = search.value.trim().toLowerCase(); applyFilter(); }, 120); });
  searchWrap.append(search);

  const modeWrap = el('div', 'tl-field tl-mode');
  modeWrap.append(el('span', null, 'Spuren'));
  const seg = el('div', 'tl-seg');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Spuren gruppieren nach');
  const segBtns = [['target', 'Zielkörper'], ['agency', 'Agentur']].map(([v, t]) => {
    const b = el('button', 'tl-seg-btn', t);
    b.type = 'button';
    b.dataset.v = v;
    b.addEventListener('click', () => { state.laneMode = v; syncSeg(); render(); });
    seg.append(b);
    return b;
  });
  const syncSeg = () => segBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === state.laneMode)));
  syncSeg();
  modeWrap.append(seg);

  const reset = el('button', 'tl-btn tl-reset', 'Filter zurücksetzen');
  reset.type = 'button';
  reset.addEventListener('click', () => {
    for (const f of [fAgency, fCountry, fTarget, fStatus]) f.s.value = '';
    search.value = '';
    Object.assign(state, { agency: '', country: '', target: '', status: '', q: '' });
    applyFilter();
  });
  bar.append(modeWrap, fAgency.wrap, fCountry.wrap, fTarget.wrap, fStatus.wrap, searchWrap, reset);

  // Achse
  const axisCard = el('div', 'tl-card tl-axis-card');
  const axisTools = el('div', 'tl-axis-tools');
  const count = el('span', 'tl-count');
  const zoomBox = el('div', 'tl-zoom');
  const mkBtn = (t, label, fn) => { const b = el('button', 'tl-btn tl-btn-icon', t); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label; b.addEventListener('click', fn); zoomBox.append(b); return b; };
  mkBtn('−', 'Herauszoomen', () => zoomAt(1.6));
  mkBtn('+', 'Hineinzoomen', () => zoomAt(1 / 1.6));
  mkBtn('Heute', 'Auf heute zentrieren', () => centerOn(Date.now(), 12 * 365 * DAY));
  mkBtn('Alles', 'Gesamten Zeitraum zeigen', () => setView(Date.UTC(1956, 0, 1), Date.UTC(2036, 0, 1)));
  axisTools.append(count, zoomBox);

  const legend = el('div', 'tl-legend');
  for (const k of Object.keys(KINDS)) {
    const i = el('span', `tl-leg tl-k-${k}`);
    i.append(el('i', 'tl-dot'), document.createTextNode(KINDS[k].name));
    legend.append(i);
  }
  const lp = el('span', 'tl-leg tl-leg-plan'); lp.append(el('i', 'tl-dot'), document.createTextNode('geplant')); legend.append(lp);
  const lf = el('span', 'tl-leg tl-leg-fail'); lf.append(el('i', 'tl-dot'), document.createTextNode('gescheitert')); legend.append(lf);

  const axis = el('div', 'tl-axis');
  axis.tabIndex = 0;
  axis.setAttribute('role', 'application');
  axis.setAttribute('aria-label', 'Zeitachse – Mausrad oder Pinch zum Zoomen, Ziehen oder Pfeiltasten zum Verschieben, Plus/Minus zum Zoomen');
  const svg = sv('svg', { class: 'tl-svg' });
  axis.append(svg);
  const hint = el('p', 'tl-hint', 'Mausrad/Pinch: zoomen · Ziehen/←→: verschieben · +/−: Zoom · Klick auf Marker: Details');
  axisCard.append(axisTools, legend, axis, hint);

  // Detail + Liste
  const detail = el('div', 'tl-card tl-detail');
  detail.hidden = true;
  const listCard = el('div', 'tl-card tl-list-card');
  const listHead = el('h3', null, 'Ereignisse');
  const list = el('ol', 'tl-list');
  listCard.append(listHead, list);

  root.append(head, bar, axisCard, detail, listCard);
  container.append(root);

  // --- Filter --------------------------------------------------------------------------------
  function applyFilter() {
    const q = state.q;
    filtered = events.filter((e) =>
      (!state.agency || e.agency === state.agency) &&
      (!state.country || e.country === state.country) &&
      (!state.target || e.target === state.target) &&
      (!state.status || e.status === state.status) &&
      (!q || `${e.title} ${e.agency} ${e.country} ${TARGETS[e.target]?.name || ''} ${e.desc}`.toLowerCase().includes(q)));
    count.textContent = `${filtered.length} von ${events.length} Ereignissen`;
    if (state.selected && !filtered.includes(state.selected)) select(null);
    renderList();
    render();
  }

  // --- Ansicht / Zoom ------------------------------------------------------------------------
  function setView(t0, t1) {
    let span = Math.max(MIN_SPAN, Math.min(t1 - t0, DOMAIN_MAX - DOMAIN_MIN));
    let a = t0;
    if (t1 - t0 < MIN_SPAN) a = (t0 + t1) / 2 - span / 2;
    a = Math.max(DOMAIN_MIN, Math.min(a, DOMAIN_MAX - span));
    state.t0 = a; state.t1 = a + span;
    schedule();
  }
  const plotBox = () => {
    const w = axis.clientWidth || 600;
    const labelW = w < 520 ? 0 : 132;
    return { w, x0: labelW + 8, x1: w - 10 };
  };
  const xOf = (t, b) => b.x0 + ((t - state.t0) / (state.t1 - state.t0)) * (b.x1 - b.x0);
  const tOf = (x, b) => state.t0 + ((x - b.x0) / (b.x1 - b.x0)) * (state.t1 - state.t0);
  function zoomAt(factor, clientX) {
    const b = plotBox();
    const r = axis.getBoundingClientRect();
    const x = clientX == null ? (b.x0 + b.x1) / 2 : clientX - r.left;
    const tc = tOf(Math.max(b.x0, Math.min(b.x1, x)), b);
    const f = (tc - state.t0) / (state.t1 - state.t0);
    const span = Math.max(MIN_SPAN, Math.min((state.t1 - state.t0) * factor, DOMAIN_MAX - DOMAIN_MIN));
    setView(tc - f * span, tc - f * span + span);
  }
  function panBy(dxPx) {
    const b = plotBox();
    const dt = (dxPx / (b.x1 - b.x0)) * (state.t1 - state.t0);
    setView(state.t0 - dt, state.t1 - dt);
  }
  function centerOn(t, span = state.t1 - state.t0) { setView(t - span / 2, t + span / 2); }
  function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }

  axis.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { panBy(-e.deltaX); return; }
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomAt(Math.exp(Math.max(-1, Math.min(1, d / 300))), e.clientX);
  }, { passive: false });

  const pointers = new Map();
  let pinchDist = 0;
  let moved = 0;
  axis.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0;
    if (pointers.size === 2) { const [p, q] = [...pointers.values()]; pinchDist = Math.hypot(p.x - q.x, p.y - q.y); }
  });
  axis.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    if (pointers.size === 1) {
      const dx = cur.x - prev.x;
      moved += Math.abs(dx);
      if (moved > 4) {
        if (!axis.hasPointerCapture(e.pointerId)) axis.setPointerCapture(e.pointerId);
        axis.classList.add('is-drag');
        panBy(dx);
      }
    }
    pointers.set(e.pointerId, cur);
    if (pointers.size === 2) {
      const [p, q] = [...pointers.values()];
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (pinchDist > 0 && d > 0) zoomAt(pinchDist / d, (p.x + q.x) / 2);
      pinchDist = d;
      moved = 99;
    }
  });
  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (!pointers.size) axis.classList.remove('is-drag');
  };
  axis.addEventListener('pointerup', endPointer);
  axis.addEventListener('pointercancel', endPointer);
  axis.addEventListener('click', (e) => {
    if (moved > 4) return;
    const m = e.target.closest?.('[data-ev]');
    if (m) { select(events.find((x) => x.id === m.getAttribute('data-ev'))); }
  });
  axis.addEventListener('keydown', (e) => {
    const step = (plotBox().x1 - plotBox().x0) * 0.15;
    if (e.key === 'ArrowLeft') panBy(step);
    else if (e.key === 'ArrowRight') panBy(-step);
    else if (e.key === '+' || e.key === '=') zoomAt(1 / 1.4);
    else if (e.key === '-' || e.key === '_') zoomAt(1.4);
    else if (e.key === 'Home') setView(Date.UTC(1956, 0, 1), Date.UTC(2036, 0, 1));
    else return;
    e.preventDefault();
  });
  const ro = new ResizeObserver(() => schedule());
  ro.observe(axis);

  // --- Zeichnen ------------------------------------------------------------------------------
  function ticks() {
    const yrs = (state.t1 - state.t0) / (365.25 * DAY);
    const w = plotBox().x1 - plotBox().x0;
    const want = Math.max(2, w / 80);
    const steps = [1 / 12, 3 / 12, 6 / 12, 1, 2, 5, 10, 20];
    const step = steps.find((s) => yrs / s <= want) || 20;
    const out = [];
    const d0 = new Date(state.t0);
    if (step < 1) {
      const mStep = Math.round(step * 12);
      let y = d0.getUTCFullYear(); let m = Math.floor(d0.getUTCMonth() / mStep) * mStep;
      for (let i = 0; i < 400; i++) {
        const t = Date.UTC(y, m, 1);
        if (t > state.t1) break;
        if (t >= state.t0) out.push({ t, label: m === 0 ? `${y}` : MONTHS[m], major: m === 0 });
        m += mStep; if (m >= 12) { m -= 12; y++; }
      }
    } else {
      let y = Math.ceil(d0.getUTCFullYear() / step) * step;
      for (; Date.UTC(y, 0, 1) <= state.t1; y += step) out.push({ t: Date.UTC(y, 0, 1), label: `${y}`, major: y % (step * 5) === 0 || step >= 10 });
    }
    return out;
  }

  function render() {
    const b = plotBox();
    const narrow = b.x0 < 50;
    const laneKeys = state.laneMode === 'target' ? LANE_ORDER : AGENCY_LANES;
    const laneOf = (e) => (state.laneMode === 'target' ? e.lane : e.alane);
    const used = laneKeys.filter((k) => filtered.some((e) => laneOf(e) === k));
    const lanes = used.length ? used : laneKeys.slice(0, 1);
    const top = 26;
    const rowH = narrow ? 42 : 34;
    const H = top + lanes.length * rowH + 8;
    svg.setAttribute('viewBox', `0 0 ${b.w} ${H}`);
    svg.setAttribute('width', b.w);
    svg.setAttribute('height', H);
    svg.replaceChildren();

    const gGrid = sv('g', { class: 'tl-grid' });
    for (const tk of ticks()) {
      const x = xOf(tk.t, b);
      gGrid.append(sv('line', { x1: x, x2: x, y1: top - 6, y2: H - 4, class: tk.major ? 'is-major' : '' }));
      const tx = sv('text', { x: x + 3, y: 14, class: 'tl-tick' });
      tx.textContent = tk.label;
      gGrid.append(tx);
    }
    svg.append(gGrid);

    const gLanes = sv('g', { class: 'tl-lanes' });
    lanes.forEach((k, i) => {
      const y = top + i * rowH;
      gLanes.append(sv('rect', { x: 0, y, width: b.w, height: rowH, class: i % 2 ? 'tl-lane is-odd' : 'tl-lane' }));
      const label = state.laneMode === 'target' ? LANES[k] : k;
      const t = sv('text', { x: narrow ? 6 : 8, y: narrow ? y + 11 : y + rowH / 2 + 4, class: 'tl-lane-label' });
      t.textContent = label;
      gLanes.append(t);
    });
    svg.append(gLanes);

    const now = Date.now();
    if (now >= state.t0 && now <= state.t1) {
      const x = xOf(now, b);
      const g = sv('g', { class: 'tl-today' });
      g.append(sv('line', { x1: x, x2: x, y1: top - 4, y2: H - 4 }));
      const t = sv('text', { x: x + 4, y: top - 2 });
      t.textContent = 'heute';
      g.append(t);
      svg.append(g);
    }

    const gM = sv('g', { class: 'tl-marks' });
    const lastX = new Map();
    const subY = narrow ? [24, 33, 15] : [17, 9, 25];
    for (const e of filtered) {
      if (e.to < state.t0 || e.from > state.t1) continue;
      const li = lanes.indexOf(laneOf(e));
      if (li < 0) continue;
      const x = xOf(e.t, b);
      const arr = lastX.get(li) || [-1e9, -1e9, -1e9];
      let s = arr.findIndex((px) => x - px > 11);
      if (s < 0) s = arr.indexOf(Math.min(...arr));
      arr[s] = x; lastX.set(li, arr);
      const y = top + li * rowH + subY[s];
      const cls = `tl-m tl-k-${e.kind}${e.status === 'geplant' ? ' is-plan' : ''}${e.status === 'gescheitert' ? ' is-fail' : ''}${state.selected === e ? ' is-sel' : ''}`;
      const g = sv('g', { class: cls, 'data-ev': e.id, transform: `translate(${x.toFixed(1)} ${y})` });
      if (e.precision !== 'day') {
        const w = Math.max(0, xOf(e.to, b) - xOf(e.from, b));
        if (w > 10) g.append(sv('rect', { x: (xOf(e.from, b) - x).toFixed(1), y: -2, width: w.toFixed(1), height: 4, rx: 2, class: 'tl-span' }));
      }
      g.append(sv('circle', { r: 9, class: 'tl-hit' }));
      g.append(sv('circle', { r: e.status === 'geplant' ? 4.5 : 5, class: 'tl-mk' }));
      const ttl = sv('title');
      ttl.textContent = `${fmtShort(e)} · ${e.title} (${STATUS[e.status].name})`;
      g.append(ttl);
      gM.append(g);
    }
    svg.append(gM);
  }

  // --- Liste & Detail ------------------------------------------------------------------------
  const badge = (e) => el('span', `tl-badge is-${e.status}`, STATUS[e.status].name);
  function renderList() {
    const frag = document.createDocumentFragment();
    for (const e of filtered) {
      const li = el('li', 'tl-row');
      const b = el('button', `tl-row-btn tl-k-${e.kind}${state.selected === e ? ' is-sel' : ''}`);
      b.type = 'button';
      b.dataset.ev = e.id;
      b.append(el('i', `tl-dot${e.status === 'geplant' ? ' is-plan' : ''}${e.status === 'gescheitert' ? ' is-fail' : ''}`),
        el('span', 'tl-row-date', fmtShort(e)), el('span', 'tl-row-title', e.title),
        el('span', 'tl-row-meta', `${e.agency} · ${TARGETS[e.target]?.name || e.target}`), badge(e));
      li.append(b);
      frag.append(li);
    }
    if (!filtered.length) frag.append(el('li', 'tl-empty', 'Keine Ereignisse für diese Filter.'));
    list.replaceChildren(frag);
    listHead.textContent = `Ereignisse (${filtered.length})`;
  }
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ev]');
    if (!b) return;
    const ev = events.find((x) => x.id === b.dataset.ev);
    select(ev, true);
  });

  function select(ev, center = false) {
    state.selected = ev || null;
    list.querySelectorAll('.tl-row-btn.is-sel').forEach((n) => n.classList.remove('is-sel'));
    if (!ev) { detail.hidden = true; render(); return; }
    list.querySelector(`[data-ev="${ev.id}"]`)?.classList.add('is-sel');
    if (center && (ev.t < state.t0 || ev.t > state.t1)) centerOn(ev.t);
    else if (center) centerOn(ev.t);
    renderDetail(ev);
    render();
    detail.hidden = false;
    if (center) detail.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
  }

  function renderDetail(e) {
    const close = el('button', 'tl-btn tl-btn-icon tl-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Details schließen');
    close.addEventListener('click', () => select(null));
    const top = el('div', 'tl-detail-top');
    const kind = el('span', `tl-kind tl-k-${e.kind}`);
    kind.append(el('i', 'tl-dot'), document.createTextNode(KINDS[e.kind]?.name || e.kind));
    top.append(kind, badge(e), close);
    const h = el('h3', 'tl-detail-title', e.title);
    const dl = el('dl', 'tl-dl');
    const row = (k, v) => { dl.append(el('dt', null, k), el('dd', null, v)); };
    row('Datum', `${fmtDate(e)}${e.precision !== 'day' ? (e.precision === 'year' ? ' (nur Jahr bekannt)' : ' (nur Monat bekannt)') : ''}`);
    row('Agentur', e.agency);
    row('Land', e.country);
    row('Ziel', TARGETS[e.target]?.name || e.target);
    const p = el('p', 'tl-desc', e.desc);
    // Datensatz-Stand: geplante Termine in der Vergangenheit sind evtl. schon erfolgt oder verschoben
    if (e.status === 'geplant' && e.to < Date.now()) p.append(el('em', 'tl-stale', ' Hinweis: Der geplante Termin ist verstrichen – aktuellen Stand bitte in der Quelle prüfen.'));
    const actions = el('div', 'tl-actions');
    if (e.source && /^https:\/\//.test(e.source)) {
      const a = el('a', 'tl-src', 'Quelle öffnen');
      a.href = e.source;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      let host = '';
      try { host = new URL(e.source).hostname.replace(/^www\./, ''); } catch { /* ignorieren */ }
      a.append(el('small', null, host ? ` (${host})` : ''));
      actions.append(a);
    }
    if (TARGETS[e.target]?.goto) {
      const go = el('button', 'tl-btn tl-goto', 'Im Sonnensystem zeigen');
      go.type = 'button';
      go.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('galactic:goto', { detail: { date: isoOf(e.t), body: e.target } }));
      });
      actions.append(go);
    }
    detail.replaceChildren(top, h, dl, p, actions);
  }

  // --- Countdown -----------------------------------------------------------------------------
  function updateNext() {
    const now = Date.now();
    const up = events.filter((e) => e.to > now && e.status !== 'gescheitert')
      .sort((a, b) => (a.from - b.from) || (a.t - b.t));
    // Bevorzugt exakt datierte bzw. noch nicht begonnene Perioden; laufende Perioden (z. B. „2026“) nur als Rückfall.
    const ev = up.find((e) => e.from > now) || up[0];
    if (!ev) { nextVal.textContent = '–'; nextName.textContent = ''; return; }
    nextName.textContent = `${ev.title} · ${fmtDate(ev)}`;
    nextName.onclick = () => select(ev, true);
    if (ev.from <= now) { nextVal.textContent = ev.precision === 'year' ? `im Lauf von ${ev.date}` : 'in diesem Monat'; return; }
    const ms = ev.from - now;
    const days = Math.floor(ms / DAY);
    const ca = ev.precision !== 'day' ? 'ca. ' : '';
    if (ev.precision === 'day' && days < 2) {
      const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000);
      nextVal.textContent = `in ${h} h ${String(m).padStart(2, '0')} min`;
    } else nextVal.textContent = `in ${ca}${days.toLocaleString('de-DE')} ${days === 1 ? 'Tag' : 'Tagen'}`;
  }
  function syncTimer() {
    const run = state.active && document.visibilityState === 'visible';
    if (run && !timer) { updateNext(); timer = setInterval(updateNext, 30000); }
    else if (!run && timer) { clearInterval(timer); timer = 0; }
  }
  document.addEventListener('visibilitychange', syncTimer);

  // --- Start ---------------------------------------------------------------------------------
  updateNext();
  applyFilter();

  return {
    setActive(on) {
      state.active = !!on;
      syncTimer();
      if (on) { updateNext(); schedule(); }
    },
  };
}
