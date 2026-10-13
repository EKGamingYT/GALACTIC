// Planetenkarte (CesiumJS) für Körper mit Kartendaten (Erde, Mond, Mars …).
// Pro Körper wird ein eigener Viewer mit passendem Ellipsoid erzeugt.
import {
  Viewer, Globe, Ellipsoid, ImageryLayer, UrlTemplateImageryProvider, GeographicTilingScheme,
  ScreenSpaceEventHandler, ScreenSpaceEventType, Cartographic, Math as CesiumMath,
  Credit, Color, Cartesian3, Ion, Rectangle,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

Ion.defaultAccessToken = ''; // keine Cesium-ion-Dienste, nur offene NASA-Kacheln

export function createGlobeView(container, { onPick }) {
  let viewer = null;
  let current = null;

  function show(body) {
    if (current === body.id) return;
    viewer?.destroy();
    container.innerHTML = '';
    current = body.id;

    const r = body.radiusKm * 1000;
    const ellipsoid = new Ellipsoid(r, r, r);
    Ellipsoid.default = ellipsoid;
    const isEarth = body.id === 'earth';

    const provider = new UrlTemplateImageryProvider({
      url: body.map.url,
      tilingScheme: new GeographicTilingScheme({
        ellipsoid,
        ...(body.map.tilingRect && { rectangle: Rectangle.fromDegrees(...body.map.tilingRect) }),
      }),
      rectangle: Rectangle.fromDegrees(-180, -90, 180, 90),
      tileWidth: body.map.tileSize,
      tileHeight: body.map.tileSize,
      maximumLevel: body.map.maxLevel,
      credit: new Credit(body.map.credit),
    });

    viewer = new Viewer(container, {
      globe: new Globe(ellipsoid),
      baseLayer: new ImageryLayer(provider),
      baseLayerPicker: false, geocoder: false, homeButton: true, sceneModePicker: true,
      navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false,
      infoBox: false, selectionIndicator: false,
      skyAtmosphere: isEarth ? undefined : false,
      // nur in der Entwicklung: erlaubt Screenshots des WebGL-Canvas
      contextOptions: { webgl: { preserveDrawingBuffer: import.meta.env.DEV } },
    });
    viewer.scene.globe.baseColor = Color.BLACK;
    viewer.scene.globe.showGroundAtmosphere = isEarth;
    viewer.camera.setView({ destination: Cartesian3.fromDegrees(0, 10, r * 3, ellipsoid) });

    // Ruhigere Steuerung (v. a. Touch): weniger Nachlauf, Zoomgrenzen
    const ctl = viewer.scene.screenSpaceCameraController;
    ctl.inertiaSpin = 0.6;
    ctl.inertiaTranslate = 0.6;
    ctl.inertiaZoom = 0.5;
    ctl.minimumZoomDistance = 300;
    ctl.maximumZoomDistance = r * 8;

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((e) => {
      const cart = viewer.camera.pickEllipsoid(e.position, ellipsoid);
      if (!cart) return;
      const c = Cartographic.fromCartesian(cart, ellipsoid);
      onPick(body, CesiumMath.toDegrees(c.latitude), CesiumMath.toDegrees(c.longitude));
    }, ScreenSpaceEventType.LEFT_CLICK);
  }

  return { show, resize: () => viewer?.resize() };
}
