// Zugangsschutz der gesamten Seite (Vercel Routing Middleware, läuft auf dem Server vor jeder Anfrage).
// Passwort und Signaturschlüssel stehen NUR als Umgebungsvariablen in Vercel (SITE_PASSWORD, SESSION_SECRET),
// nie im Code oder im Git. Ohne beide Variablen bleibt die Seite gesperrt (fail closed).
//
// Ablauf: ohne gültiges Sitzungs-Cookie → Anmeldeseite. POST /__login prüft das Passwort (zeitkonstanter
// Vergleich, Verzögerung bei Fehlversuch) und setzt ein HttpOnly-Cookie „exp.signatur“ (HMAC-SHA-256, 14 Tage).
import { next } from '@vercel/functions';

export const config = { matcher: '/:path*' };

const COOKIE = 'galactic_session';
const MAX_AGE = 14 * 24 * 3600; // Sekunden
const enc = new TextEncoder();

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

// zeitkonstanter Vergleich gleich langer Zeichenketten (über SHA-256 auf gleiche Länge gebracht)
async function safeEqual(a, b) {
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

async function validSession(request, secret) {
  const value = readCookie(request, COOKIE);
  if (!value) return false;
  const [exp, sig] = value.split('.');
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sig, await hmac(secret, `v1:${exp}`));
}

// nur relative Pfade derselben Seite als Rücksprungziel (kein offener Redirect)
const safeNext = (n) => (typeof n === 'string' && /^\/(?![\/\\])[\w\-./?=&#%]*$/.test(n) ? n : '/');

const SECURITY_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

// Sicherheits-Header für alle ausgelieferten Seiten/Dateien nach erfolgreicher Anmeldung.
// CSP: Cesium erzeugt intern Code per new Function → 'unsafe-eval'; das einzige Inline-Skript (Notfall-Rückfall in
// index.html) ist per Hash freigegeben (über den Text mit LF-Zeilenenden) – bei Änderung den Hash neu berechnen.
const INLINE_SCRIPT_HASH = "'sha256-rwv+14VeWXqL/Ll7eqaCMsMrQpQ8h9rIhV7YejIBLMs='";
// Feste Liste der Server, mit denen die App spricht (Kacheln, Geländedaten, Kataloge, Lexikon, Datenbank).
// Enger als "https:" – falls je ein XSS entstünde, kann er Daten nicht an beliebige Fremdhosts senden.
const HOSTS = [
  'https://cadwpentvihjhxtbfbav.supabase.co', 'https://trek.nasa.gov', 'https://gibs.earthdata.nasa.gov',
  'https://tiles.maps.eox.at', 'https://s2maps.eu', 'https://tile.openstreetmap.org', 'https://tile.opentopomap.org',
  'https://s3.amazonaws.com', 'https://nominatim.openstreetmap.org', 'https://de.wikipedia.org',
  'https://overpass-api.de', 'https://overpass.kumi.systems', 'https://planetarynames.wr.usgs.gov',
  'https://simbad.cds.unistra.fr', 'https://gea.esac.esa.int', 'https://exoplanetarchive.ipac.caltech.edu',
  'https://www.cosmos.esa.int',
].join(' ');
const SITE_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    `script-src 'self' 'unsafe-eval' ${INLINE_SCRIPT_HASH}`,
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    `img-src 'self' data: blob: ${HOSTS}`,
    `connect-src 'self' ${HOSTS}`,
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; '),
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function loginPage(nextPath, error = '', status = 401) {
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>G.A.L.A.C.T.I.C. – Zugang</title>
<style>
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{display:grid;place-items:center;padding:16px;color:#e8eefc;font:14px/1.5 system-ui,'Segoe UI',sans-serif;
background:radial-gradient(1px 1px at 12% 22%,#fff9,transparent 60%),radial-gradient(1px 1px at 78% 14%,#fff8,transparent 60%),
radial-gradient(1.4px 1.4px at 64% 72%,#cfe0ffcc,transparent 60%),radial-gradient(1px 1px at 28% 81%,#fff7,transparent 60%),
radial-gradient(ellipse at 50% 40%,#0e1a38 0%,#070c1b 55%,#04060d 100%)}
form{width:min(360px,100%);padding:26px 24px;border:1px solid rgba(130,170,255,.2);border-radius:16px;
background:linear-gradient(180deg,rgba(14,24,52,.75),rgba(6,10,24,.75));box-shadow:0 20px 60px rgba(0,0,0,.5)}
h1{margin:0 0 4px;font-size:20px;letter-spacing:.22em;background:linear-gradient(90deg,#fff,#bcd3ff 60%,#d6bfff);-webkit-background-clip:text;background-clip:text;color:transparent}
p{margin:0 0 18px;color:#8a97b5;font-size:12px;letter-spacing:.12em;text-transform:uppercase}
label{display:block;margin-bottom:6px;color:#c3cde6;font-size:13px}
input{width:100%;padding:11px 12px;color:#fff;font:inherit;background:rgba(5,9,20,.7);border:1px solid rgba(130,170,255,.25);border-radius:10px}
input:focus{outline:none;border-color:#6ea8ff;box-shadow:0 0 0 3px rgba(110,168,255,.2)}
button{width:100%;margin-top:14px;padding:11px;color:#04060d;font:600 14px system-ui,sans-serif;background:linear-gradient(90deg,#6ea8ff,#b98cff);border:0;border-radius:10px;cursor:pointer}
.err{margin:10px 0 0;color:#ff9a9a;font-size:13px;text-transform:none;letter-spacing:0}
</style></head><body>
<form method="post" action="/__login">
<h1>G.A.L.A.C.T.I.C.</h1><p>Geschützter Zugang</p>
<label for="pw">Passwort</label>
<input id="pw" name="password" type="password" autocomplete="current-password" required autofocus maxlength="200">
<input type="hidden" name="next" value="${esc(nextPath)}">
<button type="submit">Entsperren</button>
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}
</form></body></html>`;
  return new Response(html, { status, headers: SECURITY_HEADERS });
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const password = process.env.SITE_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!password || !secret || secret.length < 32) {
    return new Response('Zugang nicht konfiguriert.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }

  if (url.pathname === '/__logout') {
    return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } });
  }

  if (url.pathname === '/__login') {
    if (request.method !== 'POST') return loginPage('/', '', 200);
    // nur Formulare von dieser Seite (CSRF-Schutz für die Anmeldung)
    const origin = request.headers.get('origin');
    // nur gleicher Ursprung: Origin-Abgleich und, wo vorhanden, Sec-Fetch-Site (deckt auch fehlenden Origin ab)
    const fetchSite = request.headers.get('sec-fetch-site');
    if ((origin && origin !== url.origin) || (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none')) {
      return loginPage('/', 'Ungültige Anfrage.', 403);
    }
    let form;
    try { form = await request.formData(); } catch { return loginPage('/', 'Ungültige Anfrage.', 400); }
    const given = String(form.get('password') ?? '').slice(0, 200);
    const target = safeNext(String(form.get('next') ?? '/'));
    if (!(await safeEqual(given, password))) {
      await new Promise((r) => setTimeout(r, 900)); // bremst automatisiertes Durchprobieren
      return loginPage(target, 'Falsches Passwort.');
    }
    const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
    const token = `${exp}.${await hmac(secret, `v1:${exp}`)}`;
    return new Response(null, {
      status: 303,
      headers: { Location: target, 'Cache-Control': 'no-store', 'Set-Cookie': `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax` },
    });
  }

  if (await validSession(request, secret)) return next({ headers: SITE_HEADERS });

  // Seitenaufrufe bekommen die Anmeldeseite, alles andere (Skripte, Daten, API) nur 401
  const wantsHtml = (request.headers.get('accept') || '').includes('text/html');
  if (request.method === 'GET' && wantsHtml) return loginPage(safeNext(url.pathname + url.search));
  return new Response('Nicht angemeldet.', { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
