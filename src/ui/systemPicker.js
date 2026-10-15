// Auswahl aller Sternsysteme (Sonnensystem + Nachbarn bis MAX_LY) als Seitenleiste:
// Suche, Filter (alle / mit Planeten / Mehrfachsysteme), sortiert nach Entfernung.
import { SYSTEMS } from '../data/systems.js';
// Reichweite des Katalogs, auf volle 10 Lj aufgerundet
export const MAX_LY = Math.ceil(Math.max(...SYSTEMS.map((s) => s.distanceLy || 0)) / 10) * 10;

const fmtLy = (ly) => (ly === 0 ? 'hier' : `${ly.toLocaleString('de-DE', { maximumFractionDigits: 2 })} Lj`);
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function createSystemPicker(button, { solarSystem, onPick }) {
  const own = {
    id: solarSystem.id, name: solarSystem.name, distanceLy: 0, color: solarSystem.color, own: true,
    members: [{ colorHex: '#fff1c9' }], planets: new Array(8).fill({ inHz: false }), hzCount: 1,
  };
  const all = [own, ...SYSTEMS.map((s) => ({ ...s, hzCount: s.planets.filter((p) => p.inHz).length }))];

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
    <ol class="sp-list"></ol>`;
  document.body.appendChild(el);

  const list = el.querySelector('.sp-list');
  const input = el.querySelector('input');
  let filter = 'all';
  let current = null; // zuletzt gewähltes System (bleibt markiert)

  function render() {
    const q = norm(input.value.trim());
    const rows = all.filter((s) => (!q || norm(s.name).includes(q) || s.members?.some((m) => norm(m.name || '').includes(q)))
      && (filter === 'all' || (filter === 'planets' && s.planets.length) || (filter === 'multi' && s.members.length > 1)));
    list.innerHTML = rows.map((s) => `
      <li><button data-id="${s.id}" class="${s.own ? 'own' : ''} ${s.id === current ? 'on' : ''}" aria-current="${s.id === current}">
        <span class="sp-dots">${s.members.slice(0, 4).map((m) => `<i style="background:${m.colorHex || '#fff'}"></i>`).join('')}</span>
        <span class="sp-main">
          <strong>${s.name}</strong>
          <small>${s.members.length} ${s.members.length === 1 ? 'Stern' : 'Sterne'}${s.planets.length ? ` · ${s.planets.length} ${s.planets.length === 1 ? 'Planet' : 'Planeten'}` : ''}</small>
        </span>
        ${s.hzCount ? `<span class="sp-badge" title="Planet(en) in der habitablen Zone">HZ</span>` : ''}
        <span class="sp-dist">${fmtLy(s.distanceLy)}</span>
      </button></li>`).join('') || '<li class="muted small sp-empty">Kein System gefunden</li>';
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
  el.querySelector('.close').onclick = () => toggle(false);
  button.onclick = () => toggle();
  return { toggle };
}
