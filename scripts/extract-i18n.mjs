// Sammelt deutsche Oberflächentexte (String-Literale) aus src/ und index.html für die englische Übersetzung.
// Kleiner JS-Tokenizer (Kommentare, '…', "…", `…${…}…` verschachtelt, Regex-Literale), damit keine Codeteile als Text gelten.
// Vorlagen mit ${…} werden zu Schlüsseln mit {0}, {1} …; HTML-Schnipsel werden an Tags zerlegt.
// Ausgabe: scripts/i18n-strings.json. Übersetzungen: src/i18n/en.json (deutscher Text → englisch).
// Aufruf: node scripts/extract-i18n.mjs [--stats] [--missing]   (--missing: nur Texte ohne Übersetzung)
import fs from 'node:fs';
import path from 'node:path';

const files = [];
const walk = (d) => {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { if (f !== 'i18n' && f !== 'admin') walk(p); } else if (/\.js$/.test(f)) files.push(p);
  }
};
walk('src');

const GERMAN = /[äöüßÄÖÜ]|\b(der|die|das|den|dem|des|und|nicht|mit|für|von|zu|zum|zur|auf|im|in|ein|eine|einen|ist|sind|oder|bei|nach|aus|über|unter|noch|nur|keine?|alle[sn]?|wird|werden|Karte|Daten|Quelle|Stern|Sterne|Planet|Mond|Monde|Stationen?|Routen?|Schlüssel|Laden|Lade|Fehler|Suche|Ansicht|Zeit|Tag|Tage|Jahr|Jahre|Höhe|Breite|Länge|Entfernung|Masse|Radius|Ebene|Hinweis|Schließen|Abbrechen|Speichern|Löschen|Bearbeiten|Anmelden|Abmelden|Organisation|Besatzung|Umlauf|Bahn|Himmel|Erde|Sonne|erfolgt|geplant|gescheitert|aktiv|ruhig|Bedarf|Stand|Quellen|Ziel|Start|Landung|Art)\b/;
const out = new Set();
const ALL = process.argv.includes('--all');

function add(t) {
  t = t.replace(/\s+/g, ' ').trim();
  if (t.length < 2 || !/[A-Za-zÄÖÜäöüß]{2}/.test(t)) return;
  if (/^(https?:|\.\.?\/|#\/|data:|mailto:)/.test(t)) return;
  if (/^[a-z][\w-]*$/.test(t) && !/[äöüß]/.test(t) && !GERMAN.test(t)) return; // Bezeichner, CSS-Klassen
  if (/<\/?[a-z][^>]*>/i.test(t)) {
    for (const m of t.matchAll(/(?:title|aria-label|placeholder|alt)="([^"]+)"/g)) add(m[1]);
    for (const part of t.split(/<[^>]*>/)) add(part);
    return;
  }
  const stat = t.replace(/\{\d+\}/g, '');
  if (ALL) { // Modus --all: jeder natürlichsprachige Text (auch einzelne Wörter wie „Standort“), Code-artiges raus
    if (!/[A-Za-zÄÖÜäöüß]{3}/.test(stat)) return;
    if (/^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$/.test(t) || /^[\w-]+\.(js|json|png|jpe?g|webp|svg|css|html|glb|bin)$/i.test(t)) return; // camelCase, Dateien
    if (/^[a-z0-9_-]+$/.test(t) && !/[äöüß]/.test(t) && !GERMAN.test(t)) return;   // ids, css-klassen
    if (/[{};]\s*$|^[.#][\w-]|:\s*[\w#(-]+;|=>|function|const|var\(--/.test(t)) return; // CSS/JS
    if (/^(GET|POST|application\/|text\/|image\/)/.test(t)) return;
  } else if (!GERMAN.test(stat)) return;
  if (/\{\d+\}/.test(t) && stat.replace(/[^A-Za-zÄÖÜäöüß]/g, '').length < 3) return;
  out.add(t);
}

// --- Tokenizer ------------------------------------------------------------------------------------------
function lex(s) {
  let i = 0, prev = ''; // prev: letztes bedeutsames Zeichen/Wort (für die Regex-Erkennung)
  const regexOk = () => !prev || /[(,=:[!&|?{};+\-*%<>~^]$/.test(prev) || /^(return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)$/.test(prev);
  function str(q) { // i steht hinter dem Anführungszeichen
    let v = '';
    while (i < s.length && s[i] !== q) {
      if (s[i] === '\\') { v += s[i + 1] === 'n' ? ' ' : s[i + 1]; i += 2; } else if (s[i] === '\n') break; else v += s[i++];
    }
    i++; return v;
  }
  function tpl() { // i hinter dem Backtick; Text mit {n}-Platzhaltern
    let v = '', n = 0;
    while (i < s.length && s[i] !== '`') {
      if (s[i] === '\\') { v += s[i + 1] === 'n' ? ' ' : s[i + 1]; i += 2; continue; }
      if (s[i] === '$' && s[i + 1] === '{') { i += 2; code(1); v += `{${n++}}`; continue; }
      v += s[i++];
    }
    i++; add(v);
  }
  function code(depth) { // bis zur passenden schließenden Klammer (depth > 0) bzw. Dateiende
    while (i < s.length) {
      const c = s[i];
      if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
      if (c === '/' && s[i + 1] === '*') { i = s.indexOf('*/', i + 2); i = i < 0 ? s.length : i + 2; continue; }
      if (c === "'" || c === '"') { i++; add(str(c)); prev = 'x'; continue; }
      if (c === '`') { i++; tpl(); prev = 'x'; continue; }
      if (c === '/' && regexOk()) { // Regex-Literal überspringen
        i++; let cls = false;
        while (i < s.length && (s[i] !== '/' || cls)) {
          if (s[i] === '\\') i++; else if (s[i] === '[') cls = true; else if (s[i] === ']') cls = false; else if (s[i] === '\n') break;
          i++;
        }
        i++; while (/[a-z]/.test(s[i] || '')) i++;
        prev = 'x'; continue;
      }
      if (c === '{' && depth) depth++;
      if (c === '}' && depth && --depth === 0) { i++; return; }
      if (/\s/.test(c)) { i++; continue; }
      if (/[A-Za-z_$]/.test(c)) { let w = ''; while (/[\w$]/.test(s[i] || '')) w += s[i++]; prev = w; continue; }
      if (/[0-9]/.test(c)) { while (/[\w.]/.test(s[i] || '')) i++; prev = 'x'; continue; }
      prev = c; i++;
    }
  }
  code(0);
}

for (const f of files) lex(fs.readFileSync(f, 'utf8'));
// Daten-JSON (Monde, Kleinkörper …): deutsche Zeichenkettenwerte
for (const f of fs.readdirSync('src/data').filter((x) => x.endsWith('.json'))) {
  const walkJ = (v) => { if (typeof v === 'string') add(v); else if (v && typeof v === 'object') Object.values(v).forEach(walkJ); };
  walkJ(JSON.parse(fs.readFileSync(path.join('src/data', f), 'utf8')));
}
// index.html: Textknoten und title/placeholder/aria-label
const html = fs.readFileSync('index.html', 'utf8').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
// index.html ist durchgehend deutsch: alle Textknoten mit Buchstaben aufnehmen (ohne Wortheuristik)
for (const m of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/>([^<>]+)</g)) { const t = m[1].replace(/\s+/g, ' ').trim(); if (/[A-Za-zÄÖÜäöüß]{3}/.test(t)) out.add(t); }
for (const m of html.matchAll(/(?:title|placeholder|aria-label|content)="([^"]+)"/g)) add(m[1]);

let list = [...out].sort((a, b) => a.localeCompare(b, 'de'));
const missing = process.argv.includes('--missing');
if (missing) {
  const en = JSON.parse(fs.readFileSync('src/i18n/en.json', 'utf8'));
  list = list.filter((k) => !(k in en));
}
if (process.argv.includes('--stats')) {
  console.log('Texte:', list.length, 'Zeichen:', list.reduce((a, t) => a + t.length, 0));
} else {
  const file = missing ? 'scripts/i18n-missing.json' : 'scripts/i18n-strings.json';
  fs.writeFileSync(file, JSON.stringify(list, null, 1));
  console.log(`${file}: ${list.length} Texte`);
}
