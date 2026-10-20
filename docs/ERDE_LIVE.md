# Erde live – Aufbau, Quellen, Stand

Abgespeckter Live-Bereich auf der Erdkarte (`#/body/earth`, Knopf „🌍 Erde live“), Ideen nach
[bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view) (MIT, siehe CREDITS.md).
Bewusst **ohne** Google-3D-Tiles, Kameras, KI-/Sprachmodelle, Personensuche, Gesichtserkennung oder Personenverfolgung.

## Stand
- [x] Schritt 1: Server-Proxys + Dev-API im Vite-Server + Permissions-Policy `geolocation=(self)`
- [x] Schritt 2: Oberfläche (src/views/map/earthLive.js, Stil in src/map.css), i18n EN, CREDITS
- [x] Schritt 3: Deploy 503bfb2 auf Vercel „success“; alle neuen /api/* ohne Anmeldung → 401, Permissions-Policy live

## Ebenen
| Ebene | Quelle (Proxy) | Cache | Hinweise |
|---|---|---|---|
| Erdbeben | USGS GeoJSON (`/api/quakes?range=day\|week`) | CDN 3 min, Speicher 2 min | Größe/Farbe nach Magnitude, Tsunami-Hinweis |
| Waldbrände/Hitzepunkte | NASA FIRMS MODIS C6.1 24 h, offene CSV (`/api/fires`) | CDN 1 h, Speicher 30 min | **kein MAP_KEY nötig**; Konfidenz < 30 % weggelassen; ~17 000 Punkte |
| Raketenstarts | Launch Library 2 (`/api/launches`) | CDN 1 h, Speicher 45 min | Free-Tier 15 Abrufe/h; ein Marker je Startgelände, Countdown; Link zur Missions-Zeitleiste (`#/ops/timeline`) |
| Flugzeuge | adsb.lol `v2/point` (`/api/aircraft?lat=&lon=`) | CDN 20 s je 2°-Rasterzelle, Speicher 20 s | Radius 250 NM, max. 300; nur unter 2 500 km Kamerahöhe; Abfrage alle 20 s, pausiert nach 15 min ohne Kartenbewegung; PIA/LADD ohne Kennung |
| Wolken | NASA GIBS VIIRS NOAA-20 Echtfarben (Vortag) | Kacheln direkt (GIBS steht schon in der CSP) | Tagesmosaik, halbtransparent |
| Niederschlag | NASA GIBS IMERG 30 min; jüngste Zeit über `/api/rain-time` | CDN 20 min | feste Zeit in der Kachel-URL, sonst hielte der Kachel-Service-Worker alte Bilder |
| Überflüge | TLE aus `/api/tle` (bestehend), SGP4 im Browser (`src/lib/passes.js`) | – | Standort nur nach Klick (Browser-Zustimmung) oder Eingabe; bleibt im Browser; „sichtbar“ = Station/Hubble im Sonnenlicht, Sonne < −6° |

Alle Proxys: Zeitlimit (8–15 s), Fehler → JSON `{error}` mit kurzem Cache (60 s); die Ebene zeigt dann „Quelle gerade nicht erreichbar“.
Gemeinsamer Code in `api/_lib/live.js` (Ordner mit `_` ist für Vercel keine Route). Lokal beantwortet der Vite-Dev-Server `/api/*` mit denselben Funktionen (vite.config.js, `devApi`).

## api/weltlage – Zusammenfassung (für Sirius)
`GET /api/weltlage[?lat=..&lon=..]` → JSON: stärkste 5 Beben (24 h), nächste 5 Starts, ISS-Position, nächster
(sichtbarer) ISS-Überflug für den Ort, Anzahl Feuer (24 h), Anzahl Flugzeuge um den Ort. Ort wird auf 0,1° gerundet; CDN-Cache 5 min.

**Zugang:** liegt wie alles hinter dem Passwortschutz (`middleware.js`) – ohne Sitzungs-Cookie 401. Bewusst **noch nicht geöffnet**.
Vorschlag für später (analog Sirius-App, ohne Passwort im Sirius-Code):
1. Zufälliges Token erzeugen (≥ 32 Byte), nur dessen SHA-256 als Vercel-Umgebungsvariable `SIRIUS_TOKEN_SHA256` hinterlegen.
2. In `middleware.js` **nur** für `GET /api/weltlage` zusätzlich Header `X-Sirius-Token` akzeptieren: SHA-256 des Headers
   zeitkonstant mit `SIRIUS_TOKEN_SHA256` vergleichen → bei Treffer durchlassen (`x-middleware-next`), sonst wie bisher 401.
3. Sirius speichert das Klartext-Token lokal (Schlüsselbund/.env), sendet es nur per HTTPS-Header, nie in der URL.
   Antwort mit Token-Header nicht im öffentlichen CDN cachen (`Cache-Control: private` bzw. `Vary: X-Sirius-Token`).
4. Token-Wechsel = neue Umgebungsvariable + Redeploy.

## Weggelassen / Grenzen
- Kein Google 3D, keine Kameras, keine KI. Flugzeuge: keine Historie/Spur einzelner Flüge, keine Suche nach Kennzeichen.
- FIRMS mit MAP_KEY (Gebietsabfragen, VIIRS 375 m) nicht nötig – die offene MODIS-24-h-CSV reicht; falls die offenen
  Feeds einmal wegfallen, bräuchte es einen MAP_KEY (Vercel-Umgebungsvariable), den nur der Nutzer anlegen soll.
- Niederschlag: einzelne GIBS-Kacheln ohne Daten liefern 404 (harmlos, Cesium überspringt sie).
- adsb.lol-Grenze ca. 500 Abrufe/Tag je IP: durch Raster + CDN + Pause bei Inaktivität entschärft; bei vielen Nutzern ggf. Raster gröber/Cache länger.

## Offen
- Funktionsprüfung **angemeldet auf Produktion** steht aus (lokal mit Vite vollständig getestet; Login auf der
  Produktivseite bewusst nicht automatisiert). Bitte einmal „🌍 Erde live“ öffnen und je Ebene einschalten.
- Sirius-Zugang zu /api/weltlage (Token-Header, siehe oben) – erst auf Wunsch umsetzen.
