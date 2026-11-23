-- Etapa 5: liberación de pistas. Ejecutar en Supabase > SQL Editor. Es seguro correrlo más de una vez.

-- Libera el evento: agrega las pistas de relleno de quienes no confirmaron, marca a todos como confirmados,
-- borra los borradores y pasa el evento de 'drawn' a 'released', todo en una transacción.
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
