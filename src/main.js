import './style.css';
import { BODIES, bodyById, mappedBodies } from './data/bodies.js';
import { SOLAR_SYSTEM, HABITABLE_ZONE } from './data/solarsystem.js';
import { SMALL_BODIES } from './views/system.js';
import { moonBodies } from './views/moons.js';
import { heliocentricPosition } from './lib/orbits.js';
import { TEXTURES } from './data/textures.js';
import { createClock } from './lib/time.js';
import { createSystemView } from './views/system.js';
import { createGlobeView } from './views/globe.js';
import { createSkyView } from './views/sky.js';
import { createTimebar } from './ui/timebar.js';
import { placeName, nearbyArticles } from './lib/lexicon.js';

const $ = (sel) => document.querySelector(sel);
const panel = $('#panel');
const AU_KM = 149597870.7;

const fmt = (n, unit = '', digits) =>
  n === null || n === undefined
    ? '–'
    : `${n.toLocaleString('de-DE', digits !== undefined ? { maximumFractionDigits: digits } : {})}${unit}`;

function moonDetails(m) {
  const FRAME = { ecliptic: 'Ekliptik', laplace: 'Laplace-Ebene', equatorial: 'Äquator des Planeten' };
  return `
    <dl class="facts">
      <dt>Typ</dt><dd>${m.type}</dd>
      <dt>Radius</dt><dd>${fmt(m.radiusKm, ' km', 1)}</dd>
      <dt>Abstand zum Planeten</dt><dd>${fmt(m.aKm, ' km', 0)}</dd>
      <dt>Umlaufzeit</dt><dd>${fmt(m.periodDays, ' Tage', 2)}${m.retrograde ? ' <small>(rückläufig)</small>' : ''}</dd>
      <dt>Exzentrizität</dt><dd>${fmt(m.e, '', 3)}</dd>
      <dt>Bahnneigung</dt><dd>${fmt(m.iDeg, '°', 1)} <small>(${FRAME[m.frameCode] ?? m.frame})</small></dd>
      ${m.densityGcm3 ? `<dt>Dichte</dt><dd>${fmt(m.densityGcm3, ' g/cm³', 2)}</dd>` : ''}
      ${m.albedo ? `<dt>Albedo</dt><dd>${fmt(m.albedo, '', 2)}</dd>` : ''}
    </dl>`;
}

function bodyDetails(body) {
  if (body.isMoon) return moonDetails(body);
  return `
    <dl class="facts">
      <dt>Typ</dt><dd>${body.type}</dd>
      <dt>Radius</dt><dd>${fmt(body.radiusKm, ' km', 1)}${body.radiusSource === 'Literaturwert' ? ' <small>(Lit.)</small>' : ''}</dd>
      ${body.kepler ? `
      <dt>Umlaufzeit</dt><dd>${fmt(body.periodYears, ' Jahre', 1)}</dd>
      <dt>Bahnneigung</dt><dd>${fmt(body.kepler.i, '°', 1)}</dd>
      <dt>Exzentrizität</dt><dd>${fmt(body.kepler.e, '', 3)}</dd>
      <dt>Rotation</dt><dd>${fmt(body.rotationHours, ' h', 2)}</dd>` : `
      <dt>Schwerkraft</dt><dd>${fmt(body.gravity, ' m/s²')}</dd>
      <dt>Tageslänge</dt><dd>${fmt(body.dayHours, ' h')}</dd>
      <dt>Mittlere Temp.</dt><dd>${fmt(body.meanTempC, ' °C')}</dd>`}
      <dt>Monde</dt><dd>${fmt(body.moons)}</dd>
      ${body.elements || body.kepler ? `
      <dt>Abstand zur Sonne</dt><dd data-live="sun">–</dd>
      <dt>Sonneneinstrahlung</dt><dd data-live="flux">–</dd>
      ${body.id !== 'earth' ? '<dt>Abstand zur Erde</dt><dd data-live="earth">–</dd>' : ''}` : ''}
    </dl>`;
}

// Live-Werte im Panel (ändern sich mit der eingestellten Zeit)
let panelBody = null;
function updatePanelLive() {
  if (!(panelBody?.elements || panelBody?.kepler) || panel.classList.contains('hidden')) return;
  const date = clock.date();
  const p = heliocentricPosition(panelBody, date);
  const e = heliocentricPosition(bodyById('earth'), date);
  const rSun = Math.hypot(p.x, p.y, p.z);
  const rEarth = Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z);
  const show = (au) => `${fmt(au, ' AE', 3)} <small>(${fmt(au * AU_KM / 1e6, ' Mio. km', 1)})</small>`;
  const sun = panel.querySelector('[data-live=sun]');
  const earth = panel.querySelector('[data-live=earth]');
  if (sun) sun.innerHTML = show(rSun);
  // Solarkonstante 1361 W/m² bei 1 AE, nimmt mit 1/r² ab
  const flux = panel.querySelector('[data-live=flux]');
  if (flux) flux.innerHTML = `${fmt(1361 / (rSun * rSun), ' W/m²', rSun > 5 ? 2 : 0)} <small>(${fmt(100 / (rSun * rSun), ' % der Erde', rSun > 5 ? 2 : 0)})</small>`;
  if (earth) earth.innerHTML = show(rEarth);
}

function showPanel(html) {
  panel.innerHTML = `<button class="close" aria-label="Schließen">×</button>${html}`;
  panel.classList.remove('hidden');
  panel.querySelector('.close').onclick = () => {
    panel.classList.add('hidden');
    panelBody = null;
    system.select(null);
  };
}

// Panel für das ganze Sonnensystem (in der Sternansicht anklickbar)
function showSystemPanel() {
  panelBody = null;
  system.select(null);
  const date = clock.date();
  const [hzIn, hzOut] = HABITABLE_ZONE.conservative;
  const inHz = BODIES.filter((b) => b.elements).map((b) => {
    const p = heliocentricPosition(b, date);
    return { b, r: Math.hypot(p.x, p.y, p.z) };
  }).filter(({ r }) => r >= hzIn && r <= hzOut);
  const row = ([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`;
  showPanel(`
    <p class="eyebrow">${SOLAR_SYSTEM.type}</p>
    <h2 style="--accent:${SOLAR_SYSTEM.color}">${SOLAR_SYSTEM.name}</h2>
    <dl class="facts facts-wide">${SOLAR_SYSTEM.facts.map(row).join('')}
      <dt>In der habitablen Zone</dt><dd>${inHz.length
        ? inHz.map(({ b, r }) => `${b.name} <small>(${fmt(r, ' AE', 2)})</small>`).join(', ')
        : 'derzeit kein Planet'}</dd>
    </dl>
    <p class="eyebrow">Lage im Universum</p>
    <dl class="facts facts-wide">${SOLAR_SYSTEM.galaxy.map(row).join('')}</dl>
    <p class="muted small">Habitable Zone nach Kopparapu et al. (2013/14): Bereich, in dem flüssiges Wasser
    auf der Oberfläche eines erdähnlichen Planeten möglich ist (grünes Band in der Systemansicht).
    Quellen: NASA Sun Fact Sheet, IAU 2015, GRAVITY Collaboration 2019, IERS (ICRF3).</p>`);
}

function selectBody(body) {
  if (body.id === SOLAR_SYSTEM.id) return showSystemPanel();
  panelBody = body;
  system.select(body.id);
  const children = (body.children || []).map(bodyById);
  showPanel(`
    <p class="eyebrow">${body.type}</p>
    <h2 style="--accent:${body.color}">${body.name}</h2>
    ${body.description ? `<p class="desc">${body.description}</p>` : ''}
    ${TEXTURES[body.id]?.artistic ? '<p class="muted small">Oberfläche: künstlerische Darstellung – es gibt noch keine Nahaufnahmen.</p>' : ''}
    ${bodyDetails(body)}
    <div class="actions">
      ${body.elements || body.kepler || body.id === 'sun' || body.major ? `<button data-act="focus">Heranfliegen</button>` : ''}
      ${body.maps ? `<a class="primary" href="#/body/${body.id}">Karte öffnen</a>` : ''}
      ${children.filter((c) => c.maps).map((c) => `<a href="#/body/${c.id}">${c.name}-Karte</a>`).join('')}
    </div>
    <p class="muted small">${body.isMoon
      ? 'Quelle: NASA/JPL Solar System Dynamics – mittlere Bahnelemente und physikalische Parameter der Monde. Abstände in der Ansicht logarithmisch gestaucht.'
      : body.kepler
      ? `Quelle: JPL Small-Body Database (${body.fullname}). Bahn als Zweikörper-Näherung – bei Kometen über Jahrzehnte ungenau.`
      : 'Quelle: NASA Planetary Fact Sheet · Bahnen: JPL (Standish)'}</p>`);
  panel.querySelector('[data-act="focus"]')?.addEventListener('click', () => system.focus(body.id));
  updatePanelLive();
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

async function pickPoint(body, lat, lon) {
  panelBody = null;
  const isEarth = body.id === 'earth';
  showPanel(`
    <p class="eyebrow">${body.name} · Punktabfrage</p>
    <h2 style="--accent:${body.color}">${lat.toFixed(3)}°, ${lon.toFixed(3)}°</h2>
    <dl class="facts">
      <dt>Breite</dt><dd>${lat.toFixed(4)}°</dd>
      <dt>Länge</dt><dd>${lon.toFixed(4)}°</dd>
    </dl>
    ${isEarth ? '<div class="lexicon"><p class="muted small">Lexikon wird geladen …</p></div>' : ''}
    <p class="muted small">Weitere Datenebenen für diesen Punkt (Höhe, Temperatur,
    Bodenzusammensetzung) folgen.</p>`);
  if (!isEarth) return;

  const box = panel.querySelector('.lexicon');
  try {
    const [place, articles] = await Promise.all([placeName(lat, lon), nearbyArticles(lat, lon)]);
    if (!box.isConnected) return; // Panel inzwischen geschlossen/gewechselt
    box.innerHTML = `
      ${place ? `<p class="place">${esc(place)}</p>` : ''}
      ${articles.map((a, i) => `
        <div class="article">
          <a href="${a.url}" target="_blank" rel="noopener">${esc(a.title)}</a>
          <span class="muted small"> · ${a.distKm.toFixed(1)} km</span>
          ${i === 0 && a.extract ? `<p class="small">${esc(a.extract)}</p>` : ''}
        </div>`).join('') || '<p class="muted small">Keine Wikipedia-Artikel in der Nähe.</p>'}
      <p class="muted small">Quellen: OpenStreetMap Nominatim · Wikipedia (CC BY-SA)</p>`;
  } catch {
    if (box.isConnected) box.innerHTML = '<p class="muted small">Lexikon gerade nicht erreichbar.</p>';
  }
}

// --- Ansichten ---------------------------------------------------------------
const clock = createClock();
const system = createSystemView($('#view-system'), { onSelect: selectBody });
const layerBar = document.createElement('div');
layerBar.className = 'layer-bar';
const mapStatus = document.createElement('div');
mapStatus.className = 'map-status';
const globe = createGlobeView($('#view-body'), {
  onPick: pickPoint,
  onStatus: (text) => { mapStatus.textContent = text; mapStatus.hidden = !text; },
  // Ebenen-Umschalter der aktuellen Karte (z. B. Farbe / Relief / Infrarot)
  onLayers: (body, active) => {
    layerBar.innerHTML = `<div class="seg">${body.maps
      .map((m, i) => `<button data-i="${i}" class="${i === active ? 'on' : ''}">${m.name}</button>`).join('')}</div>`;
    layerBar.querySelectorAll('button').forEach((b) => (b.onclick = () => globe.setLayer(Number(b.dataset.i))));
  },
});
createSkyView($('#view-sky'));

createTimebar($('#view-system'), clock);
clock.onChange(() => {
  system.setDate(clock.date());
  updatePanelLive();
});

// Darstellung: Bahnmodus, Bereich, Ebenen
const controls = document.createElement('div');
controls.className = 'view-controls';
controls.innerHTML = `
  <div class="vc-group">
    <span class="vc-title">Modell</span>
    <div class="seg">
      <button data-orbit="flat" class="on" title="Alle Bahnen in einer Ebene, Abstände gestaucht">Lehrbuch</button>
      <button data-orbit="real" title="Echte Bahnneigungen und maßstabsgetreue Abstände">Real</button>
    </div>
  </div>
  <div class="vc-group">
    <span class="vc-title">Bereich</span>
    <div class="seg">
      <button data-frame="52">Gesamt</button>
      <button data-frame="3.5">Inneres</button>
      <button data-frame="35">Äußeres</button>
      <button data-frame="900" title="Bis zur Bahn von Sedna">Fern</button>
      <button data-frame="6000" title="Ganz hinaus: das Sonnensystem als Stern">Stern</button>
    </div>
  </div>
  <div class="vc-group">
    <span class="vc-title">Bahnen</span>
    <div class="seg">
      <button data-orbits="all" class="on">Alle</button>
      <button data-orbits="selected" title="Nur die Bahn des angeklickten Körpers">Auswahl</button>
      <button data-orbits="off">Aus</button>
    </div>
  </div>
  <div class="vc-group">
    <span class="vc-title">Ebenen</span>
    <label><input type="checkbox" data-layer="hz" checked /> Habitable Zone</label>
    <label><input type="checkbox" data-layer="belts" checked /> Gürtel</label>
    <label><input type="checkbox" data-layer="zones" checked /> Zonen</label>
    <label><input type="checkbox" data-layer="dwarfs" checked /> Zwergplaneten</label>
    <label><input type="checkbox" data-layer="asteroids" checked /> Asteroiden</label>
    <label><input type="checkbox" data-layer="comets" checked /> Kometen</label>
  </div>
  <p class="vc-note" hidden>Maßstabsgetreue Abstände · Planeten vergrößert dargestellt</p>`;
$('#view-system').appendChild(controls);

controls.querySelectorAll('[data-orbit]').forEach((b) => (b.onclick = () => {
  const real = b.dataset.orbit === 'real';
  system.setRealMode(real);
  controls.querySelectorAll('[data-orbit]').forEach((x) => x.classList.toggle('on', x === b));
  controls.querySelector('.vc-note').hidden = !real;
}));
controls.querySelectorAll('[data-orbits]').forEach((b) => (b.onclick = () => {
  const mode = b.dataset.orbits;
  system.setLayer('orbits', mode !== 'off');
  if (mode !== 'off') system.setOrbitMode(mode);
  controls.querySelectorAll('[data-orbits]').forEach((x) => x.classList.toggle('on', x === b));
}));
controls.querySelectorAll('[data-frame]').forEach((b) => (b.onclick = () => system.frame(Number(b.dataset.frame))));
controls.querySelectorAll('[data-layer]').forEach((c) => (c.onchange = () => system.setLayer(c.dataset.layer, c.checked)));

// --- Suche über alle Objekte --------------------------------------------------------------
const MOON_BODIES = moonBodies();
const searchItems = () => [SOLAR_SYSTEM, ...BODIES, ...SMALL_BODIES, ...MOON_BODIES];
const search = document.createElement('div');
search.className = 'search';
search.innerHTML = `<input type="search" placeholder="Objekt suchen …" aria-label="Objekt suchen" />
  <ul class="search-results" role="listbox" hidden></ul>`;
$('.topbar .nav').after(search);
const sInput = search.querySelector('input');
const sList = search.querySelector('ul');
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function goTo(body) {
  sList.hidden = true;
  sInput.value = '';
  sInput.blur();
  if (body.parent && body.maps) { location.hash = `#/body/${body.id}`; return; }
  if (location.hash !== '#/system') location.hash = '#/system';
  selectBody(body);
  if (body.id === SOLAR_SYSTEM.id) system.frame(6000);
  else if (body.isMoon && !body.major) system.focus(body.parent); // kleine Monde: zum Planeten fliegen
  else system.focus(body.id);
}
sInput.addEventListener('input', () => {
  const q = norm(sInput.value.trim());
  if (!q) { sList.hidden = true; return; }
  const hits = searchItems().filter((b) => norm(b.name).includes(q) || norm(b.fullname || '').includes(q)).slice(0, 8);
  sList.innerHTML = hits.map((b, i) => `<li role="option" data-i="${i}"><span class="dot" style="background:${b.color}"></span>${b.name}<small>${b.type}</small></li>`).join('')
    || '<li class="none">Nichts gefunden</li>';
  sList.hidden = false;
  sList.querySelectorAll('[data-i]').forEach((li) => (li.onmousedown = (e) => { e.preventDefault(); goTo(hits[li.dataset.i]); }));
});
sInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sList.querySelector('[data-i]')?.dispatchEvent(new MouseEvent('mousedown'));
  if (e.key === 'Escape') { sList.hidden = true; sInput.blur(); }
});
sInput.addEventListener('blur', () => setTimeout(() => (sList.hidden = true), 150));

// Kartenauswahl (Erde / Mond / Mars …)
const bodyTabs = document.createElement('div');
bodyTabs.className = 'body-tabs';
bodyTabs.innerHTML = mappedBodies()
  .map((b) => `<a href="#/body/${b.id}" data-body="${b.id}">${b.name}</a>`).join('');
$('#view-body').before(bodyTabs);
bodyTabs.after(layerBar);
$('#view-body').after(mapStatus);

// --- Routing (#/system, #/body/<id>, #/sky) ---------------------------------------
function route() {
  const [, view = 'system', arg] = location.hash.split('/');
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.view === view));
  bodyTabs.classList.toggle('active', view === 'body');
  layerBar.classList.toggle('active', view === 'body');
  if (view !== 'body') mapStatus.hidden = true;
  system.setActive(view === 'system');

  if (view === 'body') {
    const body = bodyById(arg) || bodyById('earth');
    globe.show(body);
    bodyTabs.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.body === body.id));
    $('#status').textContent = `Karte: ${body.name}`;
  } else {
    $('#status').textContent = view === 'sky' ? 'SPHEREx · Vorschau' : 'Sonnensystem';
  }
}
window.addEventListener('hashchange', route);
if (!location.hash) location.hash = '#/system';
route();
