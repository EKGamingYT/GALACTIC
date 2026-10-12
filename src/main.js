import './style.css';
import { bodyById, mappedBodies } from './data/bodies.js';
import { createSystemView } from './views/system.js';
import { createGlobeView } from './views/globe.js';
import { createSkyView } from './views/sky.js';

const $ = (sel) => document.querySelector(sel);
const panel = $('#panel');

const fmt = (n, unit = '') =>
  n === null || n === undefined ? '–' : `${n.toLocaleString('de-DE')}${unit}`;

function bodyDetails(body) {
  return `
    <dl class="facts">
      <dt>Typ</dt><dd>${body.type}</dd>
      <dt>Radius</dt><dd>${fmt(body.radiusKm, ' km')}</dd>
      <dt>Schwerkraft</dt><dd>${fmt(body.gravity, ' m/s²')}</dd>
      <dt>Tageslänge</dt><dd>${fmt(body.dayHours, ' h')}</dd>
      <dt>Mittlere Temp.</dt><dd>${fmt(body.meanTempC, ' °C')}</dd>
      <dt>Monde</dt><dd>${fmt(body.moons)}</dd>
      ${body.elements ? `<dt>Große Halbachse</dt><dd>${fmt(body.elements[0], ' AE')}</dd>` : ''}
    </dl>`;
}

function showPanel(html) {
  panel.innerHTML = `<button class="close" aria-label="Schließen">×</button>${html}`;
  panel.classList.remove('hidden');
  panel.querySelector('.close').onclick = () => panel.classList.add('hidden');
}

function selectBody(body) {
  const children = (body.children || []).map(bodyById);
  showPanel(`
    <p class="eyebrow">${body.type}</p>
    <h2 style="--accent:${body.color}">${body.name}</h2>
    ${bodyDetails(body)}
    <div class="actions">
      ${body.elements ? `<button data-act="focus">Heranfliegen</button>` : ''}
      ${body.map ? `<a class="primary" href="#/body/${body.id}">Karte öffnen</a>` : ''}
      ${children.filter((c) => c.map).map((c) => `<a href="#/body/${c.id}">${c.name}-Karte</a>`).join('')}
    </div>
    <p class="muted small">Quelle: NASA Planetary Fact Sheet · Bahnen: JPL (Standish)</p>`);
  panel.querySelector('[data-act="focus"]')?.addEventListener('click', () => system.focus(body.id));
}

function pickPoint(body, lat, lon) {
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
const system = createSystemView($('#view-system'), { onSelect: selectBody });
const globe = createGlobeView($('#view-body'), { onPick: pickPoint });
createSkyView($('#view-sky'));

// Zeitsteuerung für das Sonnensystem
const timebar = document.createElement('div');
timebar.className = 'timebar';
timebar.innerHTML = `
  <input type="date" id="date" />
  <div class="speeds">
    <button data-speed="0" class="on">Pause</button>
    <button data-speed="1">1 Tag/s</button>
    <button data-speed="30">1 Monat/s</button>
    <button data-speed="365">1 Jahr/s</button>
  </div>
  <button id="today">Heute</button>`;
$('#view-system').appendChild(timebar);

const dateInput = $('#date');
const syncDateInput = () => (dateInput.value = system.getDate().toISOString().slice(0, 10));
syncDateInput();
dateInput.onchange = () => dateInput.value && system.setDate(new Date(dateInput.value + 'T12:00:00Z'));
$('#today').onclick = () => { system.setDate(new Date()); syncDateInput(); };

let daysPerSecond = 0;
timebar.querySelectorAll('[data-speed]').forEach((btn) => {
  btn.onclick = () => {
    daysPerSecond = Number(btn.dataset.speed);
    timebar.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', b === btn));
  };
});
let last = performance.now();
(function tick(now) {
  const dt = (now - last) / 1000;
  last = now;
  if (daysPerSecond) {
    system.setDate(new Date(system.getDate().getTime() + daysPerSecond * dt * 86400000));
    syncDateInput();
  }
  requestAnimationFrame(tick);
})(last);

// Kartenauswahl (Erde / Mond / Mars …)
const bodyTabs = document.createElement('div');
bodyTabs.className = 'body-tabs';
bodyTabs.innerHTML = mappedBodies()
  .map((b) => `<a href="#/body/${b.id}" data-body="${b.id}">${b.name}</a>`).join('');
$('#view-body').before(bodyTabs);

// --- Routing (#/system, #/body/<id>, #/sky) ---------------------------------------
function route() {
  const [, view = 'system', arg] = location.hash.split('/');
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.view === view));
  bodyTabs.classList.toggle('active', view === 'body');
  system.setActive(view === 'system');

  if (view === 'body') {
    const body = bodyById(arg) || bodyById('earth');
    globe.show(body);
    bodyTabs.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.body === body.id));
    $('#status').textContent = `Karte: ${body.name}`;
  } else {
    $('#status').textContent = view === 'sky' ? 'SPHEREx · Vorschau' : 'Sonnensystem · Live-Bahnen';
  }
}
window.addEventListener('hashchange', route);
if (!location.hash) location.hash = '#/system';
route();
