// Auswahl aller Sternsysteme (Sonnensystem + Nachbarn bis MAX_LY) als Seitenleiste:
// Suche, Schnellfilter, ausklappbare Detailfilter (Sterntyp, Planetentyp, Habitable Zone, Systemart,
// Entfernung) und Sortierung.
import { SYSTEMS } from '../data/systems.js';
import { exoplanetLook } from '../lib/exoplanet.js';
// Reichweite des Katalogs, auf volle 10 Lj aufgerundet
export const MAX_LY = Math.ceil(Math.max(...SYSTEMS.map((s) => s.distanceLy || 0)) / 10) * 10;

// Sternklasse aus dem Spektraltyp: O/B/A, F, G, K, M, Weißer Zwerg (D…), Brauner Zwerg (L/T/Y)
function starClass(m) {
  const sp = (m.spectralType || '').trim().toUpperCase();
  if (/^(D|WD)/.test(sp)) return 'D';
  const c = sp.replace(/^(ESD|USD|SD)/, '')[0];
  if (!c) return '?';
  if ('OBA'.includes(c)) return 'A';
  if ('FGKM'.includes(c)) return c;
  if ('LTY'.includes(c)) return 'L';
  return '?';
}
const STAR_CLASSES = [
  ['A', 'O/B/A', 'heiß, blau-weiß', '#cfdbff'], ['F', 'F', 'gelb-weiß', '#f8f7ff'], ['G', 'G', 'sonnenähnlich', '#fff1c9'],
  ['K', 'K', 'orange', '#ffd2a1'], ['M', 'M', 'Roter Zwerg', '#ffb467'], ['D', 'Weißer Zwerg', 'Sternrest', '#e8f0ff'], ['L', 'Brauner Zwerg', 'L/T/Y', '#c26a4a'],
];
const PLANET_KINDS = ['Gemäßigter Gesteinsplanet', 'Heißer Gesteinsplanet', 'Lavawelt', 'Eiswelt', 'Gasriese', 'Heißer Gasriese', 'Kalter Gasriese'];

const fmtLy = (ly) => (ly === 0 ? 'hier' : `${ly.toLocaleString('de-DE', { maximumFractionDigits: 2 })} Lj`);
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function createSystemPicker(button, { solarSystem, onPick }) {
  const own = {
    id: solarSystem.id, name: solarSystem.name, distanceLy: 0, color: solarSystem.color, own: true,
    members: [{ colorHex: '#fff1c9' }], planets: new Array(8).fill({ inHz: false }), hzCount: 1,
  };
  const all = [own, ...SYSTEMS.map((s) => {
    // Planetentypen wie in der 3D-Ansicht (Größe + Gleichgewichtstemperatur, Albedo 0,3)
    const kinds = new Set(s.planets.map((p) => {
      const host = s.members.find((m) => m.name === p.host);
      const teq = host?.L && p.aAu ? 254.9 * Math.pow(host.L, 0.25) / Math.sqrt(p.aAu) : 300;
      return exoplanetLook(p, teq).kind;
    }));
    return { ...s, hzCount: s.planets.filter((p) => p.inHz).length, classes: new Set(s.members.map(starClass)), kinds,
      vmin: Math.min(...s.members.map((m) => m.vmag ?? 99)) };
  })];
  own.classes = new Set(['G']);
  own.kinds = new Set(['Gemäßigter Gesteinsplanet', 'Heißer Gesteinsplanet', 'Gasriese', 'Kalter Gasriese']);
  own.vmin = -26.7;

  const el = document.createElement('aside');
  el.className = 'system-picker';
  el.hidden = true;
  el.innerHTML = `
    <header>
      <div>
        <p class="eyebrow">Sternsysteme</p>
        <h2>Sonnenumgebung</h2>
        <p class="muted small">${all.length} Systeme bis ${MAX_LY} Lichtjahre · nach Entfernung</p>
      </div>
      <button class="close" aria-label="Schließen" title="Schließen (Esc)">×</button>
    </header>
    <input type="search" placeholder="System filtern …" aria-label="Systeme filtern" autocomplete="off" spellcheck="false" />
    <div class="seg sp-filter" role="group" aria-label="Filter">
      <button data-f="all" class="on">Alle</button>
      <button data-f="planets">Mit Planeten</button>
      <button data-f="multi">Mehrfach</button>
    </div>
    <details class="sp-more">
      <summary>Filter &amp; Sortierung <span class="sp-active" hidden></span></summary>
      <p class="sp-h">Sterntyp</p>
      <div class="sp-chips" data-group="cls">${STAR_CLASSES.map(([k, l, d, c]) => `<button data-v="${k}" title="${d}"><i style="background:${c}"></i>${l}</button>`).join('')}</div>
      <p class="sp-h">Planetentyp <small>(Einordnung nach Größe/Temperatur)</small></p>
      <div class="sp-chips" data-group="kind">${PLANET_KINDS.map((k) => `<button data-v="${k}">${k}</button>`).join('')}</div>
      <p class="sp-h">Weitere</p>
      <div class="sp-chips" data-group="misc">
        <button data-v="hz">Planet in habitabler Zone</button><button data-v="single">Einzelstern</button><button data-v="bright">Mit bloßem Auge (≤ 6 mag)</button>
      </div>
      <label class="sp-range">Bis <b>${MAX_LY}</b> Lichtjahre<input type="range" min="5" max="${MAX_LY}" step="1" value="${MAX_LY}" /></label>
      <div class="sp-sort">Sortieren
        <select aria-label="Sortierung"><option value="dist">Entfernung</option><option value="name">Name</option><option value="planets">Anzahl Planeten</option><option value="bright">Helligkeit</option></select>
        <button class="sp-reset" type="button">Zurücksetzen</button>
      </div>
    </details>
    <p class="sp-count muted small"></p>
    <ol class="sp-list"></ol>`;
  document.body.appendChild(el);

  const list = el.querySelector('.sp-list');
  const input = el.querySelector('input');
  let filter = 'all';
  const sel = { cls: new Set(), kind: new Set(), misc: new Set() };
  let maxLy = MAX_LY, sortBy = 'dist';
  const range = el.querySelector('.sp-range input'), rangeOut = el.querySelector('.sp-range b');
  const sortSel = el.querySelector('.sp-sort select');
  const activeBadge = el.querySelector('.sp-active'), countEl = el.querySelector('.sp-count');
  const matches = (s) => (!sel.cls.size || [...sel.cls].some((c) => s.classes.has(c)))
    && (!sel.kind.size || [...sel.kind].some((k) => s.kinds.has(k)))
    && (!sel.misc.has('hz') || s.hzCount > 0)
    && (!sel.misc.has('single') || s.members.length === 1)
    && (!sel.misc.has('bright') || s.vmin <= 6)
    && s.distanceLy <= maxLy;
  const SORT = {
    dist: (a, b) => a.distanceLy - b.distanceLy,
    name: (a, b) => a.name.localeCompare(b.name, 'de'),
    planets: (a, b) => b.planets.length - a.planets.length || a.distanceLy - b.distanceLy,
    bright: (a, b) => a.vmin - b.vmin,
  };
  let current = null; // zuletzt gewähltes System (bleibt markiert)

  function render() {
    const q = norm(input.value.trim());
    const rows = all.filter((s) => (!q || norm(s.name).includes(q) || s.members?.some((m) => norm(m.name || '').includes(q)))
      && (filter === 'all' || (filter === 'planets' && s.planets.length) || (filter === 'multi' && s.members.length > 1))
      && matches(s)).sort(SORT[sortBy]);
    const nActive = sel.cls.size + sel.kind.size + sel.misc.size + (maxLy < MAX_LY ? 1 : 0) + (sortBy !== 'dist' ? 1 : 0);
    activeBadge.hidden = !nActive;
    activeBadge.textContent = nActive;
    countEl.textContent = `${rows.length.toLocaleString('de-DE')} Treffer`;
    // bei langen Listen nur die ersten 300 zeichnen (Suche/Filter grenzen weiter ein)
    const shown = rows.slice(0, 300);
    list.innerHTML = shown.map((s) => `
      <li><button data-id="${s.id}" class="${s.own ? 'own' : ''} ${s.id === current ? 'on' : ''}" aria-current="${s.id === current}">
        <span class="sp-dots">${s.members.slice(0, 4).map((m) => `<i style="background:${m.colorHex || '#fff'}"></i>`).join('')}</span>
        <span class="sp-main">
          <strong>${s.name}</strong>
          <small>${s.members.length} ${s.members.length === 1 ? 'Stern' : 'Sterne'}${s.planets.length ? ` · ${s.planets.length} ${s.planets.length === 1 ? 'Planet' : 'Planeten'}` : ''}</small>
        </span>
        ${s.hzCount ? `<span class="sp-badge" title="Planet(en) in der habitablen Zone">HZ</span>` : ''}
        <span class="sp-dist">${fmtLy(s.distanceLy)}</span>
      </button></li>`).join('') + (rows.length > shown.length ? `<li class="muted small sp-empty">… und ${rows.length - shown.length} weitere – Filter oder Suche nutzen</li>` : '')
      || '<li class="muted small sp-empty">Kein System gefunden</li>';
    list.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => {
      current = b.dataset.id;
      render();
      onPick(all.find((s) => s.id === current));
      if (window.matchMedia('(max-width: 720px)').matches) toggle(false);
    }));
  }

  function toggle(open = el.hidden) {
    el.hidden = !open;
    button.classList.toggle('on', open);
    button.setAttribute('aria-expanded', String(open));
    if (open) { render(); input.focus({ preventScroll: true }); }
  }

  input.addEventListener('input', render);
  // Esc schließt die Seitenleiste (auch aus dem Filterfeld heraus)
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) { e.stopPropagation(); toggle(false); button.focus({ preventScroll: true }); } });
  el.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => {
    filter = b.dataset.f;
    el.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('on', x === b));
    render();
  }));
  el.querySelectorAll('.sp-chips button').forEach((b) => (b.onclick = () => {
    const g = sel[b.parentElement.dataset.group];
    if (g.has(b.dataset.v)) g.delete(b.dataset.v); else g.add(b.dataset.v);
    b.classList.toggle('on', g.has(b.dataset.v));
    render();
  }));
  range.oninput = () => { maxLy = Number(range.value); rangeOut.textContent = maxLy; render(); };
  sortSel.onchange = () => { sortBy = sortSel.value; render(); };
  el.querySelector('.sp-reset').onclick = () => {
    Object.values(sel).forEach((g) => g.clear());
    el.querySelectorAll('.sp-chips button').forEach((b) => b.classList.remove('on'));
    maxLy = MAX_LY; range.value = MAX_LY; rangeOut.textContent = MAX_LY;
    sortBy = 'dist'; sortSel.value = 'dist';
    render();
  };
  el.querySelector('.close').onclick = () => toggle(false);
  button.onclick = () => toggle();
  return { toggle };
}
