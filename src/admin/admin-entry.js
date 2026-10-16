// Einstieg des Admin-Panels: erst dieselbe Zugangssperre der Seite, dann das Panel laden
// (im Panel folgt zusätzlich die Anmeldung mit dem Admin-Token).
import { ensureAccess } from '../gate.js';
if (ensureAccess()) import('./admin.js');
