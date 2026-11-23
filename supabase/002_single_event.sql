-- Etapa 2: un solo evento por instalación (MVP).
-- Ejecutar en Supabase > SQL Editor. Es seguro correrlo más de una vez.
-- Evita que dos personas creen un evento a la vez: la base de datos rechaza el segundo.
create unique index if not exists only_one_event on events ((true));
