# Sicherheitsüberprüfung – G.A.L.A.C.T.I.C.

Stand: 2026-10-16. Geprüft: Zugangsschutz (Middleware), Stationsplanungs-Backend (Supabase),
Admin-Panel, Frontend-XSS, Service Worker. Methode: eigener Code-Review + 15 Live-Prüfungen gegen die
echte API. Ein separater Angriffs-Agent wurde vom Sicherheitsfilter der Umgebung gestoppt; die Prüfung
wurde stattdessen direkt und defensiv durchgeführt.

## Zugangsschutz (`middleware.js`)
- Läuft serverseitig vor jeder Anfrage. Passwort und Signaturschlüssel nur als Vercel-Umgebungsvariablen
  (`SITE_PASSWORD`, `SESSION_SECRET`), nie im Code/Git. Fehlen sie → Seite gesperrt (fail closed).
- Sitzung: HttpOnly-Cookie, `Secure`, `SameSite=Lax`, HMAC-SHA-256-signiert, 14 Tage, serverseitig geprüft.
- Passwortvergleich zeitkonstant (über SHA-256 gleicher Länge). Fehlversuch mit ~0,9 s Verzögerung.
- Geprüft: kein Cookie → Anmeldeseite/401; falsches Passwort → 401; gefälschtes/manipuliertes Cookie → 401;
  CSRF (fremder Origin) beim Login → 403; offener Redirect (`//evil`, `/\evil`) → auf `/` normalisiert.
- `/__login` nur per exaktem Pfad; abweichende Schreibweise/Encoding fällt auf den Session-Check zurück (fail closed).

## Sicherheits-Header (nach Anmeldung, alle Seiten)
CSP (Inline-Skript per SHA-256-Hash freigegeben, `object-src 'none'`, `frame-ancestors 'none'`,
`base-uri 'self'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, HSTS (2 Jahre),
`Referrer-Policy`, `Permissions-Policy` (Kamera/Mikro/Standort/Zahlung aus), COOP. Im fertigen Build
gegen Erde-, Mars- und Sonnensystem-Ansicht ohne CSP-Verstoß verifiziert.
- Offener Punkt (bewusst, niedrig): `connect-src https:` ist weit, weil die App ~15 offene Datenserver
  (NASA, ESA, EOX, OSM …) anspricht. Eine feste Liste wäre strenger, bremst aber Erweiterungen.

## Stationsplanung-Backend (`supabase/schema.sql`)
- **Row Level Security** auf allen öffentlichen Tabellen; nur Lesen erlaubt. Zusätzlich `REVOKE INSERT/UPDATE/DELETE`
  für die API-Rollen (doppelt abgesichert). Direkter Schreibzugriff über die REST-API → 401 (geprüft: stations, agencies, routes).
- Schreiben ausschließlich über `SECURITY DEFINER`-RPCs, die den Stationsschlüssel bzw. das Admin-Token prüfen.
- **Schlüssel/Token nur als SHA-256-Hash** gespeichert; der Klartext-Schlüssel wird genau einmal bei Ausgabe gezeigt.
- Private Tabellen (`station_keys`, `admin_tokens`, `failed_attempts`) liegen im `private`-Schema → über die API
  nicht erreichbar (geprüft: 404).
- **Mehrmandantentrennung**: eine Organisation kann fremde Stationen/Routen weder ändern noch löschen (geprüft: abgelehnt).
- **Durchprobier-Bremse**: >30 Fehlversuche in 10 min systemweit → vorübergehend gesperrt; jeder Fehlversuch wird protokolliert.
- **Eingabevalidierung** per CHECK-Constraints und in den RPCs: Körper-ID-Muster, Wertebereiche (lat/lon/Radius),
  Routenpunkte, Längenbegrenzungen, JSON-Größe. Geprüft: ungültiger Körper → 400, Radius über Maximum → 400, lat 999 → 400.
- **SQL-Injection**: RPC-Argumente sind gebundene Parameter; `' OR '1'='1` als Schlüssel → null (kein Treffer).
- Supabase-Advisor: Die 10 „SECURITY DEFINER per API aufrufbar"-Hinweise sind hier **beabsichtigt** – genau so
  funktioniert das Schlüssel-/Admin-Modell. Jede Funktion prüft intern die Berechtigung.

## Admin-Panel (`admin.html`, `src/admin/`)
- Eigene Seite, `noindex,nofollow`, zusätzlich durch die Passwort-Middleware geschützt.
- Admin-Token nur in `sessionStorage` (endet mit dem Tab), nie in localStorage/URL/Cookie.
- Gesamtes DOM über `textContent`/Properties, kein `innerHTML` mit Fremddaten → kein XSS über Organisations-/Schlüsselnamen.

## Frontend-XSS
- Fremddaten im Lexikon (OpenStreetMap-Nominatim-Ortsname, Wikipedia-Titel/Auszug) werden mit `esc()` maskiert.
- Das Planungs-Panel (`planner.js`) baut alle Stations-/Routennamen aus der DB nur per `textContent`.
- Übrige `innerHTML`-Stellen verwenden ausschließlich eigene, gebündelte Katalogdaten, keine Nutzereingaben.

## Service Worker (`public/tile-sw.js`)
- Cacht nur Bildkacheln fremder Kartenserver (feste Hostliste, nur `.png/.jpg/.webp`), nie die App, API oder
  Anmeldedaten; speichert keine „opaque"-Antworten.

## Abhängigkeiten
- `npm audit --omit=dev`: 0 Schwachstellen.

## Empfehlung
Kein offener kritischer Punkt. Optional später: `connect-src` auf eine feste Serverliste eingrenzen.
