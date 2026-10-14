# Texturquellen (neu: Sternenhimmel + Monde)

Alle hier gelisteten Dateien stammen aus offen nutzbaren NASA-/USGS-Daten (US-Behoerdenwerke bzw.
oeffentliche Missionsdaten). Es wurden **keine** Daten chinesischer Agenturen verwendet.
Abgerufen am 2026-10-13. Verarbeitung (Skalierung/Tone-Mapping) wurde mit Python/Pillow/numpy/ffmpeg
durchgefuehrt; die Rohdaten selbst wurden nicht veraendert, ausser wo unten ausdruecklich vermerkt.

Hinweis zu den bereits vorhandenen Texturen (`2k_*.jpg`, `ceres_dawn.jpg`, ...): siehe `CREDITS.md`.

---

## starmap_4k.jpg  (Himmelshintergrund)

| | |
|---|---|
| Datei | `public/textures/starmap_4k.jpg` -- 4096 x 2048 px, JPEG (q92, 4:4:4, progressiv), ca. 3,7 MB |
| Quelle (Seite) | https://svs.gsfc.nasa.gov/4851 -- "Deep Star Maps 2020" (NASA/GSFC Scientific Visualization Studio, veroeffentlicht 2020-09-09) |
| Originaldatei | https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/starmap_2020_4k.exr (4096 x 2048, OpenEXR half-float, linear, 34,3 MB) -- **celestische** Variante (nicht `_gal`) |
| Vorschau zur Kontrolle | https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/starmap_2020_4k_print.jpg |
| Credit (Pflicht-Wortlaut der SVS-Seite) | "NASA/Goddard Space Flight Center Scientific Visualization Studio. Gaia DR2: ESA/Gaia/DPAC. Constellation figures based on those developed for the IAU by Alan MacRobert of Sky and Telescope magazine (Roger Sinnott and Rick Fienberg)." Visualisierung: Ernie Wright (USRA). |
| Daten dahinter | Hipparcos-2, Tycho-2, Gaia DR2 (1,7 Mrd. Sterne), Yale Bright Star Catalog, UCAC3, XHIP |
| Lizenz | NASA-SVS-Inhalt: frei nutzbar bei Namensnennung (SVS-Seite verweist auf die NASA-"Reproduction Guidelines" https://www.nasa.gov/multimedia/guidelines/index.html). Enthaltene Gaia-DR2-Daten: ESA/Gaia/DPAC (Gaia-DPAC-Material wird ueblicherweise unter CC BY-SA 3.0 IGO bereitgestellt -- nicht separat geprueft, daher Credit unveraendert mitfuehren). |

**Verarbeitung:** EXR (linear, Werte 0..1, kein HDR-Ueberschuss) per ffmpeg zu float32 dekodiert, dann
`out = clamp((linear - 0.004) * 1.6, 0, 1) ^ (1/2.2)`, 8 Bit sRGB-aehnlich. Ergebnis: Milchstrasse deutlich
sichtbar, Hintergrund dunkel (Median-Pixelwert 24/255, Mittel 28/255). Keine Konstellationslinien/Gitter.

**Orientierung (laut SVS-Seite, Wortlaut sinngemaess):** "The map is centered at 0h right ascension, and
r.a. increases to the left." Plate carree (equirektangular), Koordinaten ICRF/J2000 geozentrisch (RA/Dec).
- Norden oben (v = 0 -> Dec +90 Grad, v = 1 -> Dec -90 Grad); Dec linear in v.
- Bildmitte (u = 0,5) = RA 0h; **RA waechst nach links**: `RA[h] = (0,5 - u) * 24` (mod 24); u = 0 und u = 1 liegen bei RA 12h.
- Das entspricht der Ansicht "von innen" (wie eine Himmelskarte, Osten links) -- fuer eine Himmelskugel
  mit `BackSide` ist daher normalerweise keine Spiegelung noetig; sonst u -> 1-u pruefen.
- Selbst gegengeprueft: LMC (RA 5h23) erscheint bei u ~ 0,28, Zentrum der Milchstrasse (RA 17h46) bei u ~ 0,76,
  SMC (RA 0h52) knapp links der Mitte -- passt zur Angabe.

---

## Monde: `public/textures/moons/<id>.jpg`

Gemeinsames: alle Karten sind zylindrisch/equirektangular, **Norden oben**. "Daten" = Anteil der Zeilen mit
Bildinhalt; schwarze Bereiche = nicht abgebildet (kein Datensatz, nichts erfunden/aufgefuellt).

### triton.jpg
| | |
|---|---|
| Datei | 1024 x 512 px, RGB, ca. 127 KB (unveraendert, das USGS-1024-px-Sample) |
| Seite | https://astrogeology.usgs.gov/search/map/triton_voyager_2_global_color_mosaic_600m -- "Triton Voyager 2 Global Color Mosaic 600m" |
| Datei-URL | https://astrogeology.usgs.gov/ckan/dataset/445b4c39-e87a-4e4d-88a8-e48d8e755c5c/resource/de0ba9f1-303e-4e5f-a99a-3201fba9a764/download/triton_voyager2_clrmosaic_1024.jpg |
| Vollaufloesung | https://planetarymaps.usgs.gov/mosaic/Triton_Voyager2_ClrMosaic_GlobalFill_600m.tif (14138 x 7069, 287 MB, nicht geladen) |
| Credit | NASA / JPL-Caltech; Dr. Paul Schenk (Lunar and Planetary Institute); veroeffentlicht von USGS Astrogeology Science Center, 2014-08-21; urspruenglich Photojournal PIA18668 |
| Lizenz | USGS-Metadaten: Access Constraints "public domain", Use Constraints "Please cite authors" |
| Orientierung | Equirektangular, planetozentrische Breite, Laenge positiv Ost, Bereich **-180..+180**: linker Rand -180, **Bildmitte = 0 Grad**, rechter Rand +180 |
| Hinweis | Farbe synthetisch (Orange/Violett/UV-Filter als R/G/B). Metadaten: "Large gap at the north pole" -> schwarze Luecke im Norden; Gitterlinien der Vorlage mit Nachbarpixeln gefuellt. Daten ca. Breite -90..+31 Grad (mittig). |

### charon.jpg
| | |
|---|---|
| Datei | 1024 x 512 px, Graustufen, ca. 68 KB (unveraendert) |
| Seite | https://astrogeology.usgs.gov/search/map/charon_new_horizons_lorri_mvic_global_mosaic_300m -- "Charon New Horizons LORRI MVIC Global Mosaic 300m" |
| Datei-URL | https://astrogeology.usgs.gov/ckan/dataset/93827f6c-8feb-42b6-98e6-b0ce57c7d2c8/resource/1abf318c-3290-4aa0-932e-a34f32d7f6ad/download/charon_newhorizons_global_mosaic_300m_jul2017_1024.jpg |
| Vollaufloesung | https://planetarymaps.usgs.gov/mosaic/Charon_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif (12693 x 6347, 77 MB, nicht geladen) |
| Credit | NASA / Johns Hopkins University Applied Physics Laboratory / Southwest Research Institute (New Horizons Team); Lunar and Planetary Institute; USGS Astrogeology, 2017-07-14 |
| Lizenz | USGS-Metadaten: Access Constraints "None", Use Constraints "Please cite authors" (NASA-Missionsdaten, gemeinfrei) |
| Orientierung | "Simple Cylindrical", planetographische Breite, Laenge positiv Ost, Bereich **0..360**: linker Rand 0 Grad, **Bildmitte = 180 Grad Ost**, rechter Rand 360 |
| Hinweis | Nur Graustufen. Suedpolregion (Breite < ca. -32 Grad) nicht abgebildet (schwarz); Gegenhalbkugel nur niedrig aufgeloest (unscharf). |

### pluto_color.jpg  (ZUSAMMENGESETZT aus zwei NASA-Produkten)
| | |
|---|---|
| Datei | 1024 x 512 px, RGB, ca. 129 KB -- **abgeleitetes Komposit**, nicht unveraenderte Originaldatei |
| Farbquelle | NASA Photojournal **PIA19956** "Pluto in Extended Color" (2015-09-24): https://photojournal.jpl.nasa.gov/catalog/PIA19956 -- Datei https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia19/pia19956/PIA19956.jpg (5999 x 3000, 1,1 MB). Credit: NASA/Johns Hopkins University Applied Physics Laboratory/Southwest Research Institute |
| Graustufen-Fuellung | USGS "Pluto New Horizons LORRI - MVIC Global Mosaic 300m": https://astrogeology.usgs.gov/search/map/pluto_new_horizons_lorri_mvic_global_mosaic_300m -- Datei https://astrogeology.usgs.gov/ckan/dataset/a5f1b7f4-9822-4697-a201-e23ef4bd3e16/resource/96be2aa1-f384-4a9f-9458-a8431a0e7956/download/pluto_newhorizons_global_mosaic_300m_jul2017_1024.jpg (1024 x 512; Vollversion 24888 x 12444, 296 MB, nicht geladen). Credit: NASA/JHUAPL/SwRI, LPI, USGS Astrogeology, 2017 |
| Lizenz | PIA19956: NASA-Bild (Photojournal, Credit angeben). USGS-Mosaik: Access Constraints "None", Use Constraints "Please cite authors". |
| Methode | PIA19956 auf 1024 x 512 skaliert; Pixel mit Farbdaten uebernommen; ausserhalb davon (wo das USGS-Mosaik Daten hat) Graustufen des USGS-Mosaiks, Helligkeit per Faktor 1,17 an die Farbkarte angeglichen (Median im Ueberlappungsbereich), Naht ca. 3 px weich ausgeblendet. Registrierung beider Karten per Kreuzkorrelation geprueft: bester Versatz 0/0 px (r = 0,70), d. h. identische Projektion/Mitte. |
| Orientierung | Equirektangular, Laenge positiv Ost, **0..360**, Bildmitte = 180 Grad Ost (Sputnik Planitia in Bildmitte), Norden oben |
| Hinweis | Farben sind **verstaerkte "extended color"** (Ralph-Filter blau/rot/nahes IR), keine Echtfarben. Farbe nur auf der Begegnungshalbkugel (ca. 32 % der Oberflaeche); Rest Graustufen (ca. 67 % insgesamt abgedeckt). Suedlich ca. -34 Grad schwarz (nicht abgebildet). Die rein graue Variante liegt bereits als `pluto_newhorizons.jpg` vor. |

### Uranusmonde und Deimos (USGS-Zylinderkarten, Zweitquelle "Views of the Solar System")
Die USGS-Astropedia-Suche liefert fuer diese Monde keine fertigen Globalmosaike (nur Kontrollnetze). Verwendet werden
die vom USGS erzeugten zylindrischen Karten, gehostet bei Calvin J. Hamilton, solarviews.com. Die Seiten nennen
"Produced by: USGS", "Copyright: Copyright Free", Verwandtes Dokument "Planetary Maps and Models". **Die
Originalablage beim USGS wurde nicht gefunden/verifiziert** -> Lizenzangabe stammt vom Hoster. Alle Dateien:
1440 x 720 px, Graustufen-JPEG, unveraendert (so heruntergeladen). Laengenkonvention/Nullmeridian ist auf den
Quellseiten **nicht dokumentiert** (unverifiziert); nur "Norden oben, Suedhalbkugel unten" ist aus dem Bild ersichtlich.

| id | Quellseite | Datei-URL | Datum | Daten |
|---|---|---|---|---|
| ariel | https://solarviews.com/cap/uranus/arielcyl1.htm | https://solarviews.com/raw/uranus/arielcyl1.jpg | 2001-11-01 | Suedhalbkugel, Breite ca. -90..-6 Grad (Voyager 2) |
| miranda | https://solarviews.com/cap/uranus/mirandacyl1.htm | https://solarviews.com/raw/uranus/mirandacyl1.jpg | 2001-11-01 | ca. -90..-9 Grad |
| umbriel | https://solarviews.com/cap/uranus/umbrielcyl1.htm | https://solarviews.com/raw/uranus/umbrielcyl1.jpg | 2001-11-01 | ca. -90..-6 Grad |
| titania | https://solarviews.com/cap/uranus/titaniacyl1.htm | https://solarviews.com/raw/uranus/titaniacyl1.jpg | 2001-11-01 | ca. -90..-11 Grad |
| oberon | https://solarviews.com/cap/uranus/oberoncyl1.htm | https://solarviews.com/raw/uranus/oberoncyl1.jpg | 2001-11-01 | ca. -90..-2 Grad |
| deimos | https://solarviews.com/cap/mars/deimoscyl1.htm | https://solarviews.com/raw/mars/deimoscyl1.jpg | 2001-10-26 | vollstaendiges Rechteck (Viking), grauer Hintergrund; Schattenrelief-artig, horizontale Mosaik-Naehte sichtbar; Deimos ist unregelmaessig, Abbildung auf Kugel nur Naeherung |

Credit (alle): U.S. Geological Survey (USGS) aus Voyager-2- bzw. Viking-Orbiter-Bilddaten (NASA/JPL); Hosting: Calvin J. Hamilton, solarviews.com.
Uranusmonde: Voyager 2 sah 1986 nur die Suedhalbkugeln -> Nordteil schwarz (kein Datensatz); die Obergrenze der Daten ist unregelmaessig (Limb).

---

## Nicht enthalten

- **proteus.jpg** -- kein sauberes, klar lizenziertes Globalmosaik gefunden. Einzig verfuegbar: eine von Phil Stooke aus einem
  Formmodell abgeleitete Interpretationskarte (https://solarviews.com/cap/nep/proteuscyl1.htm, 720 x 360, Quellseite
  widerspruechlich "Produced by NASA/USGS" / "produced by Phil Stooke", "Public Domain") -- bewusst weggelassen
  (kartografische Interpretation, keine Aufnahme; Herkunft unklar).
