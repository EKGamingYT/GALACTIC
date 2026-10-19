// Sprachumschaltung Deutsch/Englisch ohne Umbau der einzelnen Module:
// Die Oberfläche ist auf Deutsch geschrieben; im englischen Modus übersetzt ein MutationObserver alle sichtbaren
// Textknoten und die Attribute title/placeholder/aria-label/alt – auch Inhalte, die später nachgeladen werden.
// Wörterbuch: src/i18n/en.json (deutscher Text → englisch), Vorlagen mit {0}, {1} … für eingesetzte Werte.
// Erzeugt aus den Quelltexten mit scripts/extract-i18n.mjs. Grafik in <canvas> (Diagramme, Kartenbeschriftungen) bleibt außen vor.
const KEY = 'galactic_lang';
const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT']);

export const lang = (() => {
  try { const v = localStorage.getItem(KEY); if (v === 'de' || v === 'en') return v; } catch { /* egal */ }
  return (navigator.language || 'de').toLowerCase().startsWith('de') ? 'de' : 'en';
})();

export function setLang(l) {
  try { localStorage.setItem(KEY, l); } catch { /* egal */ }
  location.reload(); // Originaltexte sind nach dem Übersetzen weg – Neuladen ist der saubere Weg zurück
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let exact = null, templates = [], miss = new Set();
const done = new WeakMap(); // Knoten → zuletzt gesetzter Text (verhindert Endlosschleifen)

function translate(s) {
  const core = s.trim().replace(/\s+/g, ' ');
  if (!core || core.length > 2000 || miss.has(core)) return null;
  let out = exact.get(core);
  if (out == null) {
    for (const t of templates) {
      if (!core.includes(t.anchor)) continue;
      const m = t.re.exec(core);
      // Platzhalter, die ganze unübersetzte Wörter schlucken („{0} aktiv“ ← „… – nicht aktiv“), gelten nicht als Treffer
      if (m && m.slice(1).some((g) => /[a-zäöüß]{4,}/.test(g) && !/\d/.test(g) && !exact.has(g.trim()))) continue;
      if (m) { // eingesetzte Werte ebenfalls übersetzen (z. B. „Mond {0}“ mit „des Jupiter“ → „Moon of Jupiter“)
        out = t.en.replace(/\{(\d+)\}/g, (_, i) => { const v = m[t.order.indexOf(+i) + 1] ?? ''; return exact.get(v.trim()) ?? v; });
        break;
      }
    }
  }
  if (out == null) out = bySegments(core);
  if (out == null) { if (miss.size > 20000) miss.clear(); miss.add(core); return null; }
  return s.replace(s.trim(), out);
}

// Rückfall für zusammengesetzte Texte („NASA · Mond“, „Downlink (Sonde → Erde) – nicht aktiv“): schrittweise zerlegen –
// erst Aufzählungsstrich und Klammer am Ende, dann an Trennern von grob (·) nach fein (,) – jedes Teil zuerst als Ganzes suchen
const LEVELS = [' · ', ' – ', ' — ', ': ', ' / ', ', '];
const UNITS = [[/\/Tag\b/g, '/day'], [/\bTage\b/g, 'days'], [/\bTag\b/g, 'day'], [/\bStd\.?(?=\s|$)/g, 'h'], [/\bJahre?n?\b/g, 'yr'], [/\bPers\./g, 'crew'], [/\bStk\./g, 'pcs.'], [/\bEinh\./g, 'units'], [/\bca\./g, 'approx.']];
function bySegments(core) {
  let hit = false;
  const seg = (t, level) => {
    const k = t.trim();
    if (!k) return t;
    const e = exact.get(k) ?? exact.get(k.replace(/[.:]$/, ''));
    if (e != null) { hit = true; return t.replace(k, e); }
    let m = /^([–—•-]\s+)(.+)$/s.exec(k);
    if (m) return t.replace(k, m[1] + seg(m[2], 0));
    m = /^(.*\S)\s*\(([^()]+)\)$/s.exec(k);
    if (m && level === 0) return t.replace(k, `${seg(m[1], 0)} (${seg(m[2], 0)})`);
    for (let l = level; l < LEVELS.length; l++) {
      if (!k.includes(LEVELS[l])) continue;
      return t.replace(k, k.split(LEVELS[l]).map((p) => seg(p, l + 1)).join(LEVELS[l]));
    }
    const u = unitsOnly(t);
    if (u != null) { hit = true; return u; }
    return t;
  };
  const out = seg(core, 0);
  return hit ? out : null;
}
function unitsOnly(p) {
  let out = p, hit = false;
  for (const [re, en] of UNITS) out = out.replace(re, () => { hit = true; return en; });
  return hit ? out : null;
}

function doText(node) {
  if (done.get(node) === node.data) return;
  const p = node.parentElement;
  if (!p || SKIP.has(p.tagName) || p.closest('[translate="no"], .notranslate')) return;
  const t = translate(node.data);
  if (t != null && t !== node.data) { node.data = t; done.set(node, t); }
}
function doAttrs(elm) {
  for (const a of ATTRS) {
    const v = elm.getAttribute(a);
    if (!v) continue;
    const t = translate(v);
    if (t != null && t !== v) elm.setAttribute(a, t);
  }
  if (elm.tagName === 'INPUT' && (elm.type === 'button' || elm.type === 'submit') && elm.value) {
    const t = translate(elm.value); if (t != null) elm.value = t;
  }
}
function walk(root) {
  if (root.nodeType === 3) return doText(root);
  if (root.nodeType !== 1 || SKIP.has(root.tagName)) return;
  doAttrs(root);
  const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = it.nextNode(); n; n = it.nextNode()) n.nodeType === 3 ? doText(n) : doAttrs(n);
}

export async function startI18n() {
  document.documentElement.lang = lang;
  addToggle();
  if (lang !== 'en') return;
  const dict = (await import('./en.json')).default;
  exact = new Map();
  for (const [de, en] of Object.entries(dict)) {
    if (!/\{\d+\}/.test(de)) { exact.set(de, en); continue; }
    // zu allgemeine Vorlagen („{0} von {1}“) würden fremde Sätze zerreißen – erst ab 5 festen Buchstaben
    if (de.replace(/\{\d+\}/g, '').replace(/[^A-Za-zÄÖÜäöüß]/g, '').length < 5) continue;
    const order = [];
    const src = de.split(/(\{\d+\})/).map((p) => { const m = /^\{(\d+)\}$/.exec(p); if (m) { order.push(+m[1]); return '(.+?)'; } return esc(p); }).join('');
    const anchor = de.split(/\{\d+\}/).sort((a, b) => b.length - a.length)[0];
    templates.push({ re: new RegExp(`^${src}$`, 's'), order, en, anchor });
  }
  templates.sort((a, b) => b.anchor.length - a.anchor.length);
  document.title = translate(document.title) ?? document.title;
  walk(document.body);
  new MutationObserver((recs) => {
    for (const r of recs) {
      if (r.type === 'characterData') doText(r.target);
      else if (r.type === 'attributes') doAttrs(r.target);
      else r.addedNodes.forEach(walk);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  new MutationObserver(() => { const t = translate(document.title); if (t && t !== document.title) document.title = t; })
    .observe(document.querySelector('title') || document.head, { childList: true, characterData: true, subtree: true });
}

// Umschalter DE | EN oben rechts in der Kopfleiste (vor der Suche)
function addToggle() {
  const host = document.querySelector('.topbar, header');
  if (!host || host.querySelector('.lang-toggle')) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'lang-toggle notranslate';
  b.setAttribute('translate', 'no');
  b.title = lang === 'en' ? 'Auf Deutsch umschalten' : 'Switch to English';
  b.setAttribute('aria-label', b.title);
  b.innerHTML = `<span class="${lang === 'de' ? 'on' : ''}">DE</span><span class="${lang === 'en' ? 'on' : ''}">EN</span>`;
  b.onclick = () => setLang(lang === 'en' ? 'de' : 'en');
  const search = host.querySelector('.search');
  if (search) search.before(b); else host.append(b);
}
