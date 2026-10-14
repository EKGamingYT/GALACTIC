// Bedienung der Planetenkarte: Mausrad-Zoom zum Cursor (geglättet), Doppelklick-Flug,
// Ganzer-Globus-Ansicht, Nordung und Zoom-Grenzen. Dreh-/Kipp-Gesten bleiben bei Cesium.
import {
  BoundingSphere, CameraEventType, Cartesian3, Cartographic, HeadingPitchRange, Math as CesiumMath,
  Rectangle, SceneMode, ScreenSpaceEventType,
} from 'cesium';
import { globeFitDistance, pickSurface } from './geo.js';

const TILTED = -1.45; // rad: flacher als ~-83° = geneigte Ansicht

export function createNavigation(viewer, { ellipsoid, radius, isEarth, handler }) {
  const { scene } = viewer;
  const camera = scene.camera;
  const canvas = scene.canvas;
  const ctl = scene.screenSpaceCameraController;
  const minHeight = isEarth ? 40 : Math.min(300, radius * 0.02); // m über der Oberfläche
  const maxHeight = radius * 8;

  // Ruhiger Nachlauf; Mausrad übernehmen wir selbst (Zoom zum Cursor), Pinch/Rechts-Ziehen bleiben bei Cesium
  ctl.inertiaSpin = 0.82;
  ctl.inertiaTranslate = 0.82;
  ctl.inertiaZoom = 0.7;
  ctl.minimumZoomDistance = minHeight;
  ctl.maximumZoomDistance = maxHeight;
  const setWheelOwner = (mine) => {
    ctl.zoomEventTypes = mine
      ? [CameraEventType.RIGHT_DRAG, CameraEventType.PINCH]
      : [CameraEventType.RIGHT_DRAG, CameraEventType.WHEEL, CameraEventType.PINCH];
  };
  setWheelOwner(true);
  // Cesium hängt ans Doppelklicken sonst „Entität verfolgen“ – wir fliegen stattdessen zum Punkt
  viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

  const unsubMorph = scene.morphComplete.addEventListener(() => setWheelOwner(scene.mode === SceneMode.SCENE3D));
  const unsubMorphStart = scene.morphStart.addEventListener(() => setWheelOwner(false));

  // --- Ansicht „Ganzer Globus“ ---
  function startView(duration = 0, lon = 0, lat = 15) {
    if (scene.mode === SceneMode.SCENE2D) {
      camera.flyTo({ destination: Rectangle.fromDegrees(-180, -90, 180, 90), duration });
      return;
    }
    const opts = {
      destination: Cartesian3.fromDegrees(lon, lat, globeFitDistance(scene, radius) - radius, ellipsoid),
      orientation: { heading: 0, pitch: -CesiumMath.PI_OVER_TWO, roll: 0 },
    };
    if (duration > 0) camera.flyTo({ ...opts, duration }); else camera.setView(opts);
  }

  function resetNorth() {
    camera.cancelFlight();
    if (scene.mode !== SceneMode.SCENE3D) return;
    camera.flyTo({
      destination: Cartesian3.clone(camera.positionWC),
      orientation: { heading: 0, pitch: -CesiumMath.PI_OVER_TWO, roll: 0 },
      duration: 0.7,
    });
  }

  // --- Zoom zum Cursor ---
  let pending = 0;    // noch auszuführender Zoom (ln-Faktor, >0 = hinaus)
  let anchor = null;  // Bildschirmposition, auf die gezoomt wird (null = Bildmitte)

  function zoomAt(factor, a) {
    const pos = camera.positionWC;
    const carto = Cartographic.fromCartesian(pos, ellipsoid);
    const terrain = isEarth ? (scene.globe.getHeight(carto) ?? 0) : 0;
    const h = carto.height;
    const newH = Math.min(maxHeight, Math.max(minHeight + terrain, h * factor));
    if (Math.abs(newH - h) < 1e-6) return;
    const s = newH / h;
    const P = a ? pickSurface(scene, ellipsoid, a, isEarth) : undefined;
    const heading = camera.heading;
    const pitch = camera.pitch;

    if (P && pitch > TILTED) {
      // geneigte Ansicht: Kamera entlang des Strahls durch den Cursor bewegen (Punkt bleibt unter dem Cursor)
      let t = 1 - s;
      const next = new Cartesian3();
      for (let i = 0; i < 3; i++) {
        Cartesian3.add(pos, Cartesian3.multiplyByScalar(Cartesian3.subtract(P, pos, next), t, next), next);
        const nh = Cartographic.fromCartesian(next, ellipsoid).height;
        if (nh >= minHeight + terrain || t <= 0) break;
        t *= (h - (minHeight + terrain)) / Math.max(1e-6, h - nh) * 0.98;
      }
      Cartesian3.clone(next, camera.position);
      return;
    }

    // Draufsicht: Unterpunkt der Kamera zum Cursor-Punkt verschieben, Höhe skalieren
    const nS = Cartesian3.normalize(pos, new Cartesian3());
    const dest = (n) => Cartesian3.multiplyByScalar(n, radius + newH, new Cartesian3());
    const view = (n) => camera.setView({ destination: dest(n), orientation: { heading, pitch, roll: 0 } });
    let n = nS;
    if (P) {
      const nP = Cartesian3.normalize(P, new Cartesian3());
      // beim Herauszoomen nur nahe der Oberfläche zum Cursor ziehen, weit draußen mittig bleiben
      const damp = s > 1 ? CesiumMath.clamp((2 * radius - h) / (1.5 * radius), 0, 1) : 1;
      const f = (1 - s) * damp;
      n = Cartesian3.normalize(Cartesian3.add(
        Cartesian3.multiplyByScalar(nS, 1 - f, new Cartesian3()), Cartesian3.multiplyByScalar(nP, f, new Cartesian3()),
        new Cartesian3()), new Cartesian3());
      view(n);
      // Feinkorrektur: liegt unter dem Cursor noch ein anderer Punkt, Kamera um die Differenz nachführen
      const P2 = pickSurface(scene, ellipsoid, a, isEarth);
      if (P2) {
        const nP2 = Cartesian3.normalize(P2, new Cartesian3());
        const corr = Cartesian3.subtract(nP, nP2, new Cartesian3());
        view(Cartesian3.normalize(Cartesian3.add(n, corr, new Cartesian3()), new Cartesian3()));
      }
      return;
    }
    view(n);
  }

  let lastTick = performance.now();
  const unsubTick = scene.preRender.addEventListener(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTick) / 1000);
    lastTick = now;
    if (Math.abs(pending) < 1e-3) { pending = 0; return; }
    const step = pending * (1 - Math.exp(-dt / 0.09));
    pending -= step;
    zoomAt(Math.exp(step), anchor);
  });

  const addZoom = (ln, a) => {
    camera.cancelFlight();
    anchor = a ?? null;
    pending = CesiumMath.clamp(pending + ln, -2.5, 2.5);
  };

  function onWheel(e) {
    if (scene.mode !== SceneMode.SCENE3D) return; // 2D: Standardzoom
    e.preventDefault();
    const px = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    addZoom(CesiumMath.clamp(px * 0.0022, -0.5, 0.5), { x: e.offsetX, y: e.offsetY });
  }
  canvas.addEventListener('wheel', onWheel, { passive: false });
  const stop = () => { pending = 0; camera.cancelFlight(); };
  canvas.addEventListener('pointerdown', stop);

  // --- Doppelklick: zum Punkt hinfliegen (Höhe auf ~40 %) ---
  handler.setInputAction((e) => {
    const P = pickSurface(scene, ellipsoid, e.position, isEarth);
    if (!P) return;
    flyToPoint(P, 0.4);
  }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

  function flyToPoint(P, k = 0.4, range) {
    pending = 0;
    const h = Cartographic.fromCartesian(camera.positionWC, ellipsoid).height;
    camera.flyToBoundingSphere(new BoundingSphere(P, 0), {
      offset: new HeadingPitchRange(camera.heading ?? 0, camera.pitch ?? -CesiumMath.PI_OVER_TWO, Math.max(minHeight * 2, range ?? h * k)),
      duration: 1.1,
    });
  }

  return {
    startView,
    flyHome: () => { stop(); startView(1.4); },
    resetNorth,
    zoom: (dir) => addZoom(dir * 0.55, null),
    flyToPoint,
    heading: () => (scene.mode === SceneMode.SCENE3D ? camera.heading : 0), // in 2D gibt Cesium keinen Kurs an
    height: () => Cartographic.fromCartesian(camera.positionWC, ellipsoid).height,
    dispose() {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', stop);
      unsubTick();
      unsubMorph();
      unsubMorphStart();
    },
  };
}
