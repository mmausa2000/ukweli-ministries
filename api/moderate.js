// Admin: approve or reject a pending visitor submission.
// approve -> restore the real category (from "_pending|<realCat>"), making it
//            visible on the public gallery.
// reject  -> delete the row and the stored file.
import { isAdmin } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const { token, id, action } = req.body || {};
  if (!(await isAdmin(req, token))) return res.status(401).json({ error: 'unauthorized' });
  if (!id || !['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'need id and action (approve|reject)' });
  }
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const base = process.env.SUPABASE_URL;
  const h = { apikey: sr, Authorization: `Bearer ${sr}` };
  try {
    if (action === 'approve') {
      // Read the pending row to recover the real category from "_pending|<realCat>".
      const cur = await fetch(`${base}/rest/v1/gallery_items?id=eq.${id}&select=cat`, { headers: h });
      const curRows = cur.ok ? await cur.json() : [];
      const curCat = curRows.length ? String(curRows[0].cat || '') : '';
      const realCat = curCat.startsWith('_pending|')
        ? curCat.slice('_pending|'.length) || 'Community'
        : curCat || 'Community';
      const r = await fetch(`${base}/rest/v1/gallery_items?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...h, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ cat: realCat }),
      });
      if (!r.ok) throw new Error(`approve ${r.status}`);
      return res.status(200).json({ ok: true, status: 'approved', cat: realCat });
    }
    // reject: remove the stored file, then the row
    const q = await fetch(`${base}/rest/v1/gallery_items?id=eq.${id}&select=url`, { headers: h });
    const rows = await q.json();
    if (q.ok && rows.length) {
      const marker = '/storage/v1/object/public/gallery/';
      const idx = rows[0].url.indexOf(marker);
      if (idx !== -1) {
        const path = rows[0].url.slice(idx + marker.length);
        await fetch(`${base}/storage/v1/object/gallery/${path}`, { method: 'DELETE', headers: h });
      }
    }
    const d = await fetch(`${base}/rest/v1/gallery_items?id=eq.${id}`, { method: 'DELETE', headers: h });
    if (!d.ok) throw new Error(`reject ${d.status}`);
    res.status(200).json({ ok: true, status: 'rejected' });
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) });
  }
}
