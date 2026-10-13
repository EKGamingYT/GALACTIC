import './style.css';
import { bodyById, mappedBodies } from './data/bodies.js';
import { heliocentricPosition } from './lib/orbits.js';
import { TEXTURES } from './data/textures.js';
import { createClock } from './lib/time.js';
import { createSystemView } from './views/system.js';
import { createGlobeView } from './views/globe.js';
import { createSkyView } from './views/sky.js';
import { createTimebar } from './ui/timebar.js';

const $ = (sel) => document.querySelector(sel);
const panel = $('#panel');
const AU_KM = 149597870.7;

const fmt = (n, unit = '', digits) =>
  n === null || n === undefined
    ? '–'
    : `${n.toLocaleString('de-DE', digits !== undefined ? { maximumFractionDigits: digits } : {})}${unit}`;

function bodyDetails(body) {
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

function selectBody(body) {
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
      ${body.elements || body.kepler ? `<button data-act="focus">Heranfliegen</button>` : ''}
      ${body.maps ? `<a class="primary" href="#/body/${body.id}">Karte öffnen</a>` : ''}
      ${children.filter((c) => c.maps).map((c) => `<a href="#/body/${c.id}">${c.name}-Karte</a>`).join('')}
    </div>
    <p class="muted small">${body.kepler
      ? `Quelle: JPL Small-Body Database (${body.fullname}). Bahn als Zweikörper-Näherung – bei Kometen über Jahrzehnte ungenau.`
      : 'Quelle: NASA Planetary Fact Sheet · Bahnen: JPL (Standish)'}</p>`);
  panel.querySelector('[data-act="focus"]')?.addEventListener('click', () => system.focus(body.id));
  updatePanelLive();
}

function pickPoint(body, lat, lon) {
  panelBody = null;
  showPanel(`
    <p class="eyebrow">${body.name} · Punktabfrage</p>
    <h2 style="--accent:${body.color}">${lat.toFixed(3)}°, ${lon.toFixed(3)}°</h2>
    <dl class="facts">
      <dt>Breite</dt><dd>${lat.toFixed(4)}°</dd>
      <dt>Länge</dt><dd>${lon.toFixed(4)}°</dd>
    </dl>
    <p class="muted small">Weitere Datenebenen für diesen Punkt (Höhe, Temperatur,
    Bodenzusammensetzung) folgen.</p>`);
}

// --- Ansichten ---------------------------------------------------------------
const clock = createClock();
const system = createSystemView($('#view-system'), { onSelect: selectBody });
const layerBar = document.createElement('div');
layerBar.className = 'layer-bar';
const globe = createGlobeView($('#view-body'), {
  onPick: pickPoint,
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
    <span class="vc-title">Bahnen</span>
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
    </div>
  </div>
  <div class="vc-group">
    <span class="vc-title">Ebenen</span>
    <label><input type="checkbox" data-layer="orbits" checked /> Bahnen</label>
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
controls.querySelectorAll('[data-frame]').forEach((b) => (b.onclick = () => system.frame(Number(b.dataset.frame))));
controls.querySelectorAll('[data-layer]').forEach((c) => (c.onchange = () => system.setLayer(c.dataset.layer, c.checked)));

// Kartenauswahl (Erde / Mond / Mars …)
const bodyTabs = document.createElement('div');
bodyTabs.className = 'body-tabs';
bodyTabs.innerHTML = mappedBodies()
  .map((b) => `<a href="#/body/${b.id}" data-body="${b.id}">${b.name}</a>`).join('');
$('#view-body').before(bodyTabs);
bodyTabs.after(layerBar);

// --- Routing (#/system, #/body/<id>, #/sky) ---------------------------------------
function route() {
  const [, view = 'system', arg] = location.hash.split('/');
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.view === view));
  bodyTabs.classList.toggle('active', view === 'body');
  layerBar.classList.toggle('active', view === 'body');
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
