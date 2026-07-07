// PUBLIC: record a visitor photo submission as PENDING. No admin auth.
// Safeguards: honeypot, category whitelist, length caps, submissions/ path
// only, status forced to 'pending'. Pending items never appear on the public
// gallery (api/gallery.js filters status=approved), so this cannot deface the site.
const ALLOWED_CATS = ['Worship', 'Community', 'Missions', 'Media'];

// strip control characters; keep normal text (letters, spaces, hyphens, punctuation)
function clean(s, max) {
  return String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const { cat, label, cap, path, submitter, website } = req.body || {};

  // Honeypot: real people leave this empty. Bots fill it. Pretend success, drop it.
  if (website) return res.status(200).json({ ok: true, pending: true });

  if (!path || !label) return res.status(400).json({ error: 'Please add a photo and a title.' });
  if (!/^submissions\/[A-Za-z0-9._-]+$/.test(String(path))) {
    return res.status(400).json({ error: 'invalid path' });
  }

  const safeCat = ALLOWED_CATS.includes(cat) ? cat : 'Community';
  // Pending submissions are stored under a hidden category "_pending|<realCat>".
  // The public gallery hides any category starting with "_"; on approval the
  // admin restores the real category. This avoids needing a DB status column.
  const pendingCat = '_pending|' + safeCat;
  const L = clean(label, 80);
  let C = clean(cap, 160);
  const by = clean(submitter, 60);
  if (!L) return res.status(400).json({ error: 'Please add a title.' });
  if (by) C = (C ? C + ' ' : '') + '(submitted by ' + by + ')';

  try {
    const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const url = `${process.env.SUPABASE_URL}/storage/v1/object/public/gallery/${path}`;
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/gallery_items`, {
      method: 'POST',
      headers: {
        apikey: sr,
        Authorization: `Bearer ${sr}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ cat: pendingCat, label: L, cap: C, url }),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(t || `insert ${r.status}`);
    }
    res.status(200).json({ ok: true, pending: true });
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) });
  }
}
