import { createClient } from '@supabase/supabase-js';

let client;

// Cliente con service role. Solo se usa en funciones del servidor, nunca en el navegador.
export function getSupabase() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Faltan variables de entorno de Supabase');
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}
