import { getSupabase } from './_lib/supabase.js';

// No devuelve detalles internos: solo si todo responde.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { error } = await getSupabase().from('events').select('id', { head: true, count: 'exact' });
    if (error) throw error;
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('health check failed:', err.message);
    res.status(503).json({ ok: false });
  }
}
