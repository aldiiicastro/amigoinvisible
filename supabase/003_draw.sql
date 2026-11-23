-- Etapa 3: sorteo atómico. Ejecutar en Supabase > SQL Editor. Es seguro correrlo más de una vez.
-- Guarda las asignaciones (ya cifradas por el servidor) y pasa el evento de 'preparing' a 'drawn'
-- en una sola transacción, bloqueando la fila del evento: si dos pedidos llegan a la vez, solo uno sortea.
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

-- Solo el servidor (service role) puede llamarla; el navegador nunca.
revoke all on function perform_draw(uuid, jsonb) from public, anon, authenticated;
grant execute on function perform_draw(uuid, jsonb) to service_role;
