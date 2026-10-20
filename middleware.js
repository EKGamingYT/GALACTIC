// Zugangsschutz der gesamten Seite (Vercel Routing Middleware, läuft auf dem Server vor JEDER Anfrage:
// Seiten, Assets, /api/*, /admin.html). Ohne gültiges Sitzungs-Cookie gibt es nur die Anmeldeseite (HTML-Aufrufe)
// bzw. 401 (Skripte, Daten, API). Kein Passwort und kein Schlüssel im Code – siehe auth-config.js und
// scripts/passwort-setzen.mjs (neues Passwort setzen ⇒ alle Sitzungen ungültig).
//
// Warum kein HMAC-Schlüssel „aus dem Hash“: Das Repo ist öffentlich – ein Schlüssel, der sich aus Code-Inhalten
// ableitet, wäre für jeden nachrechenbar (Cookies fälschbar). Stattdessen trägt das Cookie den aus dem Passwort
// abgeleiteten Sitzungswert T = HMAC(PBKDF2(passwort), …); der Server kennt nur V = SHA-256(T). Ohne Passwort
// (oder ein gestohlenes Cookie, HttpOnly) lässt sich T nicht erzeugen.
import { AUTH } from './auth-config.js';

export const config = { matcher: '/:path*' };

const COOKIE = 'galactic_auth';
const REMEMBER_S = 90 * 24 * 3600; // „Auf diesem Gerät angemeldet bleiben“
const SESSION_S = 24 * 3600; // ohne Häkchen: Browser-Sitzungscookie, serverseitig höchstens 24 h
const enc = new TextEncoder();

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

function timingSafeEqualStr(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const matchesVerifier = async (t) => timingSafeEqualStr(hex(await crypto.subtle.digest('SHA-256', t)), AUTH.verifier);

// Passwort → Sitzungswert T (langsam: PBKDF2, nur beim Anmelden)
async function tokenFromPassword(password) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from(atob(AUTH.salt), (c) => c.charCodeAt(0));
  const k = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: AUTH.iterations }, base, 256);
  const hk = await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', hk, enc.encode('galactic-session-v1'));
}

function readCookie(request, name) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

// Cookie „v1.<ablauf>.<T>“ – schnell prüfbar (ein SHA-256 pro Anfrage)
async function validSession(request) {
  const m = /^v1\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(readCookie(request, COOKIE) || '');
  if (!m) return false;
  const now = Date.now() / 1000;
  if (Number(m[1]) < now || Number(m[1]) > now + REMEMBER_S + 3600) return false;
  try { return await matchesVerifier(fromB64url(m[2])); } catch { return false; }
}

// nur relative Pfade derselben Seite als Rücksprungziel (kein offener Redirect)
const safeNext = (n) => (typeof n === 'string' && /^\/(?![\/\\])[\w\-./?=&#%~]*$/.test(n) && !n.startsWith('/__') ? n : '/');

// Bremse bei Fehlversuchen (ohne Datenbank: pro Server-Instanz, nach IP) – zusätzlich zur PBKDF2-Rechenzeit
const fails = new Map();
function failDelay(ip) {
  const now = Date.now();
  const f = fails.get(ip);
  const n = f && now - f.t < 15 * 60000 ? f.n + 1 : 1;
  fails.set(ip, { n, t: now });
  if (fails.size > 5000) fails.clear();
  return Math.min(1000 + (n - 1) * 1000, 8000);
}

const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

const T = {
  de: { sub: 'Geschützter Zugang', pw: 'Passwort', remember: 'Auf diesem Gerät angemeldet bleiben (90 Tage)', btn: 'Anmelden',
    wrong: 'Falsches Passwort.', bad: 'Ungültige Anfrage.', other: 'English', out: 'Du bist abgemeldet.' },
  en: { sub: 'Protected access', pw: 'Password', remember: 'Keep me signed in on this device (90 days)', btn: 'Sign in',
    wrong: 'Wrong password.', bad: 'Invalid request.', other: 'Deutsch', out: 'You have been signed out.' },
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function pickLang(request, url, formLang) {
  const q = formLang || url.searchParams.get('lang');
  if (q === 'de' || q === 'en') return q;
  return /^de\b/i.test(request.headers.get('accept-language') || 'de') ? 'de' : 'en';
}

function loginPage({ next = '/', lang = 'de', error = '', info = '', status = 401 }) {
  const t = T[lang];
  const other = lang === 'de' ? 'en' : 'de';
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#04060d"><title>G.A.L.A.C.T.I.C. – ${esc(t.sub)}</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700&family=Inter:wght@400;600&display=swap">
<style>
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#04060d}
body{display:grid;place-items:center;min-height:100vh;min-height:100dvh;padding:16px;color:#e8eefc;font:14px/1.5 Inter,system-ui,'Segoe UI',sans-serif;
background:radial-gradient(1.2px 1.2px at 12% 22%,#fff9,transparent 60%),radial-gradient(1px 1px at 78% 14%,#fff8,transparent 60%),
radial-gradient(1.4px 1.4px at 64% 72%,#cfe0ffcc,transparent 60%),radial-gradient(1px 1px at 28% 81%,#fff7,transparent 60%),
radial-gradient(ellipse at 50% 42%,#0e1a38 0%,#070c1b 55%,#04060d 100%) fixed}
form{width:min(380px,100%);padding:26px 24px;border:1px solid rgba(130,170,255,.2);border-radius:16px;
background:linear-gradient(180deg,rgba(14,24,52,.75),rgba(6,10,24,.75));box-shadow:0 20px 60px rgba(0,0,0,.5)}
svg{width:46px;height:46px;margin-bottom:12px}
h1{margin:0 0 2px;font:700 20px/1.1 Orbitron,system-ui,sans-serif;letter-spacing:.2em;background:linear-gradient(90deg,#fff,#bcd3ff 60%,#d6bfff);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{margin:0 0 18px;font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#8a97b5}
label{display:block;margin-bottom:6px;font-size:13px;color:#c3cde6}
input[type=password]{width:100%;padding:11px 12px;color:#fff;font:inherit;background:rgba(5,9,20,.7);border:1px solid rgba(130,170,255,.25);border-radius:10px}
input[type=password]:focus{outline:none;border-color:#6ea8ff;box-shadow:0 0 0 3px rgba(110,168,255,.2)}
.remember{display:flex;align-items:flex-start;gap:8px;margin:12px 0 0;font-size:12.5px;color:#8a97b5;cursor:pointer}
.remember input{margin:3px 0 0;accent-color:#6ea8ff}
button{width:100%;margin-top:14px;padding:11px;color:#04060d;font:600 14px Inter,system-ui,sans-serif;background:linear-gradient(90deg,#6ea8ff,#b98cff);border:0;border-radius:10px;cursor:pointer}
.msg{margin:10px 0 0;min-height:1.2em;font-size:13px}.err{color:#ff9a9a}.info{color:#9fd8b0}
.lang{position:fixed;top:16px;right:16px;padding:7px 14px;font:600 12px Inter,system-ui,sans-serif;color:#c3cde6;text-decoration:none;
background:rgba(11,17,33,.8);border:1px solid rgba(130,170,255,.3);border-radius:999px}
</style></head><body>
<a class="lang" href="/__login?lang=${other}&amp;next=${encodeURIComponent(next)}" translate="no">${t.other}</a>
<form method="post" action="/__login?next=${encodeURIComponent(next)}">
<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="none" stroke="rgba(130,170,255,.25)" stroke-width="1.5"/>
<circle cx="32" cy="32" r="9" fill="#9bbcff"/><ellipse cx="32" cy="32" rx="24" ry="8.5" transform="rotate(-22 32 32)" fill="none" stroke="#8aa8ff" stroke-width="2" opacity=".6"/></svg>
<h1>G.A.L.A.C.T.I.C.</h1><p class="sub">${esc(t.sub)}</p>
<label for="pw">${esc(t.pw)}</label>
<input id="pw" name="password" type="password" autocomplete="current-password" required autofocus maxlength="200">
<label class="remember"><input type="checkbox" name="remember" value="1" checked> <span>${esc(t.remember)}</span></label>
<input type="hidden" name="lang" value="${lang}">
<button type="submit">${esc(t.btn)}</button>
<p class="msg ${error ? 'err' : 'info'}" role="alert">${esc(error || info)}</p>
</form></body></html>`;
  return new Response(html, { status, headers: PAGE_HEADERS });
}

const plain = (text, status) => new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const clearCookie = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

export default async function middleware(request) {
  const url = new URL(request.url);
  if (!AUTH || !/^[0-9a-f]{64}$/.test(AUTH.verifier || '') || !(AUTH.iterations >= 200000)) return plain('Zugang nicht konfiguriert.', 503); // fail closed

  if (url.pathname === '/__logout') {
    return new Response(null, { status: 303, headers: { Location: '/__login?out=1', 'Cache-Control': 'no-store', 'Set-Cookie': clearCookie } });
  }

  if (url.pathname === '/__login') {
    if (request.method !== 'POST') {
      const lang = pickLang(request, url);
      // schon angemeldet → direkt weiter
      if (await validSession(request)) return new Response(null, { status: 303, headers: { Location: safeNext(url.searchParams.get('next')), 'Cache-Control': 'no-store' } });
      return loginPage({ next: safeNext(url.searchParams.get('next')), lang, info: url.searchParams.has('out') ? T[lang].out : '', status: 200 });
    }
    // CSRF-Schutz: nur Formulare dieser Seite
    const origin = request.headers.get('origin');
    const fetchSite = request.headers.get('sec-fetch-site');
    if ((origin && origin !== url.origin) || (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none')) {
      return loginPage({ lang: pickLang(request, url), error: T[pickLang(request, url)].bad, status: 403 });
    }
    let form;
    try { form = await request.formData(); } catch { return loginPage({ lang: pickLang(request, url), error: T[pickLang(request, url)].bad, status: 400 }); }
    const lang = pickLang(request, url, String(form.get('lang') || ''));
    const next = safeNext(url.searchParams.get('next') || '/'); // Rücksprungziel steht in der Formular-URL
    const given = String(form.get('password') ?? '').slice(0, 200);
    const t = given ? await tokenFromPassword(given) : null;
    if (!t || !(await matchesVerifier(t))) {
      const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unbekannt';
      await new Promise((r) => setTimeout(r, failDelay(ip)));
      return loginPage({ next, lang, error: T[lang].wrong });
    }
    const remember = form.get('remember') === '1';
    const exp = Math.floor(Date.now() / 1000) + (remember ? REMEMBER_S : SESSION_S);
    const cookie = `${COOKIE}=v1.${exp}.${b64url(t)}; Path=/; HttpOnly; Secure; SameSite=Lax${remember ? `; Max-Age=${REMEMBER_S}` : ''}`;
    return new Response(null, { status: 303, headers: { Location: next, 'Cache-Control': 'no-store', 'Set-Cookie': cookie, 'X-Dbg': encodeURIComponent(request.url + ' | ' + url.search) } });
  }

  if (await validSession(request)) return new Response(null, { headers: { 'x-middleware-next': '1' } }); // weiter zur Seite

  // Seitenaufrufe bekommen die Anmeldeseite, alles andere (Skripte, Daten, API, Service Worker) nur 401
  const wantsHtml = request.method === 'GET' && (request.headers.get('accept') || '').includes('text/html');
  if (wantsHtml) return loginPage({ next: safeNext(url.pathname + url.search), lang: pickLang(request, url) });
  return plain('Nicht angemeldet.', 401);
}
