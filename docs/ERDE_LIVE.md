# Erde live – Zwischenstand & Aufbau

Abgespeckter Live-Bereich auf der Erdkarte (`#/body/earth`), Ideen nach
[bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view) (MIT).
Bewusst **ohne** Google-3D-Tiles, Kameras, KI-/Sprachmodelle, Personensuche oder Personenverfolgung.

## Stand
- [x] Schritt 1: Server-Proxys `api/quakes`, `api/fires`, `api/launches`, `api/aircraft`, `api/weltlage` (+ `api/_lib/live.js`),
      Dev-Server beantwortet `/api/*` lokal (vite.config.js), Permissions-Policy `geolocation=(self)`.
- [ ] Schritt 2: Oberfläche „Erde live“ (Ebenen, Legende, Info-Karten, Überflüge, Wetter)
- [ ] Schritt 3: i18n EN, CREDITS, Mobil-Prüfung, Deploy
