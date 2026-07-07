// Admin: record an uploaded file in the gallery table.
import { isAdmin } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const { token, cat, label, cap, path } = req.body || {};
  if (!(await isAdmin(req, token))) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!cat || !label || !path) return res.status(400).json({ error: 'missing fields' });
  try {
    const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const url = `${process.env.SUPABASE_URL}/storage/v1/object/public/gallery/${path}`;
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/gallery_items`, {
      method: 'POST',
      headers: {
        apikey: sr,
        Authorization: `Bearer ${sr}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ cat, label, cap: cap || '', url }),
    });
    const rows = await r.json();
    if (!r.ok) throw new Error(rows.message || `insert ${r.status}`);
    const x = rows[0];
    res.status(200).json({
      id: x.id,
      cat: x.cat,
      label: x.label,
      cap: x.cap,
      img: x.url,
      kind: /\.(mp4|webm|mov)(\?|$)/i.test(x.url) ? 'video' : 'photo',
    });
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) });
  }
}
