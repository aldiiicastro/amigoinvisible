-- Amigo Invisible: esquema inicial (Etapa 0).
-- Ejecutar completo en Supabase > SQL Editor.
-- Todo el acceso pasa por funciones del servidor con la service role key.
-- RLS activado sin políticas: anon y authenticated no pueden leer ni escribir nada.

create table events (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  status           text not null default 'preparing'
                   check (status in ('preparing', 'drawn', 'released', 'closed')),
  release_at       timestamptz,                -- liberación por fecha límite
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
