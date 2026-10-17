-- G.A.L.A.C.T.I.C. – Stationsplanung (Supabase/Postgres)
-- Öffentlich lesbar: agencies (nur Name/Land), stations, routes. Schreiben NUR über die RPC-Funktionen unten,
-- die einen Organisationsschlüssel (nur als SHA-256-Hash gespeichert) bzw. das Admin-Token prüfen.
-- Das private Schema ist nicht über die API erreichbar. Der Admin-Token-Hash wird separat (nicht im Repo) gesetzt.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- --- Tabellen -------------------------------------------------------------------------------------
create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 120),
  country text check (char_length(country) <= 80),
  created_at timestamptz not null default now()
);

create table private.admin_tokens (hash bytea primary key, created_at timestamptz not null default now());

create table private.station_keys (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  label text check (char_length(label) <= 120),
  key_hash bytea not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table private.failed_attempts (ts timestamptz not null default now(), kind text not null, bucket bytea);
create index on private.failed_attempts (ts);
create index on private.failed_attempts (bucket, ts);

create table public.stations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  body text not null check (body ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 2 and 120),
  kind text not null check (kind in ('basis', 'forschung', 'habitat', 'landeplatz', 'abbau', 'energie', 'kommunikation')),
  status text not null default 'geplant' check (status in ('geplant', 'im Bau', 'aktiv')),
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  radius_m double precision not null check (radius_m between 1 and 1000000),
  crew integer check (crew between 0 and 100000),
  description text check (char_length(description) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.stations (body);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  kind text not null check (kind in ('strasse', 'schiene', 'pipeline', 'kabel', 'rover')),
  points jsonb not null check (jsonb_typeof(points) = 'array' and jsonb_array_length(points) between 2 and 500),
  created_at timestamptz not null default now()
);
create index on public.routes (station_id);

alter table public.agencies enable row level security;
alter table public.stations enable row level security;
alter table public.routes enable row level security;
create policy "lesen" on public.agencies for select to anon, authenticated using (true);
create policy "lesen" on public.stations for select to anon, authenticated using (true);
create policy "lesen" on public.routes for select to anon, authenticated using (true);
-- keine insert/update/delete-Policies: direkter Schreibzugriff ist für alle Rollen gesperrt

-- --- Prüfungen --------------------------------------------------------------------------------------
-- Bremse gegen Durchprobieren: >= 20 Fehlversuche je vorgelegtem Schlüssel/Token in 10 Minuten → gesperrt.
-- Pro Zugangsmittel (nicht global), damit niemand mit dem öffentlichen Key alle Organisationen aussperren kann.
create function private.throttle(p_bucket bytea) returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from private.failed_attempts where ts < now() - interval '1 day';
  if (select count(*) from private.failed_attempts where bucket = p_bucket and ts > now() - interval '10 minutes') >= 20 then
    raise exception 'Zu viele Fehlversuche – bitte später erneut versuchen' using errcode = 'P0001';
  end if;
end $$;

create function private.agency_for_key(p_key text) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_bucket bytea := extensions.digest(coalesce(p_key, ''), 'sha256');
begin
  perform private.throttle(v_bucket);
  if p_key is null or char_length(p_key) not between 20 and 200 then v_agency := null;
  else
    update private.station_keys set last_used_at = now()
      where key_hash = v_bucket and active
      returning agency_id into v_agency;
  end if;
  if v_agency is null then
    -- KEIN raise: eine Exception würde den Protokolleintrag zurückrollen → Aufrufer geben null zurück
    insert into private.failed_attempts (kind, bucket) values ('key', v_bucket);
  end if;
  return v_agency;
end $$;

create function private.is_admin(p_token text) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_bucket bytea := extensions.digest(coalesce(p_token, ''), 'sha256');
begin
  perform private.throttle(v_bucket);
  if p_token is null or char_length(p_token) > 200 or not exists (select 1 from private.admin_tokens where hash = v_bucket) then
    insert into private.failed_attempts (kind, bucket) values ('admin', v_bucket);
    return false;
  end if;
  return true;
end $$;

-- --- Öffentliche RPCs (Organisationen mit Schlüssel) --------------------------------------------------
create function public.key_agency(p_key text) returns json language plpgsql security definer set search_path = '' as $$
declare v uuid := private.agency_for_key(p_key);
begin
  if v is null then return null; end if;
  return (select json_build_object('id', a.id, 'name', a.name, 'country', a.country) from public.agencies a where a.id = v);
end $$;

create function public.station_save(p_key text, p jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_agency uuid := private.agency_for_key(p_key); v_id uuid;
begin
  if v_agency is null then return null; end if;
  if jsonb_typeof(p) <> 'object' or pg_column_size(p) > 16000 then raise exception 'Ungültige Daten'; end if;
  if p ? 'id' and nullif(p->>'id', '') is not null then
    update public.stations set
      body = p->>'body', name = p->>'name', kind = p->>'kind', status = coalesce(p->>'status', 'geplant'),
      lat = (p->>'lat')::float8, lon = (p->>'lon')::float8, radius_m = (p->>'radius_m')::float8,
      crew = nullif(p->>'crew', '')::int, description = p->>'description', updated_at = now()
    where id = (p->>'id')::uuid and agency_id = v_agency returning id into v_id;
    if v_id is null then raise exception 'Station nicht gefunden oder fremde Organisation'; end if;
  else
    insert into public.stations (agency_id, body, name, kind, status, lat, lon, radius_m, crew, description)
    values (v_agency, p->>'body', p->>'name', p->>'kind', coalesce(p->>'status', 'geplant'), (p->>'lat')::float8, (p->>'lon')::float8,
      (p->>'radius_m')::float8, nullif(p->>'crew', '')::int, p->>'description')
    returning id into v_id;
  end if;
  return v_id;
end $$;

create function public.station_delete(p_key text, p_id uuid) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_agency uuid := private.agency_for_key(p_key);
begin
  if v_agency is null then return false; end if;
  delete from public.stations where id = p_id and agency_id = v_agency;
  if not found then raise exception 'Station nicht gefunden oder fremde Organisation'; end if;
  return true;
end $$;

create function public.route_save(p_key text, p jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_agency uuid := private.agency_for_key(p_key); v_id uuid; pt jsonb;
begin
  if v_agency is null then return null; end if;
  if jsonb_typeof(p) <> 'object' or pg_column_size(p) > 24000 then raise exception 'Ungültige Daten'; end if;
  if jsonb_typeof(p->'points') <> 'array' then raise exception 'Ungültige Punkte'; end if;
  for pt in select * from jsonb_array_elements(p->'points') loop
    if jsonb_typeof(pt) <> 'array' or jsonb_array_length(pt) <> 2
      or (pt->>0)::float8 not between -90 and 90 or (pt->>1)::float8 not between -180 and 180 then
      raise exception 'Ungültiger Routenpunkt';
    end if;
  end loop;
  if not exists (select 1 from public.stations where id = (p->>'station_id')::uuid and agency_id = v_agency) then
    raise exception 'Station nicht gefunden oder fremde Organisation';
  end if;
  insert into public.routes (station_id, agency_id, name, kind, points)
  values ((p->>'station_id')::uuid, v_agency, p->>'name', p->>'kind', p->'points') returning id into v_id;
  return v_id;
end $$;

create function public.route_delete(p_key text, p_id uuid) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_agency uuid := private.agency_for_key(p_key);
begin
  if v_agency is null then return false; end if;
  delete from public.routes where id = p_id and agency_id = v_agency;
  if not found then raise exception 'Route nicht gefunden oder fremde Organisation'; end if;
  return true;
end $$;

-- --- Admin-RPCs ----------------------------------------------------------------------------------------
create function public.admin_overview(p_token text) returns json language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(p_token) then return null; end if;
  return json_build_object(
    'agencies', coalesce((select json_agg(json_build_object('id', a.id, 'name', a.name, 'country', a.country,
      'stations', (select count(*) from public.stations s where s.agency_id = a.id)) order by a.name) from public.agencies a), '[]'),
    'keys', coalesce((select json_agg(json_build_object('id', k.id, 'agency_id', k.agency_id, 'label', k.label, 'active', k.active,
      'created_at', k.created_at, 'last_used_at', k.last_used_at) order by k.created_at desc) from private.station_keys k), '[]'));
end $$;

create function public.admin_create_agency(p_token text, p_name text, p_country text) returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not private.is_admin(p_token) then return null; end if;
  insert into public.agencies (name, country) values (trim(p_name), nullif(trim(p_country), '')) returning id into v;
  return v;
end $$;

-- gibt den neuen Schlüssel genau EINMAL im Klartext zurück; gespeichert wird nur der Hash
create function public.admin_issue_key(p_token text, p_agency uuid, p_label text) returns text language plpgsql security definer set search_path = '' as $$
declare v_key text := 'GLX-' || encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not private.is_admin(p_token) then return null; end if;
  insert into private.station_keys (agency_id, label, key_hash) values (p_agency, p_label, extensions.digest(v_key, 'sha256'));
  return v_key;
end $$;

create function public.admin_set_key_active(p_token text, p_key_id uuid, p_active boolean) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(p_token) then return false; end if;
  update private.station_keys set active = p_active where id = p_key_id;
  return found;
end $$;

create function public.admin_delete_station(p_token text, p_id uuid) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(p_token) then return false; end if;
  delete from public.stations where id = p_id;
  return found;
end $$;

-- --- Rechte: Funktionen standardmäßig gesperrt, nur die RPCs freigeben -------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function public.key_agency(text), public.station_save(text, jsonb), public.station_delete(text, uuid),
  public.route_save(text, jsonb), public.route_delete(text, uuid),
  public.admin_overview(text), public.admin_create_agency(text, text, text), public.admin_issue_key(text, uuid, text),
  public.admin_set_key_active(text, uuid, boolean), public.admin_delete_station(text, uuid)
  to anon, authenticated;
-- doppelt abgesichert: auch ohne RLS keine Schreibrechte für die API-Rollen
revoke insert, update, delete, truncate on public.agencies, public.stations, public.routes from anon, authenticated;

-- =====================================================================================================
-- Erweiterung 2026-10-17: Organisationen mit Stammdaten + volle Admin-Verwaltung
-- (im Live-Projekt bereits per Migrationen angewandt; hier als Dokumentation des aktuellen Standes)
-- =====================================================================================================
alter table public.agencies add column if not exists category text;
alter table public.agencies add column if not exists website text;
alter table public.agencies add column if not exists description text;
-- Kontakt-PII separat und NICHT öffentlich lesbar (Spalten-REVOKE reicht nicht, da anon SELECT auf
-- Tabellenebene hat → eigene Tabelle im privaten Schema):
create table if not exists private.agency_contacts (
  agency_id uuid primary key references public.agencies(id) on delete cascade,
  contact_person text check (contact_person is null or char_length(contact_person) <= 120),
  email text check (email is null or char_length(email) <= 200),
  phone text check (phone is null or char_length(phone) <= 60)
);
revoke all on private.agency_contacts from public, anon, authenticated;
-- admin_create_agency(p_token,p jsonb), admin_update_agency(p_token,p_id,p jsonb): schreiben agencies + agency_contacts
-- admin_delete_agency(p_token,p_id): löscht Organisation (Stationen/Routen/Schlüssel/Kontakte per CASCADE)
-- admin_delete_route(p_token,p_id): löscht eine Route
-- admin_overview(p_token): liefert jetzt zusätzlich alle Stationen, alle Routen und Aktivitätszähler;
--   Organisationen inkl. Kontaktdaten (nur über diese SECURITY-DEFINER-Funktion sichtbar).
-- Vollständige Funktionskörper: siehe Supabase-Migrationen agency_contact_fields_and_admin_rpcs
-- und move_contact_pii_to_private.
