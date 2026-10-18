// Mission Control: Deep Space Network & Lichtlaufzeit · Weltraumwetter · Kolonie-Logistik (ISRU).
// Die Unterseiten werden erst beim ersten Öffnen geladen (dynamischer Import) – Route #/ops/<tab>.
import './ops.css';

const TABS = [
  { id: 'dsn', label: 'Deep Space Network', load: () => import('./dsn.js').then((m) => m.createDsnPanel) },
  { id: 'weather', label: 'Weltraumwetter', load: () => import('./weather.js').then((m) => m.createWeatherPanel) },
  { id: 'isru', label: 'Kolonie-Logistik', load: () => import('./isru.js').then((m) => m.createIsruPanel) },
];

export function createOpsView(container) {
  const root = document.createElement('div');
  root.className = 'ops';
  const wrap = document.createElement('div');
  wrap.className = 'ops-wrap';
  const head = document.createElement('div');
  head.className = 'ops-head';
  const title = document.createElement('h1');
  title.className = 'ops-title';
  title.textContent = 'Mission Control';
  const tabs = document.createElement('div');
  tabs.className = 'seg ops-tabs';
  tabs.setAttribute('role', 'tablist');
  head.append(title, tabs);
  wrap.append(head);
  root.append(wrap);
  container.append(root);

  const panes = new Map(); // id → { el, api, promise }
  let current = null, active = false;

  for (const t of TABS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t.label;
    b.dataset.tab = t.id;
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => { location.hash = `#/ops/${t.id}`; });
    tabs.append(b);
  }

  async function show(id) {
    const t = TABS.find((x) => x.id === id) || TABS[0];
    current = t.id;
    tabs.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.tab === t.id;
      b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on));
    });
    for (const [pid, p] of panes) { p.el.hidden = pid !== t.id; if (pid !== t.id) p.api?.setActive?.(false); }
    let p = panes.get(t.id);
    if (!p) {
      const el = document.createElement('div');
      el.className = 'ops-pane';
      el.textContent = 'Lade …';
      wrap.append(el);
      p = { el, api: null };
      panes.set(t.id, p);
      try {
        const create = await t.load();
        el.textContent = '';
        p.api = create(el);
      } catch (e) {
        el.textContent = `Modul konnte nicht geladen werden: ${e.message}`;
      }
    }
    if (current === t.id) p.api?.setActive?.(active);
  }

  return {
    setActive(on, arg) {
      active = on;
      if (on) show(arg || current || TABS[0].id);
      else for (const p of panes.values()) p.api?.setActive?.(false);
    },
    label: () => TABS.find((x) => x.id === current)?.label,
  };
}
