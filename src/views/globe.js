// Planetenkarte (CesiumJS) für Körper mit Kartendaten (Erde, Mond, Mars …).
// Pro Körper wird ein eigener Viewer mit passendem Ellipsoid erzeugt.
import {
  Viewer, Globe, Ellipsoid, ImageryLayer, UrlTemplateImageryProvider, GeographicTilingScheme,
  ScreenSpaceEventHandler, ScreenSpaceEventType, Cartographic, Math as CesiumMath,
  Credit, Color, Cartesian3, Ion, Rectangle, WebMercatorTilingScheme, SingleTileImageryProvider,
  Primitive, GeometryInstance, EllipsoidGeometry, MaterialAppearance, Material,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { createTerrariumTerrain } from '../lib/terrarium.js';
import { enableOsmBuildings } from '../lib/osmBuildings.js';

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

export function createGlobeView(container, { onPick, onLayers, onStatus }) {
  let viewer = null;
  let current = null;
  let ellipsoid = null;
  let currentBody = null;

  function setLayer(index) {
    if (!viewer) return;
    viewer.imageryLayers.removeAll();
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
    onLayers?.(currentBody, index);
  }

  function show(body) {
    if (current === body.id) return;
    currentBody = body;
    viewer?.destroy();
    container.innerHTML = '';
    current = body.id;

    const r = body.radiusKm * 1000;
    ellipsoid = new Ellipsoid(r, r, r);
    Ellipsoid.default = ellipsoid;
    const isEarth = body.id === 'earth';


    viewer = new Viewer(container, {
      globe: new Globe(ellipsoid),
      // Erde: offenes 3D-Gelände (AWS Terrain Tiles); andere Körper vorerst glatt
      ...(isEarth && { terrainProvider: createTerrariumTerrain(ellipsoid) }),
      baseLayer: false, // Ebenen setzt setLayer(0)
      baseLayerPicker: false, geocoder: false, homeButton: true, sceneModePicker: true,
      navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false,
      infoBox: false, selectionIndicator: false,
      skyAtmosphere: isEarth ? undefined : false,
      // nur in der Entwicklung: erlaubt Screenshots des WebGL-Canvas
      contextOptions: { webgl: { preserveDrawingBuffer: import.meta.env.DEV } },
    });
    if (import.meta.env.DEV) window.__viewer = viewer; // nur lokales Testen
    viewer.scene.globe.baseColor = Color.fromCssColorString('#1c2230'); // dezent statt schwarz
    viewer.scene.globe.showGroundAtmosphere = isEarth;
    viewer.camera.setView({ destination: Cartesian3.fromDegrees(0, 10, r * 3, ellipsoid) });

    // Ruhigere Steuerung (v. a. Touch): weniger Nachlauf, Zoomgrenzen
    const ctl = viewer.scene.screenSpaceCameraController;
    ctl.inertiaSpin = 0.6;
    ctl.inertiaTranslate = 0.6;
    ctl.inertiaZoom = 0.5;
    ctl.minimumZoomDistance = isEarth ? 40 : 300;
    ctl.maximumZoomDistance = r * 8;

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((e) => {
      const cart = viewer.camera.pickEllipsoid(e.position, ellipsoid);
      if (!cart) return;
      const c = Cartographic.fromCartesian(cart, ellipsoid);
      onPick(body, CesiumMath.toDegrees(c.latitude), CesiumMath.toDegrees(c.longitude));
    }, ScreenSpaceEventType.LEFT_CLICK);
    if (isEarth) {
      viewer.scene.globe.depthTestAgainstTerrain = true;
      // Die Geländedaten (Web-Mercator) enden bei ±85° Breite → Loch an den Polen.
      // Zwei eisfarbene Polkappen (85°–90°) direkt auf der Oberfläche schließen es.
      for (const [minCone, maxCone] of [[0, 5.2], [174.8, 180]]) {
        viewer.scene.primitives.add(new Primitive({
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

      enableOsmBuildings(viewer, onStatus);
    }
    onStatus?.(isEarth ? 'Tipp: nah heranzoomen (unter ~2,5 km Höhe) für 3D-Gelände und Gebäude' : '');
    setLayer(0);
  }

  return { show, setLayer, resize: () => viewer?.resize() };
}
