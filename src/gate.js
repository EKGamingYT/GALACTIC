// Einfache Zugangssperre in der Web-App selbst (ohne Server/Vercel-Middleware).
// Hinweis: Das ist bewusst NUR eine leichte Sperre – der Abgleich läuft im Browser, das Passwort
// (als SHA-256-Hash hinterlegt) ist im ausgelieferten Code enthalten und daher nicht wirklich geheim.
// Sie hält Gelegenheitszugriffe ab, ersetzt aber keinen serverseitigen Schutz.
import { lang, setLang } from './i18n/i18n.js';

const PASSWORD_SHA256 = 'f34256f79341a67d6dc5547f3883394e3390761a912daf18ddf24ffc94e47d21';
const STORE = 'galactic_unlocked';

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function unlocked() {
  try {
    return localStorage.getItem(STORE) === PASSWORD_SHA256 || sessionStorage.getItem(STORE) === PASSWORD_SHA256;
  } catch { return false; }
}

// true → Zugang vorhanden, App darf starten. false → Sperre wird angezeigt, Aufrufer startet die App NICHT.
export function ensureAccess() {
  if (unlocked()) return true;
  showGate();
  return false;
}

function showGate() {
  // Startbildschirm ausblenden, solange die Sperre sichtbar ist
  const boot = document.getElementById('boot');
  if (boot) boot.style.display = 'none';
  document.documentElement.style.background = '#04060d';

  const style = document.createElement('style');
  style.textContent = `
    .gate { position: fixed; inset: 0; z-index: 3000; display: grid; place-items: center; padding: 16px;
      font: 14px/1.5 system-ui, 'Segoe UI', sans-serif; color: #e8eefc;
      background:
        radial-gradient(1.2px 1.2px at 12% 22%, #fff9, transparent 60%),
        radial-gradient(1px 1px at 78% 14%, #fff8, transparent 60%),
        radial-gradient(1.4px 1.4px at 64% 72%, #cfe0ffcc, transparent 60%),
        radial-gradient(1px 1px at 28% 81%, #fff7, transparent 60%),
        radial-gradient(ellipse at 50% 42%, #0e1a38 0%, #070c1b 55%, #04060d 100%); }
    .gate form { width: min(360px, 100%); padding: 26px 24px; text-align: left;
      border: 1px solid rgba(130,170,255,.2); border-radius: 16px;
      background: linear-gradient(180deg, rgba(14,24,52,.75), rgba(6,10,24,.75)); box-shadow: 0 20px 60px rgba(0,0,0,.5); }
    .gate .mark { width: 46px; height: 46px; margin-bottom: 12px; }
    .gate h1 { margin: 0 0 2px; font: 700 20px/1.1 Orbitron, system-ui, sans-serif; letter-spacing: .2em;
      background: linear-gradient(90deg,#fff,#bcd3ff 60%,#d6bfff); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .gate p.sub { margin: 0 0 18px; font-size: 11px; letter-spacing: .28em; text-transform: uppercase; color: #8a97b5; }
    .gate label { display: block; margin-bottom: 6px; font-size: 13px; color: #c3cde6; }
    .gate input { width: 100%; padding: 11px 12px; color: #fff; font: inherit; box-sizing: border-box;
      background: rgba(5,9,20,.7); border: 1px solid rgba(130,170,255,.25); border-radius: 10px; }
    .gate input:focus { outline: none; border-color: #6ea8ff; box-shadow: 0 0 0 3px rgba(110,168,255,.2); }
    .gate button { width: 100%; margin-top: 14px; padding: 11px; color: #04060d; font: 600 14px system-ui, sans-serif;
      background: linear-gradient(90deg,#6ea8ff,#b98cff); border: 0; border-radius: 10px; cursor: pointer; }
    .gate .err { margin: 10px 0 0; min-height: 1.2em; color: #ff9a9a; font-size: 13px; }
    .gate label.remember { display: flex; align-items: center; gap: 8px; margin: 12px 0 0; font-size: 12.5px; color: #8a97b5; }
    .gate label.remember input { width: auto; }
  `;
  document.head.appendChild(style);

  const wrap = document.createElement('div');
  wrap.className = 'gate';
  wrap.innerHTML = `
    <form autocomplete="off">
      <svg class="mark" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="29" fill="none" stroke="rgba(130,170,255,.25)" stroke-width="1.5"/>
        <circle cx="32" cy="32" r="9" fill="#9bbcff"/>
        <ellipse cx="32" cy="32" rx="24" ry="8.5" transform="rotate(-22 32 32)" fill="none" stroke="#8aa8ff" stroke-width="2" opacity=".6"/>
      </svg>
      <h1>G.A.L.A.C.T.I.C.</h1>
      <p class="sub">Geschützter Zugang</p>
      <label for="gate-pw">Passwort</label>
      <input id="gate-pw" type="password" autocomplete="current-password" autofocus maxlength="200" />
      <label class="remember"><input id="gate-remember" type="checkbox" checked /> Auf diesem Gerät merken</label>
      <button type="submit">Entsperren</button>
      <p class="err" id="gate-err" role="alert"></p>
    </form>`;
  document.body.appendChild(wrap);

  // Sprachwahl schon vor dem Entsperren (internationale Besucher)
  const lb = document.createElement('button');
  lb.type = 'button';
  lb.setAttribute('translate', 'no');
  lb.className = 'notranslate';
  lb.textContent = lang === 'en' ? 'Deutsch' : 'English';
  lb.style.cssText = 'position:fixed;top:16px;right:16px;left:auto;width:auto;margin:0;padding:7px 14px;font:600 12px Inter,system-ui,sans-serif;color:#c3cde6;'
    + 'background:rgba(11,17,33,.8);border:1px solid rgba(130,170,255,.3);border-radius:999px;cursor:pointer;z-index:2';
  lb.onclick = () => setLang(lang === 'en' ? 'de' : 'en');
  wrap.appendChild(lb);

  const form = wrap.querySelector('form');
  const input = wrap.querySelector('#gate-pw');
  const remember = wrap.querySelector('#gate-remember');
  const err = wrap.querySelector('#gate-err');
  input.focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const hash = await sha256Hex(input.value);
    if (hash !== PASSWORD_SHA256) {
      err.textContent = 'Falsches Passwort.';
      input.select();
      return;
    }
    try {
      if (remember.checked) localStorage.setItem(STORE, PASSWORD_SHA256);
      else sessionStorage.setItem(STORE, PASSWORD_SHA256); // nur bis zum Schließen des Tabs
    } catch { /* Speicher evtl. blockiert – dann nach Neuladen erneut fragen */ }
    location.reload();
  });
}
