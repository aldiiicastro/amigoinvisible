-- Etapa 3b: indicaciones del evento (se agregan al mensaje de WhatsApp y se muestran a cada participante).
-- Ejecutar en Supabase > SQL Editor ANTES de subir la versión nueva de la app. Es seguro correrlo más de una vez.
alter table events add column if not exists description text not null default '';
