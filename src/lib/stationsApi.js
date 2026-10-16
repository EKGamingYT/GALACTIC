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
export const adminCreateAgency = (token, name, country) => rpc('admin_create_agency', { p_token: token, p_name: name, p_country: country });
export const adminIssueKey = (token, agencyId, label) => rpc('admin_issue_key', { p_token: token, p_agency: agencyId, p_label: label });
export const adminSetKeyActive = (token, keyId, active) => rpc('admin_set_key_active', { p_token: token, p_key_id: keyId, p_active: active });
export const adminDeleteStation = (token, id) => rpc('admin_delete_station', { p_token: token, p_id: id });

export const STATION_KINDS = {
  basis: 'Basis', forschung: 'Forschungsstation', habitat: 'Habitat', landeplatz: 'Landeplatz',
  abbau: 'Rohstoffabbau', energie: 'Energieanlage', kommunikation: 'Kommunikation',
};
export const ROUTE_KINDS = { strasse: 'Straße', schiene: 'Schiene', pipeline: 'Pipeline', kabel: 'Kabel', rover: 'Rover-Route' };
