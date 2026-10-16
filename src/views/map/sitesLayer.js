// Reale Raumfahrt-Orte auf der Planeten-/Mondkarte: Landeplätze, Rover, zurückgelassene Instrumente,
// Aufschlagstellen und (für Orbitstationen) ein Hinweis. Daten: src/data/sites.js (mit Quellen).
// Eigene, umschaltbare Ebene mit Detail-Einblendung; getrennt von der nutzereigenen Stationsplanung.
import { Cartesian3, Color, HeightReference, LabelStyle, VerticalOrigin } from 'cesium';
import { SITES } from '../../data/sites.js';

export const SITE_KINDS = {
  landeplatz: { label: 'Landeplatz', color: '#6ea8ff' },
  rover: { label: 'Rover', color: '#3ddc84' },
  instrument: { label: 'Instrument', color: '#ffcc55' },
  station: { label: 'Station', color: '#b98cff' },
  aufschlag: { label: 'Aufschlag', color: '#ff6b6b' },
  geplant: { label: 'Geplant', color: '#9aa7b8' },
};
const col = (k) => Color.fromCssColorString(SITE_KINDS[k]?.color ?? '#ffffff');

export const sitesFor = (bodyId) => SITES.filter((s) => s.body === bodyId);
// Orte mit Oberflächenposition (Marker auf der Karte); Orbitstationen haben lat/lon = null
export const surfaceSitesFor = (bodyId) => sitesFor(bodyId).filter((s) => s.lat != null && s.lon != null);

const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
  }
  for (const c of kids) if (c != null) n.append(c);
  return n;
};
const fmtDeg = (lat, lon) => `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? 'O' : 'W'}`;

export function createSitesLayer({ viewer, body, ellipsoid, root, hasTerrain }) {
  const { scene, camera, entities } = viewer;
  const surface = surfaceSitesFor(body.id);
  const items = new Map(); // entity.id → site
  const drawn = [];
  let visible = true;

  const pos = (lat, lon) => Cartesian3.fromDegrees(lon, lat, 0, ellipsoid);
  function draw() {
    for (const e of drawn) entities.remove(e);
    drawn.length = 0;
    if (!visible) { scene.requestRender(); return; }
    for (const s of surface) {
      const c = col(s.kind);
      const e = entities.add({
        position: pos(s.lat, s.lon),
        point: { pixelSize: 9, color: c, outlineColor: Color.BLACK, outlineWidth: 1.5,
          heightReference: hasTerrain ? HeightReference.CLAMP_TO_GROUND : HeightReference.NONE, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: s.name, font: '600 12px Inter, system-ui, sans-serif', fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE, verticalOrigin: VerticalOrigin.BOTTOM, pixelOffset: { x: 0, y: -11 },
          disableDepthTestDistance: Number.POSITIVE_INFINITY, scaleByDistance: undefined, translucencyByDistance: undefined },
      });
      items.set(e.id, s);
      drawn.push(e);
    }
    scene.requestRender();
  }

  // Detail-Einblendung (eigene kleine Box, getrennt vom Merkmals-Popup der Karte)
  const box = el('aside', { class: 'site-pop', hidden: '' });
  root.append(box);
  function showSite(s) {
    box.hidden = false;
    const c = SITE_KINDS[s.kind]?.color ?? '#fff';
    box.replaceChildren(
      el('button', { class: 'site-x', type: 'button', 'aria-label': 'Schließen', onclick: () => { box.hidden = true; } }, '×'),
      el('p', { class: 'site-kind', style: `--c:${c}` }, `${SITE_KINDS[s.kind]?.label ?? s.kind}${s.status ? ' · ' + s.status : ''}`),
      el('h3', { text: s.name }),
      el('p', { class: 'site-meta', text: `${s.agency ?? ''}${s.country ? ' · ' + s.country : ''}${s.year ? ' · ' + s.year : ''}` }),
      el('p', { class: 'site-meta', text: fmtDeg(s.lat, s.lon) }),
      s.purpose ? el('p', { class: 'site-desc', text: s.purpose }) : null,
      s.instruments?.length ? el('p', { class: 'site-desc', text: 'Instrumente: ' + s.instruments.join(', ') }) : null,
      s.note ? el('p', { class: 'site-note', text: s.note }) : null,
      el('div', { class: 'site-actions' },
        el('button', { type: 'button', onclick: () => camera.flyTo({ destination: Cartesian3.fromDegrees(s.lon, s.lat, 60000, ellipsoid), duration: 1.4 }) }, 'Hinfliegen'),
        s.sourceUrl ? el('a', { href: s.sourceUrl, target: '_blank', rel: 'noopener', text: 'Quelle ↗' }) : el('span', { class: 'site-src', text: s.source ?? '' })),
    );
  }

  draw();
  return {
    // Klick auf der Karte: durchsucht ALLE Objekte am Punkt (ein IAU-Namensetikett kann über dem Marker liegen)
    pickAt(pos) {
      if (!visible) return false;
      for (const p of scene.drillPick(pos, 8)) {
        const s = items.get(p?.id?.id ?? p?.id);
        if (s) { showSite(s); return true; }
      }
      return false;
    },
    setVisible(v) { visible = v; draw(); },
    count: surface.length,
    dispose() { for (const e of drawn) entities.remove(e); box.remove(); },
  };
}
