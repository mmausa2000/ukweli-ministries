// Admin: edit a gallery item's title, caption, or section.
import { isAdmin } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const { token, id, label, cap, cat } = req.body || {};
  if (!(await isAdmin(req, token))) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!id) return res.status(400).json({ error: 'missing id' });
  const fields = {};
  if (typeof label === 'string' && label.trim()) fields.label = label.trim().slice(0, 80);
  if (typeof cap === 'string') fields.cap = cap.trim().slice(0, 160);
  if (typeof cat === 'string' && ['Worship', 'Community', 'Missions', 'Media'].includes(cat)) fields.cat = cat;
  if (!Object.keys(fields).length) return res.status(400).json({ error: 'nothing to update' });
  try {
    const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/gallery_items?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        apikey: sr,
        Authorization: `Bearer ${sr}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(fields),
    });
    const rows = await r.json();
    if (!r.ok) throw new Error(rows.message || `update ${r.status}`);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    const x = rows[0];
    res.status(200).json({ ok: true, id: x.id, cat: x.cat, label: x.label, cap: x.cap });
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) });
  }
}
