// Planetenkarte (CesiumJS) für Körper mit Kartendaten (Erde, Mond, Mars …).
// Pro Körper wird ein eigener Viewer mit passendem Ellipsoid erzeugt. Bedienung, Ortsnamen und
// Bedienelemente der Karte liegen in ./map/ (navigation, names, ui), Stil in ../map.css.
import {
  Viewer, Globe, Ellipsoid, ImageryLayer, UrlTemplateImageryProvider, GeographicTilingScheme, GridImageryProvider,
  ScreenSpaceEventHandler, ScreenSpaceEventType, SceneMode, Math as CesiumMath,
  Credit, Color, Cartesian3, Ion, Rectangle, WebMercatorTilingScheme, SingleTileImageryProvider, DirectionalLight,
  Primitive, GeometryInstance, EllipsoidGeometry, MaterialAppearance, Material,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import '../map.css';
import { createTerrariumTerrain } from '../lib/terrarium.js';
import { enableOsmBuildings } from '../lib/osmBuildings.js';
import { createNavigation } from './map/navigation.js';
import { createNames, hasNames } from './map/names.js';
import { createMapUI } from './map/ui.js';
import { metersPerPixel, niceKm, toLatLon } from './map/geo.js';

Ion.defaultAccessToken = ''; // keine Cesium-ion-Dienste, nur offene NASA-Kacheln

// Kachelquelle für eine Kartenebene (geographisches oder Web-Mercator-Raster)
function makeProvider(layer, ellipsoid) {
  return new UrlTemplateImageryProvider({
    url: layer.url,
    tilingScheme: layer.mercator
      ? new WebMercatorTilingScheme({ ellipsoid })
      : new GeographicTilingScheme({
        ellipsoid,
        ...(layer.tilingRect && { rectangle: Rectangle.fromDegrees(...layer.tilingRect) }),
      }),
    ...(!layer.mercator && { rectangle: Rectangle.fromDegrees(-180, -90, 180, 90) }),
    tileWidth: layer.tileSize ?? 256,
    tileHeight: layer.tileSize ?? 256,
    maximumLevel: layer.maxLevel,
    credit: new Credit(layer.credit, true),
  });
}

// Schalter der Karte (bleiben beim Körperwechsel erhalten)
const prefs = { grid: false, names: true };

export function createGlobeView(container, { onPick, onLayers, onStatus }) {
  let viewer = null;
  let current = null;
  let ellipsoid = null;
  let currentBody = null;
  let gridLayer = null;
  let ui = null;
  let names = null;
  let nav = null;
  let disposers = [];

  // Gitter liegt immer ganz oben; wird bei jedem Ebenenwechsel neu gesetzt
  function applyGrid() {
    if (!viewer) return;
    if (gridLayer) { viewer.imageryLayers.remove(gridLayer, true); gridLayer = null; }
    if (!prefs.grid) return;
    gridLayer = viewer.imageryLayers.add(new ImageryLayer(new GridImageryProvider({
      tilingScheme: new GeographicTilingScheme({ ellipsoid }), ellipsoid, cells: 6,
      color: new Color(1, 1, 1, 0.28), glowColor: Color.TRANSPARENT, glowWidth: 0,
      backgroundColor: Color.TRANSPARENT,
    })));
  }

  function setLayer(index) {
    if (!viewer) return;
    viewer.imageryLayers.removeAll();
    gridLayer = null;
    const layer = currentBody.maps[index];
    if (currentBody.mapFallback) {
      viewer.imageryLayers.add(new ImageryLayer(new SingleTileImageryProvider({
        url: currentBody.mapFallback, tileWidth: 2048, tileHeight: 1024,
        rectangle: Rectangle.fromDegrees(-180, -90, 180, 90), ellipsoid,
      })));
    }
    // Lücken detaillierter Karten (nicht abgedeckte Gebiete) mit der vollständigen
    // Grundkarte füllen, leicht abgedunkelt – statt schwarzer Flächen
    if (layer.underlay !== undefined) {
      viewer.imageryLayers.add(new ImageryLayer(makeProvider(currentBody.maps[layer.underlay], ellipsoid), { brightness: 0.7, saturation: 0.6 }));
    }
    viewer.imageryLayers.add(new ImageryLayer(makeProvider(layer, ellipsoid)));
    applyGrid();
    ui?.setLayer(layer);
    onLayers?.(currentBody, index);
  }

  function teardown() {
    disposers.forEach((fn) => { try { fn(); } catch { /* bereits zerstört */ } });
    disposers = [];
    nav?.dispose();
    names?.dispose();
    nav = names = ui = gridLayer = null;
    viewer?.destroy();
    viewer = null;
    container.innerHTML = '';
  }

  function show(body) {
    if (current === body.id) return;
    teardown();
    currentBody = body;
    current = body.id;

    const stage = document.createElement('div');
    stage.className = 'map-stage';
    const uiRoot = document.createElement('div');
    uiRoot.className = 'map-ui';
    container.append(stage, uiRoot);

    const r = body.radiusKm * 1000;
    ellipsoid = new Ellipsoid(r, r, r);
    Ellipsoid.default = ellipsoid;
    const isEarth = body.id === 'earth';

    const v = new Viewer(stage, {
      globe: new Globe(ellipsoid),
      // Erde: offenes 3D-Gelände (AWS Terrain Tiles); andere Körper vorerst glatt
      ...(isEarth && { terrainProvider: createTerrariumTerrain(ellipsoid) }),
      baseLayer: false, // Ebenen setzt setLayer(0)
      baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, // eigene Bedienung (map/ui.js)
      navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false,
      infoBox: false, selectionIndicator: false,
      skyAtmosphere: isEarth ? undefined : false,
      // nur in der Entwicklung: erlaubt Screenshots des WebGL-Canvas
      contextOptions: { webgl: { preserveDrawingBuffer: import.meta.env.DEV } },
    });
    viewer = v;
    if (import.meta.env.DEV) window.__viewer = v; // nur lokales Testen
    const { scene } = v;
    const { camera } = scene;
    const { globe, canvas } = scene;
    globe.baseColor = Color.fromCssColorString('#1c2230'); // dezent statt schwarz
    globe.showGroundAtmosphere = isEarth;
    if (!isEarth) { if (scene.sun) scene.sun.show = false; if (scene.moon) scene.moon.show = false; }

    // Sanftes Seitenlicht von links oben (bleibt zur Kamera ausgerichtet): Kugel wirkt plastisch statt als flache Scheibe.
    // Die Beleuchtung blendet beim Heranzoomen aus, damit Details auf der Nachtseite lesbar bleiben.
    const light = new DirectionalLight({ direction: Cartesian3.clone(Cartesian3.UNIT_X), intensity: 2 });
    scene.light = light;
    globe.enableLighting = true;
    globe.dynamicAtmosphereLighting = false; // sonst folgt die Schattierung der Kameraposition statt unserem Licht
    globe.lightingFadeOutDistance = r * 0.35;
    globe.lightingFadeInDistance = r * 1.6;
    const tmpDir = new Cartesian3();
    const tmpA = new Cartesian3();
    disposers.push(scene.preRender.addEventListener(() => {
      Cartesian3.multiplyByScalar(camera.rightWC, 0.55, tmpA);
      Cartesian3.add(camera.directionWC, tmpA, tmpDir);
      Cartesian3.multiplyByScalar(camera.upWC, -0.4, tmpA);
      Cartesian3.add(tmpDir, tmpA, tmpDir);
      light.direction = Cartesian3.normalize(tmpDir, light.direction);
    }));

    const handler = new ScreenSpaceEventHandler(canvas);
    disposers.push(() => handler.destroy());
    nav = createNavigation(v, { ellipsoid, radius: r, isEarth, handler });
    nav.startView(0);

    // --- Namen & Bedienelemente ---
    names = createNames(v, { ellipsoid, radius: r, bodyId: body.id });
    const namesAvailable = hasNames(body.id);
    let namesReady = false;
    const closeFeature = () => { names.select(null); ui.showFeature(null); };
    ui = createMapUI(uiRoot, {
      body,
      prefs,
      on: {
        zoom: (dir) => nav.zoom(dir),
        home: () => nav.flyHome(),
        north: () => nav.resetNorth(),
        closeFeature,
        flyToFeature: (f) => names.flyTo(f, nav),
        toggle: (key, on) => {
          if (key === 'grid') { prefs.grid = on; applyGrid(); }
          if (key === 'names') { prefs.names = on; names.setEnabled(on && namesReady); if (!on) closeFeature(); }
          if (key === 'flat') { if (on) scene.morphTo2D(1); else scene.morphTo3D(1); }
        },
      },
    });
    ui.setNames({ available: namesAvailable, count: 0 });
    // flache Karte ohne Schattierung; Globus mit Seitenlicht
    disposers.push(scene.morphStart.addEventListener(() => { globe.enableLighting = false; }));
    disposers.push(scene.morphComplete.addEventListener(() => {
      globe.enableLighting = scene.mode === SceneMode.SCENE3D;
      ui.setFlat(scene.mode === SceneMode.SCENE2D);
    }));
    if (namesAvailable) {
      names.load().then((info) => {
        if (viewer !== v || !info) return;
        namesReady = true;
        ui.setNames({ available: true, ...info });
        names.setEnabled(prefs.names);
      }).catch(() => { /* Namen sind optional */ });
    }

    // --- Klick: Name (Merkmalskarte) oder beliebiger Punkt (Punktabfrage) ---
    // Verzögert, damit ein Doppelklick (Hinfliegen) keine zwei Abfragen auslöst
    let clickTimer = 0;
    handler.setInputAction((e) => {
      clearTimeout(clickTimer);
      const pos = { x: e.position.x, y: e.position.y };
      clickTimer = setTimeout(() => {
        if (viewer !== v) return;
        const f = namesReady && prefs.names ? names.fromPick(scene.pick(pos)) : null;
        if (f) {
          names.select(f);
          ui.showFeature(f);
          onPick(body, f.lat, f.lon);
          return;
        }
        closeFeature();
        const cart = camera.pickEllipsoid(pos, ellipsoid);
        if (!cart) return;
        const { lat, lon } = toLatLon(cart, ellipsoid);
        onPick(body, lat, lon);
      }, 240);
    }, ScreenSpaceEventType.LEFT_CLICK);
    disposers.push(() => clearTimeout(clickTimer));
    const cancelClick = () => clearTimeout(clickTimer);
    canvas.addEventListener('dblclick', cancelClick);
    disposers.push(() => canvas.removeEventListener('dblclick', cancelClick));

    // --- Positionsanzeige (Cursor), Maßstab, Kompass ---
    let hover = null;
    let hoverPick = 0;
    const onMove = (e) => { hover = { x: e.offsetX, y: e.offsetY }; };
    const onLeave = () => { hover = null; canvas.style.cursor = ''; };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    disposers.push(() => { canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerleave', onLeave); });

    let lastHud = 0;
    disposers.push(scene.postRender.addEventListener(() => {
      ui.setHeading(CesiumMath.toDegrees(nav.heading()));
      const now = performance.now();
      if (now - lastHud < 120) return;
      lastHud = now;
      const mode = scene.mode;
      if (mode !== SceneMode.SCENE3D && mode !== SceneMode.SCENE2D) return;

      const centre = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
      const p = camera.pickEllipsoid(hover ?? centre, ellipsoid);
      if (p) { const { lat, lon } = toLatLon(p, ellipsoid); ui.setCoord(lat, lon, !!hover); } else ui.setCoord(null, null, !!hover);

      // Maßstab am Bildmittelpunkt (ohne Globus-Treffer: am Punkt unter der Kamera)
      const mid = camera.pickEllipsoid(centre, ellipsoid)
        ?? Cartesian3.multiplyByScalar(Cartesian3.normalize(camera.positionWC, new Cartesian3()), r, new Cartesian3());
      const mpp = metersPerPixel(scene, mid);
      const km = niceKm((mpp * 110) / 1000);
      ui.setScale(Math.round((km * 1000) / mpp), km < 1 ? `${Math.round(km * 1000)} m` : `${km.toLocaleString('de-DE')} km`);
      ui.setAltitude(mode === SceneMode.SCENE3D ? nav.height() / 1000 : null);

      // Zeiger über einem Namen
      if (hover && namesReady && prefs.names && now - hoverPick > 140) {
        hoverPick = now;
        canvas.style.cursor = names.fromPick(scene.pick(hover)) ? 'pointer' : '';
      }
    }));

    if (isEarth) {
      globe.depthTestAgainstTerrain = true;
      // Die Geländedaten (Web-Mercator) enden bei ±85° Breite → Loch an den Polen.
      // Zwei eisfarbene Polkappen (85°–90°) direkt auf der Oberfläche schließen es.
      for (const [minCone, maxCone] of [[0, 5.2], [174.8, 180]]) {
        scene.primitives.add(new Primitive({
          geometryInstances: new GeometryInstance({
            geometry: new EllipsoidGeometry({
              radii: new Cartesian3(r + 1, r + 1, r + 1),
              minimumCone: CesiumMath.toRadians(minCone),
              maximumCone: CesiumMath.toRadians(maxCone),
              vertexFormat: MaterialAppearance.MaterialSupport.BASIC.vertexFormat,
            }),
          }),
          appearance: new MaterialAppearance({
            material: Material.fromType('Color', { color: Color.fromCssColorString('#e9eef4') }),
            materialSupport: MaterialAppearance.MaterialSupport.BASIC,
          }),
          asynchronous: false,
        }));
      }

      enableOsmBuildings(v, onStatus);
    }
    onStatus?.(isEarth ? 'Tipp: nah heranzoomen (unter ~2,5 km Höhe) für 3D-Gelände und Gebäude' : '');
    setLayer(0);
  }

  return { show, setLayer, resize: () => viewer?.resize() };
}
