// Katalog der realen Raumfahrt-Orte eines Körpers (Landeplätze, Rover, Instrumente, Stationen).
// Vollbild-Einblendung mit allen Daten je Eintrag. Daten: src/data/sites.js (mit Quellen).
// Alle Werte werden per textContent gesetzt (kein innerHTML mit Daten) – XSS-sicher.
import { SITES } from '../data/sites.js';
import { SITE_KINDS } from '../views/map/sitesLayer.js';

export const sitesForBody = (bodyId) => SITES.filter((s) => s.body === bodyId);

const KIND_ORDER = ['station', 'landeplatz', 'rover', 'instrument', 'aufschlag', 'geplant'];
const fmtDeg = (lat, lon) => (lat == null || lon == null ? 'Orbit' : `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? 'O' : 'W'}`);
const fmtNum = (n) => n?.toLocaleString('de-DE');

const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
  }
  for (const c of kids) if (c != null) n.append(c);
  return n;
};

function row(label, value) {
  if (value == null || value === '') return null;
  return el('div', { class: 'sc-row' }, el('dt', { text: label }), el('dd', { text: String(value) }));
}

function card(s) {
  const c = SITE_KINDS[s.kind]?.color ?? '#fff';
  const dl = el('dl', { class: 'sc-facts' },
    row('Art', SITE_KINDS[s.kind]?.label ?? s.kind),
    row('Betreiber', [s.agency, s.country].filter(Boolean).join(' · ')),
    row('Jahr', s.year),
    row('Status', s.status),
    row('Position', fmtDeg(s.lat, s.lon)),
    s.orbit ? row('Orbit', [s.orbit.altitudeKm != null ? `${fmtNum(s.orbit.altitudeKm)} km Höhe` : null,
      s.orbit.periluneKm != null ? `${fmtNum(s.orbit.periluneKm)}–${fmtNum(s.orbit.apoluneKm)} km` : null,
      s.orbit.inclinationDeg != null ? `${s.orbit.inclinationDeg}° Neigung` : null,
      s.orbit.periodMin != null ? `${fmtNum(s.orbit.periodMin)} min Umlauf` : null,
      s.orbit.type].filter(Boolean).join(' · ')) : null,
    row('Masse', s.massKg != null ? `${fmtNum(s.massKg)} kg` : null),
    row('Größe', s.sizeM),
    row('Besatzung', s.crew),
    row('Instrumente', s.instruments?.join(', ')),
  );
  return el('article', { class: 'sc-card', style: `--c:${c}` },
    el('div', { class: 'sc-head' }, el('span', { class: 'sc-dot' }), el('h3', { text: s.name })),
    s.purpose ? el('p', { class: 'sc-purpose', text: s.purpose }) : null,
    dl,
    s.note ? el('p', { class: 'sc-note', text: s.note }) : null,
    s.source ? el('p', { class: 'sc-src' }, el('span', { text: 'Quelle: ' + s.source + ' ' }),
      s.sourceUrl ? el('a', { href: s.sourceUrl, target: '_blank', rel: 'noopener', text: '↗' }) : null) : null,
  );
}

export function openSiteCatalog(bodyId, bodyName) {
  const sites = sitesForBody(bodyId);
  if (!sites.length) return;
  sites.sort((a, b) => (KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)) || (a.year ?? 9999) - (b.year ?? 9999));

  const overlay = el('div', { class: 'sc-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Raumfahrt-Orte: ${bodyName}` });
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const counts = {};
  for (const s of sites) counts[s.kind] = (counts[s.kind] ?? 0) + 1;
  const legend = el('div', { class: 'sc-legend' }, ...KIND_ORDER.filter((k) => counts[k]).map((k) =>
    el('span', { class: 'sc-leg', style: `--c:${SITE_KINDS[k].color}` }, `${SITE_KINDS[k].label} ${counts[k]}`)));

  const panel = el('div', { class: 'sc-panel' },
    el('header', { class: 'sc-top' },
      el('div', {}, el('p', { class: 'sc-ey', text: 'Raumfahrt-Orte' }), el('h2', { text: bodyName }),
        el('p', { class: 'sc-sub', text: `${sites.length} Einträge · echte Missionen, mit Quellen` })),
      el('button', { class: 'sc-x', type: 'button', 'aria-label': 'Schließen', onclick: close }, '×')),
    legend,
    el('div', { class: 'sc-grid' }, ...sites.map(card)),
  );
  overlay.append(panel);
  document.body.append(overlay);
  panel.querySelector('.sc-x').focus();
}
