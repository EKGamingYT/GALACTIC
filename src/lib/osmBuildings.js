// 3D-Gebäude aus OpenStreetMap (© OpenStreetMap-Mitwirkende, ODbL), live über
// die Overpass API geladen, sobald die Kamera tief genug über der Erde ist.
// Höhe aus den OSM-Tags `height` bzw. `building:levels` (sonst 10 m).
import {
  Cartesian3, Cartographic, Color, DirectionalLight, HeightReference, Math as CesiumMath, PolygonHierarchy,
} from 'cesium';

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const MAX_CAMERA_HEIGHT = 2500; // m – darüber keine Gebäude laden
const MAX_SPAN_DEG = 0.02;      // maximale Ausdehnung des Abfragegebiets (~2 km)

function buildingHeight(tags = {}) {
  const h = parseFloat(tags.height);
  if (Number.isFinite(h)) return h;
  const levels = parseFloat(tags['building:levels']);
  return Number.isFinite(levels) ? levels * 3.2 : 10;
}

// Farbe nach Höhe: niedrige Häuser warmes Hellgrau, Hochhäuser kühles Blaugrau
function buildingColor(h) {
  const t = Math.min(1, h / 80);
  return Color.lerp(Color.fromCssColorString('#e9e4da'), Color.fromCssColorString('#8fa3c0'), t, new Color());
}

export function enableOsmBuildings(viewer, onStatus) {
  // „Stirnlampe“: Licht kommt schräg von der Kamera → Gebäude sind immer
  // plastisch schattiert, unabhängig von der echten Tageszeit
  const light = new DirectionalLight({ direction: viewer.camera.directionWC, intensity: 2.2 });
  viewer.scene.light = light;
  const removeLight = viewer.scene.preRender.addEventListener(() => {
    const d = Cartesian3.add(viewer.camera.directionWC, Cartesian3.multiplyByScalar(viewer.camera.rightWC, 0.6, new Cartesian3()), new Cartesian3());
    light.direction = Cartesian3.normalize(d, d);
  });

  const loaded = new Set();   // geladene Rasterzellen
  const seen = new Set();     // OSM-IDs bereits angelegter Gebäude
  let busy = false;
  let timer = null;

  async function query(south, west, north, east) {
    const data = `[out:json][timeout:20];way["building"](${south},${west},${north},${east});out geom;`;
    for (const url of ENDPOINTS) {
      try {
        const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data }) });
        if (res.ok) return (await res.json()).elements;
      } catch { /* nächsten Server versuchen */ }
    }
    throw new Error('Overpass nicht erreichbar');
  }

  async function update() {
    if (busy) return;
    const cam = viewer.camera.positionCartographic;
    if (cam.height > MAX_CAMERA_HEIGHT) { onStatus?.(''); return; }

    // Sichtbaren Bereich in 0,02°-Rasterzellen zerlegen (jede Zelle nur einmal laden),
    // vom Blickmittelpunkt aus, höchstens 6 Zellen pro Kamerabewegung
    const center = viewer.camera.pickEllipsoid(
      { x: viewer.canvas.clientWidth / 2, y: viewer.canvas.clientHeight / 2 }, viewer.scene.globe.ellipsoid);
    const c = center ? Cartographic.fromCartesian(center) : cam;
    const cLat = CesiumMath.toDegrees(c.latitude), cLon = CesiumMath.toDegrees(c.longitude);
    const cells = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const lat = (Math.floor(cLat / MAX_SPAN_DEG) + dy) * MAX_SPAN_DEG;
        const lon = (Math.floor(cLon / MAX_SPAN_DEG) + dx) * MAX_SPAN_DEG;
        const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
        if (!loaded.has(key)) cells.push({ lat, lon, key, d: Math.abs(dx) + Math.abs(dy) });
      }
    }
    cells.sort((a, b) => a.d - b.d).splice(6);
    if (!cells.length) return;

    busy = true;
    let count = 0;
    try {
      for (const { lat, lon, key } of cells) {
        onStatus?.(`Lade 3D-Gebäude … (${count} bisher)`);
        const elements = await query(lat, lon, lat + MAX_SPAN_DEG, lon + MAX_SPAN_DEG);
        loaded.add(key);
        for (const el of elements) {
          if (!el.geometry || el.geometry.length < 3 || seen.has(el.id)) continue;
          seen.add(el.id);
          viewer.entities.add({
            polygon: {
              hierarchy: new PolygonHierarchy(el.geometry.map((p) => Cartesian3.fromDegrees(p.lon, p.lat))),
              heightReference: HeightReference.RELATIVE_TO_GROUND,
              extrudedHeight: buildingHeight(el.tags),
              extrudedHeightReference: HeightReference.RELATIVE_TO_GROUND,
              material: buildingColor(buildingHeight(el.tags)),
              outline: false,
            },
          });
          count++;
        }
      }
      onStatus?.(count ? `${count} Gebäude geladen` : 'Keine neuen Gebäude in diesem Bereich');
    } catch {
      onStatus?.('Gebäudedienst gerade überlastet – später erneut versuchen');
    } finally {
      busy = false;
    }
  }

  const remove = viewer.camera.moveEnd.addEventListener(() => {
    clearTimeout(timer);
    timer = setTimeout(update, 400);
  });
  return () => { remove(); removeLight(); viewer.entities.removeAll(); };
}
