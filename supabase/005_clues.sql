-- Etapa 4: confirmación atómica de pistas. Ejecutar en Supabase > SQL Editor. Es seguro correrlo más de una vez.
-- Una persona confirma una sola vez: inserta sus 3 pistas (ya cifradas por el servidor) en el pool anónimo,
-- marca que confirmó y borra su borrador, todo en una transacción. El pool NO guarda autor ni fechas.
alter table participants add column if not exists confirmed boolean not null default false;
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
