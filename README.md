# G.A.L.A.C.T.I.C.

**Global Aerospace Logistics and Astronautical Cooperation – Technology, Innovation, Colonization**

Ein offener 3D-Atlas des Weltraums: Sonnensystem mit echten Bahnen, Planetenkarten
(Erde, Mond, Mars …) aus NASA-Daten und – für die NASA Space Apps Challenge 2026 –
ein Zeitvergleich des Nachthimmels mit SPHEREx-Daten.

## Starten
```bash
npm install
npm run dev
```
Dann http://localhost:5173 öffnen (unter Windows auch per `GALACTIC starten.bat`).

## Aufbau
- `src/views/system.js` – 3D-Sonnensystem (three.js), Bahnen nach JPL/Standish
- `src/views/globe.js` – Planetenkarten (CesiumJS) mit NASA-Kacheln
- `src/views/sky.js` – SPHEREx-Himmel (in Arbeit)
- `src/data/bodies.js` – Himmelskörper, physikalische Daten, Kartenquellen
- `docs/` – Recherche & Planung

**Live-Demo:** https://galactic-vert.vercel.app

Quellen und Lizenzen: [CREDITS.md](CREDITS.md). Lizenz: Apache-2.0.
