// Admin: delete a gallery item (row + stored file).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const { token, id } = req.body || {};
  if (!token || token !== process.env.UKWELI_ADMIN_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!id) return res.status(400).json({ error: 'missing id' });
  try {
    const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const base = process.env.SUPABASE_URL;
    const h = { apikey: sr, Authorization: `Bearer ${sr}` };

    const q = await fetch(`${base}/rest/v1/gallery_items?id=eq.${id}&select=url`, { headers: h });
    const rows = await q.json();
    if (!q.ok || !rows.length) return res.status(404).json({ error: 'not found' });

    const marker = '/storage/v1/object/public/gallery/';
    const idx = rows[0].url.indexOf(marker);
    if (idx !== -1) {
      const path = rows[0].url.slice(idx + marker.length);
      await fetch(`${base}/storage/v1/object/gallery/${path}`, { method: 'DELETE', headers: h });
    }
    const d = await fetch(`${base}/rest/v1/gallery_items?id=eq.${id}`, { method: 'DELETE', headers: h });
    if (!d.ok) throw new Error(`delete ${d.status}`);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) });
  }
}
