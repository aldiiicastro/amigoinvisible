-- Amigo Invisible: esquema COMPLETO (etapas 0 a 5). Para una instalación nueva, ejecutar este archivo entero
-- en Supabase > SQL Editor. Los archivos 002 a 006 son solo las migraciones para quien ya tenía una versión anterior.
-- Todo el acceso pasa por funciones del servidor con la service role key.
-- RLS activado sin políticas: anon y authenticated no pueden leer ni escribir nada.

create table events (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  status           text not null default 'preparing'
                   check (status in ('preparing', 'drawn', 'released', 'closed')),
  release_at       timestamptz,                -- liberación por fecha límite
  description      text not null default '',   -- indicaciones para los participantes
  admin_token_hash text not null,              -- sesión de gestión (hash, nunca el token)
  recovery_hash    text,                       -- código de recuperación (hash)
  created_at       timestamptz not null default now()
);

create table participants (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references events(id) on delete cascade,
  name              text not null,
  phone             text not null,
  is_admin          boolean not null default false,
  invite_token_hash text unique,               -- enlace de un solo canje (hash)
  session_hash      text unique,               -- cookie de sesión tras el canje (hash)
  confirmed         boolean not null default false  -- sin timestamp a propósito
);
create index participants_event_idx on participants(event_id);
create unique index one_admin_per_event on participants(event_id) where is_admin;

-- Quién regala a quién. El destinatario va cifrado (AES-GCM) con una clave solo de servidor.
create table assignments (
  giver_id      uuid primary key references participants(id) on delete cascade,
  event_id      uuid not null references events(id) on delete cascade,
  recipient_enc text not null
);

-- Borradores. Cifrados, sin timestamps. Se borran al confirmar.
create table drafts (
  participant_id uuid primary key references participants(id) on delete cascade,
  clue1_enc      text,
  clue2_enc      text,
  clue3_enc      text
);

-- Pool anónimo de pistas confirmadas. NO guarda autor ni fechas.
create table clue_pool (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references events(id) on delete cascade,
  recipient_id uuid not null references participants(id) on delete cascade,
  round        smallint not null check (round between 1 and 3),
  text_enc     text not null,
  position     integer                         -- orden de impresión, se fija en la liberación
);
create index clue_pool_event_idx on clue_pool(event_id);

alter table events       enable row level security;
alter table participants enable row level security;
alter table assignments  enable row level security;
alter table drafts       enable row level security;
alter table clue_pool    enable row level security;

revoke all on all tables in schema public from anon, authenticated;

-- Etapa 2: un solo evento por instalación (MVP). Quitar este índice cuando se agregue el historial de eventos.
create unique index only_one_event on events ((true));

-- Etapa 3: sorteo atómico (ver supabase/003_draw.sql).
create or replace function perform_draw(p_event_id uuid, p_assignments jsonb)
returns boolean
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status from events where id = p_event_id for update;
  if v_status is distinct from 'preparing' then
    return false;
  end if;

  insert into assignments (giver_id, event_id, recipient_enc)
  select (a ->> 'giver_id')::uuid, p_event_id, a ->> 'recipient_enc'
  from jsonb_array_elements(p_assignments) as a;

  update events set status = 'drawn' where id = p_event_id;
  return true;
end;
$$;

revoke all on function perform_draw(uuid, jsonb) from public, anon, authenticated;
grant execute on function perform_draw(uuid, jsonb) to service_role;

-- Etapa 4: confirmación atómica de pistas (ver supabase/005_clues.sql).
create unique index if not exists clue_pool_recipient_round on clue_pool(recipient_id, round);

create or replace function confirm_clues(p_event_id uuid, p_participant_id uuid, p_recipient_id uuid, p_clues jsonb)
returns boolean
language plpgsql
as $$
declare
  v_status text;
  v_confirmed boolean;
begin
  select status into v_status from events where id = p_event_id for update;
  if v_status is distinct from 'drawn' then
    return false;
  end if;

  select confirmed into v_confirmed from participants
  where id = p_participant_id and event_id = p_event_id for update;
  if v_confirmed is distinct from false then
    return false;
  end if;

  insert into clue_pool (event_id, recipient_id, round, text_enc)
  select p_event_id, p_recipient_id, (c.ordinality)::smallint, c.value
  from jsonb_array_elements_text(p_clues) with ordinality as c(value, ordinality);

  update participants set confirmed = true where id = p_participant_id;
  delete from drafts where participant_id = p_participant_id;
  return true;
end;
$$;

revoke all on function confirm_clues(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function confirm_clues(uuid, uuid, uuid, jsonb) to service_role;

-- Etapa 5: liberación de pistas (ver supabase/006_release.sql).
create or replace function release_event(p_event_id uuid, p_fillers jsonb)
returns boolean
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status from events where id = p_event_id for update;
  if v_status is distinct from 'drawn' then
    return false;
  end if;

  insert into clue_pool (event_id, recipient_id, round, text_enc)
  select p_event_id, (f ->> 'recipient_id')::uuid, (f ->> 'round')::smallint, f ->> 'text_enc'
  from jsonb_array_elements(p_fillers) as f
  on conflict (recipient_id, round) do nothing;

  update participants set confirmed = true where event_id = p_event_id;
  delete from drafts where participant_id in (select id from participants where event_id = p_event_id);
  update events set status = 'released' where id = p_event_id;
  return true;
end;
$$;

-- Fija el orden de impresión del pool (ya mezclado por el servidor con aleatoriedad criptográfica).
create or replace function set_pool_positions(p_event_id uuid, p_positions jsonb)
returns void
language sql
as $$
  update clue_pool c
  set position = (x ->> 'position')::int
  from jsonb_array_elements(p_positions) as x
  where c.id = (x ->> 'id')::uuid and c.event_id = p_event_id;
$$;

revoke all on function release_event(uuid, jsonb) from public, anon, authenticated;
revoke all on function set_pool_positions(uuid, jsonb) from public, anon, authenticated;
grant execute on function release_event(uuid, jsonb) to service_role;
grant execute on function set_pool_positions(uuid, jsonb) to service_role;
