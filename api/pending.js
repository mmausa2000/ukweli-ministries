// Admin: list PENDING visitor submissions awaiting review.
// Pending rows are stored with a category "_pending|<realCat>".
import { isAdmin } from './_lib/auth.js';

export default async function handler(req, res) {
  if (!(await isAdmin(req, req.query && req.query.token))) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/gallery_items?select=*&order=created_at.desc`,
      { headers: { apikey: sr, Authorization: `Bearer ${sr}` } },
    );
    if (!r.ok) throw new Error(`supabase ${r.status}`);
    const rows = await r.json();
    const items = rows
      .filter((x) => String(x.cat || '').startsWith('_pending|'))
      .map((x) => ({
        id: x.id,
        cat: String(x.cat).slice('_pending|'.length) || 'Community',
        label: x.label,
        cap: x.cap || '',
        img: x.url,
        kind: /\.(mp4|webm|mov)(\?|$)/i.test(x.url) ? 'video' : 'photo',
      }));
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(items);
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) });
  }
}
