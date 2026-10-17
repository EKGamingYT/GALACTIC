// Zugriff auf die Stationsplanung (Supabase, nur REST/RPC über fetch – keine Zusatzbibliothek).
// Der Publishable Key ist absichtlich öffentlich: Lesen ist erlaubt, Schreiben geht ausschließlich über
// die RPC-Funktionen, die serverseitig den Stationsschlüssel bzw. das Admin-Token prüfen (supabase/schema.sql).
const URL = 'https://cadwpentvihjhxtbfbav.supabase.co';
const KEY = 'sb_publishable_Dkyu39xzwR_YZAQBXMRDxw_0flbSwo-';
const headers = { apikey: KEY, 'Content-Type': 'application/json' };

async function request(path, init = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...init.headers } });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || `Serverfehler ${res.status}`);
  return data;
}

const rpc = (name, args) => request(`rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });
const enc = encodeURIComponent;

// --- Lesen ---------------------------------------------------------------------------------------
export const listStations = (body) =>
  request(`stations?body=eq.${enc(body)}&select=*,agency:agencies(name,country)&order=created_at.asc`);
export const listRoutes = (body) =>
  request(`routes?select=*,station:stations!inner(body,name)&station.body=eq.${enc(body)}`);
export const countStations = () => request('stations?select=body');

// --- Organisation mit Stationsschlüssel ---------------------------------------------------------------
// Ungültiger Schlüssel → null (der Server protokolliert den Fehlversuch und bremst Durchprobieren)
export const checkKey = (key) => rpc('key_agency', { p_key: key });
export const saveStation = (key, station) => rpc('station_save', { p_key: key, p: station });
export const deleteStation = (key, id) => rpc('station_delete', { p_key: key, p_id: id });
export const saveRoute = (key, route) => rpc('route_save', { p_key: key, p: route });
export const deleteRoute = (key, id) => rpc('route_delete', { p_key: key, p_id: id });

// --- Admin ---------------------------------------------------------------------------------------------
export const adminOverview = (token) => rpc('admin_overview', { p_token: token });
export const adminCreateAgency = (token, data) => rpc('admin_create_agency', { p_token: token, p: data });
export const adminUpdateAgency = (token, id, data) => rpc('admin_update_agency', { p_token: token, p_id: id, p: data });
export const adminDeleteAgency = (token, id) => rpc('admin_delete_agency', { p_token: token, p_id: id });
export const adminIssueKey = (token, agencyId, label) => rpc('admin_issue_key', { p_token: token, p_agency: agencyId, p_label: label });
export const adminSetKeyActive = (token, keyId, active) => rpc('admin_set_key_active', { p_token: token, p_key_id: keyId, p_active: active });
export const adminDeleteStation = (token, id) => rpc('admin_delete_station', { p_token: token, p_id: id });
export const adminDeleteRoute = (token, id) => rpc('admin_delete_route', { p_token: token, p_id: id });

// --- Seiteneinstellungen & Besucher ---------------------------------------------------------------------
export const adminSetSetting = (token, key, value) => rpc('admin_set_setting', { p_token: token, p_key: key, p_value: value });
export const getSettings = async () => Object.fromEntries((await request('site_settings?select=key,value')).map((r) => [r.key, r.value]));
export const logVisit = (path, sid) => rpc('log_visit', { p_path: path, p_sid: sid });
// Verweildauer; keepalive, damit der Aufruf auch beim Schließen des Tabs noch rausgeht
export const logViewTime = (path, sid, seconds) => fetch(`${URL}/rest/v1/rpc/log_view_time`, {
  method: 'POST', headers, keepalive: true, body: JSON.stringify({ p_path: path, p_sid: sid, p_seconds: seconds }),
}).catch(() => {});
export const adminDeleteKey = (token, id) => rpc('admin_delete_key', { p_token: token, p_key_id: id });

// --- Stammdaten-Felder einer Organisation (Admin-Panel) -------------------------------------------------
export const AGENCY_CATEGORIES = [
  'Raumfahrtbehörde', 'Internationale Organisation', 'Raumfahrtunternehmen', 'Trägerraketen-Betreiber',
  'Satelliten-/Raumfahrzeughersteller', 'Forschungseinrichtung', 'Universität', 'Startup', 'Militär/Verteidigung', 'Sonstige',
];
export const AGENCY_STATUS = ['aktiv', 'geplant', 'aufgelöst'];
// ISO-3166-Ländercodes → deutsche Namen über Intl.DisplayNames (keine eigene Namensliste nötig)
const ISO = 'AF AX AL DZ AS AD AO AI AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BA BW BR BN BG BF BI CV KH CM CA KY CF TD CL CN CO KM CG CD CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GF PF GA GM GE DE GH GR GL GD GP GU GT GG GN GW GY HT HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR XK KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NC NZ NI NE NG MK NO OM PK PW PS PA PG PY PE PH PL PT PR QA RE RO RU RW WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW'.split(' ');
let countries = null;
export function countryNames() {
  if (countries) return countries;
  let dn = null;
  try { dn = new Intl.DisplayNames(['de'], { type: 'region' }); } catch { /* sehr alte Browser */ }
  countries = ['International', 'Europäische Union', ...ISO.map((c) => dn?.of(c) ?? c).sort((a, b) => a.localeCompare(b, 'de'))];
  return countries;
}
// type: text | number | url | email | select | textarea · private: nur im Admin-Panel sichtbar (nicht öffentlich lesbar)
export const AGENCY_FIELDS = [
  { key: 'name', label: 'Name', required: true, group: 'Stammdaten' },
  { key: 'short_name', label: 'Kürzel', group: 'Stammdaten', placeholder: 'z. B. NASA' },
  { key: 'category', label: 'Kategorie', type: 'select', options: () => AGENCY_CATEGORIES, group: 'Stammdaten' },
  { key: 'status', label: 'Status', type: 'select', options: () => AGENCY_STATUS, group: 'Stammdaten' },
  { key: 'country', label: 'Land', type: 'select', options: countryNames, group: 'Stammdaten' },
  { key: 'headquarters', label: 'Hauptsitz', group: 'Stammdaten', placeholder: 'Stadt' },
  { key: 'founded', label: 'Gründungsjahr', type: 'number', min: 1800, max: 2200, group: 'Kennzahlen' },
  { key: 'employees', label: 'Mitarbeitende', type: 'number', min: 0, group: 'Kennzahlen' },
  { key: 'budget_usd_m', label: 'Jahresbudget (Mio. USD)', type: 'number', min: 0, step: 'any', group: 'Kennzahlen' },
  { key: 'website', label: 'Website', type: 'url', group: 'Kennzahlen' },
  { key: 'source_url', label: 'Quelle der Angaben', type: 'url', group: 'Kennzahlen' },
  { key: 'description', label: 'Beschreibung', type: 'textarea', group: 'Kennzahlen' },
  { key: 'contact_person', label: 'Ansprechpartner', group: 'Kontakt (privat)', private: true },
  { key: 'email', label: 'E-Mail', type: 'email', group: 'Kontakt (privat)', private: true },
  { key: 'phone', label: 'Telefon', type: 'tel', group: 'Kontakt (privat)', private: true },
  { key: 'address', label: 'Postanschrift', type: 'textarea', group: 'Kontakt (privat)', private: true },
  { key: 'notes', label: 'Interne Notizen', type: 'textarea', group: 'Kontakt (privat)', private: true },
];

export const STATION_KINDS = {
  basis: 'Basis', forschung: 'Forschungsstation', habitat: 'Habitat', landeplatz: 'Landeplatz',
  abbau: 'Rohstoffabbau', energie: 'Energieanlage', kommunikation: 'Kommunikation',
};
export const ROUTE_KINDS = { strasse: 'Straße', schiene: 'Schiene', pipeline: 'Pipeline', kabel: 'Kabel', rover: 'Rover-Route' };
