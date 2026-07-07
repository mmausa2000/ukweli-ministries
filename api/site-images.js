// Site photo slots (hero montage, portraits, app shots) stored as gallery_items
// rows with cat "_site" (label = slot key). GET is public; POST/reset need the
// admin token. Pages fall back to the baked-in asset when a slot has no row.
import { isAdmin } from './_lib/auth.js';

const SLOT_RE = /^[a-z0-9-]{1,40}$/;

export default async function handler(req, res) {
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const base = process.env.SUPABASE_URL;
  const h = { apikey: sr, Authorization: `Bearer ${sr}` };

  if (req.method === 'GET') {
    try {
      const r = await fetch(`${base}/rest/v1/gallery_items?cat=eq._site&select=label,url`, {
        headers: {
          apikey: process.env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        },
      });
      if (!r.ok) throw new Error(`supabase ${r.status}`);
      const rows = await r.json();
      const map = {};
      rows.forEach((x) => { map[x.label] = x.url; });
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      return res.status(200).json(map);
    } catch (e) {
      return res.status(502).json({ error: String((e && e.message) || e) });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const { token, slot, path, reset } = req.body || {};
  if (!(await isAdmin(req, token))) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!slot || !SLOT_RE.test(slot)) return res.status(400).json({ error: 'bad slot' });
  if (!reset && !path) return res.status(400).json({ error: 'missing path' });

  try {
    // Remove the previous override (row + stored file) for this slot.
    const q = await fetch(
      `${base}/rest/v1/gallery_items?cat=eq._site&label=eq.${encodeURIComponent(slot)}&select=id,url`,
      { headers: h },
    );
    const old = q.ok ? await q.json() : [];
    const marker = '/storage/v1/object/public/gallery/';
    for (const row of old) {
      const idx = row.url.indexOf(marker);
      if (idx !== -1) {
        await fetch(`${base}/storage/v1/object/gallery/${row.url.slice(idx + marker.length)}`, {
          method: 'DELETE',
          headers: h,
        });
      }
    }
    if (old.length) {
      await fetch(`${base}/rest/v1/gallery_items?cat=eq._site&label=eq.${encodeURIComponent(slot)}`, {
        method: 'DELETE',
        headers: h,
      });
    }

    if (reset) return res.status(200).json({ slot, url: null });

    const url = `${base}/storage/v1/object/public/gallery/${path}`;
    const r = await fetch(`${base}/rest/v1/gallery_items`, {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ cat: '_site', label: slot, cap: '', url }),
    });
    const rows = await r.json();
    if (!r.ok) throw new Error(rows.message || `insert ${r.status}`);
    return res.status(200).json({ slot, url: rows[0].url });
  } catch (e) {
    return res.status(502).json({ error: String((e && e.message) || e) });
  }
}
