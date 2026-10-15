// Bedienelemente innerhalb der Planetenkarte: Infokarte, Schalter (Gitter/Namen/2D), Zoom- und Kompass-Tasten,
// Positionsanzeige mit Maßstab und Merkmals-Karte. Reines DOM, Stil in src/map.css.
import { CLASSES } from './featureTypes.js';
import { fmtKm, fmtLat, fmtLon, nfmt } from './geo.js';
import { PLACE_LANGS } from './places.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* privater Modus */ } },
};
const LANG_KEY = 'galactic.map.lang';
const touch = () => window.matchMedia?.('(pointer: coarse)').matches;

export function createMapUI(root, { body, prefs, on }) {
  const compact = window.matchMedia?.('(max-width: 720px)').matches;
  const open = store.get('galactic.map.info') ?? (compact ? '0' : '1');
  const hints = touch()
    ? ['Wischen: Globus drehen', 'Zwei Finger kneifen: zoomen', 'Zwei Finger hoch/runter: kippen', 'Doppeltippen: dorthin fliegen']
    : ['Ziehen: Globus drehen', 'Mausrad: zum Cursor zoomen', 'Doppelklick: dorthin fliegen', 'Strg + Ziehen oder Mittelklick: kippen', 'Rechts ziehen: stufenlos zoomen'];

  let lang = store.get(LANG_KEY);
  if (!PLACE_LANGS.some(([c]) => c === lang)) lang = 'de';

  root.innerHTML = `
    <div class="map-left">
      <section class="map-info" data-open="${open}">
        <button class="mi-head" aria-expanded="${open === '1'}" title="Infokarte ein-/ausklappen">
          <span class="mi-eyebrow">Karte</span><span class="mi-title">${esc(body.name)}</span><span class="mi-caret" aria-hidden="true">▾</span>
        </button>
        <div class="mi-body">
          <dl>
            <dt>Radius</dt><dd>${nfmt(body.radiusKm, body.radiusKm < 10 ? 2 : 1)} km</dd>
            <dt>Ebene</dt><dd class="mi-layer"></dd>
            <dt>Quelle</dt><dd class="mi-credit"></dd>
            <dt class="mi-names-k" hidden>Namen</dt><dd class="mi-names" hidden></dd>
            <dt class="mi-places-k" hidden>Namen</dt><dd class="mi-places" hidden></dd>
          </dl>
          <ul class="mi-hints">${hints.map((h) => `<li>${h}</li>`).join('')}</ul>
          <div class="mi-legend" hidden>${Object.values(CLASSES).filter((c) => c.de !== CLASSES.other.de)
            .map((c) => `<span style="--c:${c.color}">${c.de}</span>`).join('')}</div>
        </div>
      </section>
      <div class="map-chips" role="group" aria-label="Kartenebenen">
        <button class="map-chip" data-key="grid" aria-pressed="${prefs.grid}" title="Breiten- und Längengitter">Gitter</button>
        <button class="map-chip" data-key="names" aria-pressed="${prefs.names}" title="Offizielle IAU-Ortsnamen" hidden>Namen</button>
        <button class="map-chip" data-key="places" aria-pressed="false" title="Ortsnamen (Staaten und Städte) einblenden" hidden>Ortsnamen</button>
        <select class="map-select" aria-label="Sprache der Ortsnamen" title="Sprache der Ortsnamen" hidden>${PLACE_LANGS
          .map(([c, n]) => `<option value="${c}"${c === lang ? ' selected' : ''}>${n}</option>`).join('')}</select>
        <button class="map-chip" data-key="flat" aria-pressed="false" title="Zwischen Globus und flacher Karte wechseln">Flach</button>
      </div>
    </div>
    <div class="map-right">
      <button class="map-btn map-compass" title="Norden nach oben, Ansicht aufrichten" aria-label="Kompass: Norden nach oben">
        <svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 6l5.5 15h-11z" fill="#ff7a6b"/><path d="M20 34l5.5-13h-11z" fill="#c8d2e8"/><circle cx="20" cy="21" r="1.8" fill="#0d1426"/><text x="20" y="5.2" text-anchor="middle" font-size="6.5" font-weight="700" fill="#e8eefc">N</text></svg>
      </button>
      <button class="map-btn" data-zoom="1" title="Heranzoomen" aria-label="Heranzoomen">+</button>
      <button class="map-btn" data-zoom="-1" title="Herauszoomen" aria-label="Herauszoomen">−</button>
      <button class="map-btn map-home" title="Ganzer Globus" aria-label="Ganzer Globus">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><ellipse cx="12" cy="12" rx="3.7" ry="8.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3.5 12h17" stroke="currentColor" stroke-width="1.3"/></svg>
      </button>
    </div>
    <div class="map-hud" aria-live="off">
      <div class="mh-row"><span class="mh-k">Cursor</span><span class="mh-coord">–</span></div>
      <div class="mh-row"><span class="mh-scale"><i></i><span>–</span></span><span class="mh-alt"></span></div>
    </div>
    <div class="map-feature" hidden></div>`;

  const q = (s) => root.querySelector(s);
  const info = q('.map-info');
  q('.mi-head').onclick = () => {
    const next = info.dataset.open === '1' ? '0' : '1';
    info.dataset.open = next;
    q('.mi-head').setAttribute('aria-expanded', next === '1');
    store.set('galactic.map.info', next);
  };

  root.querySelectorAll('.map-chip').forEach((b) => {
    b.onclick = () => {
      const pressed = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', pressed);
      on.toggle(b.dataset.key, pressed);
    };
  });
  root.querySelectorAll('[data-zoom]').forEach((b) => (b.onclick = () => on.zoom(Number(b.dataset.zoom))));
  const langSel = q('.map-select');
  langSel.onchange = () => { lang = langSel.value; store.set(LANG_KEY, lang); on.lang?.(lang); };
  q('.map-home').onclick = on.home;
  q('.map-compass').onclick = on.north;

  const compass = q('.map-compass svg');
  const coord = q('.mh-coord');
  const coordK = q('.mh-k');
  const scaleBar = q('.mh-scale i');
  const scaleTxt = q('.mh-scale span');
  const alt = q('.mh-alt');
  const feat = q('.map-feature');
  let lastHeading = NaN;

  return {
    setLayer(layer) {
      q('.mi-layer').textContent = layer.name;
      const under = typeof layer.underlay === 'object' ? layer.underlay.credit : '';
      q('.mi-credit').textContent = [layer.credit, ...(layer.overlays ?? []).map((o) => o.credit), under].filter(Boolean).join(' · ');
    },
    setHeading(deg) {
      deg = ((((deg + 180) % 360) + 360) % 360) - 180; // −180…180: kein Sprung 0°/360°
      if (Math.abs(deg - lastHeading) < 0.2) return;
      lastHeading = deg;
      compass.style.transform = `rotate(${-deg}deg)`;
    },
    setCoord(lat, lon, hovering) {
      coordK.textContent = hovering ? 'Cursor' : 'Mitte';
      coord.textContent = lat === null ? '–' : `${fmtLat(lat)} · ${fmtLon(lon)}`;
    },
    setScale(px, label) {
      scaleBar.style.width = `${px}px`;
      scaleTxt.textContent = label;
    },
    setAltitude(km) { alt.textContent = km === null ? '' : `Höhe ${fmtKm(km)}`; },
    setNames({ available, count, total }) {
      q('[data-key="names"]').hidden = !available;
      q('.mi-names-k').hidden = q('.mi-names').hidden = !available || !count;
      q('.mi-legend').hidden = !available || !count;
      if (count) {
        q('.mi-names').textContent = `IAU · USGS Gazetteer · ${count.toLocaleString('de-DE')} von ${total.toLocaleString('de-DE')} Namen`;
      }
    },
    getLang: () => lang,
    // Ortsnamen der Erde: Schalter + Sprachwahl; Hinweis zur Quelle bzw. zur Beschriftung der Kacheln
    setPlaces({ available, on, tileNames }) {
      q('[data-key="places"]').hidden = langSel.hidden = !available;
      q('[data-key="places"]').setAttribute('aria-pressed', !!on);
      langSel.disabled = !on;
      q('.mi-places-k').hidden = q('.mi-places').hidden = !available;
      q('.mi-places').textContent = tileNames
        ? 'Die Kacheln dieser Ebene tragen OSM-Namen in der jeweiligen Landessprache. Ortsnamen in Wunschsprache: Schalter „Ortsnamen“ (Natural Earth, gemeinfrei).'
        : 'Natural Earth (gemeinfrei) · Staaten und Städte, Sprache über die Auswahl wählbar';
    },
    setFlat(flat) { q('[data-key="flat"]').setAttribute('aria-pressed', flat); },
    showFeature(f) {
      if (!f) { feat.hidden = true; return; }
      feat.hidden = false;
      feat.innerHTML = `
        <button class="mf-x" aria-label="Schließen">×</button>
        <p class="mf-type" style="--c:${CLASSES[f.cls].color}">${esc(f.de)}</p>
        <h3>${esc(f.name)}</h3>
        <p class="mf-meta">Ø ${fmtKm(f.km)} · ${fmtLat(f.lat)} · ${fmtLon(f.lon)}</p>
        <div class="mf-actions">
          <button class="mf-fly">Hinfliegen</button>
          ${f.gid ? `<a href="https://planetarynames.wr.usgs.gov/Feature/${f.gid}" target="_blank" rel="noopener">Gazetteer ↗</a>` : ''}
        </div>
        <p class="mf-src">Name: IAU, Quelle USGS Gazetteer of Planetary Nomenclature</p>`;
      feat.querySelector('.mf-x').onclick = on.closeFeature;
      feat.querySelector('.mf-fly').onclick = () => on.flyToFeature(f);
    },
  };
}
