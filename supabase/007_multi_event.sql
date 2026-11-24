-- Varios eventos por organizadora. Ejecutar en Supabase > SQL Editor. Es seguro correrlo más de una vez.
-- Crea la tabla `organizers` (una sola fila: quien administra) y le cuelga todos los eventos.
-- Si ya había un evento, su sesión y su código de recuperación pasan a ser los de la organizadora: no hay que
-- volver a entrar ni cambiar nada.
create table if not exists organizers (
  id               uuid primary key default gen_random_uuid(),
  admin_token_hash text not null unique,   -- sesión de gestión (hash, nunca el token)
  recovery_hash    text not null unique    -- código de recuperación (hash)
);
alter table organizers enable row level security;
revoke all on organizers from anon, authenticated;
create unique index if not exists only_one_organizer on organizers ((true));

alter table events add column if not exists organizer_id uuid references organizers(id) on delete cascade;
alter table events alter column admin_token_hash drop not null;

insert into organizers (admin_token_hash, recovery_hash)
select admin_token_hash, recovery_hash
from events
where organizer_id is null and admin_token_hash is not null and recovery_hash is not null
order by created_at
limit 1
on conflict do nothing;

update events set organizer_id = (select id from organizers limit 1) where organizer_id is null;

drop index if exists only_one_event;
