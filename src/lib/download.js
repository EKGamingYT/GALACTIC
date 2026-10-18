// Dateien im Browser erzeugen und herunterladen (kein Server). CSV mit „;“ und BOM, damit Excel (de) Umlaute
// und Spalten richtig erkennt; Formeln am Zellanfang werden entschärft (CSV-Injection).
export function download(name, text, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const cell = (v) => {
  if (v == null) return '';
  let s = typeof v === 'number' ? String(v).replace('.', ',') : typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v !== 'number') s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// cols: [[Überschrift, (zeile) => Wert], …]
export function toCSV(rows, cols) {
  return '﻿' + [cols.map(([h]) => cell(h)).join(';'), ...rows.map((r) => cols.map(([, f]) => cell(f(r))).join(';'))].join('\r\n');
}
export const stamp = () => new Date().toISOString().slice(0, 10);
