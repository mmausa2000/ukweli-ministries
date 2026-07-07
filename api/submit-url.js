// PUBLIC: mint a signed upload URL for a visitor photo submission.
// No admin auth. Validates the file type and namespaces uploads under
// submissions/. The record is only created (as pending) by /api/submit,
// and nothing is shown publicly until an admin approves it.
const ALLOWED = /\.(jpe?g|png|webp|gif|mp4|webm|mov)$/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const { filename } = req.body || {};
  const name = String(filename || '');
  if (!ALLOWED.test(name)) {
    return res.status(400).json({ error: 'Please choose an image or video file.' });
  }
  try {
    const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `submissions/${Date.now()}-${rand}-${safe}`;
    const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const r = await fetch(
      `${process.env.SUPABASE_URL}/storage/v1/object/upload/sign/gallery/${path}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${sr}`, apikey: sr, 'Content-Type': 'application/json' },
        body: '{}',
      },
    );
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || `sign ${r.status}`);
    res.status(200).json({ uploadUrl: `${process.env.SUPABASE_URL}/storage/v1${data.url}`, path });
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) });
  }
}
