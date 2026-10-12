# SPHEREx – Datenrecherche (2026-10-12)

Live getestet gegen IRSA/AWS.

## Produkte
- Level-2 **Spectral Images**: FITS-MEF, ~70 MB je Datei, 2040×2040 px, 0.615"/px.
- Extensionen: IMAGE (MJy/sr), FLAGS, VARIANCE, ZODI, PSF, WCS-WAVE.
- 6 Detektoren/Bänder: D1 0.75–1.09 µm · D2 1.10–1.62 · D3 1.63–2.41 · D4 2.42–3.82 · D5 3.83–4.41 · D6 4.42–5.00 µm.
  Wellenlänge variiert entlang einer Bildachse (LVF) → 102 Kanäle entstehen aus den 6 Detektoren.
- Releases: QR2 (ab Okt 2025, Default), QR3 (ab Sep 2026), wöchentlich. All-Sky-Datenwürfel erst später. **Keine HiPS, keine Mosaike, keine Solar-System-Produkte** offiziell.

## Zugriff
- **SIA2**: `https://irsa.ipac.caltech.edu/SIA?COLLECTION=spherex_qr2&POS=circle+RA+DEC+R&RESPONSEFORMAT=CSV`
  (Collections: spherex_qr2, spherex_qr2_deep, spherex_qr3, spherex_qr3_deep). Spalten u. a. `access_url`, `cloud_access`, `t_min`/`t_max` (MJD), `energy_bandpassname`.
  - **Kein CORS** → nur über eigenes Backend.
  - Test Orion (83.82, −5.39, r=0.05°): QR2 = 247 Bilder, 42 Zeitpunkte, MJD 60924–61117 (Sep 2025 → Mär 2026) → **zwei Himmelsdurchgänge ~6 Monate auseinander** ✔. QR3 dort (noch) leer.
- **Cutout**: `<access_url>?center=RA,DEC&size=…` – am 2026-10-12 **HTTP 503** (temporär?). Nicht als einzige Quelle einplanen.
- **AWS S3** `nasa-irsa-spherex` (us-east-1), Pfad = Pfad nach `/ibe/data/spherex/`:
  `https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com/qr2/level2/...fits`
  → **CORS `*`, GET/HEAD** → Browser kann FITS direkt laden (Range-Requests prüfen).

## Folgerung Architektur
- Backend (dünn): SIA-Abfragen proxyen + cachen, Metadaten-Index (Position × Zeit × Band).
- Für flüssiges Zoomen: eigene **HiPS-Kacheln je Durchgang** vorberechnen (z. B. hipsgen/Python-Pipeline) → Aladin Lite blendet Durchgang 1 ↔ 2 (Slider/Blink/Differenzbild).
- Bewegte Objekte: Bahnen aus JPL Horizons/SBDB über die Bildzeitpunkte legen (Asteroiden/Kometen markieren).

Quellen: irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_qr.html · caltech-ipac.github.io/spherex-archive-documentation/
