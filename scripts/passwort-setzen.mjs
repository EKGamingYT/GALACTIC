// Setzt ein neues Passwort für den Zugangsschutz (middleware.js) – ohne Vercel-Umgebungsvariable.
//
//   node scripts/passwort-setzen.mjs
//
// Erzeugt ein zufälliges, gut tippbares Passwort (5 Fünfergruppen aus a–z/2–9 ohne verwechselbare Zeichen,
// ≈124 Bit), schreibt den Klartext NUR in die lokale Datei außerhalb des Repos (PASSWORT_DATEI) und legt im
// Repo nur Salz + Iterationszahl + Prüfwert in auth-config.js ab. Der Klartext wird nie ausgegeben.
// Danach committen + pushen → nach dem Deploy sind ALLE bisherigen Anmeldungen ungültig (neues Salz).
//
// Ableitung (muss zu middleware.js passen):
//   K = PBKDF2-SHA256(passwort, salz, ITER, 256 Bit)
//   T = HMAC-SHA256(K, "galactic-session-v1")      → steht im Sitzungs-Cookie (HttpOnly)
//   V = SHA-256(T)                                  → steht in auth-config.js (öffentlich unkritisch)
import { randomInt, randomBytes, webcrypto } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PASSWORT_DATEI = process.env.GALACTIC_PW_FILE || 'C:\\Users\\j6023\\Desktop\\Claude\\.galactic_passwort.txt';
const ITER = 300000;
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // ohne i, l, o, 0, 1
const enc = new TextEncoder();
const { subtle } = webcrypto;

const group = () => Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const password = Array.from({ length: 5 }, group).join('-'); // 29 Zeichen, URL-sicher

const salt = randomBytes(16);
const base = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
const k = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, base, 256);
const hk = await subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const t = await subtle.sign('HMAC', hk, enc.encode('galactic-session-v1'));
const v = Buffer.from(await subtle.digest('SHA-256', t)).toString('hex');

writeFileSync(PASSWORT_DATEI, password + '\n', { encoding: 'utf8', mode: 0o600 });

const target = fileURLToPath(new URL('../auth-config.js', import.meta.url));
writeFileSync(target, `// Automatisch erzeugt von scripts/passwort-setzen.mjs (${new Date().toISOString().slice(0, 10)}) – nicht von Hand ändern.
// Enthält KEIN Passwort: nur Salz, Iterationszahl und den Prüfwert V = SHA-256(HMAC(PBKDF2(passwort), …)).
// Ein neues Passwort (neues Salz) macht alle bestehenden Anmeldungen ungültig.
export const AUTH = {
  salt: '${salt.toString('base64')}',
  iterations: ${ITER},
  verifier: '${v}',
};
`);
console.log(`Neues Passwort erzeugt und in die lokale Datei geschrieben (${PASSWORT_DATEI}). auth-config.js aktualisiert.`);
