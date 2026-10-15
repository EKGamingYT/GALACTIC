import './ui/boot.js'; // Startbildschirm (Uplink-Animation) – zuerst laden, damit er den Ladefortschritt von Anfang an mitbekommt
import './style.css';
import { BODIES, bodyById } from './data/bodies.js';
import { MAP_BODIES, mapBodyById, mapIdFor } from './data/mapcatalog.js';
import { SOLAR_SYSTEM, HABITABLE_ZONE } from './data/solarsystem.js';
import { SMALL_BODIES } from './views/system.js';
import { moonBodies } from './views/moons.js';
import { STARS, starBody } from './views/stars.js';
import { SYSTEMS } from './data/systems.js';
import { createSystemPicker, MAX_LY } from './ui/systemPicker.js';
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

// Monde eines Körpers (große zuerst, nach Abstand)
const moonsOf = (parentId) => MOON_BODIES.filter((m) => m.parent === parentId)
  .sort((a, b) => (b.major - a.major) || (a.aKm - b.aKm));

// Chips der großen Monde + Zahl der kleinen; Klick fliegt zum Mond
function moonChips(parentId, max = 12) {
  const all = moonsOf(parentId);
  if (!all.length) return '';
  const big = all.filter((m) => m.major).slice(0, max);
  const rest = all.length - big.length;
  return `<div class="chips">${big.map((m) => `<button data-moon="${m.id}"><i style="background:${m.color}"></i>${m.name}</button>`).join('')}
    ${rest > 0 ? `<button data-moon-rest="${parentId}" title="Zum Mondsystem fliegen – kleine Monde als Punkte, einzeln über die Suche">+ ${rest} kleinere</button>` : ''}</div>`;
}
function wireMoonChips() {
  panel.querySelectorAll('[data-moon]').forEach((b) => (b.onclick = () => {
    const m = MOON_BODIES.find((x) => x.id === b.dataset.moon);
    selectBody(m);
    system.focus(m.id);
  }));
  // „+ N kleinere“: zum Mutterkörper fliegen – das Mondsystem zeigt die kleinen Monde als Punkte
  panel.querySelectorAll('[data-moon-rest]').forEach((b) => (b.onclick = () => system.focus(b.dataset.moonRest)));
}

// Gleichgewichtstemperatur eines Planeten: 278,6 K · L^¼ · a^−½ · (1 − A)^¼ (Albedo 0,3 angenommen)
const equilibriumK = (L, aAu) => (L && aAu ? 278.6 * Math.pow(L, 0.25) / Math.sqrt(aAu) * Math.pow(0.7, 0.25) : null);
const STAR_L = new Map(SYSTEMS.flatMap((s) => s.members.map((m) => [m.name, m.L])));

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
    </dl>
    ${m.schematic ? '<p class="muted small">Werte aus der Fachliteratur (gerundet); Bahnlage im Atlas schematisch.</p>' : ''}`;
}

function starDetails(s) {
  const members = STARS.filter((x) => x.system === s.system && x.id !== s.id).map((x) => x.name);
  const planets = s.planets || [];
  return `
    <dl class="facts">
      <dt>Entfernung</dt><dd>${fmt(s.distanceLy, ' Lichtjahre', 2)}</dd>
      <dt>Spektraltyp</dt><dd>${s.spectralType ?? '–'}</dd>
      ${s.teffK ? `<dt>Temperatur</dt><dd>${fmt(s.teffK, ' K', 0)}</dd>` : ''}
      ${s.massSun ? `<dt>Masse</dt><dd>${fmt(s.massSun, ' Sonnenmassen', 3)}</dd>` : ''}
      ${s.radiusSun ? `<dt>Radius</dt><dd>${fmt(s.radiusSun, ' Sonnenradien', 3)}</dd>` : ''}
      ${s.vmag != null ? `<dt>Scheinbare Helligkeit</dt><dd>${fmt(s.vmag, ' mag', 2)}</dd>` : ''}
      ${members.length ? `<dt>Im System mit</dt><dd>${members.join(', ')}</dd>` : ''}
      <dt>Bekannte Planeten</dt><dd>${planets.length}</dd>
    </dl>
    ${planets.length ? `<p class="eyebrow">Planeten</p><ul class="member-list">${planets.map((p) => `<li><button data-planet="planet-${s.id}-${p.name}"><i style="background:${system.exoplanet(`planet-${s.id}-${p.name}`)?.color ?? '#9aa7b8'}"></i>
      <span><strong>${p.name}</strong><small>${p.aAu ? fmt(p.aAu, ' AE', 3) : ''}${p.periodDays ? ' · ' + fmt(p.periodDays, ' Tage', 1) : ''}${p.radiusEarth ? ' · ' + fmt(p.radiusEarth, ' R⊕', 2) : p.massEarth ? ' · ' + fmt(p.massEarth, ' M⊕', 2) : ''}${p.discoveryYear ? ' · entdeckt ' + p.discoveryYear : ''}</small></span></button></li>`).join('')}</ul>` : ''}`;
}

function exoDetails(p) {
  return `
    <dl class="facts">
      <dt>Stern</dt><dd>${p.host}</dd>
      ${p.aAu ? `<dt>Abstand zum Stern</dt><dd>${fmt(p.aAu, ' AE', 4)}</dd>` : ''}
      ${p.periodDays ? `<dt>Umlaufzeit</dt><dd>${fmt(p.periodDays, ' Tage', 2)}</dd>` : ''}
      ${p.e != null ? `<dt>Exzentrizität</dt><dd>${fmt(p.e, '', 3)}</dd>` : ''}
      ${p.radiusEarth ? `<dt>Radius</dt><dd>${fmt(p.radiusEarth, ' Erdradien', 2)}</dd>` : ''}
      ${p.massEarth ? `<dt>Masse</dt><dd>${fmt(p.massEarth, ' Erdmassen', 2)}</dd>` : ''}
      ${p.discoveryYear ? `<dt>Entdeckt</dt><dd>${p.discoveryYear}${p.method ? ' · ' + p.method : ''}</dd>` : ''}
      ${equilibriumK(STAR_L.get(p.host), p.aAu) ? `<dt>Temperatur (geschätzt)</dt><dd>≈ ${fmt(equilibriumK(STAR_L.get(p.host), p.aAu), ' K', 0)} <small>(${fmt(equilibriumK(STAR_L.get(p.host), p.aAu) - 273.15, ' °C', 0)})</small></dd>` : ''}
      ${p.kind ? `<dt>Typ (Einordnung)</dt><dd>${p.kind}</dd>` : ''}
      <dt>Monde</dt><dd>keine bekannt</dd>
    </dl>
    <p class="muted small">Temperatur = Gleichgewichtstemperatur ohne Treibhauseffekt (Albedo 0,3 angenommen).
    Aussehen und Typ sind eine Einordnung nach Größe und Temperatur – von diesem Planeten gibt es keine Aufnahme.
    Monde um Exoplaneten (Exomonde) sind bisher nirgends sicher nachgewiesen.</p>`;
}

function bodyDetails(body) {
  if (body.isStar) return starDetails(body);
  if (body.isExoplanet) return exoDetails(body);
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
  panel.innerHTML = `<button class="close" aria-label="Schließen" title="Schließen (Esc)">×</button><div class="panel-body">${html}</div>`;
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
  system.select('sun');
  const date = clock.date();
  const [hzIn, hzOut] = HABITABLE_ZONE.conservative;
  const planets = BODIES.filter((b) => b.elements && b.type === 'Planet').map((b) => {
    const p = heliocentricPosition(b, date);
    const a = b.elements[0];
    return { b, a, r: Math.hypot(p.x, p.y, p.z), years: Math.pow(a, 1.5), inHz: a >= hzIn && a <= hzOut };
  });
  const dwarfs = ['ceres', 'pluto', 'eris', 'haumea', 'makemake']
    .map((id) => BODIES.find((b) => b.id === id) ?? SMALL_BODIES.find((b) => b.id === id)).filter(Boolean);
  const row = ([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`;
  showPanel(`
    <p class="eyebrow">${SOLAR_SYSTEM.type} · 1 Stern</p>
    <h2 style="--accent:${SOLAR_SYSTEM.color}">${SOLAR_SYSTEM.name}</h2>
    <p class="desc">Unser Heimatsystem – ein offizieller Eigenname existiert nicht; der Stern heißt Sonne (lat. Sol).</p>
    <dl class="facts facts-wide">
      <dt>Planeten</dt><dd>8</dd>
      <dt>Zwergplaneten (IAU)</dt><dd>5</dd>
      <dt>Bekannte Monde</dt><dd>${fmt(MOON_BODIES.length)}</dd>
      <dt>In der habitablen Zone</dt><dd>${planets.filter((p) => p.inHz).map((p) => p.b.name).join(', ')}</dd>
    </dl>
    <p class="eyebrow">Stern</p>
    <ul class="member-list"><li><button data-go="sun"><i style="background:#fff1c9"></i>
      <span><strong>Sonne</strong><small>G2V · Leuchtkraft 1 L☉ · HZ ${fmt(hzIn, '', 2)}–${fmt(hzOut, ' AE', 2)} · 5.772 K</small></span>
    </button></li></ul>
    <p class="eyebrow">Planeten</p>
    <ul class="member-list">${planets.map((p) => `<li><button data-go="${p.b.id}"><i style="background:${p.b.color}"></i>
      <span><strong>${p.b.name}${p.inHz ? ' <span class="sp-badge">HZ</span>' : ''}</strong>
      <small>${fmt(p.a, ' AE', 2)} · Umlauf ${fmt(p.years, '', p.years < 2 ? 2 : 1)} ${Math.abs(p.years - 1) < 0.01 ? 'Jahr' : 'Jahre'} · ${fmt(p.b.radiusKm, ' km')} · ${fmt(p.b.moons)} ${p.b.moons === 1 ? 'Mond' : 'Monde'} · jetzt ${fmt(p.r, ' AE', 2)}</small></span>
    </button></li>`).join('')}</ul>
    <p class="eyebrow">Monde · ${fmt(MOON_BODIES.length)} im Atlas</p>
    ${['earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'eris', 'haumea', 'makemake', 'gonggong', 'quaoar', 'orcus', 'didymos']
      .filter((id) => moonsOf(id).length).map((id) => {
        const host = BODIES.find((b) => b.id === id) ?? SMALL_BODIES.find((b) => b.id === id);
        return `<p class="moon-host">${host.name} <small>· ${moonsOf(id).length}</small></p>${moonChips(id, 8)}`;
      }).join('')}
    <p class="eyebrow">Zwergplaneten</p>
    <div class="chips">${dwarfs.map((d) => `<button data-go="${d.id}"><i style="background:${d.color}"></i>${d.name}</button>`).join('')}</div>
    <p class="eyebrow">Daten der Sonne</p>
    <dl class="facts facts-wide">${SOLAR_SYSTEM.facts.filter(([k]) => !/Planeten|Zwergplaneten|Habitable/.test(k)).map(row).join('')}</dl>
    <p class="eyebrow">Lage im Universum</p>
    <dl class="facts facts-wide">${SOLAR_SYSTEM.galaxy.map(row).join('')}</dl>
    <p class="muted small">Habitable Zone (konservativ) nach Kopparapu et al. (2013/14) – grünes Band in der Ansicht.
    Quellen: NASA Planetary &amp; Sun Fact Sheets, IAU 2015, GRAVITY Collaboration 2019, IERS (ICRF3).</p>`);
  wireMoonChips();
  panel.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => {
    const id = b.dataset.go;
    const body = BODIES.find((x) => x.id === id) ?? SMALL_BODIES.find((x) => x.id === id);
    if (!body) return;
    selectBody(body);
    system.focus(id);
  }));
}

// Panel eines Nachbar-Sternsystems: Sterne (mit Leuchtkraft & habitabler Zone) und Planeten
function showStarSystemPanel(sys) {
  panelBody = null;
  system.select(sys.primaryId);
  const hzPlanets = sys.planets.filter((p) => p.inHz);
  const lum = (m) => (m.L == null ? '–' : `${m.estimated ? '≈ ' : ''}${fmt(m.L, ' L☉', m.L < 0.01 ? 5 : 3)}`);
  showPanel(`
    <p class="eyebrow">${sys.type}</p>
    <h2 style="--accent:${sys.color}">${sys.name}</h2>
    ${sys.description ? `<p class="desc">${sys.description}</p>` : ''}
    <dl class="facts facts-wide">
      <dt>Entfernung</dt><dd>${fmt(sys.distanceLy, ' Lichtjahre', 2)}</dd>
      <dt>Sterne</dt><dd>${sys.members.length}</dd>
      <dt>Bekannte Planeten</dt><dd>${sys.planets.length}</dd>
      <dt>In der habitablen Zone</dt><dd>${hzPlanets.length ? hzPlanets.map((p) => p.name).join(', ') : sys.planets.length ? 'keiner bekannt' : '–'}</dd>
    </dl>
    <p class="eyebrow">Sterne</p>
    ${sys.members.map((m) => `
      <button class="star-head" data-star="${m.id}"><i style="background:${m.colorHex || '#fff'}"></i><strong>${m.name}</strong></button>
      <dl class="facts facts-wide star-facts">
        <dt>Spektraltyp</dt><dd>${m.spectralType ?? '–'}</dd>
        ${m.teffK ? `<dt>Oberflächentemperatur</dt><dd>${fmt(m.teffK, ' K', 0)}</dd>` : ''}
        ${m.massSun ? `<dt>Masse</dt><dd>${fmt(m.massSun, ' M☉', 3)}</dd>` : ''}
        ${m.radiusSun ? `<dt>Radius</dt><dd>${fmt(m.radiusSun, ' R☉', 3)} <small>(${fmt(m.radiusSun * 695700, ' km', 0)})</small></dd>` : ''}
        <dt>Leuchtkraft</dt><dd>${lum(m)}</dd>
        ${m.vmag != null ? `<dt>Scheinbare Helligkeit</dt><dd>${fmt(m.vmag, ' mag', 2)}</dd>` : ''}
        <dt>Habitable Zone</dt><dd>${m.hz ? `${fmt(m.hz[0], '', m.hz[0] < 0.1 ? 3 : 2)}–${fmt(m.hz[1], ' AE', m.hz[1] < 0.1 ? 3 : 2)}` : 'unbekannt'}</dd>
        <dt>Planeten</dt><dd>${(m.planets || []).length}</dd>
      </dl>`).join('')}
    ${sys.planets.length ? `<p class="eyebrow">Planeten</p>
    <ul class="member-list">${sys.planets.map((p) => `<li><button data-planet="${exoId(p)}"><i style="background:${system.exoplanet(exoId(p))?.color ?? '#9aa7b8'}"></i>
      <span><strong>${p.name}${p.inHz ? ' <span class="sp-badge">HZ</span>' : ''}</strong>
      <small>um ${p.host}${p.aAu ? ' · ' + fmt(p.aAu, ' AE', 3) : ''}${p.periodDays ? ' · ' + fmt(p.periodDays, ' Tage', 1) : ''}${p.radiusEarth ? ' · ' + fmt(p.radiusEarth, ' R⊕', 2) : ''}${p.massEarth ? ' · ' + fmt(p.massEarth, ' M⊕', 2) : ''}${equilibriumK(STAR_L.get(p.host), p.aAu) ? ' · ≈ ' + fmt(equilibriumK(STAR_L.get(p.host), p.aAu) - 273.15, ' °C', 0) : ''}${p.discoveryYear ? ' · ' + p.discoveryYear : ''}${p.method ? ' (' + p.method + ')' : ''}</small></span></button></li>`).join('')}</ul>` : ''}
    <p class="eyebrow">Monde</p>
    <p class="muted small">Keine bekannt – Monde um Exoplaneten (Exomonde) sind bisher nirgends sicher nachgewiesen.</p>
    <div class="actions"><button data-act="focus">Heranfliegen</button></div>
    <p class="muted small">Quellen: CDS SIMBAD, NASA Exoplanet Archive. Leuchtkraft mit „≈“ geschätzt aus Helligkeit,
    Parallaxe und Spektraltyp; habitable Zone (konservativ) nach Kopparapu et al. – Näherung.</p>`);
  panel.querySelector('[data-act="focus"]').onclick = () => system.focus(sys.primaryId);
  wirePlanetButtons();
  panel.querySelectorAll('[data-star]').forEach((b) => (b.onclick = () => {
    const s = STARS.find((x) => x.id === b.dataset.star);
    selectBody(starBody(s));
    system.focus(s.id);
  }));
}

// Exoplaneten-ID wie in der 3D-Ansicht (Stern-ID + Planetenname)
const exoId = (p) => `planet-${STARS.find((s) => s.name === p.host)?.id}-${p.name}`;
// Planetenknöpfe in Stern-/Systempanels: auswählen und hinfliegen
function wirePlanetButtons() {
  panel.querySelectorAll('[data-planet]').forEach((b) => (b.onclick = () => {
    const body = system.exoplanet(b.dataset.planet);
    if (!body) return;
    selectBody(body);
    system.focus(body.id);
  }));
}

function selectBody(body) {
  if (body.id === SOLAR_SYSTEM.id) return showSystemPanel();
  if (body.isSystem) return showStarSystemPanel(body);
  panelBody = body;
  system.select(body.id);
  const children = (body.children || []).map(bodyById);
  showPanel(`
    <p class="eyebrow">${body.type}</p>
    <h2 style="--accent:${body.color}">${body.name}</h2>
    ${body.description ? `<p class="desc">${body.description}</p>` : ''}
    ${TEXTURES[body.id]?.artistic ? '<p class="muted small">Oberfläche: künstlerische Darstellung – es gibt noch keine Nahaufnahmen.</p>' : ''}
    ${bodyDetails(body)}
    ${!body.isMoon && !body.isStar && !body.isExoplanet && moonsOf(body.id).length
      ? `<p class="eyebrow">Monde (${moonsOf(body.id).length} im Atlas)</p>${moonChips(body.id)}` : ''}
    <div class="actions">
      ${body.elements || body.kepler || body.id === 'sun' || body.major || body.isStar || body.isExoplanet ? `<button data-act="focus">Heranfliegen</button>` : ''}
      ${mapIdFor(body) ? `<a class="primary" href="#/body/${mapIdFor(body)}">Karte öffnen</a>` : ''}
      ${children.filter((c) => c.maps).map((c) => `<a href="#/body/${c.id}">${c.name}-Karte</a>`).join('')}
    </div>
    <p class="muted small">${body.isStar || body.isExoplanet
      ? 'Quellen: CDS SIMBAD (Entfernung aus der Parallaxe), NASA Exoplanet Archive. Abstände in der Ansicht logarithmisch, Bahnlage der Exoplaneten schematisch.'
      : body.isMoon
      ? 'Quelle: NASA/JPL Solar System Dynamics – mittlere Bahnelemente und physikalische Parameter der Monde. Abstände in der Ansicht logarithmisch gestaucht.'
      : body.kepler
      ? `Quelle: JPL Small-Body Database (${body.fullname}). Bahn als Zweikörper-Näherung – bei Kometen über Jahrzehnte ungenau.`
      : 'Quelle: NASA Planetary Fact Sheet · Bahnen: JPL (Standish)'}</p>`);
  panel.querySelector('[data-act="focus"]')?.addEventListener('click', () => system.focus(body.id));
  wireMoonChips();
  wirePlanetButtons();
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
    layerBar.innerHTML = `<div class="seg" role="group" aria-label="Kartenebene">${body.maps
      .map((m, i) => `<button data-i="${i}" class="${i === active ? 'on' : ''}" aria-pressed="${i === active}">${m.name}</button>`).join('')}</div>`;
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
  <button class="vc-toggle" aria-expanded="true" title="Steuerung ein-/ausklappen"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg><span>Ansicht</span><i class="chev" aria-hidden="true"></i></button>
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
      <button data-frame="60000" title="Oortsche Wolke (bis 100.000 AE)">Oort</button>
      <button data-frame="1500000" title="Ganz hinaus: Sonnensystem als Stern und Nachbarsterne">Sterne</button>
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
    <div class="vc-chips">
    <label><input type="checkbox" data-layer="hz" checked /> Habitable Zone</label>
    <label><input type="checkbox" data-layer="belts" checked /> Gürtel</label>
    <label><input type="checkbox" data-layer="zones" checked /> Zonen</label>
    <label><input type="checkbox" data-layer="dwarfs" checked /> Zwergplaneten</label>
    <label><input type="checkbox" data-layer="asteroids" checked /> Asteroiden</label>
    <label><input type="checkbox" data-layer="comets" checked /> Kometen</label>
    <label><input type="checkbox" data-layer="oort" checked /> Oortsche Wolke</label>
    <label><input type="checkbox" data-layer="planet9" checked /> Planet Neun?</label>
    <label><input type="checkbox" data-layer="ref" /> Himmelsgitter</label>
    </div>
  </div>
  <p class="vc-note" hidden>Maßstabsgetreue Abstände · Planeten vergrößert dargestellt</p>`;
$('#view-system').appendChild(controls);

// Steuerung einklappbar (auf dem Handy standardmäßig eingeklappt)
const vcToggle = controls.querySelector('.vc-toggle');
const setCollapsed = (c) => {
  controls.classList.toggle('collapsed', c);
  vcToggle.setAttribute('aria-expanded', String(!c));
};
vcToggle.onclick = () => setCollapsed(!controls.classList.contains('collapsed'));
setCollapsed(true); // eingeklappt starten – freie Sicht aufs System, Einstellungen per Klick
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
const STAR_BODIES = STARS.map(starBody);
const searchItems = () => [SOLAR_SYSTEM, ...BODIES, ...SMALL_BODIES, ...SYSTEMS, ...STAR_BODIES, ...MOON_BODIES];
const search = document.createElement('div');
search.className = 'search';
search.innerHTML = `<input type="search" placeholder="Objekt suchen …" aria-label="Objekt suchen" autocomplete="off" spellcheck="false" />
  <ul class="search-results" role="listbox" hidden></ul>`;
$('.topbar .nav').after(search);
const sysBtn = document.createElement('button');
sysBtn.className = 'sys-btn';
sysBtn.innerHTML = '<span class="sys-ico"></span><span class="sys-label">Sternsysteme</span>';
sysBtn.title = `Sternsysteme bis ${MAX_LY} Lichtjahre`;
sysBtn.setAttribute('aria-label', 'Sternsysteme');
sysBtn.setAttribute('aria-expanded', 'false');
search.before(sysBtn);
sysBtn.addEventListener('click', () => setCollapsed(true)); // Auswahlliste und Ansicht-Menü nicht übereinander
createSystemPicker(sysBtn, {
  solarSystem: SOLAR_SYSTEM,
  onPick: (s) => {
    if (location.hash !== '#/system') location.hash = '#/system';
    if (s.own) { selectBody(SOLAR_SYSTEM); system.frame(52); return; }
    selectBody(s);
    system.focus(s.primaryId);
  },
});
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
  if (body.id === SOLAR_SYSTEM.id) system.frame(1500000);
  else if (body.isMoon && !body.major) system.focus(body.parent); // kleine Monde: zum Planeten fliegen
  else if (body.isSystem) system.focus(body.primaryId);
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

// Kartenauswahl: gruppierte Liste aller Körper mit Oberflächenkarten
const bodyTabs = document.createElement('div');
bodyTabs.className = 'body-tabs';
bodyTabs.setAttribute('role', 'toolbar');
bodyTabs.setAttribute('aria-label', 'Karte und Kartenebenen');
const groups = [...new Set(MAP_BODIES.map((b) => b.group))];
bodyTabs.innerHTML = `<label class="map-pick"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2M12 3.4c3.4 3.2 3.4 13.8 0 17.2M12 3.4c-3.4 3.2-3.4 13.8 0 17.2"/></svg><span>Karte</span><select aria-label="Himmelskörper wählen">${groups
  .map((g) => `<optgroup label="${g}">${MAP_BODIES.filter((b) => b.group === g)
    .map((b) => `<option value="${b.id}">${b.name}</option>`).join('')}</optgroup>`).join('')}</select></label>`;
const mapSelect = bodyTabs.querySelector('select');
mapSelect.onchange = () => (location.hash = `#/body/${mapSelect.value}`);
$('#view-body').before(bodyTabs);
bodyTabs.append(layerBar); // Körperwahl + Ebenen als eine kompakte Leiste
$('#view-body').after(mapStatus);

// Tastatur: H = Überblick, Esc = Panel schließen (nicht während der Eingabe in Suchfeldern)
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea')) return;
  if (e.key === 'Escape') panel.querySelector('.close')?.click();
  if ((e.key === 'h' || e.key === 'H') && location.hash.startsWith('#/system')) system.frame(52);
});

// Ziehen startet nie einen Browser-Drag (Links/Bilder würden sonst in neue Tabs gezogen)
document.addEventListener('dragstart', (e) => e.preventDefault());

// Positionsanzeige oben rechts: Kamera relativ zur Sonne (heliozentrisch-ekliptikal, J2000)
const statusEl = $('#status');
statusEl.title = 'Kameraposition: Abstand zur Sonne, ekliptikale Länge λ und Breite β (J2000)';
setInterval(() => {
  if (!location.hash.startsWith('#/system') && location.hash) return;
  const { au, lambda, beta, real } = system.cameraInfo();
  const ly = au / 63241.077;
  const dist = ly >= 0.05
    ? `${fmt(ly, ' Lj', 2)} <small>(${fmt(au, ' AE', 0)})</small>`
    : `${fmt(au, ' AE', au < 10 ? 2 : 0)}`;
  statusEl.innerHTML = `<span class="hud-k">☉</span> ${dist} <span class="hud-k">λ</span> ${lambda.toFixed(1)}° `
    + (real ? `<span class="hud-k">β</span> ${beta.toFixed(1)}°` : '<small>Lehrbuch</small>');
}, 250);

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
    const body = mapBodyById(arg) || mapBodyById('earth');
    globe.show(body);
    mapSelect.value = body.id;
    $('#status').textContent = `Karte: ${body.name}`;
  } else {
    if (view === 'sky') $('#status').textContent = 'SPHEREx · Vorschau';
  }
}
window.addEventListener('hashchange', route);
if (!location.hash) location.hash = '#/system';
route();
window.dispatchEvent(new Event('galactic:ready')); // Startbildschirm (src/ui/boot.js): Ansichten stehen, Ausblenden + Intro einleiten
