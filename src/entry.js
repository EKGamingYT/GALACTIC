// Einstieg der App: erst Zugangssperre prüfen, dann die eigentliche App laden.
import { ensureAccess } from './gate.js';
if (ensureAccess()) import('./main.js');
